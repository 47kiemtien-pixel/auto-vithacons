const path = require('path');
const fs = require('fs');

async function execDiscoverGroups(context, keyword, logCallback = () => {}) {
    const page = await context.newPage();
    try {
        const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
        logCallback(`[Discovery] Đang tìm kiếm nhóm với từ khóa: "${keyword}"...`);
        
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Cuộn trang một chút để tải thêm kết quả
        logCallback('[Discovery] Đang cuộn trang để lấy thêm kết quả...');
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await page.waitForTimeout(2000);
        }

        const groups = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('div[role="article"], div[role="listitem"]');
            
            items.forEach(item => {
                const link = item.querySelector('a[href*="/groups/"]');
                if (link && link.href) {
                    let fullUrl = link.href.split('?')[0];
                    if (!fullUrl.endsWith('/')) fullUrl += '/';
                    
                    // Tránh lấy lại link tab search
                    if (fullUrl.includes('/search/')) return;

                    const text = item.innerText || '';
                    const lines = text.split('\n').filter(l => l.trim());
                    
                    if (lines.length >= 2) {
                        const name = lines[0];
                        const info = lines[1]; // Vd: "Công khai · 141K thành viên"
                        
                        // Kiểm tra trạng thái Join
                        let joinBtnFound = false;
                        // Tìm tất cả các element có khả năng là nút bấm
                        const joinSelectors = [
                            '[role="button"]',
                            'div[aria-label]',
                            'span[role="button"]',
                            'a[role="button"]'
                        ];
                        
                        const buttons = item.querySelectorAll(joinSelectors.join(','));
                        for (const btn of buttons) {
                            const btnText = (btn.innerText || '').trim();
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            
                            const joinTexts = ['Tham gia', 'Join', 'Tham gia nhóm', 'Join Group', 'Request to Join', 'Yêu cầu tham gia', 'Tham gia Group'];
                            const isJoinLabel = ariaLabel.includes('tham gia group') || ariaLabel.includes('join group') || ariaLabel.includes('tham gia nhóm') || ariaLabel === 'tham gia' || ariaLabel === 'join';

                            if (joinTexts.some(t => btnText === t) || isJoinLabel) {
                                joinBtnFound = true;
                                break;
                            }
                        }
                        
                        // Nếu text chứa "Đã tham gia" hoặc "Joined" thì bỏ qua hoặc đánh dấu
                        const textLower = text.toLowerCase();
                        const isJoined = textLower.includes('đã tham gia') || 
                                         textLower.includes('joined') || 
                                         textLower.includes('đã gửi yêu cầu') || 
                                         textLower.includes('requested') || 
                                         textLower.includes('pending') || 
                                         textLower.includes('đang chờ');

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
            
            // Lọc trùng
            const unique = [];
            const map = new Map();
            for (const item of results) {
                if (!map.has(item.url)) {
                    map.set(item.url, true);
                    unique.push(item);
                }
            }
            return unique;
        });

        logCallback(`[Discovery] Tìm thấy ${groups.length} nhóm tiềm năng.`);
        
        // Phát sự kiện từng nhóm tìm được
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
        await page.waitForTimeout(3000);

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
            // Fallback: Tìm text Tham gia trong toàn bộ button
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
            await page.waitForTimeout(3000);
            // Có thể có câu hỏi gia nhập
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
