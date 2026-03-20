const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { startPosting } = require('./index.js');
const { execGetGroups } = require('./get_groups.js'); // Keep this line
const { execDiscoverGroups, execJoinGroup } = require('./discover_groups'); // Changed from .js
const browserManager = require('./browser_manager'); // Changed from .js
const FBAutomator = require('./fb_automator'); // Added
const dotenv = require('dotenv'); // Added

const app = express();
app.use(cors());
app.use(express.json());
// Middleware xá»­ lÃ½ lá»—i JSON parse Ä‘á»ƒ trÃ¡nh crash server
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('[Server] Lá»—i JSON body khÃ´ng há»£p lá»‡:', err.message);
        return res.status(400).json({ error: 'Dá»¯ liá»‡u JSON khÃ´ng há»£p lá»‡' });
    }
    next();
});

const PORT = 3001;

let isPosting = false;
let isScanning = false;
let isDiscovering = false;
let isHarvestingVisible = false;
let visibleHarvestTimer = null;
let isCheckWorkerRunning = false;
let activeClients = [];
let scanControl = { cancelled: false };
const groupsDataPath = path.join(__dirname, 'groups_data.json');
const postedHistoryPath = path.join(__dirname, 'posted_history.txt');

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
        postedTime: new Date(postedTs).toLocaleString('vi-VN'),
        lastPostStatus: isRecent ? 'Da dang boi bot < 2 ngay' : (group.lastPostStatus || 'Da dang boi bot'),
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
    if (index === -1) groups.push(group);
    else groups[index] = { ...groups[index], ...group };
    writeGroupsData(groups);
}

function normalizeKeyword(text = '') {
    return String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/Ä‘/g, 'd')
        .replace(/Ä/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function parseFBTime(timeStr) {
    if (!timeStr) return null;

    const now = new Date();
    const s = normalizeKeyword(timeStr);
    if (s.includes('vua xong') || s.includes('moi day') || s.includes('bay gio')) return now;

    const numMatch = s.match(/\d+/);
    if (!numMatch) {
        if (s.includes('hom qua')) {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            return d;
        }
        if (s.includes('tuan') || s.includes('thang') || s.includes('nam')) {
            return new Date(2000, 0, 1);
        }
        return now;
    }

    const num = parseInt(numMatch[0], 10);
    if (s.includes('phut')) return new Date(now.getTime() - num * 60000);
    if (s.includes('gio')) return new Date(now.getTime() - num * 3600000);
    if (s.includes('ngay')) return new Date(now.getTime() - num * 86400000);
    if (s.includes('hom qua')) {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d;
    }
    if (s.includes('tuan') || s.includes('thang') || s.includes('nam')) {
        return new Date(2000, 0, 1);
    }
    return now;
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

                    const lowerId = groupId.toLowerCase();
                    if (['feed', 'joins', 'discover', 'search', 'create', 'notifications'].includes(lowerId)) continue;

                    const card = anchor.closest('[role="article"], [role="listitem"], [data-visualcompletion], li, div');
                    const parts = [
                        cleanText(anchor.innerText),
                        cleanText(anchor.getAttribute('aria-label')),
                        cleanText(card?.innerText),
                        cleanText(anchor.parentElement?.innerText)
                    ].filter(Boolean);

                    const name = parts.sort((a, b) => b.length - a.length)[0] || groupId;
                    const key = `${groupId}|${absoluteUrl}`;
                    if (seen.has(key)) continue;
                    seen.add(key);

                    rows.push({
                        id: groupId,
                        name,
                        url: absoluteUrl,
                        members: 'N/A',
                        sourceHint: location.href
                    });
                }

                return rows;
            });

            groupsOnPage.forEach((group) => harvested.push(group));
        } catch (e) {
            broadcastLog({
                type: 'warning',
                message: `KhÃ´ng Ä‘á»c Ä‘Æ°á»£c DOM tá»« tab ${page.url()}: ${e.message}`,
                source: 'visible-harvest'
            });
        }
    }

    let added = 0;
    let updated = 0;

    for (const group of harvested) {
        if (!isValidVisibleGroup(group)) continue;
        if (normalizedKeyword && !normalizeKeyword(group.name).includes(normalizedKeyword)) continue;

        const existing = readGroupsData().find((item) => item.url === group.url);
        const mergedGroup = {
            ...existing,
            ...group,
            lastPostStatus: existing?.lastPostStatus || 'Hang doi...',
            postedTime: existing?.postedTime || null,
            isSelectable: existing?.isSelectable ?? false
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
        broadcastLog({
            type: 'info',
            message: `Thu tá»« mÃ n hÃ¬nh: +${added} nhÃ³m má»›i, cáº­p nháº­t ${updated} nhÃ³m.`,
            source: 'visible-harvest'
        });
    }

    return { added, updated };
}

async function startPendingCheckWorker() {
    if (isCheckWorkerRunning) return;
    isCheckWorkerRunning = true;

    const context = await browserManager.getContext();
    const automator = new FBAutomator((msg) => {
        if (typeof msg === 'string') {
            broadcastLog({ type: 'info', message: msg, source: 'checking' });
        }
    });
    await automator.init(context);

    try {
        broadcastLog({ type: 'info', message: 'Worker check bÃ i Ä‘Ã£ báº­t.', source: 'checking' });

        while (true) {
            if (isPosting) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                continue;
            }

            const groups = readGroupsData();
            const nextGroup = groups.find((group) => group.lastPostStatus === 'Hang doi...');

            if (!nextGroup) {
                if (!isScanning && !isHarvestingVisible) break;
                await new Promise((resolve) => setTimeout(resolve, 2000));
                continue;
            }

            const workingGroup = {
                ...nextGroup,
                lastPostStatus: 'Dang check bai...',
                isSelectable: false
            };
            upsertGroupData(workingGroup);
            broadcastLog({ type: 'group_updated', group: workingGroup, source: 'checking' });

            try {
                const actorForGroup = await automator.getActorFromGroupContext(workingGroup.url) || await automator.getCurrentUserId();
                const checkUrl = `${workingGroup.url.replace(/\/$/, '')}/user/${actorForGroup}/`;
                workingGroup.actorIdUsed = actorForGroup;
                broadcastLog({ type: 'info', message: `Check bÃ i táº¡i ${checkUrl}`, source: 'checking' });

                await automator.page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await automator.page.waitForTimeout(2500);

                const detail = await automator.page.evaluate(() => {
                    const postEls = Array.from(document.querySelectorAll('div[role="feed"] [role="article"], div[role="main"] [role="article"]'));
                    let newestTs = null;

                    if (postEls.length > 0) {
                        const timeEl = postEls[0].querySelector('a[aria-label][href*="/posts/"], a[href*="/posts/"], a[role="link"][aria-label], span[aria-label]');
                        newestTs = timeEl?.getAttribute('aria-label') || timeEl?.innerText || null;
                    }

                    return { newestTs };
                });

                const parsedTime = parseFBTime(detail?.newestTs);
                const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

                if (parsedTime) {
                    workingGroup.postedTime = parsedTime.toLocaleString('vi-VN');
                    if (parsedTime.getTime() > twoDaysAgo) {
                        workingGroup.lastPostStatus = 'Da co bai moi trong 2 ngay';
                        workingGroup.isSelectable = false;
                    } else {
                        workingGroup.lastPostStatus = 'San sang > 2 ngay';
                        workingGroup.isSelectable = true;
                    }
                } else {
                    workingGroup.lastPostStatus = 'San sang, chua ro ngay';
                    workingGroup.isSelectable = true;
                }
            } catch (e) {
                workingGroup.lastPostStatus = 'Loi check bai';
                workingGroup.isSelectable = true;
                broadcastLog({ type: 'warning', message: `Lá»—i check ${workingGroup.name}: ${e.message}`, source: 'checking' });
            }

            upsertGroupData(workingGroup);
            broadcastLog({ type: 'group_updated', group: workingGroup, source: 'checking' });
            await new Promise((resolve) => setTimeout(resolve, 4000));
        }
    } catch (e) {
        broadcastLog({ type: 'error', message: `Worker check bÃ i lá»—i: ${e.message}`, source: 'checking' });
    } finally {
        try { await automator.page?.close(); } catch (e) {}
        isCheckWorkerRunning = false;
        broadcastLog({ type: 'done', message: 'Worker check bÃ i Ä‘Ã£ dá»«ng.', source: 'checking' });
    }
}

// API Láº¥y danh sÃ¡ch nhÃ³m Ä‘Ã£ tham gia (lÆ°u trong file)
app.get('/api/groups', (req, res) => {
    if (fs.existsSync(groupsDataPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(groupsDataPath, 'utf-8'));
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Lá»—i parse file JSON data', details: e.message });
        }
    } else {
        res.json([]);
    }
});

// API QuÃ©t danh sÃ¡ch nhÃ³m Ä‘Ã£ tham gia tá»« FB
app.post('/api/fetch-groups', async (req, res) => {
    // NgÄƒn cháº·n cháº¡y song song náº¿u Ä‘Ã£ cÃ³ tiáº¿n trÃ¬nh quÃ©t Ä‘ang cháº¡y
    if (isScanning) {
        return res.status(400).json({ error: 'Tiáº¿n trÃ¬nh quÃ©t Ä‘ang cháº¡y, vui lÃ²ng Ä‘á»£i cho Ä‘áº¿n khi hoÃ n táº¥t.' });
    }
    
    isScanning = true;
    scanControl = { cancelled: false };
    const keyword = req.body.keyword || '';
    broadcastLog({ type: 'info', message: `Báº¯t Ä‘áº§u quÃ©t nhÃ³m Ä‘Ã£ tham gia vá»›i tá»« khÃ³a: "${keyword}"`, source: 'scanning' });
    
    try {
        const context = await browserManager.getContext();
        execGetGroups(context, keyword, (msg) => {
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        if (event.type === 'group_found' || event.type === 'group_updated') {
                            upsertGroupData(event.group);
                        }
                        broadcastLog({ ...event, source: 'scanning' });
                    } catch(e) {}
                } else {
                    broadcastLog({ type: 'info', message: msg, source: 'scanning' });
                }
            }
        }, () => scanControl.cancelled).then(() => {
            isScanning = false;
            scanControl = { cancelled: false };
            broadcastLog({ type: 'done', message: 'ÄÃ£ hoÃ n thÃ nh quÃ©t nhÃ³m Ä‘Ã£ tham gia.', source: 'scanning' });
        }).catch(err => {
            isScanning = false;
            scanControl = { cancelled: false };
            broadcastLog({ type: 'error', message: `Lá»—i quÃ©t nhÃ³m: ${err.message}`, source: 'scanning' });
        });

        startPendingCheckWorker().catch((e) => {
            broadcastLog({ type: 'error', message: `KhÃ´ng thá»ƒ báº­t worker check bÃ i: ${e.message}`, source: 'checking' });
        });
        
        res.json({ success: true, message: 'Tiáº¿n trÃ¬nh quÃ©t Ä‘ang cháº¡y ngáº§m...' });
    } catch(e) {
        isScanning = false;
        scanControl = { cancelled: false };
        res.status(500).json({ error: 'KhÃ´ng thá»ƒ khá»Ÿi táº¡o trÃ¬nh duyá»‡t', details: e.message });
    }
});

app.post('/api/stop-scan', (req, res) => {
    if (!isScanning) {
        return res.status(400).json({ error: 'Hiá»‡n khÃ´ng cÃ³ tiáº¿n trÃ¬nh quÃ©t nÃ o Ä‘ang cháº¡y.' });
    }

    scanControl.cancelled = true;
    broadcastLog({ type: 'warning', message: 'ÄÃ£ nháº­n yÃªu cáº§u dá»«ng quÃ©t. Há»‡ thá»‘ng sáº½ dá»«ng sau bÆ°á»›c Ä‘ang cháº¡y.', source: 'scanning' });
    res.json({ success: true, message: 'ÄÃ£ gá»­i yÃªu cáº§u dá»«ng quÃ©t.' });
});

app.post('/api/start-visible-harvest', async (req, res) => {
    if (isHarvestingVisible) {
        return res.status(400).json({ error: 'Cháº¿ Ä‘á»™ thu tá»« mÃ n hÃ¬nh Ä‘ang cháº¡y.' });
    }

    try {
        const context = await browserManager.getContext();
        const keyword = req.body?.keyword || '';
        isHarvestingVisible = true;

        visibleHarvestTimer = setInterval(async () => {
            if (!isHarvestingVisible) return;
            try {
                await harvestVisibleGroups(context, keyword);
            } catch (e) {
                broadcastLog({
                    type: 'error',
                    message: `Lá»—i thu tá»« mÃ n hÃ¬nh: ${e.message}`,
                    source: 'visible-harvest'
                });
            }
        }, 4000);

        await harvestVisibleGroups(context, keyword);
        startPendingCheckWorker().catch((e) => {
            broadcastLog({ type: 'error', message: `KhÃ´ng thá»ƒ báº­t worker check bÃ i: ${e.message}`, source: 'checking' });
        });
        broadcastLog({
            type: 'start',
            message: 'ÄÃ£ báº­t cháº¿ Ä‘á»™ thu nhÃ³m tá»« mÃ n hÃ¬nh hiá»‡n táº¡i. Báº¡n cá»© lÆ°á»›t Facebook, bot sáº½ gom nhÃ³m Ä‘ang hiá»‡n.',
            source: 'visible-harvest'
        });

        res.json({ success: true, message: 'ÄÃ£ báº­t thu nhÃ³m tá»« mÃ n hÃ¬nh.' });
    } catch (e) {
        isHarvestingVisible = false;
        if (visibleHarvestTimer) clearInterval(visibleHarvestTimer);
        visibleHarvestTimer = null;
        res.status(500).json({ error: 'KhÃ´ng thá»ƒ báº­t thu tá»« mÃ n hÃ¬nh', details: e.message });
    }
});

app.post('/api/stop-visible-harvest', (req, res) => {
    if (!isHarvestingVisible) {
        return res.status(400).json({ error: 'Hiá»‡n khÃ´ng cÃ³ cháº¿ Ä‘á»™ thu tá»« mÃ n hÃ¬nh nÃ o Ä‘ang cháº¡y.' });
    }

    isHarvestingVisible = false;
    if (visibleHarvestTimer) clearInterval(visibleHarvestTimer);
    visibleHarvestTimer = null;
    broadcastLog({
        type: 'done',
        message: 'ÄÃ£ dá»«ng thu nhÃ³m tá»« mÃ n hÃ¬nh hiá»‡n táº¡i.',
        source: 'visible-harvest'
    });
    res.json({ success: true, message: 'ÄÃ£ dá»«ng thu tá»« mÃ n hÃ¬nh.' });
});
// API KhÃ¡m phÃ¡ nhÃ³m má»›i (ChÆ°a tham gia)
app.post('/api/discover-groups', (req, res) => {
    const keyword = req.body.keyword || '';
    const autoJoin = req.body.autoJoin === true || req.body.autoJoin === 'true';
    
    console.log(`[API] Khá»Ÿi cháº¡y KhÃ¡m phÃ¡ nhÃ³m: ${keyword}, AutoJoin=${autoJoin}`);
    runDiscoveryProcess(keyword, autoJoin);
    
    res.json({ success: true, message: 'Tiáº¿n trÃ¬nh khÃ¡m phÃ¡ Ä‘Ã£ báº¯t Ä‘áº§u vÃ  Ä‘ang cháº¡y ngáº§m...' });
});

// API Gia nháº­p nhÃ³m
app.post('/api/join-group', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiáº¿u dá»¯ liá»‡u yÃªu cáº§u' });
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiáº¿u URL nhÃ³m' });

    broadcastLog({ type: 'info', message: `YÃªu cáº§u gia nháº­p nhÃ³m: ${url}` });

    try {
        const context = await browserManager.getContext();
        const success = await execJoinGroup(context, url, (msg) => {
            broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        res.json({ success });
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lá»—i khi gia nháº­p nhÃ³m: ${e.message}` });
        res.status(500).json({ error: e.message });
    }
});

// API ÄÄƒng bÃ i
app.post('/api/post', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiáº¿u dá»¯ liá»‡u yÃªu cáº§u' });
    const { groups, postContent, imageFolderPath } = req.body;
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
        return res.status(400).json({ error: 'Vui lÃ²ng cung cáº¥p danh sÃ¡ch nhÃ³m cáº§n Ä‘Äƒng.' });
    }

    // Cho phÃ©p cháº¡y song song vá»›i Discovery/Scanning
    isPosting = true;
    res.json({ success: true, message: 'ÄÃ£ báº¯t Ä‘áº§u tiáº¿n trÃ¬nh Ä‘Äƒng bÃ i' });
    broadcastLog({ type: 'start', message: `Tiáº¿n trÃ¬nh Ä‘Äƒng bÃ i báº¯t Ä‘áº§u vá»›i ${groups.length} nhÃ³m`, source: 'posting' });

    try {
        const context = await browserManager.getContext();
        await startPosting(groups, (event) => {
            broadcastLog({ ...event, source: 'posting' });
            
            // Náº¿u Ä‘Äƒng thÃ nh cÃ´ng, XÃ³a nhÃ³m Ä‘Ã³ khá»i danh sÃ¡ch Ä‘Ã£ quÃ©t luÃ´n
            if (event.type === 'success' && event.groupUrl) {
                markGroupAfterSuccess(event.groupUrl, event.status);
            }
        }, context, postContent, imageFolderPath);
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lá»—i ná»™i bá»™: ${e.message}`, source: 'posting' });
    } finally {
        isPosting = false;
        broadcastLog({ type: 'done', message: 'Táº¥t cáº£ tiáº¿n trÃ¬nh Ä‘Ã£ káº¿t thÃºc.', source: 'posting' });
    }
});

// HÃ m xÃ³a nhÃ³m khá»i danh sÃ¡ch cá»¥c bá»™ sau khi Ä‘Äƒng bÃ i xong
function markGroupAfterSuccess(groupUrl, status = 'published') {
    try {
        const groups = readGroupsData();
        const index = groups.findIndex((g) => g.url === groupUrl);
        if (index === -1) return;

        const postedTs = Date.now();
        const updatedGroup = {
            ...groups[index],
            lastBotPostedAt: postedTs,
            postedTime: new Date(postedTs).toLocaleString('vi-VN'),
            isSelectable: false,
            lastPostStatus: status === 'pending' ? 'Da dang, dang cho duyet' : 'Da dang boi bot < 2 ngay'
        };

        groups[index] = updatedGroup;
        writeGroupsData(groups);
        broadcastLog({
            type: 'group_updated',
            group: updatedGroup,
            source: 'posting'
        });
    } catch (e) {
        console.error('Loi khi danh dau nhom da dang:', e);
    }
}
// Broadcast sá»± kiá»‡n tá»›i toÃ n bá»™ client SSE
function broadcastLog(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    activeClients.forEach(client => {
        try {
            client.res.write(payload);
        } catch (e) {}
    });
}

// SSE Endpoint cho Logs
app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'ÄÃ£ káº¿t ná»‘i luá»“ng Log.' })}\n\n`);

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    activeClients.push(newClient);

    req.on('close', () => {
        activeClients = activeClients.filter(c => c.id !== clientId);
    });
});

// --- Tá»° Äá»˜NG KHÃM PHÃ (AUTO-DISCOVERY) ---
// Cháº¡y ngáº§m má»—i 2 giá» náº¿u Ä‘Æ°á»£c báº­t
let autoDiscoveryInterval = null;
function startAutoDiscovery() {
    if (autoDiscoveryInterval) return;
    console.log('[AutoDisc] Khá»Ÿi táº¡o luá»“ng Tá»± Ä‘á»™ng khÃ¡m phÃ¡ (láº·p láº¡i sau 2 giá»)...');
    autoDiscoveryInterval = setInterval(() => {
        if (!isDiscovering) { // Chá»‰ kiá»ƒm tra náº¿u chÆ°a cÃ³ Discovery nÃ o khÃ¡c ÄANG CHáº Y. CÃ³ thá»ƒ cháº¡y cÃ¹ng lÃºc vá»›i Posting.
            const defaultKeyword = 'viá»‡c lÃ m thiáº¿t káº¿ ná»™i tháº¥t'; // CÃ³ thá»ƒ láº¥y tá»« config
            console.log(`[AutoDisc] Äang tá»± Ä‘á»™ng cháº¡y khÃ¡m phÃ¡ vá»›i tá»« khÃ³a: ${defaultKeyword}`);
            runDiscoveryProcess(defaultKeyword, true); 
        }
    }, 2 * 60 * 60 * 1000); 
}

// HÃ m cháº¡y discovery táº­p trung Ä‘á»ƒ dÃ¹ng chung cho API vÃ  Auto
async function runDiscoveryProcess(keyword, autoJoin = false) {
    if (isDiscovering) return;
    isDiscovering = true;
    broadcastLog({ type: 'info', message: `ðŸ” Báº¯t Ä‘áº§u tiáº¿n trÃ¬nh khÃ¡m phÃ¡ nhÃ³m: "${keyword}"`, source: 'discovery' });
    
    try {
        console.log(`[Server] Äang kiá»ƒm tra Ä‘Äƒng nháº­p trÆ°á»›c khi khÃ¡m phÃ¡...`);
        const context = await browserManager.getContext();
        
        // Äáº£m báº£o ngÆ°á»i dÃ¹ng Ä‘Ã£ Ä‘Äƒng nháº­p
        const automator = new FBAutomator((msg) => {
            broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        await automator.init(context);
        await automator.login(); // Äá»£i Ä‘Äƒng nháº­p tá»‘i Ä‘a 10 phÃºt
        
        const groups = await execDiscoverGroups(context, keyword, (msg) => {
            console.log(`[Discovery Log] ${msg}`);
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        broadcastLog({ ...event, source: 'discovery' });
                    } catch(e) {}
                } else {
                    broadcastLog({ type: 'info', message: msg, source: 'discovery' });
                }
            }
        });

        if (autoJoin && groups.length > 0) {
            const joinable = groups.filter(g => g.canJoin && !g.isJoined);
            broadcastLog({ type: 'info', message: `[Discovery] TÃ¬m tháº¥y ${groups.length} nhÃ³m. Tiáº¿n hÃ nh Tham gia ${joinable.length} nhÃ³m...`, source: 'discovery' });
            
            for (let i = 0; i < joinable.length; i++) {
                const g = joinable[i];
                broadcastLog({ type: 'info', message: `[Discovery] Äang tham gia nhÃ³m (${i+1}/${joinable.length}): ${g.name}`, source: 'discovery' });
                const success = await execJoinGroup(context, g.url, (msg) => {
                    broadcastLog({ type: 'info', message: msg, source: 'discovery' });
                });
                
                if (success) {
                    broadcastLog({ type: 'group_discovered', group: { ...g, isJoined: true, canJoin: false }, source: 'discovery' });
                }

                if (i < joinable.length - 1) {
                    const delaySec = Math.floor(Math.random() * (10 - 5 + 1) + 5);
                    await new Promise(r => setTimeout(r, delaySec * 1000));
                }
            }
        }
        broadcastLog({ type: 'done', message: 'HoÃ n thÃ nh tiáº¿n trÃ¬nh khÃ¡m phÃ¡.', source: 'discovery' });
    } catch (err) {
        console.error('[Discovery Error]', err);
        broadcastLog({ type: 'error', message: `Lá»—i khÃ¡m phÃ¡: ${err.message}`, source: 'discovery' });
    } finally {
        isDiscovering = false;
    }
}

app.listen(PORT, () => {
    console.log(`[Server] API Ä‘ang cháº¡y táº¡i http://localhost:${PORT}`);
    // KÃ­ch hoáº¡t tá»± Ä‘á»™ng khÃ¡m phÃ¡ khi khá»Ÿi Ä‘á»™ng server
    startAutoDiscovery();
    startPendingCheckWorker().catch((e) => {
        console.error('[Server] KhÃ´ng thá»ƒ báº­t worker check bÃ i khi khá»Ÿi Ä‘á»™ng:', e.message);
    });
});

