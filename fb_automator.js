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
            throw new Error('Không tìm thấy Cốc Cốc trên máy.');
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
            this.log('[FB] Sử dụng context trình duyệt từ máy chủ...');
        } else {
            this.log('[FB] Khởi tạo trình duyệt độc lập...');
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
        this.log('[FB] Kiểm tra đăng nhập...');
        await this.page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(3000);

        const loginState = await this.page.evaluate(() => {
            const cookieMatch = document.cookie.match(/c_user=(\d+)/);
            const bodyText = document.body?.innerText || '';
            const hasLoginForm = Boolean(document.querySelector('input[name="email"], input[name="pass"]')) || /đăng nhập|log in|login to facebook/i.test(bodyText);
            const hasProfileUi = Boolean(document.querySelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]'));
            return {
                cookieUser: cookieMatch ? cookieMatch[1] : null,
                hasLoginForm,
                hasProfileUi,
                currentUrl: window.location.href
            };
        });

        this.log(`[FB] Trang hiện tại: ${loginState.currentUrl}`);

        if (loginState.cookieUser && !loginState.hasLoginForm) {
            this.log(`[FB] Đã có phiên đăng nhập (c_user=${loginState.cookieUser}).`);
            return;
        }

        if (loginState.hasProfileUi) {
            this.log('[FB] Đã đăng nhập từ phiên trước.');
            return;
        }

        if (!loginState.hasLoginForm) {
            this.log('[FB] Không thấy form đăng nhập, thử chờ thêm để xác nhận phiên...');
            const recovered = await this.page.waitForFunction(() => {
                const cookieMatch = document.cookie.match(/c_user=(\d+)/);
                const hasProfileUi = Boolean(document.querySelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]'));
                const hasLoginForm = Boolean(document.querySelector('input[name="email"], input[name="pass"]'));
                return (cookieMatch && !hasLoginForm) || hasProfileUi;
            }, { timeout: 15000 }).then(() => true).catch(() => false);

            if (recovered) {
                this.log('[FB] Đã xác nhận phiên đăng nhập sau khi chờ thêm.');
                return;
            }
        }

        if (!loginState.cookieUser || loginState.hasLoginForm) {
            this.log('[FB] CHƯA ĐĂNG NHẬP. Vui lòng đăng nhập Facebook ngay trên cửa sổ trình duyệt Cốc Cốc vừa hiện ra...');
            try {
                await this.page.waitForFunction(() => {
                    const cookieMatch = document.cookie.match(/c_user=(\d+)/);
                    const hasLoginForm = Boolean(document.querySelector('input[name="email"], input[name="pass"]'));
                    const hasProfileUi = Boolean(document.querySelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]'));
                    return (cookieMatch && !hasLoginForm) || hasProfileUi;
                }, { timeout: 600000 });
                this.log('[FB] Đăng nhập thành công!');
            } catch (e) {
                this.log('[FB] Quá thời gian chờ đăng nhập (10 phút).');
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
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
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
            this.log(`[FB] Không đọc được actor hiện hành: ${e.message}`);
        }

        const preferredActor = this.getPreferredActorOverride();
        if (preferredActor) {
            this.log(`[FB] Dùng preferred actor override: ${preferredActor}`);
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
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
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

                    const slugMatch = href.match(/^https:\/\/www\.facebook\.com\/([^\/\?#]+)(?:\/|$)/i);
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
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
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
            this.log(`[FB] Không đọc được actor trong nhóm: ${error.message}`);
            return null;
        }
    }
    async postToGroup(groupUrl, content, mediaPaths = [], mediaType = 'image') {
        try {
            this.log(`[FB] Đang truy cập nhóm: ${groupUrl}`);
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
                        .replace(/đ/g, 'd')
                        .replace(/Đ/g, 'D')
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

            // Tải ảnh lên nếu có
            if (mediaPaths.length > 0) {
                const mediaLabel = mediaType === 'video' ? 'video' : 'ảnh';
                this.log(`[FB] Đang tải lên ${mediaPaths.length} ${mediaLabel}...`);

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

                    return metas.filter((meta) => !meta.disabled && (!meta.accept || /image|png|jpg|jpeg|webp|video|mp4|mov|avi|mkv|webm/i.test(meta.accept)));
                };

                const tryAttachViaInputAncestorClick = async () => {
                    const metas = await getUploadInputMetas();
                    const dialogMetas = metas.filter((meta) => meta.inDialog);
                    this.log(`[FB] Có ${dialogMetas.length} input file hợp lệ trong dialog để thử click ancestor.`);

                    for (const meta of dialogMetas) {
                        try {
                            const input = this.page.locator('input[type="file"]').nth(meta.index);
                            this.log(`[FB] Thử kích filechooser trực tiếp từ input #${meta.index + 1}.`);

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
                                await directChooser.setFiles(mediaPaths);
                                attachedByInput = true;
                                this.log(`[FB] Đã nạp ảnh qua filechooser trực tiếp từ input #${meta.index + 1}.`);
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
                                this.log(`[FB] Không tìm thấy ancestor clickable cho input #${meta.index + 1}.`);
                                continue;
                            }

                            this.log(`[FB] Thử click ancestor của input #${meta.index + 1} để mở upload thật.`);
                            const [fileChooser] = await Promise.all([
                                this.page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null),
                                clickableElement.click({ timeout: 2500 }).catch(() => null)
                            ]);

                            if (!fileChooser) {
                                this.log(`[FB] Ancestor của input #${meta.index + 1} không mở ra filechooser.`);
                                continue;
                            }

                            await fileChooser.setFiles(mediaPaths);
                            attachedByInput = true;
                            this.log(`[FB] Đã nạp ảnh qua filechooser từ ancestor input #${meta.index + 1}.`);
                            return true;
                        } catch (e) {
                            this.log(`[FB] Click ancestor của input thất bại: ${e.message}`);
                        }
                    }

                    return false;
                };

                const tryAttachToVisibleInputs = async (scopeLabel) => {
                    const fileInputs = this.page.locator('input[type="file"]');
                    const inputCount = await fileInputs.count();
                    this.log(`[FB] Tìm thấy ${inputCount} input file ở scope ${scopeLabel}.`);

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
                                this.log(`[FB] Bỏ qua input file #${i + 1} vì đang bị disabled.`);
                                continue;
                            }
                            if (meta.accept && !/image|png|jpg|jpeg|webp|video|mp4|mov|avi|mkv|webm/i.test(meta.accept)) {
                                this.log(`[FB] Bỏ qua input file #${i + 1} vì accept không khớp media: ${meta.accept}`);
                                continue;
                            }

                            triedCount++;
                            this.log(`[FB] Thử input file #${i + 1} | inDialog=${meta.inDialog} | multiple=${meta.multiple} | hidden=${meta.hiddenByStyle} | accept=${meta.accept || 'n/a'}`);

                            await input.setInputFiles(meta.multiple ? mediaPaths : [mediaPaths[0]], { timeout: 5000 });
                            await input.evaluate((el) => {
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }).catch(() => {});
                            await sleep(700);

                            const filesLength = await input.evaluate((el) => el.files?.length || 0).catch(() => 0);
                            if (filesLength > 0) {
                                attachedByInput = true;
                                this.log(`[FB] Input file #${i + 1} đã nhận ${filesLength} tệp | inDialog=${meta.inDialog} | accept=${meta.accept || 'n/a'}`);
                                return true;
                            }

                            this.log(`[FB] Input file #${i + 1} không giữ tệp sau setInputFiles.`);
                        } catch (e) {
                            this.log(`[FB] Input file #${i + 1} không dùng được: ${e.message}`);
                        }

                        if (scopeLabel === 'page' && triedCount >= 1) {
                            this.log('[FB] Đã thử 1 input file ngoài dialog, dừng fallback để tránh chậm.');
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
                            this.log('[FB] Đã bấm nút mở chọn ảnh/video trong dialog.');
                            return true;
                        } catch (e) {
                            this.log(`[FB] Bấm nút ảnh/video thất bại: ${e.message}`);
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
                                    .replace(/đ/g, 'd')
                                    .replace(/Đ/g, 'D')
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
                            this.log(`[FB] Đã bấm nút ảnh/video bằng Playwright text scan: ${meta.text}`);
                            return true;
                        } catch (e) {
                            this.log(`[FB] Thử bấm nút ảnh/video bằng text scan thất bại: ${e.message}`);
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
                        await fileChooser.setFiles(mediaPaths);
                        attachedByInput = true;
                        this.log('[FB] Đã nạp ảnh qua sự kiện filechooser.');
                    } else {
                        this.log('[FB] Không có filechooser, sẽ thử input file sau khi bấm nút ảnh/video.');
                    }
                    await sleep(700);
                } else {
                    if (!openedRealUploadFlow) {
                        this.log('[FB] Không bấm được nút ảnh/video, sẽ fallback sang input file trực tiếp.');
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
                        'div[aria-label="Xóa video"]',
                        'div[aria-label="Remove video"]',
                        'div[aria-label="Chỉnh sửa ảnh"]',
                        'div[aria-label="Edit photo"]',
                        '[data-pagelet*="MediaAttachment"] img',
                        '[data-pagelet*="MediaAttachment"] video',
                        'img[src^="blob:"]',
                        'img[src^="data:image"]',
                        'video[src^="blob:"]',
                        '[aria-label*="photo"] img',
                        '[aria-label*="ảnh"] img',
                        '[aria-label*="video"] video'
                    ];
                    const hasAttachmentPreview = selectors.some((selector) => dialog.querySelector(selector));
                    return hasAttachedFile || hasAttachmentPreview;
                }, { timeout: 6000 }).then(() => true).catch(() => false);
                this.log(`[FB] Kết quả xác nhận upload ${mediaType === 'video' ? 'video' : 'ảnh'}: ${uploadConfirmed ? 'OK' : 'KHÔNG THẤY ATTACHMENT'} | attachedByInput=${attachedByInput}`);
                await sleep(700);

                if (!uploadConfirmed) {
                    this.log(`[FB] Upload ${mediaType === 'video' ? 'video' : 'ảnh'} chưa thành công trong composer. Dừng đăng bài để tránh bài không kèm media.`);
                    return { success: false, pending: false, reason: 'media_upload_failed' };
                }
            }

            const inputSelector = 'div[role="dialog"] div[role="textbox"][contenteditable="true"]';
            try {
                await this.page.waitForSelector(inputSelector, { timeout: 10000 });
            } catch (e) {
                this.log('[FB] Không thấy ô nhập văn bản sau 10s.');
            }

            await sleep(500);
            const textboxes = await this.page.$$(inputSelector);
            let typed = false;
            for(let tb of textboxes) {
                if(await tb.isVisible()) {
                    this.log('[FB] Đã thấy ô soạn bài, đang chuẩn bị nhập nội dung...');
                    await tb.click({ delay: 100 });
                    await tb.focus();
                    await sleep(400);
                    // Đảm bảo con trỏ ở cuối hoặc đã sẵn sàng
                    await this.page.keyboard.insertText(content);
                    typed = true;
                    this.log('[FB] Đã nhập nội dung xong.');
                    break;
                }
            }
            
            if(!typed) {
                this.log('[FB] Thử nhập bằng phương pháp dự phòng (fill)...');
                const fallbackInput = await this.page.$('div[aria-label*="Bạn viết gì đi"], div[aria-label*="Bạn đang nghĩ gì"], [contenteditable="true"]');
                if (fallbackInput) {
                    try {
                        await fallbackInput.click();
                        await fallbackInput.fill(content);
                        typed = true;
                        this.log('[FB] Đã nhập nội dung bằng phương pháp dự phòng.');
                    } catch (e) {}
                }
                if (!typed) {
                    this.log('[FB] THẤT BẠI: Không tìm được ô soạn bài để nhập.');
                    return { success: false, pending: false, reason: 'textbox_not_found' };
                }
            }
            
            await sleep(800);
            this.log('[FB] Đang nhấn nút Đăng...');
            
            const submitButtonSelectors = [
                'div[role="dialog"] [aria-label="Đăng"]',
                'div[role="dialog"] [aria-label="Dang"]',
                'div[aria-label="Post"]',
                'div[role="dialog"] [role="button"]:has-text("Đăng")',
                'div[role="dialog"] [role="button"]:has-text("Dang")',
                'div[role="button"]:has-text("Post")'
            ];

            let submitButton = null;
            for (const selector of submitButtonSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (let el of elements) {
                        if (await el.isVisible()) {
                            let isDisabled = await el.getAttribute('aria-disabled');
                            let waitCount = 0;
                            // Giảm thời gian chờ xuống tối đa 15s cho mỗi nút để tránh treo quá lâu
                            while ((isDisabled === 'true' || isDisabled === true) && waitCount < 15) {
                                if (waitCount % 3 === 0) {
                                    this.log(`[FB] Đang đợi ảnh tải lên/nút Đăng sẵn sàng... (${waitCount}s)`);
                                }
                                await sleep(1000);
                                isDisabled = await el.getAttribute('aria-disabled');
                                waitCount++;
                            }

                            if (isDisabled !== 'true' && isDisabled !== true) {
                                submitButton = el;
                                break;
                            } else {
                                this.log('[FB] Nút này vẫn bị khóa sau 15s, thử tìm nút khác hoặc phương thức khác.');
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
                                .replace(/đ/g, 'd')
                                .replace(/Đ/g, 'D')
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
                        this.log(`[FB] Tìm thấy ứng viên nút Đăng: text=${meta.text || 'n/a'} | aria=${meta.aria || 'n/a'} | disabled=${meta.disabled}`);

                        if (!meta.disabled) {
                            submitButton = candidate;
                            break;
                        }
                    } catch (e) {
                        this.log(`[FB] Đọc ứng viên nút Đăng thất bại: ${e.message}`);
                    }
                }
            }

            if (submitButton) {
                await submitButton.click();
                this.log('[FB] Đã nhấn nút Đăng, đang chờ Facebook xử lý...');
                
                let postStatus = 'success';
                try {
                    // Chờ dialog biến mất hoặc xuất hiện thông báo thành công
                    const postDone = await Promise.race([
                        this.page.waitForSelector('div[role="dialog"]', { state: 'hidden', timeout: 20000 }).then(() => 'hidden'),
                        this.page.waitForSelector('text="Đã đăng thành công", text="Bài viết của bạn đang chờ"', { timeout: 20000 }).then(() => 'toast'),
                        sleep(21000).then(() => 'timeout')
                    ]);

                    if (postDone === 'hidden' || postDone === 'toast') {
                        this.log(`[FB] Đăng bài thành công (nhận diện qua: ${postDone}).`);
                    } else {
                        // Kiểm tra lỗi nếu quá 20s mà dialog vẫn còn
                        const pageText = await this.page.innerText('body').catch(() => '');
                        if (pageText.includes('tự động từ chối') || pageText.includes('không đáp ứng tiêu chí') || pageText.includes('Link')) {
                            this.log('[FB] Phát hiện bài viết bị từ chối/hủy sau khi bấm Đăng.');
                            if (pageText.includes('liên kết') || pageText.includes('link') || pageText.includes('Link')) {
                                postStatus = 'rejected_link';
                            } else {
                                postStatus = 'rejected_other';
                            }
                        } else {
                            this.log('[FB] Cảnh báo: Hộp thoại chưa đóng sau 20s, có thể lag hoặc đã đăng xong thầm lặng.');
                        }
                    }
                } catch(e) {
                     this.log(`[FB] Lỗi khi đợi kết quả đăng: ${e.message}`);
                }
                
                if (postStatus === 'rejected_link') return { success: false, pending: false, reason: 'rejected_link' };
                if (postStatus === 'rejected_other') return { success: false, pending: false, reason: 'rejected_other' };

                this.log('[FB] Chờ Facebook ổn định sau khi đóng composer...');
                await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                await sleep(6000);
                
                let isPending = false;
                try {
                    const pageText = await this.page.innerText('body');
                    if (pageText.includes('đang chờ phê duyệt') || pageText.includes('Đang chờ quản trị viên')) {
                        isPending = true;
                        this.log('[FB] Đã thấy thông báo bài đăng đang chờ duyệt.');
                    }
                } catch(e) {}

                return { success: true, pending: isPending };
            } else {
                this.log('[FB] Không tìm thấy nút Đăng hoặc nút bị vô hiệu hóa vĩnh viễn.');
                return { success: false, pending: false, reason: 'submit_button_not_found' };
            }

        } catch (error) {
            this.log(`[FB] Lỗi khi đăng bài lên ${groupUrl}: ${error.message}`);
            return { success: false, pending: false, reason: error?.message || 'post_exception' };
        }
    }

    async verifyPost(groupUrl, userId, content) {
        try {
            const resolvedUserId = userId || await this.getActorFromGroupContext(groupUrl) || await this.getCurrentUserId();
            const checkUrl = `${groupUrl.replace(/\/$/, '')}/user/${resolvedUserId}/`;
            console.log(`[FB] Đang kiểm tra trạng thái bài đăng tại: ${checkUrl}`);
            await this.page.goto(checkUrl);
            await sleep(8000); 
            
            const pageText = await this.page.innerText('body') || '';
            const shortContent = content.substring(0, 40).trim();
            
            if (pageText.includes('đang chờ phê duyệt') || pageText.includes('Đang chờ quản trị viên') || pageText.includes('Bài viết đang chờ xử lý')) {
                 console.log('==> [KẾT QUẢ]: Bài đăng thành công nhưng ĐANG CHỜ QUẢN TRỊ VIÊN PHÊ DUYỆT.');
                 return 'pending';
            }
            
            if (pageText.includes(shortContent)) {
                 console.log('==> [KẾT QUẢ]: Bài đăng ĐÃ ĐƯỢC XUẤT BẢN THÀNH CÔNG trên nhóm!');
                 return 'published';
            }
            
            console.log('==> [KẾT QUẢ]: Không tìm thấy bài đăng tại link cá nhân. Có thể bài đã bị gỡ hoặc chưa hiển thị.');
            return 'not_found';
            
        } catch (error) {
            console.error('[FB] Lỗi khi kiểm tra bài đăng:', error);
            return 'error';
        }
    }

    async checkRemovedContent(groupUrl) {
        try {
            const removedUrl = `${groupUrl.replace(/\/$/, '')}/my_removed_content/`;
            this.log(`[FB] Đang kiểm tra nội dung bị gỡ tại: ${removedUrl}`);
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
            
            if (pageText.includes('Không có bài viết nào để hiển thị') || 
                pageText.includes('No posts to show') ||
                pageText.includes('No content found')) {
                this.log('[FB] Xác nhận: trang my_removed_content đang trống.');
                return 'clean';
            }

            if (
                /\/my_removed_content\/?$/i.test(removedMeta.currentUrl || '') &&
                !removedMeta.hasEmptyState &&
                (removedMeta.articleCount > 0 || removedMeta.feedArticleCount > 0)
            ) {
                this.log('[FB] Phát hiện bài xuất hiện trong my_removed_content. Xem như đã bị gỡ.');
                if (pageText.toLowerCase().includes('liên kết') || pageText.toLowerCase().includes('link')) {
                    return 'removed_by_link';
                }
                return 'removed_other';
            }

            const warningKeywords = [
                'Nhiều người báo cáo', 'vi phạm tiêu chuẩn cộng đồng',
                'Tự động gỡ', 'Auto-removed', 'đã bị gỡ', 'Nội dung bị gỡ',
                'Removed content', 'Gỡ bởi', 'declined', 'denied', 'từ chối',
                'Từ khóa', 'tiêu chí', 'đáp ứng'
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

            if (!isRemoved) {
                const linkKeywords = ['liên kết', 'link'];
                const removalIndicators = ['gỡ', 'vi phạm', 'removed', 'declined', 'not approved'];
                
                for (const lkw of linkKeywords) {
                    if (pageText.toLowerCase().includes(lkw)) {
                        for (const ind of removalIndicators) {
                            if (pageText.toLowerCase().includes(ind)) {
                                console.log(`[FB] Phát hiện cặp từ khóa nghi ngờ: "${lkw}" + "${ind}"`);
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
                this.log(`==> [CANH BÁO]: Phát hiện bài viết bị gỡ. Lý do nghi ngờ: ${matchedKw}`);
                if (pageText.toLowerCase().includes('liên kết') || pageText.toLowerCase().includes('link')) {
                    return 'removed_by_link';
                }
                return 'removed_other';
            }
            
            this.log('[FB] Không thấy dấu hiệu bài viết bị gỡ trên my_removed_content.');
            return 'clean';
        } catch (error) {
            this.log(`[FB] Lỗi khi kiểm tra removed content: ${error.message}`);
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
