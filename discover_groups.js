async function execDiscoverGroups(context, keyword, logCallback = () => {}) {
    const page = await context.newPage();
    try {
        const exactKeyword = `"${keyword}"`;
        const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(exactKeyword)}`;
        logCallback(`[Discovery] Bat dau dieu huong toi (Tim mau): ${url}`);

        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
        logCallback('[Discovery] Da tai xong trang tim kiem. Doi du lieu render...');
        await page.waitForTimeout(7000);

        logCallback('[Discovery] Dang cuon trang (3 lan) de lay them nhom...');
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 1500));
            await page.waitForTimeout(2500);
        }

        logCallback('[Discovery] Dang trich xuat du lieu nhom tu DOM...');
        const groups = await page.evaluate((kw) => {
            const results = [];
            const allLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
            const processedUrls = new Set();

            const normalizeText = (value) => {
                return (value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();
            };

            const normalizedKw = normalizeText(kw);

            allLinks.forEach((link) => {
                let fullUrl = link.href.split('?')[0];
                if (!fullUrl.endsWith('/')) fullUrl += '/';
                if (fullUrl.includes('/search/') || processedUrls.has(fullUrl)) return;

                const container =
                    link.closest('div[role="article"]') ||
                    link.closest('div[role="listitem"]') ||
                    link.parentElement?.closest('div.x1yzt60o');

                if (!container) return;

                const text = container.innerText || '';
                const lines = text.split('\n').filter((line) => line.trim());
                if (lines.length < 1) return;

                const name = lines[0];
                if (normalizedKw && !normalizeText(name).includes(normalizedKw)) return;

                const info = lines.find((line) => line.includes('thành viên') || line.includes('members')) || '';

                let joinBtnFound = false;
                const buttons = container.querySelectorAll('div[role="button"], [role="button"]');
                for (const btn of buttons) {
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const btnText = (btn.innerText || '').trim().toLowerCase();
                    if (
                        ariaLabel.includes('tham gia nhóm') ||
                        ariaLabel.includes('join group') ||
                        btnText === 'tham gia' ||
                        btnText === 'join'
                    ) {
                        joinBtnFound = true;
                        break;
                    }
                }

                const textLower = text.toLowerCase();
                const isJoined =
                    textLower.includes('đã tham gia') ||
                    textLower.includes('joined') ||
                    textLower.includes('đã gửi yêu cầu') ||
                    textLower.includes('requested') ||
                    textLower.includes('đang chờ');

                processedUrls.add(fullUrl);
                results.push({
                    name,
                    url: fullUrl,
                    info,
                    isJoined,
                    canJoin: !isJoined && joinBtnFound
                });
            });

            return results;
        }, keyword);

        logCallback(`[Discovery] Phan tich xong. Tim thay ${groups.length} nhom.`);
        for (const g of groups) {
            logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_discovered', group: g })}`);
        }
        return groups;
    } catch (e) {
        logCallback(`[Discovery] Loi: ${e.message}`);
        return [];
    } finally {
        await page.close();
    }
}

async function execJoinGroup(context, groupUrl, logCallback = () => {}) {
    const page = await context.newPage();
    let shouldClosePage = true;

    const detectJoinState = async () => {
        return page.evaluate(() => {
            const normalize = (value) => (value || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/\s+/g, ' ')
                .trim();

            const isVisible = (el) => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            };

            const buttonTexts = Array.from(document.querySelectorAll('[role="button"], button, a[role="button"]'))
                .filter(isVisible)
                .map((el) => normalize(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || ''))
                .filter(Boolean);

            const hasAny = (patterns, values) => patterns.some((pattern) => values.some((value) => value.includes(pattern)));
            const joinedPatterns = ['da tham gia', 'joined', 'invite', 'moi', 'manage', 'quan ly'];
            const requestedPatterns = ['da gui yeu cau', 'requested', 'dang cho', 'pending', 'cancel request', 'huy yeu cau'];
            const questionPatterns = ['cau hoi gia nhap', 'membership questions', 'answer questions', 'tra loi cau hoi'];
            const joinPatterns = ['tham gia nhom', 'join group', 'tham gia', 'join'];

            if (hasAny(questionPatterns, buttonTexts)) {
                return { status: 'needs_manual', reason: 'questions' };
            }
            if (hasAny(requestedPatterns, buttonTexts) && !hasAny(joinPatterns, buttonTexts)) {
                return { status: 'requested', reason: 'request_detected' };
            }
            if (hasAny(joinedPatterns, buttonTexts) && !hasAny(joinPatterns, buttonTexts)) {
                return { status: 'joined', reason: 'joined_detected' };
            }
            if (hasAny(joinPatterns, buttonTexts)) {
                return { status: 'not_joined', reason: 'join_button_still_visible' };
            }
            return { status: 'unknown', reason: 'button_state_unclear' };
        });
    };

    try {
        logCallback(`[AutoJoin] Dang truy cap nhom de tham gia: ${groupUrl}`);
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        const joinButtonSelectors = [
            'div[aria-label="Tham gia nhóm"]',
            'div[aria-label="Join group"]',
            'div[aria-label="Tham gia"]',
            'div[role="button"]',
            'button'
        ];

        let clickedJoin = false;
        for (const selector of joinButtonSelectors) {
            const elements = await page.$$(selector);
            for (const el of elements) {
                try {
                    const text = ((await el.innerText()) || '').trim().toLowerCase();
                    const label = ((await el.getAttribute('aria-label')) || '').trim().toLowerCase();
                    const candidate = `${text} ${label}`;
                    if (
                        candidate.includes('tham gia nhóm') ||
                        candidate.includes('join group') ||
                        candidate === 'tham gia' ||
                        candidate === 'join' ||
                        candidate.includes(' tham gia ') ||
                        candidate.includes(' join ')
                    ) {
                        if (await el.isVisible()) {
                            await el.click();
                            clickedJoin = true;
                            logCallback(`[AutoJoin] Da nhan nut Tham gia tai: ${groupUrl}`);
                            break;
                        }
                    }
                } catch (_) {}
            }
            if (clickedJoin) break;
        }

        if (!clickedJoin) {
            shouldClosePage = false;
            logCallback('[AutoJoin] Khong tim thay nut tham gia ro rang. Giu tab mo de kiem tra thu cong.');
            return { status: 'unknown', reason: 'join_button_not_found' };
        }

        await page.waitForTimeout(3000);
        let finalState = await detectJoinState();

        if (finalState.status === 'unknown' || finalState.status === 'not_joined') {
            for (let i = 0; i < 8; i++) {
                await page.waitForTimeout(3000);
                finalState = await detectJoinState();
                if (finalState.status !== 'unknown' && finalState.status !== 'not_joined') {
                    break;
                }
            }
        }

        if (finalState.status === 'joined' || finalState.status === 'requested') {
            logCallback(`[AutoJoin] Xac nhan trang thai ${finalState.status} tai: ${groupUrl}`);
            return finalState;
        }

        shouldClosePage = false;
        if (finalState.status === 'needs_manual') {
            logCallback('[AutoJoin] Nhom co cau hoi gia nhap. Giu tab mo de xu ly thu cong.');
        } else {
            logCallback('[AutoJoin] Nut tham gia chua doi trang thai. Giu tab mo de kiem tra them.');
        }
        return finalState;
    } catch (e) {
        shouldClosePage = false;
        logCallback(`[AutoJoin] Loi khi tham gia ${groupUrl}: ${e.message}`);
        return { status: 'error', reason: e.message };
    } finally {
        if (shouldClosePage) {
            await page.close();
        }
    }
}

module.exports = { execDiscoverGroups, execJoinGroup };
