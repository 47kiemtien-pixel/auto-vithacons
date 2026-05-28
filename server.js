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
// Tăng giới hạn body để nhận được danh sách nhóm lớn
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger toàn cục để kiểm tra mọi yêu cầu đến server
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});

// Middleware xử lý lỗi JSON body không hợp lệ (phải đặt sau express.json)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('[Server] Lỗi JSON body không hợp lệ:', err.message);
        return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
    }
    next();
});

const PORT = 3005;
const settingsPath = path.join(__dirname, 'settings.json');
const postedHistoryPath = path.join(__dirname, 'posted_history.txt');
const discoveryStatePath = path.join(__dirname, 'discovery_state.json');
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

const SUPPORTED_PAGES = [
    { id: '61582480582780', name: 'Thang Máy Nhập Khẩu Việt Thành' },
    { id: '100063596562296', name: 'CTy TNHH CK XD TM VIỆT THÀNH - NHÀ THÉP VIỆT' },
    { id: '61555628966477', name: 'VIỆT THÀNH DOOR' },
    { id: '100006184008355', name: 'Trần Minh Thiện' },
    { id: '100089836008817', name: 'Ylang Wellness Retreat' }
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
let autoDiscoveryTimer = null;
let autoDiscoveryLastRunAt = null;

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
    const defaults = {
        delayBetweenPostsMinutes: 1,
        autoDiscoveryEnabled: false,
        autoDiscoveryIntervalHours: 6,
        autoDiscoveryKeyword: '',
        discoverJoinCooldownHours: 24,
        maxAutoJoinPerRun: 2
    };
    if (!fs.existsSync(settingsPath)) return defaults;
    try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const parsedDelay = Number(parsed?.delayBetweenPostsMinutes);
        const parsedInterval = Number(parsed?.autoDiscoveryIntervalHours);
        const parsedCooldown = Number(parsed?.discoverJoinCooldownHours);
        const parsedMaxAutoJoin = Number(parsed?.maxAutoJoinPerRun);
        return {
            ...defaults,
            ...parsed,
            delayBetweenPostsMinutes: Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : defaults.delayBetweenPostsMinutes,
            autoDiscoveryEnabled: parsed?.autoDiscoveryEnabled === true,
            autoDiscoveryIntervalHours: Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : defaults.autoDiscoveryIntervalHours,
            autoDiscoveryKeyword: String(parsed?.autoDiscoveryKeyword || '').trim(),
            discoverJoinCooldownHours: Number.isFinite(parsedCooldown) && parsedCooldown >= 0 ? parsedCooldown : defaults.discoverJoinCooldownHours,
            maxAutoJoinPerRun: Number.isFinite(parsedMaxAutoJoin) && parsedMaxAutoJoin >= 0 ? Math.floor(parsedMaxAutoJoin) : defaults.maxAutoJoinPerRun
        };
    } catch (_) {
        return defaults;
    }
}

function writeSettings(nextSettings) {
    const rawDelay = Number(nextSettings?.delayBetweenPostsMinutes);
    const rawInterval = Number(nextSettings?.autoDiscoveryIntervalHours);
    const rawCooldown = Number(nextSettings?.discoverJoinCooldownHours);
    const rawMaxAutoJoin = Number(nextSettings?.maxAutoJoinPerRun);
    const normalized = {
        delayBetweenPostsMinutes: Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 1,
        autoDiscoveryEnabled: nextSettings?.autoDiscoveryEnabled === true,
        autoDiscoveryIntervalHours: Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 6,
        autoDiscoveryKeyword: String(nextSettings?.autoDiscoveryKeyword || '').trim(),
        discoverJoinCooldownHours: Number.isFinite(rawCooldown) && rawCooldown >= 0 ? rawCooldown : 24,
        maxAutoJoinPerRun: Number.isFinite(rawMaxAutoJoin) && rawMaxAutoJoin >= 0 ? Math.floor(rawMaxAutoJoin) : 2
    };
    fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2), 'utf-8');
    return normalized;
}

function readDiscoveryState() {
    if (!fs.existsSync(discoveryStatePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(discoveryStatePath, 'utf-8'));
    } catch (_) {
        return {};
    }
}

function writeDiscoveryState(state) {
    fs.writeFileSync(discoveryStatePath, JSON.stringify(state, null, 2), 'utf-8');
}

function getDiscoveryRecord(pageId, groupUrl) {
    const state = readDiscoveryState();
    const key = `${pageId || 'global'}::${(groupUrl || '').trim().toLowerCase()}`;
    return state[key] || null;
}

function upsertDiscoveryRecord(pageId, groupUrl, patch = {}) {
    const state = readDiscoveryState();
    const key = `${pageId || 'global'}::${(groupUrl || '').trim().toLowerCase()}`;
    state[key] = {
        ...(state[key] || {}),
        pageId: pageId || '',
        url: groupUrl,
        ...patch
    };
    writeDiscoveryState(state);
    return state[key];
}

function shouldAttemptJoin(group, pageId, settings) {
    if (!group?.url || !group.canJoin || group.isJoined) return false;
    const existingGroups = readGroupsData(pageId);
    const alreadyKnown = existingGroups.some((item) => (item.url || '').replace(/\/$/, '') === (group.url || '').replace(/\/$/, ''));
    if (alreadyKnown) return false;

    const record = getDiscoveryRecord(pageId, group.url);
    if (!record?.lastJoinAttemptAt) return true;

    const cooldownMs = Math.max(0, Number(settings.discoverJoinCooldownHours) || 0) * 60 * 60 * 1000;
    if (cooldownMs === 0) return true;
    return Date.now() - Number(record.lastJoinAttemptAt) >= cooldownMs;
}

function scheduleAutoDiscovery() {
    if (autoDiscoveryTimer) {
        clearInterval(autoDiscoveryTimer);
        autoDiscoveryTimer = null;
    }

    const settings = readSettings();
    if (!settings.autoDiscoveryEnabled || !settings.autoDiscoveryKeyword) {
        return;
    }

    const intervalMs = Math.max(1, Number(settings.autoDiscoveryIntervalHours) || 1) * 60 * 60 * 1000;
    autoDiscoveryTimer = setInterval(() => {
        runAutoDiscoveryTick().catch((error) => {
            broadcastLog({ type: 'error', message: `Lỗi auto-discovery: ${error.message}`, source: 'discovery' });
        });
    }, intervalMs);
}

async function runAutoDiscoveryTick() {
    const settings = readSettings();
    if (!settings.autoDiscoveryEnabled || !settings.autoDiscoveryKeyword || isDiscovering) return;

    autoDiscoveryLastRunAt = Date.now();
    broadcastLog({
        type: 'info',
        message: `Auto-discovery chạy nền với từ khóa "${settings.autoDiscoveryKeyword}"`,
        source: 'discovery'
    });

    for (const page of SUPPORTED_PAGES) {
        await runDiscoveryProcess(settings.autoDiscoveryKeyword, true, page.id, { source: 'auto' });
    }
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
    if (!group || (!group.url && !group.id)) return;
    const groups = readGroupsData(pageId);
    
    const normalizeUrl = (u) => (u || '').replace(/\/$/, '').toLowerCase();
    
    const index = groups.findIndex((g) => {
        if (g.id && group.id && g.id !== 'unknown' && group.id !== 'unknown') {
            return String(g.id) === String(group.id);
        }
        return normalizeUrl(g.url) === normalizeUrl(group.url);
    });

    if (index === -1) groups.push(group);
    else groups[index] = { ...groups[index], ...group };
    writeGroupsData(groups, pageId);
}

function isConfirmedJoinResult(result) {
    if (result === true) return true;
    if (!result || typeof result !== 'object') return false;
    return result.status === 'joined' || result.status === 'requested';
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
    const settings = readSettings();
    res.json({
        isRunning: isPosting,
        pendingCount: groups.filter(g => g.isSelectable).length,
        isScanning: isScanning,
        isDiscovering: isDiscovering,
        autoDiscoveryEnabled: settings.autoDiscoveryEnabled,
        autoDiscoveryIntervalHours: settings.autoDiscoveryIntervalHours,
        autoDiscoveryLastRunAt
    });
});

app.post('/api/settings', (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu' });
    const delayBetweenPostsMinutes = Number(req.body.delayBetweenPostsMinutes);
    const autoDiscoveryIntervalHours = Number(req.body.autoDiscoveryIntervalHours);
    const discoverJoinCooldownHours = Number(req.body.discoverJoinCooldownHours);
    const maxAutoJoinPerRun = Number(req.body.maxAutoJoinPerRun);
    const autoDiscoveryKeyword = String(req.body.autoDiscoveryKeyword || '').trim();
    const autoDiscoveryEnabled = req.body.autoDiscoveryEnabled === true;
    if (!Number.isFinite(delayBetweenPostsMinutes) || delayBetweenPostsMinutes < 0) {
        return res.status(400).json({ error: 'Thời gian chờ không hợp lệ.' });
    }
    if (!Number.isFinite(autoDiscoveryIntervalHours) || autoDiscoveryIntervalHours <= 0) {
        return res.status(400).json({ error: 'Chu kỳ auto-discovery không hợp lệ.' });
    }
    if (!Number.isFinite(discoverJoinCooldownHours) || discoverJoinCooldownHours < 0) {
        return res.status(400).json({ error: 'Cooldown join không hợp lệ.' });
    }
    if (!Number.isFinite(maxAutoJoinPerRun) || maxAutoJoinPerRun < 0) {
        return res.status(400).json({ error: 'Giới hạn join mỗi đợt không hợp lệ.' });
    }
    const saved = writeSettings({
        delayBetweenPostsMinutes,
        autoDiscoveryEnabled,
        autoDiscoveryIntervalHours,
        autoDiscoveryKeyword,
        discoverJoinCooldownHours,
        maxAutoJoinPerRun
    });
    scheduleAutoDiscovery();
    broadcastLog({
        type: 'info',
        message: `Đã lưu cài đặt: Delay=${saved.delayBetweenPostsMinutes}p | Auto=${saved.autoDiscoveryEnabled ? 'on' : 'off'} | ${saved.autoDiscoveryIntervalHours}h/lần | Cooldown join=${saved.discoverJoinCooldownHours}h | Max join=${saved.maxAutoJoinPerRun}`,
        source: 'settings'
    });
    res.json({ success: true, settings: saved });
});

app.post('/api/fetch-groups', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
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
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
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
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
    const keyword = String(req.body.keyword || '').trim();
    const currentSettings = readSettings();
    writeSettings({
        ...currentSettings,
        autoDiscoveryKeyword: keyword || currentSettings.autoDiscoveryKeyword
    });
    scheduleAutoDiscovery();
    runDiscoveryProcess(keyword, req.body.autoJoin === true, req.body.pageId, { source: 'manual' });
    res.json({ success: true, message: 'Đang khám phá ngầm...' });
});

app.post('/api/join-group', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
    const { url, name, pageId } = req.body;
    try {
        const context = await browserManager.getContext();
        const joinResult = await execJoinGroup(context, url, (msg) => broadcastLog({ type: 'info', message: msg, source: 'discovery' }));
        if (isConfirmedJoinResult(joinResult) && pageId && name) {
            const match = url.match(/facebook\.com\/groups\/([^/?#]+)/i);
            const groupId = match ? decodeURIComponent(match[1]).trim() : 'unknown';
            upsertGroupData({ id: groupId, name, url, lastPostStatus: 'Sẵn sàng', isSelectable: true }, pageId);
            broadcastLog({ type: 'info', message: `Đã tự động thêm nhóm mới vào danh sách: ${name}`, source: 'discovery' });
        }
        res.json({ success: isConfirmedJoinResult(joinResult), joinResult });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/delete-group', (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
    const { url, pageId } = req.body;
    if (!url || !pageId) return res.status(400).json({ error: 'Thiếu url hoặc pageId' });
    const groups = readGroupsData(pageId).filter(g => g.url !== url);
    writeGroupsData(groups, pageId);
    broadcastLog({ type: 'info', message: `Đã xóa nhóm khỏi danh sách.`, source: 'settings' });
    res.json({ success: true });
});

app.post('/api/delete-all-groups', (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
    const { pageId } = req.body;
    if (!pageId) return res.status(400).json({ error: 'Thiếu pageId' });
    writeGroupsData([], pageId);
    broadcastLog({ type: 'info', message: `Đã xóa TOÀN BỘ nhóm khỏi danh sách.`, source: 'settings' });
    res.json({ success: true });
});

app.post('/api/post', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu (body)' });
    const { groups, postContent, mediaType, imageFolderPath, videoFolderPath, pageId } = req.body;
    const normalizedMediaType = mediaType === 'video' ? 'video' : 'image';
    if (!groups?.length) return res.status(400).json({ error: 'Thiếu danh sách nhóm.' });
    isPosting = true;
    res.json({ success: true, message: 'Bắt đầu đăng bài.' });
    
    // Gửi log đầu tiên ngay lập tức
    console.log('>>> NHẬN LỆNH ĐĂNG BÀI: ', groups.length, 'nhóm');
    broadcastLog({ type: 'info', message: '🚀 PHÁT LỆNH: Bắt đầu tiến trình đăng bài...', source: 'posting' });

    try {
        console.log('>>> Đang kết nối trình duyệt...');
        broadcastLog({ type: 'info', message: '⏳ Đang kết nối với trình duyệt Cốc Cốc...', source: 'posting' });
        const context = await browserManager.getContext();
        console.log('>>> Đã có context trình duyệt.');
        broadcastLog({ type: 'info', message: '✅ Đã kết nối trình duyệt. Đang chuẩn bị nội dung...', source: 'posting' });
        
        const settings = readSettings();
        await startPosting(groups, (event) => {
            broadcastLog({ ...event, source: 'posting' });
            if (event.type === 'success' && event.groupUrl) markGroupAfterSuccess(event.groupUrl, event.status, pageId);
        }, context, postContent, normalizedMediaType, imageFolderPath, videoFolderPath, settings.delayBetweenPostsMinutes);
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

async function runDiscoveryProcess(keyword, autoJoin = false, pageId, options = {}) {
    if (isDiscovering) return;
    isDiscovering = true;
    const source = options.source || 'manual';
    const settings = readSettings();
    broadcastLog({ type: 'info', message: `🔍 Khám phá nhóm: "${keyword}"`, source: 'discovery' });
    try {
        const context = await browserManager.getContext();
        // Không gọi init/login ở đây vì context đã được browserManager quản lý và có thể đã login rồi.
        // Tuy nhiên để an toàn nếu FBAutomator cần:
        // await automator.init(context); 
        const groups = await execDiscoverGroups(context, keyword, (msg) => {
            if (typeof msg === 'string' && msg.startsWith('[FB_EVENT] ')) {
                try { broadcastLog({ ...JSON.parse(msg.substring(11)), source: 'discovery' }); } catch(e) {}
            } else broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        for (const g of groups) {
            upsertDiscoveryRecord(pageId, g.url, {
                name: g.name,
                lastSeenAt: Date.now(),
                lastDiscoverySource: source
            });
        }
        if (autoJoin) {
            const joinableGroups = groups.filter((group) => shouldAttemptJoin(group, pageId, settings));
            const limitedGroups = joinableGroups.slice(0, settings.maxAutoJoinPerRun);
            if (joinableGroups.length > limitedGroups.length) {
                broadcastLog({
                    type: 'info',
                    message: `Đang giới hạn join để tránh spam: ${limitedGroups.length}/${joinableGroups.length} nhóm trong đợt này.`,
                    source: 'discovery'
                });
            }
            for (const g of limitedGroups) {
                upsertDiscoveryRecord(pageId, g.url, {
                    name: g.name,
                    lastSeenAt: Date.now(),
                    lastJoinAttemptAt: Date.now(),
                    lastJoinStatus: 'attempting'
                });
                const joinResult = await execJoinGroup(context, g.url, (m) => broadcastLog({ type: 'info', message: m, source: 'discovery' }));
                const joinConfirmed = isConfirmedJoinResult(joinResult);
                if (joinConfirmed && pageId) {
                    const match = g.url.match(/facebook\.com\/groups\/([^/?#]+)/i);
                    const groupId = match ? decodeURIComponent(match[1]).trim() : 'unknown';
                    upsertGroupData({ id: groupId, name: g.name, url: g.url, lastPostStatus: 'Sẵn sàng', isSelectable: true }, pageId);
                }
                if (joinConfirmed) {
                    upsertDiscoveryRecord(pageId, g.url, {
                        name: g.name,
                        lastSeenAt: Date.now(),
                        lastJoinAttemptAt: Date.now(),
                        lastJoinSuccessAt: Date.now(),
                        lastJoinStatus: joinResult.status
                    });
                } else {
                    upsertDiscoveryRecord(pageId, g.url, {
                        name: g.name,
                        lastSeenAt: Date.now(),
                        lastJoinAttemptAt: Date.now(),
                        lastJoinStatus: joinResult?.status || 'failed',
                        lastJoinReason: joinResult?.reason || ''
                    });
                }
                await new Promise(r => setTimeout(r, 15000));
            }
        }
        broadcastLog({ type: 'done', message: 'Hoàn thành khám phá.', source: 'discovery' });
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi: ${e.message}`, source: 'discovery' });
    } finally { isDiscovering = false; }
}

app.listen(PORT, () => {
    console.log(`[Server] running at http://localhost:${PORT}`);
    scheduleAutoDiscovery();
});
