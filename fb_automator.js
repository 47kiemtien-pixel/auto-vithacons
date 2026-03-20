const { chromium } = require('playwright');
const path = require('path');
const { sleep } = require('./scheduler');
const fs = require('fs');

class FBAutomator {
    constructor(logCallback = () => {}) {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.userDataDir = path.join(__dirname, 'fb_user_data');
        this.cocCocProjectUserDataDir = path.join(__dirname, 'fb_coccoc_profile');
        this.logCallback = logCallback;
    }

    getStandaloneLaunchConfig() {
        const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
        const coccocCandidates = [
            path.join(localAppData, 'CocCoc', 'Browser', 'Application', 'browser.exe'),
            'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe'
        ];
        const coccocPath = coccocCandidates.find((candidate) => fs.existsSync(candidate));

        if (!coccocPath) {
            throw new Error('Khong tim thay Coc Coc tren may.');
        }

        return {
            executablePath: coccocPath,
            userDataDir: this.cocCocProjectUserDataDir,
            args: ['--no-sandbox', '--disable-notifications']
        };
    }

    async init(externalContext) {
        if (externalContext) {
            this.context = externalContext;
            this.log('[FB] Sá»­ dá»¥ng context trÃ¬nh duyá»‡t tá»« mÃ¡y chá»§...');
        } else {
            this.log('[FB] Khá»Ÿi táº¡o trÃ¬nh duyá»‡t Ä‘á»™c láº­p...');
            const launchConfig = this.getStandaloneLaunchConfig();
            this.context = await chromium.launchPersistentContext(launchConfig.userDataDir, {
                executablePath: launchConfig.executablePath,
                headless: false,
                viewport: { width: 1280, height: 720 },
                args: launchConfig.args
            });
        }
        this.page = await this.context.newPage();
    }

    log(msg) {
        console.log(msg);
        this.logCallback(msg);
    }

    getPreferredActorOverride() {
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

    async login() {
        this.log('[FB] Kiá»ƒm tra Ä‘Äƒng nháº­p...');
        await this.page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(3000);

        const loginState = await this.page.evaluate(() => {
            const cookieMatch = document.cookie.match(/c_user=(\d+)/);
            const bodyText = document.body?.innerText || '';
            const hasLoginForm = Boolean(document.querySelector('input[name="email"], input[name="pass"]')) || /dang nhap|log in|login to facebook/i.test(bodyText);
            const hasProfileUi = Boolean(document.querySelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]'));
            return {
                cookieUser: cookieMatch ? cookieMatch[1] : null,
                hasLoginForm,
                hasProfileUi,
                currentUrl: window.location.href
            };
        });

        this.log(`[FB] Trang hien tai: ${loginState.currentUrl}`);

        if (loginState.cookieUser && !loginState.hasLoginForm) {
            this.log(`[FB] Da co phien dang nhap (c_user=${loginState.cookieUser}).`);
            return;
        }

        if (loginState.hasProfileUi) {
            this.log('[FB] ÄÃ£ Ä‘Äƒng nháº­p tá»« phiÃªn trÆ°á»›c.');
            return;
        }

        if (!loginState.hasLoginForm) {
            this.log('[FB] Khong thay form dang nhap, thu cho them de xac nhan phien...');
            const recovered = await this.page.waitForFunction(() => {
                const cookieMatch = document.cookie.match(/c_user=(\d+)/);
                const hasProfileUi = Boolean(document.querySelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]'));
                const hasLoginForm = Boolean(document.querySelector('input[name="email"], input[name="pass"]'));
                return (cookieMatch && !hasLoginForm) || hasProfileUi;
            }, { timeout: 15000 }).then(() => true).catch(() => false);

            if (recovered) {
                this.log('[FB] Da xac nhan phien dang nhap sau khi cho them.');
                return;
            }
        }

        if (!loginState.cookieUser || loginState.hasLoginForm) {
            this.log('[FB] CHÆ¯A ÄÄ‚NG NHáº¬P. Vui lÃ²ng Ä‘Äƒng nháº­p Facebook ngay trÃªn cá»­a sá»• trÃ¬nh duyá»‡t Cá»‘c Cá»‘c vá»«a hiá»‡n ra...');
            // Äá»£i ngÆ°á»i dÃ¹ng Ä‘Äƒng nháº­p thá»§ cÃ´ng (tá»‘i Ä‘a 10 phÃºt)
            try {
                await this.page.waitForFunction(() => {
                    const cookieMatch = document.cookie.match(/c_user=(\d+)/);
                    const hasLoginForm = Boolean(document.querySelector('input[name="email"], input[name="pass"]'));
                    const hasProfileUi = Boolean(document.querySelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]'));
                    return (cookieMatch && !hasLoginForm) || hasProfileUi;
                }, { timeout: 600000 });
                this.log('[FB] ÄÄƒng nháº­p thÃ nh cÃ´ng!');
            } catch (e) {
                this.log('[FB] QuÃ¡ thá»i gian chá» Ä‘Äƒng nháº­p (10 phÃºt).');
                throw new Error('Timeout waiting for login');
            }
        }
    }


    async getCurrentUserId() {
        const tryExtractActor = async (url) => {
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.page.waitForTimeout(4000);

            return await this.page.evaluate(() => {
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

                const pageText = normalize(document.body.innerText || '');
                const urlPathMatch = window.location.pathname.match(/^\/([^\/?#]+)(?:\/|$)/);
                const currentSlug = urlPathMatch ? urlPathMatch[1] : '';
                const currentPageLooksManaged = /quan ly trang|manage page|cong cu chuyen nghiep|professional dashboard/.test(pageText);

                const candidates = new Map();
                const addCandidate = (id, score) => {
                    if (!id || score <= 0) return;
                    candidates.set(id, (candidates.get(id) || 0) + score);
                };

                const anchors = Array.from(document.querySelectorAll('a[href]'));
                for (const a of anchors) {
                    const href = a.href || '';
                    const text = normalize(a.innerText || a.getAttribute('aria-label') || '');

                    const profileMatch = href.match(/profile\.php\?(?:[^#]*?&)?id=(\d+)/i);
                    if (profileMatch) {
                        let score = 0;
                        if (/fb_profile_edit_entry_point|profile_action|profile_plus/i.test(href)) score += 25;
                        if (/\/(about|followers|following|mentions|photos)(?:\/|$)/i.test(href)) score += 10;
                        if (/trang ca nhan|your profile|see your profile|chinh sua|edit/.test(text)) score += 20;
                        if (/fb_profile_edit_entry_point/.test(href) && currentPageLooksManaged) score += 50;
                        addCandidate(profileMatch[1], score);
                    }

                    const slugMatch = href.match(/^https:\/\/www\.facebook\.com\/([^\/\?#]+)(?:\/|$)/i);
                    if (!slugMatch) continue;

                    const slug = slugMatch[1];
                    if (ignoredSlugs.has(slug.toLowerCase())) continue;
                    if (/^(groups|profile\.php)$/i.test(slug)) continue;

                    let score = 0;
                    if (/\/(about|followers|following|mentions|photos)(?:\/|$)/i.test(href)) score += 15;
                    if (/profile_action|profile_plus|fb_profile_edit_entry_point|ref=profile/i.test(href)) score += 20;
                    if (text && text.length < 80) score += 5;
                    if (score > 0) {
                        if (currentPageLooksManaged && currentSlug && slug.toLowerCase() === currentSlug.toLowerCase()) {
                            score += 50;
                        }
                        addCandidate(`slug:${slug}`, score);
                    }
                }

                if (currentPageLooksManaged && currentSlug) {
                    const directPageEditLink = anchors.find((a) => {
                        const href = a.href || '';
                        return /fb_profile_edit_entry_point/.test(href) && /profile\.php\?/.test(href);
                    });
                    if (directPageEditLink) {
                        const match = directPageEditLink.href.match(/profile\.php\?(?:[^#]*?&)?id=(\d+)/i);
                        if (match) return match[1];
                    }

                    return `slug:${currentSlug}`;
                }

                return Array.from(candidates.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            });
        };

        try {
            const homeActor = await tryExtractActor('https://www.facebook.com/');
            if (homeActor && !homeActor.startsWith('slug:') && !homeActor.startsWith('page:') && !homeActor.startsWith('asset:')) {
                return homeActor;
            }

            const groupsActor = await tryExtractActor('https://www.facebook.com/groups/joins/?nav_source=tab');
            if (groupsActor && !groupsActor.startsWith('slug:') && !groupsActor.startsWith('page:') && !groupsActor.startsWith('asset:')) {
                return groupsActor;
            }

        } catch (e) {
            this.log(`[FB] Khong doc duoc actor hien hanh: ${e.message}`);
        }

        const preferredActor = this.getPreferredActorOverride();
        if (preferredActor) {
            this.log(`[FB] Dung preferred actor override: ${preferredActor}`);
            return preferredActor;
        }

        await this.page.goto('https://www.facebook.com/me', { waitUntil: 'load', timeout: 30000 });
        await this.page.waitForFunction(() => {
            const url = window.location.href;
            return !url.endsWith('facebook.com/me') && !url.endsWith('facebook.com/me/');
        }, { timeout: 15000 }).catch(() => {});

        const userId = await this.page.evaluate(() => {
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

        const currentUrl = this.page.url();
        const usernameMatch = currentUrl.match(/facebook\.com\/([^\/\?]+)/);
        if (usernameMatch && usernameMatch[1] !== 'me') return usernameMatch[1];

        return 'me';
    }

    async getActorFromGroupContext(groupUrl) {
        try {
            await this.page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.page.waitForTimeout(4000);
            const groupIdMatch = groupUrl.match(/\/groups\/(\d+)/i);
            const groupId = groupIdMatch ? groupIdMatch[1] : null;

            const extractActor = async () => await this.page.evaluate((currentGroupId) => {
                const normalize = (value) => (value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\u0111/g, 'd')
                    .replace(/\u0110/g, 'D')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                const personalWords = [
                    'trang ca nhan',
                    'your profile',
                    'see your profile',
                    'chinh sua trang ca nhan',
                    'edit profile'
                ];

                const actorContextWords = [
                    'dang tuong tac voi tu cach',
                    'interacting as',
                    'ban viet gi di',
                    "what's on your mind",
                    'write something',
                    'tao bai viet cong khai',
                    'create public post'
                ];

                const addParamCandidate = (value, score, source, store) => {
                    if (!value || !/^\d+$/.test(String(value))) return;
                    const existing = store.get(String(value)) || { id: String(value), score: 0, source };
                    existing.score += score;
                    if (!existing.source) existing.source = source;
                    store.set(String(value), existing);
                };

                const parseActorFromHref = (href) => {
                    if (!href || typeof href !== 'string') return null;
                    try {
                        const url = new URL(href, window.location.origin);
                        const groupUserRegex = currentGroupId
                            ? new RegExp(`^/groups/${currentGroupId}/user/([^/?#]+)/?`, 'i')
                            : /^\/groups\/\d+\/user\/([^\/?#]+)\/?/i;
                        const groupUserMatch = url.pathname.match(groupUserRegex);
                        if (groupUserMatch) return groupUserMatch[1];

                        const pageId = url.searchParams.get('id');
                        if ((/\/pages\//i.test(url.pathname) || /\/profile\.php$/i.test(url.pathname)) && pageId && /^\d+$/.test(pageId)) {
                            return pageId;
                        }
                    } catch (_) {}

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

                const scoreAnchor = (a, baseScore = 0) => {
                    const actorId = parseActorFromHref(a.href);
                    if (!actorId) return null;

                    const text = normalize(a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '');
                    const href = a.href || '';
                    let score = baseScore;

                    if (text.length > 0 && text.length < 80) score += 10;
                    if (!text) score -= 220;
                    if (currentGroupId && new RegExp(`/groups/${currentGroupId}/user/`, 'i').test(href)) score += 220;
                    else if (/\/groups\/\d+\/user\//i.test(href)) score += 120;
                    if (/dang tuong tac voi tu cach|interacting as/.test(text)) score += 140;
                    if (/page|trang/.test(text)) score += 35;
                    if (/profile_plus|composer|actor|privacy_mutation_token|av=|__cft__/.test(href)) score += 35;
                    if (personalWords.some((word) => text.includes(word))) score -= 140;
                    if (/^[a-z0-9._ ]{3,40}$/i.test(text) && !/page|trang|studio|business|fanpage/.test(text)) score -= 120;
                    if (/photo|anh|video|reel|tin|story/.test(text)) score -= 50;

                    return { id: actorId, score, text, href };
                };

                const scoreContainer = (container) => {
                    const text = normalize(container?.innerText || '');
                    let score = 0;
                    if (/ban viet gi di|what's on your mind|write something/.test(text)) score += 60;
                    if (/dang tuong tac voi tu cach|interacting as|tu cach/.test(text)) score += 80;
                    return score;
                };

                const paramCandidates = new Map();
                const paramElements = Array.from(document.querySelectorAll('a[href], form[action], input[value], button[data-testid], div[role="dialog"] a[href]'));
                for (const el of paramElements) {
                    const attrs = [
                        el.getAttribute?.('href'),
                        el.getAttribute?.('action'),
                        el.getAttribute?.('data-post-id'),
                        el.getAttribute?.('data-testid'),
                        el.getAttribute?.('ajaxify'),
                        el.getAttribute?.('value')
                    ].filter(Boolean);

                    for (const raw of attrs) {
                        const text = String(raw);
                        const avMatch = text.match(/[?&]av=(\d+)/i);
                        if (avMatch) addParamCandidate(avMatch[1], 260, 'av', paramCandidates);

                        const actorMatch = text.match(/[?&](?:actor_id|actorID|profile_id|owner_id|page_id)=(\d+)/i);
                        if (actorMatch) addParamCandidate(actorMatch[1], 240, 'actor-param', paramCandidates);

                        const privacyMatch = text.match(/privacy_mutation_token[^0-9]*(\d{8,})/i);
                        if (privacyMatch) addParamCandidate(privacyMatch[1], 180, 'privacy-token', paramCandidates);
                    }
                }

                const bestParam = Array.from(paramCandidates.values()).sort((a, b) => b.score - a.score)[0];
                if (bestParam && bestParam.score >= 240) {
                    return {
                        actor: bestParam.id,
                        debug: {
                            mode: 'param',
                            topParams: Array.from(paramCandidates.values()).sort((a, b) => b.score - a.score).slice(0, 5)
                        }
                    };
                }

                const directContextCandidates = [];
                const contextNodes = Array.from(document.querySelectorAll('div, [role="dialog"], [role="main"], [role="feed"]'));
                for (const node of contextNodes) {
                    const text = normalize(node.innerText || '');
                    if (!actorContextWords.some((word) => text.includes(word))) continue;

                    const anchors = Array.from(node.querySelectorAll('a[href]'));
                    for (const a of anchors) {
                        const candidate = scoreAnchor(a, 90);
                        if (!candidate) continue;
                        if (text.includes('dang tuong tac voi tu cach') || text.includes('interacting as')) {
                            candidate.score += 80;
                        }
                        directContextCandidates.push(candidate);
                    }
                }

                const sortedDirect = directContextCandidates.sort((a, b) => b.score - a.score);
                const bestDirect = sortedDirect[0];
                const hasStrongContext = sortedDirect.some((item) =>
                    !!(item.text || '').trim() &&
                    /dang tuong tac voi tu cach|interacting as|page|trang/.test(item.text || '') ||
                    /privacy_mutation_token|av=|actor|composer/.test(item.href || '')
                );
                if (bestDirect && bestDirect.score >= 150 && hasStrongContext) {
                    return {
                        actor: bestDirect.id,
                        debug: {
                            mode: 'direct',
                            topDirect: sortedDirect.slice(0, 5)
                        }
                    };
                }

                const containers = Array.from(document.querySelectorAll('div[role="main"] div, div[role="feed"] div, div[data-pagelet]'));
                const candidates = [];
                for (const container of containers) {
                    const baseScore = scoreContainer(container);
                    if (baseScore <= 0) continue;

                    const anchors = Array.from(container.querySelectorAll('a[href]'));
                    for (const a of anchors) {
                        const candidate = scoreAnchor(a, baseScore);
                        if (!candidate) continue;
                        candidates.push(candidate);
                    }
                }

                const topCandidates = candidates
                    .filter((item) => (item.text || '').trim() || /privacy_mutation_token|av=|actor|composer/.test(item.href || ''))
                    .sort((a, b) => b.score - a.score);
                const bestFallback = topCandidates[0] || null;
                const fallbackLooksStrong = Boolean(
                    bestFallback &&
                    bestFallback.score >= 180 &&
                    (
                        /dang tuong tac voi tu cach|interacting as|page|trang|studio|business|fanpage/.test(bestFallback.text || '') ||
                        /privacy_mutation_token|av=|actor|composer/.test(bestFallback.href || '')
                    )
                );

                return {
                    actor: fallbackLooksStrong ? bestFallback.id : null,
                    debug: {
                        mode: 'fallback',
                        topCandidates: topCandidates.slice(0, 5),
                        topParams: Array.from(paramCandidates.values()).sort((a, b) => b.score - a.score).slice(0, 5)
                    }
                };
            }, groupId);

            const clickedComposer = await this.page.evaluate(() => {
                const normalize = (value) => (value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\u0111/g, 'd')
                    .replace(/\u0110/g, 'D')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                const candidates = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], button, div[tabindex="0"]'));
                const phrases = [
                    'ban viet gi di',
                    'ban dang nghi gi',
                    "what's on your mind",
                    'write something',
                    'tao bai viet cong khai',
                    'create public post'
                ];

                for (const el of candidates) {
                    const text = normalize(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '');
                    if (!phrases.some((phrase) => text.includes(phrase))) continue;
                    el.click();
                    return true;
                }

                return false;
            });

            if (clickedComposer) {
                await this.page.waitForTimeout(2500);
            }

            let result = await extractActor();
            let actor = result?.actor || null;

            if (result?.debug) {
                this.log(`[FB] Actor debug ${JSON.stringify(result.debug)}`);
            }

            return actor || null;
        } catch (error) {
            this.log(`[FB] Khong doc duoc actor trong nhom: ${error.message}`);
            return null;
        }
    }
    async postToGroup(groupUrl, content, imagePaths = []) {
        try {
            console.log(`[FB] Äang truy cáº­p nhÃ³m: ${groupUrl}`);
            await this.page.goto(groupUrl);
            await sleep(1500);

            const postBoxSelectors = [
                'div[role="button"][tabindex="0"]:has(span:has-text("Bạn viết gì đi"))',
                'div[role="button"][tabindex="0"]:has(span:has-text("Bạn đang nghĩ gì"))',
                'div[role="button"][tabindex="0"]:has(span:has-text("Write something"))',
                'div[role="button"]:has-text("Bạn viết gì đi")',
                'div[role="button"]:has-text("Bạn đang nghĩ gì")',
                'div[role="button"]:has-text("Viết nội dung nào đó")',
                'div[role="button"]:has-text("Write something")',
                'div[role="button"]:has-text("What\'s on your mind")',
                'div[role="textbox"][contenteditable="true"]',
                '[aria-label="Bạn đang nghĩ gì?"]',
                '[aria-label="What\'s on your mind?"]'
            ];

            let clicked = false;
            for (const selector of postBoxSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (let el of elements) {
                        if (await el.isVisible()) {
                            await el.click();
                            clicked = true;
                            break;
                        }
                    }
                    if(clicked) break;
                } catch (e) {}
            }

            if (!clicked) {
                const mainPostButton = await this.page.$('[role="main"] [role="button"]:has-text("Bạn"), [role="main"] [role="button"]:has-text("Viết"), [role="main"] [role="button"]:has-text("Write"), [role="main"] [role="textbox"][contenteditable="true"]');
                if (mainPostButton) {
                    await mainPostButton.click();
                    clicked = true;
                }
            }

            if (!clicked) {
                const clickedByTextScan = await this.page.evaluate(() => {
                    const normalize = (value) => (value || '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/\u0111/g, 'd')
                        .replace(/\u0110/g, 'D')
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .trim();

                    const candidates = Array.from(document.querySelectorAll('div[role="button"], div[role="textbox"], [contenteditable="true"]'));
                    const target = candidates.find((el) => {
                        const text = normalize(el.innerText || el.getAttribute('aria-label') || '');
                        return text.includes('ban viet gi di') ||
                            text.includes('ban dang nghi gi') ||
                            text.includes('viet noi dung nao do') ||
                            text.includes('write something') ||
                            text.includes('what\'s on your mind');
                    });

                    if (target) {
                        target.click();
                        return true;
                    }
                    return false;
                }).catch(() => false);

                if (clickedByTextScan) {
                    clicked = true;
                }
            }

            if (!clicked) {
                return { success: false, pending: false, reason: 'composer_not_found' };
            }

            await sleep(1200);

            // Tai anh len neu co
            if (imagePaths.length > 0) {
                this.log(`[FB] Dang tai len ${imagePaths.length} anh...`);

                const dialog = this.page.locator('div[role="dialog"]').last();
                let uploadConfirmed = false;
                let attachedByInput = false;

                const getUploadInputMetas = async () => {
                    const fileInputs = this.page.locator('input[type="file"]');
                    const inputCount = await fileInputs.count();
                    const metas = [];

                    for (let i = 0; i < inputCount; i++) {
                        const input = fileInputs.nth(i);
                        const meta = await input.evaluate((el, idx) => ({
                            index: idx,
                            accept: el.getAttribute('accept') || '',
                            multiple: el.hasAttribute('multiple'),
                            inDialog: Boolean(el.closest('div[role="dialog"]')),
                            disabled: Boolean(el.disabled),
                            hiddenByStyle: window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden'
                        }), i).catch(() => null);
                        if (meta) metas.push(meta);
                    }

                    return metas.filter((meta) => !meta.disabled && (!meta.accept || /image|png|jpg|jpeg|webp/i.test(meta.accept)));
                };

                const tryAttachViaInputAncestorClick = async () => {
                    const metas = await getUploadInputMetas();
                    const dialogMetas = metas.filter((meta) => meta.inDialog);
                    this.log(`[FB] Co ${dialogMetas.length} input file hop le trong dialog de thu click ancestor.`);

                    for (const meta of dialogMetas) {
                        try {
                            const input = this.page.locator('input[type="file"]').nth(meta.index);
                            this.log(`[FB] Thu kich filechooser truc tiep tu input #${meta.index + 1}.`);

                            await input.evaluate((el) => {
                                el.style.display = 'block';
                                el.style.visibility = 'visible';
                                el.style.opacity = '0.01';
                                el.style.position = 'fixed';
                                el.style.left = '16px';
                                el.style.top = '16px';
                                el.style.width = '24px';
                                el.style.height = '24px';
                                el.style.zIndex = '2147483647';
                            }).catch(() => {});

                            const directChooser = await Promise.all([
                                this.page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null),
                                input.click({ force: true, timeout: 2500 }).catch(() => null)
                            ]).then(([chooser]) => chooser);

                            if (directChooser) {
                                await directChooser.setFiles(imagePaths);
                                attachedByInput = true;
                                this.log(`[FB] Da nap anh qua filechooser truc tiep tu input #${meta.index + 1}.`);
                                return true;
                            }

                            const clickableHandle = await input.evaluateHandle((el) => {
                                let current = el.parentElement;
                                while (current) {
                                    const role = current.getAttribute('role');
                                    const tabIndex = current.getAttribute('tabindex');
                                    const ariaLabel = current.getAttribute('aria-label') || '';
                                    if (
                                        current.tagName === 'LABEL' ||
                                        role === 'button' ||
                                        tabIndex === '0' ||
                                        /anh|photo|video|upload|them/i.test(ariaLabel)
                                    ) {
                                        return current;
                                    }
                                    current = current.parentElement;
                                }
                                return null;
                            });

                            const clickableElement = clickableHandle.asElement();
                            if (!clickableElement) {
                                this.log(`[FB] Khong tim thay ancestor clickable cho input #${meta.index + 1}.`);
                                continue;
                            }

                            this.log(`[FB] Thu click ancestor cua input #${meta.index + 1} de mo upload that.`);
                            const [fileChooser] = await Promise.all([
                                this.page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null),
                                clickableElement.click({ timeout: 2500 }).catch(() => null)
                            ]);

                            if (!fileChooser) {
                                this.log(`[FB] Ancestor cua input #${meta.index + 1} khong mo ra filechooser.`);
                                continue;
                            }

                            await fileChooser.setFiles(imagePaths);
                            attachedByInput = true;
                            this.log(`[FB] Da nap anh qua filechooser tu ancestor input #${meta.index + 1}.`);
                            return true;
                        } catch (e) {
                            this.log(`[FB] Click ancestor cua input that bai: ${e.message}`);
                        }
                    }

                    return false;
                };

                const tryAttachToVisibleInputs = async (scopeLabel) => {
                    const fileInputs = this.page.locator('input[type="file"]');
                    const inputCount = await fileInputs.count();
                    this.log(`[FB] Tim thay ${inputCount} input file o scope ${scopeLabel}.`);

                    let triedCount = 0;

                    for (let i = 0; i < inputCount; i++) {
                        const input = fileInputs.nth(i);
                        try {
                            const meta = await input.evaluate((el) => ({
                                accept: el.getAttribute('accept') || '',
                                multiple: el.hasAttribute('multiple'),
                                inDialog: Boolean(el.closest('div[role="dialog"]')),
                                disabled: Boolean(el.disabled),
                                hiddenByStyle: window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden'
                            })).catch(() => null);

                            if (!meta) continue;
                            if (scopeLabel === 'dialog' && !meta.inDialog) continue;
                            if (meta.disabled) {
                                this.log(`[FB] Bo qua input file #${i + 1} vi dang bi disabled.`);
                                continue;
                            }
                            if (meta.accept && !/image|png|jpg|jpeg|webp/i.test(meta.accept)) {
                                this.log(`[FB] Bo qua input file #${i + 1} vi accept khong phai anh: ${meta.accept}`);
                                continue;
                            }

                            triedCount++;
                            this.log(`[FB] Thu input file #${i + 1} | inDialog=${meta.inDialog} | multiple=${meta.multiple} | hidden=${meta.hiddenByStyle} | accept=${meta.accept || 'n/a'}`);

                            await input.setInputFiles(meta.multiple ? imagePaths : [imagePaths[0]], { timeout: 5000 });
                            await input.evaluate((el) => {
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }).catch(() => {});
                            await sleep(700);

                            const filesLength = await input.evaluate((el) => el.files?.length || 0).catch(() => 0);
                            if (filesLength > 0) {
                                attachedByInput = true;
                                this.log(`[FB] Input file #${i + 1} da nhan ${filesLength} tep | inDialog=${meta.inDialog} | accept=${meta.accept || 'n/a'}`);
                                return true;
                            }

                            this.log(`[FB] Input file #${i + 1} khong giu tep sau setInputFiles.`);
                        } catch (e) {
                            this.log(`[FB] Input file #${i + 1} khong dung duoc: ${e.message}`);
                        }

                        if (scopeLabel === 'page' && triedCount >= 1) {
                            this.log('[FB] Da thu 1 input file ngoai dialog, dung fallback de tranh cham.');
                            break;
                        }
                    }
                    return false;
                };

                const clickPhotoButton = async () => {
                    const directButton = dialog.locator([
                        '[aria-label*="Ảnh"]',
                        '[aria-label*="Anh"]',
                        '[aria-label*="Photo"]',
                        '[role="button"]:has-text("Ảnh/video")',
                        '[role="button"]:has-text("Anh/video")',
                        '[role="button"]:has-text("Photo/video")',
                        '[role="button"]:has-text("Thêm ảnh")',
                        '[role="button"]:has-text("Them anh")',
                        '[role="button"]:has-text("Add photo")'
                    ].join(', ')).first();

                    if (await directButton.count()) {
                        try {
                            await directButton.click({ timeout: 3000 });
                            this.log('[FB] Da bam nut mo chon anh/video trong dialog.');
                            return true;
                        } catch (e) {
                            this.log(`[FB] Bam nut anh/video that bai: ${e.message}`);
                        }
                    }

                    const candidates = dialog.locator('[role="button"], div[aria-label], span');
                    const candidateCount = await candidates.count();
                    for (let i = 0; i < candidateCount; i++) {
                        const candidate = candidates.nth(i);
                        try {
                            const meta = await candidate.evaluate((el) => {
                                const normalize = (value) => (value || '')
                                    .normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '')
                                    .replace(/\u0111/g, 'd')
                                    .replace(/\u0110/g, 'D')
                                    .replace(/\s+/g, ' ')
                                    .trim()
                                    .toLowerCase();

                                const text = normalize(el.innerText || el.getAttribute('aria-label') || '');
                                const matched = text.includes('anh/video') ||
                                    text.includes('photo/video') ||
                                    text.includes('them anh') ||
                                    text.includes('add photo');
                                return {
                                    matched,
                                    text,
                                    hasRoleButtonParent: Boolean(el.closest('[role="button"]'))
                                };
                            }).catch(() => null);

                            if (!meta?.matched) continue;

                            const clickableHandle = await candidate.evaluateHandle((el) => el.closest('[role="button"]') || el);
                            const clickableElement = clickableHandle.asElement();
                            if (!clickableElement) continue;

                            await clickableElement.click({ timeout: 3000 });
                            this.log(`[FB] Da bam nut anh/video bang Playwright text scan: ${meta.text}`);
                            return true;
                        } catch (e) {
                            this.log(`[FB] Thu bam nut anh/video bang text scan that bai: ${e.message}`);
                        }
                    }

                    return false;
                };

                let openedRealUploadFlow = await tryAttachViaInputAncestorClick();

                const fileChooserPromise = openedRealUploadFlow ? Promise.resolve(null) : this.page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
                const photoButtonClicked = openedRealUploadFlow ? false : await clickPhotoButton();
                if (photoButtonClicked) {
                    const fileChooser = await fileChooserPromise;
                    if (fileChooser) {
                        await fileChooser.setFiles(imagePaths);
                        attachedByInput = true;
                        this.log('[FB] Da nap anh qua su kien filechooser.');
                    } else {
                        this.log('[FB] Khong co filechooser, se thu input file sau khi bam nut anh/video.');
                    }
                    await sleep(700);
                } else {
                    if (!openedRealUploadFlow) {
                        this.log('[FB] Khong bam duoc nut anh/video, se fallback sang input file truc tiep.');
                    }
                }

                if (!attachedByInput && !await tryAttachToVisibleInputs('dialog')) {
                    await tryAttachToVisibleInputs('page');
                }

                await sleep(700);
                uploadConfirmed = attachedByInput || await this.page.waitForFunction(() => {
                    const dialog = document.querySelector('div[role="dialog"]');
                    if (!dialog) return false;

                    const allFileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
                    const hasAttachedFile = allFileInputs.some((input) => (input.files?.length || 0) > 0);
                    const selectors = [
                        'div[aria-label="Xóa ảnh"]',
                        'div[aria-label="Xoa anh"]',
                        'div[aria-label="Remove photo"]',
                        'div[aria-label="Chỉnh sửa ảnh"]',
                        'div[aria-label="Edit photo"]',
                        '[data-pagelet*="MediaAttachment"] img',
                        'img[src^="blob:"]',
                        'img[src^="data:image"]',
                        '[aria-label*="photo"] img',
                        '[aria-label*="ảnh"] img'
                    ];
                    const hasAttachmentPreview = selectors.some((selector) => dialog.querySelector(selector));
                    return hasAttachedFile || hasAttachmentPreview;
                }, { timeout: 6000 }).then(() => true).catch(() => false);
                this.log(`[FB] Ket qua xac nhan upload anh: ${uploadConfirmed ? 'OK' : 'KHONG THAY ATTACHMENT'} | attachedByInput=${attachedByInput}`);
                await sleep(700);

                if (!uploadConfirmed) {
                    this.log('[FB] Upload anh chua thanh cong trong composer. Dung dang bai de tranh bai khong kem hinh.');
                    return { success: false, pending: false, reason: 'image_upload_failed' };
                }
            }

            const inputSelector = 'div[role="dialog"] div[role="textbox"][contenteditable="true"]';
            await this.page.waitForSelector(inputSelector);
            await sleep(1000);
            const textboxes = await this.page.$$(inputSelector);
            let typed = false;
            for(let tb of textboxes) {
                if(await tb.isVisible()) {
                    this.log('[FB] Tim thay o nhap chu trong dialog, tien hanh go noi dung...');
                    await tb.click();
                    await sleep(250);
                    await this.page.keyboard.insertText(content);
                    typed = true;
                    break;
                }
            }
            
            if(!typed) {
                this.log('[FB] Van khong nhap duoc van ban bang click. Thu fallback...');
                const fallbackInput = await this.page.$('div[aria-label="Báº¡n viáº¿t gÃ¬ Ä‘i..."][contenteditable="true"]');
                if (fallbackInput) {
                    await fallbackInput.fill(content);
                    typed = true;
                }
                if (!typed) {
                    this.log('[FB] Khong nhap duoc noi dung vao o soan bai.');
                    return { success: false, pending: false, reason: 'textbox_not_found' };
                }
            }
            
            await sleep(500);
            this.log('[FB] Dang nhan nut Dang...');
            
            const submitButtonSelectors = [
                'div[role="dialog"] [aria-label="Đăng"]',
                'div[role="dialog"] [aria-label="Dang"]',
                'div[aria-label="ÄÄƒng"]',
                'div[aria-label="Post"]',
                'div[aria-label="ÄÄƒng bÃ i"]',
                'div[role="dialog"] [role="button"]:has-text("Đăng")',
                'div[role="dialog"] [role="button"]:has-text("Dang")',
                'div[role="button"]:has-text("ÄÄƒng")',
                'div[role="button"]:has-text("Post")'
            ];

            let submitButton = null;
            for (const selector of submitButtonSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (let el of elements) {
                        if (await el.isVisible()) {
                            // Kiá»ƒm tra xem nÃºt cÃ³ bá»‹ disabled khÃ´ng do Ä‘ang táº£i áº£nh
                            let isDisabled = await el.getAttribute('aria-disabled');
                            let waitCount = 0;
                            while (isDisabled === 'true' && waitCount < 30) {
                                this.log(`[FB] Nut Dang dang bi vo hieu hoa, doi them... (${waitCount * 2}s)`);
                                await sleep(1000);
                                isDisabled = await el.getAttribute('aria-disabled');
                                waitCount++;
                            }

                            if (isDisabled !== 'true') {
                                submitButton = el;
                                break;
                            } else {
                                this.log('[FB] Qua thoi gian cho tai anh, nut Dang van bi khoa.');
                            }
                        }
                    }
                    if(submitButton) break;
                } catch(e) {}
            }

            if (!submitButton) {
                const dialog = this.page.locator('div[role="dialog"]').last();
                const buttonCandidates = dialog.locator('[role="button"], button, div[tabindex="0"]');
                const candidateCount = await buttonCandidates.count().catch(() => 0);

                for (let i = 0; i < candidateCount; i++) {
                    const candidate = buttonCandidates.nth(i);
                    try {
                        if (!await candidate.isVisible()) continue;

                        const meta = await candidate.evaluate((el) => {
                            const normalize = (value) => (value || '')
                                .normalize('NFD')
                                .replace(/[\u0300-\u036f]/g, '')
                                .replace(/\u0111/g, 'd')
                                .replace(/\u0110/g, 'D')
                                .replace(/\s+/g, ' ')
                                .trim()
                                .toLowerCase();

                            const text = normalize(el.innerText || el.textContent || '');
                            const aria = normalize(el.getAttribute('aria-label') || '');
                            const disabled = (el.getAttribute('aria-disabled') || '').toLowerCase() === 'true' || el.disabled === true;
                            const matched = (
                                text === 'dang' ||
                                text === 'dang bai' ||
                                text.includes('dang') ||
                                text === 'post' ||
                                aria === 'dang' ||
                                aria === 'dang bai' ||
                                aria === 'post'
                            );

                            return { text, aria, disabled, matched };
                        }).catch(() => null);

                        if (!meta?.matched) continue;
                        this.log(`[FB] Tim thay ung vien nut Dang: text=${meta.text || 'n/a'} | aria=${meta.aria || 'n/a'} | disabled=${meta.disabled}`);

                        if (!meta.disabled) {
                            submitButton = candidate;
                            break;
                        }
                    } catch (e) {
                        this.log(`[FB] Doc ung vien nut Dang that bai: ${e.message}`);
                    }
                }
            }

            if (submitButton) {
                await submitButton.click();
                this.log('[FB] Da nhan nut Dang, dang cho Facebook xu ly...');
                
                let postStatus = 'success';
                try {
                    await this.page.waitForSelector('div[role="dialog"]', { state: 'hidden', timeout: 30000 });
                    this.log('[FB] Hop thoai dang bai da dong.');
                } catch(e) {
                     const pageText = await this.page.innerText('body');
                     if (pageText.includes('tá»± Ä‘á»™ng tá»« chá»‘i bÃ i viáº¿t') || pageText.includes('khÃ´ng Ä‘Ã¡p á»©ng tiÃªu chÃ­') || pageText.includes('LiÃªn káº¿t trong bÃ i viáº¿t')) {
                         this.log('[FB] Phat hien bai viet bi tu choi tu dong.');
                         if (pageText.includes('liÃªn káº¿t') || pageText.includes('link') || pageText.includes('Link')) {
                             postStatus = 'rejected_link';
                             this.log('[FB] Ly do: nhom nay cam chen link.');
                         } else {
                             postStatus = 'rejected_other';
                         }
                         
                         try {
                             const closeX = await this.page.$('div[aria-label="ÄÃ³ng"], div[aria-label="Close"]');
                             if (closeX) await closeX.click();
                         } catch(e2) {}
                     } else {
                         this.log('[FB] Hop thoai chua dong sau 30s va khong thay popup tu choi ro rang.');
                     }
                }
                
                if (postStatus === 'rejected_link') return { success: false, pending: false, reason: 'rejected_link' };
                if (postStatus === 'rejected_other') return { success: false, pending: false, reason: 'rejected_other' };

                this.log('[FB] Cho Facebook on dinh sau khi dong composer...');
                await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                await sleep(6000);
                
                let isPending = false;
                try {
                    const pageText = await this.page.innerText('body');
                    if (pageText.includes('Ä‘ang chá» phÃª duyá»‡t') || pageText.includes('Äang chá» quáº£n trá»‹ viÃªn')) {
                        isPending = true;
                        this.log('[FB] Da thay thong bao bai dang dang cho duyet.');
                    }
                } catch(e) {}

                return { success: true, pending: isPending };
            } else {
                this.log('[FB] Khong tim thay nut Dang hoac nut bi vo hieu hoa vinh vien.');
                return { success: false, pending: false, reason: 'submit_button_not_found' };
            }

        } catch (error) {
            this.log(`[FB] Loi khi dang bai len ${groupUrl}: ${error.message}`);
            return { success: false, pending: false, reason: error?.message || 'post_exception' };
        }
    }

    // HÃ m verify báº±ng cÃ¡ch truy cáº­p tháº³ng link nhÃ³m / user
    async verifyPost(groupUrl, userId, content) {
        try {
            const resolvedUserId = userId || await this.getActorFromGroupContext(groupUrl) || await this.getCurrentUserId();
            // Táº¡o link chuáº©n: https://www.facebook.com/groups/id_nhom/user/id_user/
            const checkUrl = `${groupUrl.replace(/\/$/, '')}/user/${resolvedUserId}/`;
            console.log(`[FB] Äang kiá»ƒm tra tráº¡ng thÃ¡i bÃ i Ä‘Äƒng táº¡i: ${checkUrl}`);
            await this.page.goto(checkUrl);
            await sleep(8000); // Äá»£i trang load cÃ¡c bÃ i post
            
            const pageText = await this.page.innerText('body') || '';
            const shortContent = content.substring(0, 40).trim(); // Láº¥y 40 kÃ½ tá»± Ä‘áº§u lÃ m tá»« khÃ³a tÃ¬m kiáº¿m
            
            if (pageText.includes('Ä‘ang chá» phÃª duyá»‡t') || pageText.includes('Äang chá» quáº£n trá»‹ viÃªn') || pageText.includes('BÃ i viáº¿t Ä‘ang chá» xá»­ lÃ½')) {
                 console.log('==> [Káº¾T QUáº¢]: BÃ i Ä‘Äƒng thÃ nh cÃ´ng nhÆ°ng ÄANG CHá»œ QUáº¢N TRá»Š VIÃŠN PHÃŠ DUYá»†T.');
                 return 'pending';
            }
            
            if (pageText.includes(shortContent)) {
                 console.log('==> [Káº¾T QUáº¢]: BÃ i Ä‘Äƒng ÄÃƒ ÄÆ¯á»¢C XUáº¤T Báº¢N THÃ€NH CÃ”NG trÃªn nhÃ³m!');
                 return 'published';
            }
            
            console.log('==> [Káº¾T QUáº¢]: KhÃ´ng tÃ¬m tháº¥y bÃ i Ä‘Äƒng táº¡i link cÃ¡ nhÃ¢n. CÃ³ thá»ƒ bÃ i Ä‘Ã£ bá»‹ gá»¡ hoáº·c chÆ°a hiá»ƒn thá»‹.');
            return 'not_found';
            
        } catch (error) {
            console.error('[FB] Lá»—i khi kiá»ƒm tra bÃ i Ä‘Äƒng:', error);
            return 'error';
        }
    }

    async checkRemovedContent(groupUrl) {
        try {
            const removedUrl = `${groupUrl.replace(/\/$/, '')}/my_removed_content/`;
            this.log(`[FB] Dang kiem tra noi dung bi go tai: ${removedUrl}`);
            await this.page.goto(removedUrl, { waitUntil: 'networkidle' }).catch(() => {});
            await sleep(2500);
            
            await this.page.mouse.wheel(0, 500);
            await sleep(1000);
            
            await this.page.screenshot({ path: path.join(__dirname, 'debug_removed_content.png') });

            const pageText = await this.page.innerText('body') || '';
            const removedMeta = await this.page.evaluate(() => {
                const articleCount = document.querySelectorAll('div[role="article"]').length;
                const feedArticleCount = document.querySelectorAll('div[role="feed"] div[role="article"], div[role="main"] div[role="article"]').length;
                const hasEmptyState = /khong co bai viet nao de hien thi|no posts to show|no content found/i.test(document.body?.innerText || '');
                return {
                    articleCount,
                    feedArticleCount,
                    hasEmptyState,
                    currentUrl: window.location.href
                };
            }).catch(() => ({
                articleCount: 0,
                feedArticleCount: 0,
                hasEmptyState: false,
                currentUrl: this.page.url()
            }));

            this.log(`[FB] Removed content page meta: url=${removedMeta.currentUrl} | articleCount=${removedMeta.articleCount} | feedArticleCount=${removedMeta.feedArticleCount} | hasEmptyState=${removedMeta.hasEmptyState}`);
            
            if (pageText.includes('KhÃ´ng cÃ³ bÃ i viáº¿t nÃ o Ä‘á»ƒ hiá»ƒn thá»‹') || 
                pageText.includes('No posts to show') ||
                pageText.includes('No content found')) {
                this.log('[FB] Xac nhan: trang my_removed_content dang trong.');
                return 'clean';
            }

            if (
                /\/my_removed_content\/?$/i.test(removedMeta.currentUrl || '') &&
                !removedMeta.hasEmptyState &&
                (removedMeta.articleCount > 0 || removedMeta.feedArticleCount > 0)
            ) {
                this.log('[FB] Phat hien bai xuat hien trong my_removed_content. Xem nhu da bi go.');
                if (pageText.toLowerCase().includes('liÃªn káº¿t') || pageText.toLowerCase().includes('link')) {
                    return 'removed_by_link';
                }
                return 'removed_other';
            }

            const warningKeywords = [
                'Nhiá»u ngÆ°á»i bÃ¡o cÃ¡o', 'vi pháº¡m tiÃªu chuáº©n cá»™ng Ä‘á»“ng',
                'Tá»± Ä‘á»™ng gá»¡', 'Auto-removed', 'Ä‘Ã£ bá»‹ gá»¡', 'Ná»™i dung bá»‹ gá»¡',
                'Removed content', 'Gá»¡ bá»Ÿi', 'declined', 'denied', 'tá»« chá»‘i',
                'Tá»« khÃ³a', 'tiÃªu chÃ­', 'Ä‘Ã¡p á»©ng'
            ];

            let isRemoved = false;
            let matchedKw = '';
            for (const kw of warningKeywords) {
                if (pageText.toLowerCase().includes(kw.toLowerCase())) {
                    matchedKw = kw;
                    isRemoved = true;
                    break;
                }
            }

            // RiÃªng tá»« khÃ³a "Link" hoáº·c "LiÃªn káº¿t" pháº£i Ä‘i kÃ¨m vá»›i dáº¥u hiá»‡u bá»‹ gá»¡ Ä‘á»ƒ trÃ¡nh nháº­n nháº§m menu
            if (!isRemoved) {
                const linkKeywords = ['liÃªn káº¿t', 'link'];
                const removalIndicators = ['gá»¡', 'vi pháº¡m', 'removed', 'declined', 'not approved'];
                
                for (const lkw of linkKeywords) {
                    if (pageText.toLowerCase().includes(lkw)) {
                        // Kiá»ƒm tra xem cÃ³ tá»« "gá»¡" hoáº·c "vi pháº¡m" á»Ÿ gáº§n Ä‘Ã³ khÃ´ng (trong cÃ¹ng trang vÄƒn báº£n)
                        for (const ind of removalIndicators) {
                            if (pageText.toLowerCase().includes(ind)) {
                                console.log(`[FB] PhÃ¡t hiá»‡n cáº·p tá»« khÃ³a nghi ngá»: "${lkw}" + "${ind}"`);
                                matchedKw = `${lkw} + ${ind}`;
                                isRemoved = true;
                                break;
                            }
                        }
                    }
                    if (isRemoved) break;
                }
            }

            if (isRemoved) {
                this.log(`==> [CANH BAO]: Phat hien bai viet bi go. Ly do nghi ngo: ${matchedKw}`);
                if (pageText.toLowerCase().includes('liÃªn káº¿t') || pageText.toLowerCase().includes('link')) {
                    return 'removed_by_link';
                }
                return 'removed_other';
            }
            
            this.log('[FB] Khong thay dau hieu bai viet bi go tren my_removed_content.');
            return 'clean';
        } catch (error) {
            this.log(`[FB] Loi khi kiem tra removed content: ${error.message}`);
            return 'error';
        }
    }

    async close() {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
    }
}

module.exports = FBAutomator;
