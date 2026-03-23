const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { startPosting } = require('./index.js');
const { execGetGroups } = require('./get_groups.js');
const { execDiscoverGroups, execJoinGroup } = require('./discover_groups');
const browserManager = require('./browser_manager');
const FBAutomator = require('./fb_automator');
const dotenv = require('dotenv');

const app = express();
app.use(cors());
app.use(express.json());

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('[Server] Lỗi JSON body không hợp lệ:', err.message);
        return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
    }
    next();
});

const PORT = 3001;
const settingsPath = path.join(__dirname, 'settings.json');
const postedHistoryPath = path.join(__dirname, 'posted_history.txt');
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

const SUPPORTED_PAGES = [
    { id: '61582480582780', name: 'Thang Máy Nhập Khẩu Việt Thành' },
    { id: '100063596562296', name: 'CTy TNHH CK XD TM VIỆT THÀNH - NHÀ THÉP VIỆT' },
    { id: '61555628966477', name: 'VIỆT THÀNH DOOR' },
    { id: '100006184008355', name: 'Trần Minh Thiện' }
];

function getGroupsDataPath(pageId) {
    if (!pageId) return path.join(__dirname, 'groups_data.json');
    return path.join(__dirname, `groups_data_${pageId}.json`);
}

let isPosting = false;
let isScanning = false;
let isDiscovering = false;
let isHarvestingVisible = false;
let visibleHarvestTimer = null;
let activeClients = [];
let scanControl = { cancelled: false };

function formatDateTimeVN(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('vi-VN', { 
        timeZone: APP_TIMEZONE,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(/,/g, '');
}

function readSettings() {
    const defaults = { delayBetweenPostsMinutes: 1 };
    if (!fs.existsSync(settingsPath)) return defaults;
    try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const parsedDelay = Number(parsed?.delayBetweenPostsMinutes);
        return {
            ...defaults,
            ...parsed,
            delayBetweenPostsMinutes: Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : defaults.delayBetweenPostsMinutes
        };
    } catch (_) {
        return defaults;
    }
}

function writeSettings(nextSettings) {
    const rawDelay = Number(nextSettings?.delayBetweenPostsMinutes);
    const normalized = {
        delayBetweenPostsMinutes: Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 1
    };
    fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2), 'utf-8');
    return normalized;
}

function readPostedHistoryMap() {
    if (!fs.existsSync(postedHistoryPath)) return new Map();
    const latestByUrl = new Map();
    const lines = fs.readFileSync(postedHistoryPath, 'utf-8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    for (const line of lines) {
        const [url, rawTs] = line.split('|');
        const ts = Number(rawTs);
        if (!url || !Number.isFinite(ts)) continue;
        const current = latestByUrl.get(url);
        if (!current || ts > current) latestByUrl.set(url, ts);
    }
    return latestByUrl;
}

function enrichGroupWithPostedHistory(group, postedHistoryMap = null) {
    if (!group?.url) return group;
    const historyMap = postedHistoryMap || readPostedHistoryMap();
    const postedTs = historyMap.get(group.url);
    if (!postedTs) return group;
    const isRecent = Date.now() - postedTs < 2 * 24 * 60 * 60 * 1000;
    return {
        ...group,
        lastBotPostedAt: postedTs,
        postedTime: formatDateTimeVN(postedTs),
        lastPostStatus: group.lastPostStatus || 'Sẵn sàng',
        isSelectable: group.isSelectable ?? true
    };
}

function readGroupsData(pageId) {
    const dataPath = getGroupsDataPath(pageId);
    if (!fs.existsSync(dataPath)) {
        // Fallback to old file if it's the first page and old file exists
        const oldPath = path.join(__dirname, 'groups_data.json');
        if (pageId === SUPPORTED_PAGES[0].id && fs.existsSync(oldPath)) {
            try {
                const data = fs.readFileSync(oldPath, 'utf-8');
                fs.writeFileSync(dataPath, data);
                // Keep the old file as backup or delete it later
            } catch (e) {}
        } else {
            return [];
        }
    }
    try {
        const postedHistoryMap = readPostedHistoryMap();
        const rawGroups = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        return rawGroups.map((group) => enrichGroupWithPostedHistory(group, postedHistoryMap));
    } catch (_) {
        return [];
    }
}

function writeGroupsData(groups, pageId) {
    const dataPath = getGroupsDataPath(pageId);
    fs.writeFileSync(dataPath, JSON.stringify(groups, null, 2));
}

function upsertGroupData(group, pageId) {
    if (!group || !group.url) return;
    const groups = readGroupsData(pageId);
    const index = groups.findIndex((g) => g.url === group.url);
    if (index === -1) groups.push(group);
    else groups[index] = { ...groups[index], ...group };
    writeGroupsData(groups, pageId);
}

function normalizeKeyword(text = '') {
    return String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function isValidVisibleGroup(group) {
    if (!group || !group.url || !group.id || !group.name) return false;
    const lowerUrl = group.url.toLowerCase();
    if (!lowerUrl.includes('/groups/')) return false;
    if (
        lowerUrl.includes('/groups/feed') ||
        lowerUrl.includes('/groups/joins') ||
        lowerUrl.includes('/groups/discover') ||
        lowerUrl.includes('/groups/search') ||
        lowerUrl.includes('/user/') ||
        lowerUrl.includes('/posts/') ||
        lowerUrl.includes('/permalink/')
    ) return false;
    return true;
}

async function harvestVisibleGroups(context, keyword = '', pageId) {
    const normalizedKeyword = normalizeKeyword(keyword);
    const pages = context.pages().filter((page) => /facebook\.com/i.test(page.url()));
    const harvested = [];
    for (const page of pages) {
        try {
            const groupsOnPage = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
                const seen = new Set();
                const cleanText = (v) => (v || '').replace(/\s+/g, ' ').trim();
                const rows = [];
                const cleanGroupName = (name) => {
                    if (!name) return '';
                    const splitters = [' Lần hoạt động', ' thành viên', ' member', ' bài viết', ' hoạt động gần đây', ' phút', ' giờ', ' ngày'];
                    let cleaned = name;
                    for (const s of splitters) {
                        const parts = cleaned.split(s);
                        if (parts.length > 1) cleaned = parts[0];
                    }
                    return cleaned.trim();
                };

                for (const anchor of anchors) {
                    const href = anchor.getAttribute('href') || '';
                    if (!href) continue;
                    const absoluteUrl = new URL(href, location.origin).href.split('?')[0];
                    const match = absoluteUrl.match(/facebook\.com\/groups\/([^/?#]+)/i);
                    if (!match) continue;
                    const groupId = decodeURIComponent(match[1] || '').trim();
                    if (!groupId) continue;
                    if (['feed', 'joins', 'discover', 'search', 'create', 'notifications'].includes(groupId.toLowerCase())) continue;
                    
                    const rawName = cleanText(anchor.innerText) || cleanText(anchor.getAttribute('aria-label')) || groupId;
                    const name = cleanGroupName(rawName);
                    const key = `${groupId}|${absoluteUrl}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    rows.push({ id: groupId, name, url: absoluteUrl, members: 'N/A', sourceHint: location.href });
                }
                return rows;
            });
            groupsOnPage.forEach((group) => harvested.push(group));
        } catch (e) {
            broadcastLog({ type: 'warning', message: `Không đọc được DOM từ tab ${page.url()}: ${e.message}`, source: 'visible-harvest' });
        }
    }
    let added = 0;
    let updated = 0;
    const currentGroups = readGroupsData(pageId);
    for (const group of harvested) {
        if (!isValidVisibleGroup(group)) continue;
        if (normalizedKeyword && !normalizeKeyword(group.name).includes(normalizedKeyword)) continue;
        const existing = currentGroups.find((item) => item.url === group.url);
        const mergedGroup = {
            ...existing,
            ...group,
            lastPostStatus: existing?.lastPostStatus || 'Sẵn sàng',
            isSelectable: existing?.isSelectable ?? true
        };
        upsertGroupData(mergedGroup, pageId);
        if (existing) {
            updated += 1;
            broadcastLog({ type: 'group_updated', group: mergedGroup, source: 'visible-harvest' });
        } else {
            added += 1;
            broadcastLog({ type: 'group_found', group: mergedGroup, source: 'visible-harvest' });
        }
    }
    if (added || updated) {
        broadcastLog({ type: 'info', message: `Thu từ màn hình: +${added} nhóm mới, cập nhật ${updated} nhóm.`, source: 'visible-harvest' });
    }
    return { added, updated };
}

app.get('/api/pages', (req, res) => {
    res.json(SUPPORTED_PAGES);
});

app.get('/api/groups', (req, res) => {
    const pageId = req.query.pageId;
    const groups = readGroupsData(pageId);
    const processed = groups.map(g => {
        const lastPost = g.lastBotPostedAt || 0;
        const diffHours = (Date.now() - lastPost) / (1000 * 60 * 60);
        return {
            ...g,
            isSelectable: diffHours >= 48
        };
    });
    res.json(processed);
});

app.get('/api/settings', (req, res) => {
    res.json(readSettings());
});

app.get('/api/worker-status', (req, res) => {
    const pageId = req.query.pageId;
    const groups = readGroupsData(pageId);
    res.json({
        isRunning: isPosting,
        pendingCount: groups.filter(g => g.isSelectable).length,
        isScanning: isScanning,
        isDiscovering: isDiscovering
    });
});

app.post('/api/settings', (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu' });
    const delayBetweenPostsMinutes = Number(req.body.delayBetweenPostsMinutes);
    if (!Number.isFinite(delayBetweenPostsMinutes) || delayBetweenPostsMinutes < 0) {
        return res.status(400).json({ error: 'Thời gian chờ không hợp lệ.' });
    }
    const saved = writeSettings({ delayBetweenPostsMinutes });
    broadcastLog({ type: 'info', message: `Đã lưu cài đặt: Delay=${saved.delayBetweenPostsMinutes}p`, source: 'settings' });
    res.json({ success: true, settings: saved });
});

app.post('/api/fetch-groups', async (req, res) => {
    if (isScanning) return res.status(400).json({ error: 'Tiến trình quét đang chạy.' });
    isScanning = true;
    scanControl = { cancelled: false };
    const keyword = req.body.keyword || '';
    const pageId = req.body.pageId;
    broadcastLog({ type: 'info', message: `Bắt đầu quét nhóm đã tham gia: "${keyword}"`, source: 'scanning' });
    try {
        const context = await browserManager.getContext();
        execGetGroups(context, keyword, (msg) => {
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        if (event.type === 'group_found' || event.type === 'group_updated') upsertGroupData(event.group, pageId);
                        broadcastLog({ ...event, source: 'scanning' });
                    } catch(e) {}
                } else broadcastLog({ type: 'info', message: msg, source: 'scanning' });
            }
        }, () => scanControl.cancelled).then(() => {
            isScanning = false;
            broadcastLog({ type: 'done', message: 'Hoàn thành quét nhóm.', source: 'scanning' });
        }).catch(err => {
            isScanning = false;
            broadcastLog({ type: 'error', message: `Lỗi quét nhóm: ${err.message}`, source: 'scanning' });
        });
        res.json({ success: true, message: 'Đang quét ngầm...' });
    } catch(e) {
        isScanning = false;
        res.status(500).json({ error: 'Lỗi khởi tạo', details: e.message });
    }
});

app.post('/api/stop-scan', (req, res) => {
    scanControl.cancelled = true;
    res.json({ success: true, message: 'Đã gửi lệnh dừng quét.' });
});

app.post('/api/start-visible-harvest', async (req, res) => {
    if (isHarvestingVisible) return res.status(400).json({ error: 'Đang chạy rồi.' });
    try {
        const context = await browserManager.getContext();
        const keyword = req.body?.keyword || '';
        const pageId = req.body.pageId;
        isHarvestingVisible = true;
        visibleHarvestTimer = setInterval(async () => {
            if (isHarvestingVisible) await harvestVisibleGroups(context, keyword, pageId).catch(() => {});
        }, 4000);
        broadcastLog({ type: 'start', message: 'Đã bật thu nhóm từ màn hình.', source: 'visible-harvest' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/stop-visible-harvest', (req, res) => {
    isHarvestingVisible = false;
    if (visibleHarvestTimer) clearInterval(visibleHarvestTimer);
    broadcastLog({ type: 'done', message: 'Đã dừng thu nhóm.', source: 'visible-harvest' });
    res.json({ success: true });
});

app.post('/api/discover-groups', (req, res) => {
    runDiscoveryProcess(req.body.keyword || '', req.body.autoJoin === true, req.body.pageId);
    res.json({ success: true, message: 'Đang khám phá ngầm...' });
});

app.post('/api/join-group', async (req, res) => {
    const { url, name, pageId } = req.body;
    try {
        const context = await browserManager.getContext();
        const success = await execJoinGroup(context, url, (msg) => broadcastLog({ type: 'info', message: msg, source: 'discovery' }));
        if (success && pageId && name) {
            const match = url.match(/facebook\.com\/groups\/([^/?#]+)/i);
            const groupId = match ? decodeURIComponent(match[1]).trim() : 'unknown';
            upsertGroupData({ id: groupId, name, url, lastPostStatus: 'Sẵn sàng', isSelectable: true }, pageId);
            broadcastLog({ type: 'info', message: `Đã tự động thêm nhóm mới vào danh sách: ${name}`, source: 'discovery' });
        }
        res.json({ success });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/post', async (req, res) => {
    const { groups, postContent, imageFolderPath, pageId } = req.body;
    if (!groups?.length) return res.status(400).json({ error: 'Thiếu danh sách nhóm.' });
    isPosting = true;
    res.json({ success: true, message: 'Bắt đầu đăng bài.' });
    try {
        const context = await browserManager.getContext();
        const settings = readSettings();
        await startPosting(groups, (event) => {
            broadcastLog({ ...event, source: 'posting' });
            if (event.type === 'success' && event.groupUrl) markGroupAfterSuccess(event.groupUrl, event.status, pageId);
        }, context, postContent, imageFolderPath, settings.delayBetweenPostsMinutes);
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi: ${e.message}`, source: 'posting' });
    } finally {
        isPosting = false;
        broadcastLog({ type: 'done', message: 'Hoàn thành tiến trình đăng bài.', source: 'posting' });
    }
});

function markGroupAfterSuccess(groupUrl, status = 'published', pageId) {
    const groups = readGroupsData(pageId);
    const index = groups.findIndex((g) => g.url === groupUrl);
    if (index === -1) return;
    const ts = Date.now();
    const updated = {
        ...groups[index],
        lastBotPostedAt: ts,
        postedTime: formatDateTimeVN(ts),
        // isSelectable will be calculated by the client or when served via API
        lastPostStatus: status === 'pending' ? 'Đang chờ duyệt' : 'Đã đăng'
    };
    delete updated.isSelectable; // remove stale flag if exists
    groups[index] = updated;
    writeGroupsData(groups, pageId);
    
    // Calculate final isSelectable before broadcasting
    const diffHours = (Date.now() - (updated.lastBotPostedAt || 0)) / (1000 * 60 * 60);
    const finalGroup = { ...updated, isSelectable: diffHours >= 48 };
    
    broadcastLog({ type: 'group_updated', group: finalGroup, source: 'posting' });
}

function broadcastLog(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    activeClients.forEach(c => { try { c.res.write(payload); } catch(e) {} });
}

app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Đã kết nối Log SSE.' })}\n\n`);
    const client = { id: Date.now(), res };
    activeClients.push(client);
    req.on('close', () => activeClients = activeClients.filter(c => c.id !== client.id));
});

async function runDiscoveryProcess(keyword, autoJoin = false, pageId) {
    if (isDiscovering) return;
    isDiscovering = true;
    broadcastLog({ type: 'info', message: `🔍 Khám phá nhóm: "${keyword}"`, source: 'discovery' });
    try {
        const context = await browserManager.getContext();
        const automator = new FBAutomator((msg) => broadcastLog({ type: 'info', message: msg, source: 'discovery' }));
        // Không gọi init/login ở đây vì context đã được browserManager quản lý và có thể đã login rồi.
        // Tuy nhiên để an toàn nếu FBAutomator cần:
        // await automator.init(context); 
        const groups = await execDiscoverGroups(context, keyword, (msg) => {
            if (typeof msg === 'string' && msg.startsWith('[FB_EVENT] ')) {
                try { broadcastLog({ ...JSON.parse(msg.substring(11)), source: 'discovery' }); } catch(e) {}
            } else broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        if (autoJoin) {
            for (const g of groups.filter(x => x.canJoin && !x.isJoined)) {
                const success = await execJoinGroup(context, g.url, (m) => broadcastLog({ type: 'info', message: m, source: 'discovery' }));
                if (success && pageId) {
                    const match = g.url.match(/facebook\.com\/groups\/([^/?#]+)/i);
                    const groupId = match ? decodeURIComponent(match[1]).trim() : 'unknown';
                    upsertGroupData({ id: groupId, name: g.name, url: g.url, lastPostStatus: 'Sẵn sàng', isSelectable: true }, pageId);
                }
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        broadcastLog({ type: 'done', message: 'Hoàn thành khám phá.', source: 'discovery' });
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi: ${e.message}`, source: 'discovery' });
    } finally { isDiscovering = false; }
}

app.listen(PORT, () => {
    console.log(`[Server] running at http://localhost:${PORT}`);
});
