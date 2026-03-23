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
const groupsDataPath = path.join(__dirname, 'groups_data.json');
const postedHistoryPath = path.join(__dirname, 'posted_history.txt');
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

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
        lastPostStatus: isRecent ? 'Đã đăng bởi bot < 2 ngày' : (group.lastPostStatus || 'Đã đăng thành công'),
        isSelectable: isRecent ? false : group.isSelectable
    };
}

function readGroupsData() {
    if (!fs.existsSync(groupsDataPath)) return [];
    try {
        const postedHistoryMap = readPostedHistoryMap();
        const rawGroups = JSON.parse(fs.readFileSync(groupsDataPath, 'utf-8'));
        return rawGroups.map((group) => enrichGroupWithPostedHistory(group, postedHistoryMap));
    } catch (_) {
        return [];
    }
}

function writeGroupsData(groups) {
    fs.writeFileSync(groupsDataPath, JSON.stringify(groups, null, 2));
}

function upsertGroupData(group) {
    if (!group || !group.url) return;
    const groups = readGroupsData();
    const index = groups.findIndex((g) => g.url === group.url);
    if (index === -1) groups.push({ ...group, isSelectable: true });
    else groups[index] = { ...groups[index], ...group };
    writeGroupsData(groups);
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

async function harvestVisibleGroups(context, keyword = '') {
    const normalizedKeyword = normalizeKeyword(keyword);
    const pages = context.pages().filter((page) => /facebook\.com/i.test(page.url()));
    const harvested = [];
    for (const page of pages) {
        try {
            const groupsOnPage = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
                const seen = new Set();
                const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();
                const rows = [];
                for (const anchor of anchors) {
                    const href = anchor.getAttribute('href') || '';
                    if (!href) continue;
                    const absoluteUrl = new URL(href, location.origin).href.split('?')[0];
                    const match = absoluteUrl.match(/facebook\.com\/groups\/([^/?#]+)/i);
                    if (!match) continue;
                    const groupId = decodeURIComponent(match[1] || '').trim();
                    if (!groupId) continue;
                    if (['feed', 'joins', 'discover', 'search', 'create', 'notifications'].includes(groupId.toLowerCase())) continue;
                    const card = anchor.closest('[role="article"], [role="listitem"], [data-visualcompletion], li, div');
                    const parts = [
                        cleanText(anchor.innerText),
                        cleanText(anchor.getAttribute('aria-label')),
                        cleanText(card?.innerText)
                    ].filter(Boolean);
                    const name = parts.sort((a, b) => b.length - a.length)[0] || groupId;
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
    const currentGroups = readGroupsData();
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
        upsertGroupData(mergedGroup);
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

app.get('/api/groups', (req, res) => {
    res.json(readGroupsData());
});

app.get('/api/settings', (req, res) => {
    res.json(readSettings());
});

app.get('/api/worker-status', (req, res) => {
    const groups = readGroupsData();
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
    broadcastLog({ type: 'info', message: `Bắt đầu quét nhóm đã tham gia: "${keyword}"`, source: 'scanning' });
    try {
        const context = await browserManager.getContext();
        execGetGroups(context, keyword, (msg) => {
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        if (event.type === 'group_found' || event.type === 'group_updated') upsertGroupData(event.group);
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
        isHarvestingVisible = true;
        visibleHarvestTimer = setInterval(async () => {
            if (isHarvestingVisible) await harvestVisibleGroups(context, keyword).catch(() => {});
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
    runDiscoveryProcess(req.body.keyword || '', req.body.autoJoin === true);
    res.json({ success: true, message: 'Đang khám phá ngầm...' });
});

app.post('/api/join-group', async (req, res) => {
    try {
        const context = await browserManager.getContext();
        const success = await execJoinGroup(context, req.body.url, (msg) => broadcastLog({ type: 'info', message: msg, source: 'discovery' }));
        res.json({ success });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/post', async (req, res) => {
    const { groups, postContent, imageFolderPath } = req.body;
    if (!groups?.length) return res.status(400).json({ error: 'Thiếu danh sách nhóm.' });
    isPosting = true;
    res.json({ success: true, message: 'Bắt đầu đăng bài.' });
    try {
        const context = await browserManager.getContext();
        const settings = readSettings();
        await startPosting(groups, (event) => {
            broadcastLog({ ...event, source: 'posting' });
            if (event.type === 'success' && event.groupUrl) markGroupAfterSuccess(event.groupUrl, event.status);
        }, context, postContent, imageFolderPath, settings.delayBetweenPostsMinutes);
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi: ${e.message}`, source: 'posting' });
    } finally {
        isPosting = false;
        broadcastLog({ type: 'done', message: 'Hoàn thành tiến trình đăng bài.', source: 'posting' });
    }
});

function markGroupAfterSuccess(groupUrl, status = 'published') {
    const groups = readGroupsData();
    const index = groups.findIndex((g) => g.url === groupUrl);
    if (index === -1) return;
    const ts = Date.now();
    const updated = {
        ...groups[index],
        lastBotPostedAt: ts,
        postedTime: formatDateTimeVN(ts),
        isSelectable: false,
        lastPostStatus: status === 'pending' ? 'Đang chờ duyệt' : 'Đã đăng < 2 ngày'
    };
    groups[index] = updated;
    writeGroupsData(groups);
    broadcastLog({ type: 'group_updated', group: updated, source: 'posting' });
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

async function runDiscoveryProcess(keyword, autoJoin = false) {
    if (isDiscovering) return;
    isDiscovering = true;
    broadcastLog({ type: 'info', message: `🔍 Khám phá nhóm: "${keyword}"`, source: 'discovery' });
    try {
        const context = await browserManager.getContext();
        const automator = new FBAutomator((msg) => broadcastLog({ type: 'info', message: msg, source: 'discovery' }));
        await automator.init(context);
        await automator.login();
        const groups = await execDiscoverGroups(context, keyword, (msg) => {
            if (typeof msg === 'string' && msg.startsWith('[FB_EVENT] ')) {
                try { broadcastLog({ ...JSON.parse(msg.substring(11)), source: 'discovery' }); } catch(e) {}
            } else broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        if (autoJoin) {
            for (const g of groups.filter(x => x.canJoin && !x.isJoined)) {
                await execJoinGroup(context, g.url, (m) => broadcastLog({ type: 'info', message: m, source: 'discovery' }));
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
