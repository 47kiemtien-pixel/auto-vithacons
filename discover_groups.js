const path = require('path');
const fs = require('fs');

async function execDiscoverGroups(context, keyword, logCallback = () => {}) {
    const page = await context.newPage();
    try {
        const exactKeyword = `"${keyword}"`;
        const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(exactKeyword)}`;
        logCallback(`[Discovery] Bắt đầu điều hướng tới (Tìm mẫu): ${url}`);
        
        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
        logCallback('[Discovery] Đã tải xong trang tìm kiếm. Đợi dữ liệu render...');
        await page.waitForTimeout(7000);

        logCallback('[Discovery] Đang cuộn trang (3 lần) để lấy thêm nhóm...');
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 1500));
            await page.waitForTimeout(2500);
        }

        logCallback('[Discovery] Đang trích xuất dữ liệu nhóm từ DOM...');
        const groups = await page.evaluate((kw) => {
            const results = [];
            const allLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
            const processedUrls = new Set();
            const lowerKw = kw.toLowerCase();

            allLinks.forEach(link => {
                let fullUrl = link.href.split('?')[0];
                if (!fullUrl.endsWith('/')) fullUrl += '/';
                if (fullUrl.includes('/search/') || processedUrls.has(fullUrl)) return;

                let container = link.closest('div[role="article"]') || 
                                link.closest('div[role="listitem"]') ||
                                link.parentElement?.closest('div.x1yzt60o'); 

                if (container) {
                    const text = container.innerText || '';
                    const lines = text.split('\n').filter(l => l.trim());
                    if (lines.length >= 1) {
                        const name = lines[0];
                        if (!name.toLowerCase().includes(lowerKw)) return; 
                        const info = lines.find(l => l.includes('thành viên') || l.includes('members')) || '';
                        
                        let joinBtnFound = false;
                        const buttons = container.querySelectorAll('div[role="button"], [role="button"]');
                        for (const btn of buttons) {
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const btnText = (btn.innerText || '').trim().toLowerCase();
                            if (ariaLabel.includes('tham gia nhóm') || ariaLabel.includes('join group') || 
                                btnText === 'tham gia' || btnText === 'join') {
                                joinBtnFound = true;
                                break;
                            }
                        }
                        
                        const textLower = text.toLowerCase();
                        const isJoined = textLower.includes('đã tham gia') || textLower.includes('joined') || 
                                         textLower.includes('đã gửi yêu cầu') || textLower.includes('requested') || 
                                         textLower.includes('đang chờ');

                        processedUrls.add(fullUrl);
                        results.push({
                            name: name,
                            url: fullUrl,
                            info: info,
                            isJoined: isJoined,
                            canJoin: !isJoined && joinBtnFound
                        });
                    }
                }
            });
            return results;
        }, keyword);

        logCallback(`[Discovery] Phân tích xong. Tìm thấy ${groups.length} nhóm.`);
        for (const g of groups) {
            logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_discovered', group: g })}`);
        }
        return groups;
    } catch (e) {
        logCallback(`[Discovery] Lỗi: ${e.message}`);
        return [];
    } finally {
        await page.close();
    }
}

async function execJoinGroup(context, groupUrl, logCallback = () => {}) {
    const page = await context.newPage();
    try {
        logCallback(`[AutoJoin] Đang truy cập nhóm để tham gia: ${groupUrl}`);
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);

        const joinButtonSelectors = [
            'div[aria-label="Tham gia nhóm"]',
            'div[aria-label="Join group"]',
            'div[role="button"]:has-text("Tham gia nhóm")',
            'div[role="button"]:has-text("Join group")',
            'div[aria-label="Tham gia"]',
            'div[role="button"]:has-text("Tham gia")'
        ];

        let joined = false;
        for (const selector of joinButtonSelectors) {
            try {
                const btn = await page.$(selector);
                if (btn && await btn.isVisible()) {
                    await btn.click();
                    joined = true;
                    logCallback(`[AutoJoin] Đã nhấn nút Tham gia tại: ${groupUrl}`);
                    break;
                }
            } catch(e) {}
        }
        if (!joined) {
            const buttons = await page.$$('div[role="button"]');
            for (const btn of buttons) {
                const text = await btn.innerText();
                if (text === 'Tham gia' || text === 'Tham gia nhóm' || text === 'Join' || text === 'Join Group') {
                    await btn.click();
                    joined = true;
                    logCallback(`[AutoJoin] Đã nhấn nút Tham gia (Fallback) tại: ${groupUrl}`);
                    break;
                }
            }
        }
        if (joined) {
            await page.waitForTimeout(1000);
            const hasQuestions = await page.evaluate(() => {
                return document.body.innerText.includes('Câu hỏi gia nhập') || document.body.innerText.includes('Membership Questions');
            });
            if (hasQuestions) {
                logCallback(`[AutoJoin] Nhóm này có câu hỏi gia nhập. Vui lòng tự trả lời thủ công nếu cần.`);
            }
            return true;
        } else {
            logCallback(`[AutoJoin] Không tìm thấy nút tham gia (Có thể đã tham gia rồi).`);
            return false;
        }
    } catch (e) {
        logCallback(`[AutoJoin] Lỗi khi tham gia ${groupUrl}: ${e.message}`);
        return false;
    } finally {
        await page.close();
    }
}

module.exports = { execDiscoverGroups, execJoinGroup };
