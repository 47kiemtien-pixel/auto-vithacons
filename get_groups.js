const fs = require('fs');
const path = require('path');

function parseFBTime(timeStr) {
    if (!timeStr) return null;

    const now = new Date();
    const s = normalizeText(timeStr);

    if (s.includes('vua xong') || s.includes('moi day') || s.includes('bay gio')) return now;

    const numMatch = s.match(/\d+/);
    if (!numMatch) {
        if (s.includes('hom qua')) {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            return d;
        }
        if (s.includes('thang') || s.includes('nam')) return new Date(2000, 0, 1);
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

function normalizeText(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'D')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function getPreferredActorOverride() {
    const debugInfoPath = path.join(__dirname, 'coccoc_page_info.json');
    if (!fs.existsSync(debugInfoPath)) return null;

    try {
        const raw = JSON.parse(fs.readFileSync(debugInfoPath, 'utf-8'));
        const links = Array.isArray(raw.links) ? raw.links : [];

        const directProfileLink = links.find((link) => /profile\.php\?/.test(link.href || '') && /id=\d+/.test(link.href || ''));
        if (directProfileLink) {
            const match = directProfileLink.href.match(/id=(\d+)/);
            if (match) return match[1];
        }

        const pageRootLink = links.find((link) => /^https:\/\/www\.facebook\.com\/[^\/?#]+\/?$/.test(link.href || ''));
        if (pageRootLink) {
            const match = pageRootLink.href.match(/^https:\/\/www\.facebook\.com\/([^\/?#]+)\/?$/);
            if (match) return match[1];
        }
    } catch (e) {}

    return null;
}

function extractSeedGroupsFromDebugFiles(keyword = '') {
    const normalizedKeyword = normalizeText(keyword);
    const debugFiles = [
        path.join(__dirname, 'groups_card_debug.json'),
        path.join(__dirname, 'coccoc_groups_joins_info.json')
    ];
    const seeded = [];
    const seen = new Set();

    const maybePush = (item) => {
        if (!item || !item.url || !item.name) return;
        if (seen.has(item.url)) return;
        const haystack = normalizeText(`${item.name} ${item.rawText || ''}`);
        if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return;
        seen.add(item.url);
        seeded.push({
            id: item.id,
            name: item.name,
            rawText: item.rawText || item.name,
            url: item.url,
            members: item.members || 'N/A'
        });
    };

    for (const filePath of debugFiles) {
        if (!fs.existsSync(filePath)) continue;
        try {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const list = Array.isArray(raw) ? raw : (raw.groupLinks || raw.links || []);
            for (const entry of list) {
                const href = entry.href || '';
                if (!href.includes('/groups/')) continue;
                if (
                    href.includes('/user/') ||
                    href.includes('/posts/') ||
                    href.includes('/groups/feed/') ||
                    href.includes('/groups/discover/') ||
                    href.includes('/groups/categories/') ||
                    href.endsWith('/groups/') ||
                    href.includes('/groups/joins/')
                ) {
                    continue;
                }

                const idMatch = href.match(/\/groups\/(\d+)\/?/) || href.match(/\/groups\/([^\/\?]+)/);
                if (!idMatch) continue;

                const id = idMatch[1];
                const rawText = `${entry.text || ''}`.trim();
                const name = rawText
                    .split('\n')
                    .map((part) => part.trim())
                    .find((part) => {
                        const normalized = normalizeText(part);
                        return normalized && normalized !== 'xem nhom' && normalized !== 'view group';
                    });

                maybePush({
                    id,
                    name: name || id,
                    rawText,
                    url: `https://www.facebook.com/groups/${id}/`,
                    members: 'N/A'
                });
            }
        } catch (_) {}
    }

    return seeded;
}

async function resolveCurrentActorId(page, logCallback = () => {}) {
    const tryExtractActor = async (url, label) => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        const actor = await page.evaluate(() => {
            const ignoredSlugs = new Set([
                '', 'me', 'groups', 'pages', 'watch', 'marketplace', 'messages', 'notifications',
                'friends', 'gaming', 'reel', 'reels', 'bookmarks', 'memories', 'events', 'feeds',
                'feed', 'settings', 'help', 'privacy', 'ads', 'ad_center', 'professional_dashboard',
                'latest'
            ]);

            const normalize = (value) => (value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u0111/g, 'd')
                .replace(/\u0110/g, 'D')
                .toLowerCase();

            const parseProfileId = (href) => {
                if (!href || typeof href !== 'string') return null;
                const profileMatch = href.match(/profile\.php\?(?:[^#]*?&)?id=(\d+)/i);
                if (profileMatch) return profileMatch[1];
                const userMatch = href.match(/\/user\/(\d+)\//i);
                if (userMatch) return userMatch[1];
                return null;
            };

            const pageText = normalize(document.body.innerText || '');
            const urlPathMatch = window.location.pathname.match(/^\/([^\/?#]+)(?:\/|$)/);
            const currentSlug = urlPathMatch ? urlPathMatch[1] : '';
            const currentPageLooksManaged = /quan ly trang|manage page|cong cu chuyen nghiep|professional dashboard/.test(pageText);

            const candidates = new Map();
            const addCandidate = (id, score, source) => {
                if (!id || score <= 0) return;
                const existing = candidates.get(id) || { id, score: 0, sources: [] };
                existing.score += score;
                existing.sources.push(source);
                candidates.set(id, existing);
            };

            const anchors = Array.from(document.querySelectorAll('a[href]'));
            for (const a of anchors) {
                const href = a.href || '';
                const text = (a.innerText || a.getAttribute('aria-label') || '').trim();
                const normalizedText = normalize(text);
                const profileId = parseProfileId(href);

                if (profileId) {
                    let score = 0;
                    if (/profile\.php/i.test(href)) score += 10;
                    if (/fb_profile_edit_entry_point|profile_action|profile_plus/i.test(href)) score += 25;
                    if (/\/(about|followers|following|mentions|photos)(?:\/|$)/i.test(href)) score += 10;
                    if (/trang ca nhan|your profile|see your profile|chinh sua|edit/.test(normalizedText)) score += 20;
                    if (/fb_profile_edit_entry_point/.test(href) && currentPageLooksManaged) score += 50;
                    addCandidate(profileId, score, text || href);
                }

                const pageIdMatch = href.match(/[?&]page_id=(\d+)/i);
                if (pageIdMatch && /ad_center|business|latest/i.test(href)) {
                    addCandidate(`page:${pageIdMatch[1]}`, 35, text || href);
                }

                const assetIdMatch = href.match(/[?&]asset_id=(\d+)/i);
                if (assetIdMatch && /business|latest|leads_center|inbox/i.test(href)) {
                    addCandidate(`asset:${assetIdMatch[1]}`, 30, text || href);
                }

                const slugMatch = href.match(/^https:\/\/www\.facebook\.com\/([^\/\?#]+)(?:\/|$)/i);
                if (!slugMatch) continue;

                const slug = slugMatch[1];
                if (ignoredSlugs.has(slug.toLowerCase())) continue;
                if (/^(groups|profile\.php)$/i.test(slug)) continue;

                let score = 0;
                if (/\/(about|followers|following|mentions|photos)(?:\/|$)/i.test(href)) score += 15;
                if (/profile_action|profile_plus|fb_profile_edit_entry_point|ref=profile/i.test(href)) score += 20;
                if (text && text.length > 0 && text.length < 80) score += 5;

                if (score > 0) {
                    if (currentPageLooksManaged && currentSlug && slug.toLowerCase() === currentSlug.toLowerCase()) {
                        score += 50;
                    }
                    addCandidate(`slug:${slug}`, score, text || href);
                }
            }

            if (currentPageLooksManaged && currentSlug) {
                const directPageEditLink = anchors.find((a) => {
                    const href = a.href || '';
                    return /fb_profile_edit_entry_point/.test(href) && /profile\.php\?/.test(href);
                });
                if (directPageEditLink) {
                    const match = directPageEditLink.href.match(/profile\.php\?(?:[^#]*?&)?id=(\d+)/i);
                    if (match) {
                        return { id: match[1], score: 999, sources: [`direct-page-edit:${currentSlug}`] };
                    }
                }

                return { id: `slug:${currentSlug}`, score: 900, sources: [`current-page-slug:${currentSlug}`] };
            }

            return Array.from(candidates.values()).sort((a, b) => b.score - a.score)[0] || null;
        });

        if (actor) {
            logCallback(`[FB] Actor candidate (${label}): ${actor.id}`);
        }

        return actor;
    };

    try {
        const homeActor = await tryExtractActor('https://www.facebook.com/', 'home');
        if (
            homeActor?.id &&
            !homeActor.id.startsWith('slug:') &&
            !homeActor.id.startsWith('page:') &&
            !homeActor.id.startsWith('asset:')
        ) {
            return homeActor.id;
        }

        const groupsActor = await tryExtractActor('https://www.facebook.com/groups/joins/?nav_source=tab', 'groups');
        if (
            groupsActor?.id &&
            !groupsActor.id.startsWith('slug:') &&
            !groupsActor.id.startsWith('page:') &&
            !groupsActor.id.startsWith('asset:')
        ) {
            return groupsActor.id;
        }

    } catch (e) {
        logCallback(`[FB] Khong doc duoc actor hien hanh: ${e.message}`);
    }

    const preferredActor = getPreferredActorOverride();
    if (preferredActor) {
        logCallback(`[FB] Dung preferred actor override: ${preferredActor}`);
        return preferredActor;
    }

    try {
        logCallback('[FB] Fallback ve tai khoan nen...');
        await page.goto('https://www.facebook.com/me', { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => {
            const url = window.location.href;
            return !url.endsWith('facebook.com/me') && !url.endsWith('facebook.com/me/');
        }, { timeout: 15000 }).catch(() => {});

        const userId = await page.evaluate(() => {
            const cookieMatch = document.cookie.match(/c_user=(\d+)/);
            if (cookieMatch) return cookieMatch[1];

            try {
                if (window.require) {
                    const config = window.require('CometCurrentUserConfig');
                    if (config && config.userID) return config.userID;
                }
            } catch (e) {}

            const urlMatch = window.location.href.match(/profile\.php\?id=(\d+)/);
            if (urlMatch) return urlMatch[1];

            return null;
        });

        if (userId) return userId;

        const currentUrl = page.url();
        const usernameMatch = currentUrl.match(/facebook\.com\/([^\/\?]+)/);
        if (usernameMatch && usernameMatch[1] !== 'me') return usernameMatch[1];
    } catch (e) {
        logCallback(`[FB] Loi fallback actor: ${e.message}`);
    }

    return 'me';
}

async function resolveActorFromGroupContext(page, groupUrl, logCallback = () => {}) {
    const cleanGroupUrl = groupUrl.replace(/\/$/, '') + '/';
    const extractActorCandidates = async () => {
        return await page.evaluate(() => {
            const normalize = (value) => (value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u0111/g, 'd')
                .replace(/\u0110/g, 'D')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

            const parseActorFromHref = (href) => {
                if (!href || typeof href !== 'string') return null;
                const profileMatch = href.match(/profile\.php\?(?:[^#]*?&)?id=(\d+)/i);
                if (profileMatch) return profileMatch[1];

                const slugMatch = href.match(/^https:\/\/www\.facebook\.com\/([^\/?#]+)(?:\/|$)/i);
                if (!slugMatch) return null;
                const slug = slugMatch[1];
                if ([
                    'groups', 'watch', 'marketplace', 'messages', 'notifications', 'me', 'profile.php',
                    'photo', 'photos', 'posts', 'videos', 'media', 'events', 'reels', 'reel', 'permalink',
                    'share', 'plugins', 'hashtag', 'stories'
                ].includes(slug.toLowerCase())) {
                    return null;
                }
                return slug;
            };

            const scoreContainer = (container) => {
                const text = normalize(container?.innerText || '');
                let score = 0;
                if (/ban viet gi di|what's on your mind|write something/.test(text)) score += 60;
                if (/dang tuong tac voi tu cach|interacting as|tu cach/.test(text)) score += 80;
                if (/tao bai viet cong khai|public post|post anonymously/.test(text)) score += 15;
                return score;
            };

            const containers = Array.from(document.querySelectorAll('div[role="main"] div, div[role="feed"] div, div[data-pagelet], div[role="dialog"] div'));
            const candidates = [];

            for (const container of containers) {
                const baseScore = scoreContainer(container);
                if (baseScore <= 0) continue;

                const anchors = Array.from(container.querySelectorAll('a[href]'));
                for (const a of anchors) {
                    const actorId = parseActorFromHref(a.href);
                    if (!actorId) continue;

                    const text = normalize(a.innerText || a.getAttribute('aria-label') || '');
                    let score = baseScore;
                    if (text.length > 0 && text.length < 80) score += 10;
                    if (/trang ca nhan|your profile|see your profile|chinh sua|edit/.test(text)) score += 20;
                    if (/photo|anh|video|reel|tin|story/.test(text)) score -= 40;
                    candidates.push({ id: actorId, score, text, href: a.href });
                }
            }

            const sorted = candidates.sort((a, b) => b.score - a.score);
            return {
                best: sorted[0] || null,
                samples: sorted.slice(0, 5)
            };
        });
    };

    try {
        await page.goto(cleanGroupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        let actor = await extractActorCandidates();

        if (!actor?.best?.id) {
            const composerSelectors = [
                'div[role="button"] span:has-text("Ban viet gi di")',
                'div[role="button"] span:has-text("What\'s on your mind")',
                'div[role="button"]:has-text("Ban viet gi di")',
                'div[role="button"]:has-text("Write something")'
            ];

            for (const selector of composerSelectors) {
                try {
                    const el = await page.locator(selector).first();
                    if (await el.isVisible()) {
                        await el.click({ timeout: 2000 });
                        await page.waitForTimeout(2500);
                        actor = await extractActorCandidates();
                        break;
                    }
                } catch (e) {}
            }
        }

        if (actor?.samples?.length) {
            logCallback(`[FB] Actor candidates ${cleanGroupUrl}: ${JSON.stringify(actor.samples)}`);
        }

        if (actor?.best?.id) {
            logCallback(`[FB] Actor tu group context: ${actor.best.id}`);
            return actor.best.id;
        }
    } catch (e) {
        logCallback(`[FB] Khong doc duoc actor tu group context: ${e.message}`);
    }

    return null;
}

async function execGetGroups(primaryContext, keyword, logCallback = () => {}, shouldStop = () => false) {
    logCallback('[FB] Dang khoi tao bo quet nhom...');

    const page = await primaryContext.newPage();
    const allGroups = new Map();
    let userIdToCheck = 'me';
    const groupQueue = [];
    let isScanningDone = false;

    const historyPath = path.join(__dirname, 'posted_history.txt');
    const localHistory = new Map();
    if (fs.existsSync(historyPath)) {
        const lines = fs.readFileSync(historyPath, 'utf-8').split('\n');
        for (const line of lines) {
            const [url, ts] = line.split('|');
            if (url && ts) localHistory.set(url.trim(), parseInt(ts, 10));
        }
    }

    try {
        logCallback('[FB] Dang xac dinh identity dang hanh dong...');
        userIdToCheck = await resolveCurrentActorId(page, logCallback);
        logCallback(`[FB] Actor dung de check bai: ${userIdToCheck}`);
    } catch (e) {
        logCallback(`[FB] Loi khi lay actor hien hanh: ${e.message}`);
        userIdToCheck = 'me';
    }

    const detailWorker = async () => {
        logCallback('[FB] Worker check bai da bat dau...');
        const detailPage = await primaryContext.newPage();
        try {
            while (!isScanningDone || groupQueue.length > 0) {
                if (shouldStop()) {
                    logCallback('[FB] Da nhan yeu cau dung quet. Worker se ket thuc.');
                    return;
                }

                if (groupQueue.length === 0) {
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }

                const group = groupQueue.shift();
                logCallback(`[FB] [Worker] Dang kiem tra: ${group.name}`);

                const lastPostTs = localHistory.get(group.url);
                const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

                if (lastPostTs && lastPostTs > twoDaysAgo) {
                    group.postedTime = new Date(lastPostTs).toLocaleString('vi-VN');
                    group.lastPostStatus = 'Da dang trong 2 ngay';
                    group.isSelectable = false;
                    logCallback(`[FB] [Worker] Bo qua ${group.name} vi da dang trong 48h.`);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_updated', group })}`);
                    continue;
                }

                try {
                    const actorForGroup = await resolveActorFromGroupContext(detailPage, group.url, logCallback) || userIdToCheck;
                    const checkUrl = `${group.url.replace(/\/$/, '')}/user/${actorForGroup}/`;
                    group.actorIdUsed = actorForGroup;
                    logCallback(`[FB] [Worker] Check bai tai: ${checkUrl}`);
                    await detailPage.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await detailPage.waitForTimeout(2500);

                    const detail = await detailPage.evaluate(() => {
                        const postEls = Array.from(document.querySelectorAll('div[role="feed"] [role="article"], div[role="main"] [role="article"]'));
                        let newestTs = null;
                        if (postEls.length > 0) {
                            const timeEl = postEls[0].querySelector('a[href*="/posts/"] span, a[href*="/groups/"] span, a[role="link"] span');
                            if (timeEl) newestTs = timeEl.innerText;
                        }

                        const memberEl = Array.from(document.querySelectorAll('span, div')).find((el) =>
                            el.innerText && el.innerText.match(/(\d+[.,]?\d*[KM]?)\s*(thanh vien|members)/i)
                        );

                        return {
                            timeStr: newestTs,
                            memberStr: memberEl ? memberEl.innerText.match(/(\d+[.,]?\d*[KM]?)\s*(thanh vien|members)/i)[0] : 'N/A'
                        };
                    });

                    group.members = detail.memberStr;
                    const parsedTime = parseFBTime(detail.timeStr);
                    if (parsedTime) {
                        group.postedTime = parsedTime.toLocaleString('vi-VN');
                        if (parsedTime.getTime() > twoDaysAgo) {
                            group.lastPostStatus = 'Da co bai moi trong 2 ngay';
                            group.isSelectable = false;
                        } else {
                            group.lastPostStatus = 'San sang > 2 ngay';
                            group.isSelectable = true;
                        }
                    } else {
                        group.lastPostStatus = 'San sang, chua ro ngay';
                        group.isSelectable = true;
                    }

                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_updated', group })}`);
                } catch (e) {
                    if (e.message.includes('Target page, context or browser has been closed')) {
                        logCallback('[FB] [Worker] Browser/page da dong dot ngot. Dung worker.');
                        return;
                    }

                    group.lastPostStatus = 'Loi check bai';
                    group.isSelectable = true;
                    logCallback(`[FB] Loi check chi tiet ${group.name}: ${e.message}`);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_updated', group })}`);
                }

                const delay = Math.floor(Math.random() * 5000) + 5000;
                await new Promise((r) => setTimeout(r, delay));
            }
        } finally {
            try { await detailPage.close(); } catch (e) {}
            logCallback('[FB] Worker da hoan tat.');
        }
    };

    const workerPromise = detailWorker();

    try {
        const searchUrl = 'https://mbasic.facebook.com/groups/?seemore';
        logCallback(`[FB] Truy cap trang nhom (mbasic): ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 90000 });

        const isLoginPage = await page.evaluate(() => document.body.innerText.includes('Dang nhap') || document.querySelector('input[name="email"]'));
        if (isLoginPage) {
            logCallback('[FB] Chua dang nhap. Vui long dang nhap Facebook trong browser bot.');
            await page.waitForFunction(() => !document.querySelector('input[name="email"]'), { timeout: 300000 });
            await page.goto(searchUrl, { waitUntil: 'load', timeout: 90000 });
        }

        await page.waitForTimeout(5000);
        logCallback('[FB] Bat dau thu thap nhom tu mbasic Groups...');

        let stagnantCount = 0;
        let lastNextUrl = page.url();
        const maxScrollAttempts = 120;
        const normalizedKeyword = normalizeText(keyword);

        const seedGroups = extractSeedGroupsFromDebugFiles(keyword);
        if (seedGroups.length > 0) {
            logCallback(`[FB] Nap duoc ${seedGroups.length} nhom tu cache/debug cu.`);
            for (const g of seedGroups) {
                if (!allGroups.has(g.url)) {
                    const groupData = {
                        ...g,
                        postedTime: null,
                        lastPostStatus: 'Hang doi...',
                        isSelectable: false
                    };
                    allGroups.set(g.url, groupData);
                    groupQueue.push(groupData);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: groupData })}`);
                }
            }
        }

        for (let i = 0; i < maxScrollAttempts; i++) {
            if (shouldStop()) {
                logCallback('[FB] Da nhan yeu cau dung quet. Dung vong quet chinh.');
                break;
            }

            const discovered = await page.evaluate(() => {
                const normalize = (value) => (value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\u0111/g, 'd')
                    .replace(/\u0110/g, 'D')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                const extractGroupName = (text) => {
                    if (!text) return '';

                    let cleaned = text.replace(/\s+/g, ' ').trim();
                    cleaned = cleaned.replace(/^Chua doc\s*/i, '');

                    const nowInMatch = cleaned.match(/(?:Bay gio|Vua xong)?\s*trong\s+(.+?):/i);
                    if (nowInMatch && nowInMatch[1]) return nowInMatch[1].trim();

                    const newPostMatch = cleaned.match(/^(.+?)\s+co mot bai viet moi/i);
                    if (newPostMatch && newPostMatch[1]) return newPostMatch[1].trim();

                    const recentActivityMatch = cleaned.match(/^(.+?)\s+Lan hoat dong gan nhat:/i);
                    if (recentActivityMatch && recentActivityMatch[1]) return recentActivityMatch[1].trim();

                    const recentVisitMatch = cleaned.match(/^(.+?)\s+Lan truy cap gan day nhat:/i);
                    if (recentVisitMatch && recentVisitMatch[1]) return recentVisitMatch[1].trim();

                    return cleaned;
                };

                const results = [];
                const seenIds = new Set();
                const allGroupLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));

                for (const a of allGroupLinks) {
                    const href = a.href;
                    if (
                        href.includes('/user/') ||
                        href.includes('/posts/') ||
                        href.includes('/groups/feed/') ||
                        href.includes('/groups/discover/') ||
                        href.includes('/groups/categories/') ||
                        href.endsWith('/groups/') ||
                        href.includes('/groups/joins/')
                    ) {
                        continue;
                    }

                    const idMatch = href.match(/\/groups\/(\d+)\/?/) || href.match(/\/groups\/([^\/\?]+)/);
                    if (!idMatch) continue;

                    const id = idMatch[1];
                    if (seenIds.has(id)) continue;

                    const container = a.closest('table, tr, td, div, li');
                    const textCandidates = [
                        a.innerText,
                        a.getAttribute('aria-label'),
                        container?.innerText,
                        a.parentElement?.innerText
                    ]
                        .filter(Boolean)
                        .map((text) => text.trim())
                        .filter((text) => text.length > 2);

                    const name = textCandidates
                        .map(extractGroupName)
                        .find((text) => {
                            const normalizedText = normalize(text);
                            return normalizedText !== 'xem nhom' && normalizedText !== 'view group';
                        }) || '';

                    if (!name) continue;

                    if (name.length > 2 && name.length < 150) {
                        results.push({
                            id,
                            name,
                            rawText: textCandidates.join(' | '),
                            url: `https://www.facebook.com/groups/${id}/`,
                            members: 'N/A'
                        });
                        seenIds.add(id);
                    }
                }

                return results;
            });

            for (const g of discovered) {
                const matchesKeyword =
                    !normalizedKeyword ||
                    normalizeText(g.name).includes(normalizedKeyword) ||
                    normalizeText(g.rawText).includes(normalizedKeyword);
                if (!matchesKeyword) continue;

                if (!allGroups.has(g.url)) {
                    const groupData = {
                        ...g,
                        postedTime: null,
                        lastPostStatus: 'Hang doi...',
                        isSelectable: false
                    };
                    allGroups.set(g.url, groupData);
                    groupQueue.push(groupData);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: groupData })}`);
                }
            }

            const nextUrl = await page.evaluate(() => {
                const nextLink = Array.from(document.querySelectorAll('a[href]')).find((a) => {
                    const text = (a.innerText || '').trim().toLowerCase();
                    return text.includes('xem them') || text.includes('see more') || (a.href && a.href.includes('seemore'));
                });
                return nextLink ? nextLink.href : null;
            });

            if (i % 5 === 0) {
                logCallback(`[FB] Dang quet... Tim thay ${allGroups.size} nhom.`);
            }

            if (!nextUrl || nextUrl === lastNextUrl) {
                stagnantCount++;
            } else {
                stagnantCount = 0;
                lastNextUrl = nextUrl;
                await page.goto(nextUrl, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
                await page.waitForTimeout(2500);
            }

            if (stagnantCount >= 2) {
                logCallback('[FB] Khong con link xem them tren mbasic, dung quet.');
                break;
            }
        }

        isScanningDone = true;
        await workerPromise;
        logCallback('[FB] Hoan tat quy trinh quet nhom.');
    } catch (e) {
        logCallback(`[FB] Loi: ${e.message}`);
    } finally {
        isScanningDone = true;
        await workerPromise.catch(() => {});
        try { await page.close(); } catch (e) {}
    }
}

module.exports = { execGetGroups };
