const { chromium } = require('playwright');
const fs = require('fs');

async function execGetGroups(primaryContext, keyword, logCallback = () => {}) {
    logCallback('[FB] Đang khởi tạo bộ quét Tìm kiếm thông minh...');
    
    const page = await primaryContext.newPage();
    const allGroups = new Map();
    const userIdToCheck = '100063596562296';

    try {
        const filterParam = 'eyJycF9hdXRob3I6MCI6IntcIm5hbWVcIjpcIm15_2dyb3Vwc19hbmRfcGFnZXNfcG9zdHNcIixcImFyZ3NcIjpcIlwifSJ9';
        const searchUrl = `https://www.facebook.com/search/posts?q=${encodeURIComponent(keyword)}&filters=${filterParam}`;

        logCallback(`[FB] Đọc dữ liệu từ Tìm kiếm: ${keyword || 'Tất cả'}`);
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(8000); 

        logCallback('[FB] Bắt đầu GIAI ĐOẠN 1: Thu thập tên và ID nhóm...');

        let lastCount = 0;
        let stagnantCount = 0;
        const maxScrolls = 200; 

        for (let i = 0; i < maxScrolls; i++) {
            const discovered = await page.evaluate(() => {
                const results = [];
                const allLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
                
                for (const a of allLinks) {
                    const href = a.href;
                    if (href.includes('/user/') || href.includes('/posts/') || 
                        href.includes('/groups/feed/') || href.includes('/groups/discover/') ||
                        href.includes('/groups/joins/')) continue;

                    const idMatch = href.match(/\/groups\/([^\/\?]+)/);
                    if (idMatch) {
                        const id = idMatch[1];
                        let name = a.innerText.trim();
                        
                        const cleanSpan = a.querySelector('span[dir="auto"]');
                        if (cleanSpan) {
                            const spanText = cleanSpan.innerText.trim();
                            if (spanText.length > 0) name = spanText;
                        }

                        // LÀM SẠCH TÊN TRỰC ĐỂ
                        name = name
                            .replace(/^(Chưa đọc|Mới|Gần đây|Bây giờ trong|Now in|Recent activity in|[\s\W]*)+/gi, '') // Xóa tiền tố
                            .replace(/( có một bài viết mới| Đánh dấu là đã đọc|·)+/gi, '') // Xóa hậu tố
                            .split('\n')[0]
                            .split('·')[0]
                            .split(':')[0]
                            .trim();

                        if (name.length > 2 && name.length < 150) {
                            results.push({ id, name, url: `https://www.facebook.com/groups/${id}/` });
                        }
                    }
                }
                return results;
            });

            for (const g of discovered) {
                if (!allGroups.has(g.url)) {
                    const groupData = {
                        id: g.id,
                        name: g.name,
                        url: g.url,
                        members: 'Đang check...',
                        postedTime: null,
                        lastPostStatus: 'Đang chờ...'
                    };
                    allGroups.set(g.url, groupData);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: groupData })}`);
                }
            }

            if (allGroups.size > lastCount) {
                lastCount = allGroups.size;
                stagnantCount = 0;
                logCallback(`[FB] Đã tìm thấy: ${allGroups.size} nhóm.`);
                fs.writeFileSync('groups_data.json', JSON.stringify(Array.from(allGroups.values()), null, 2));
            } else {
                stagnantCount++;
            }

            await page.mouse.wheel(0, 3000);
            await page.waitForTimeout(1500);

            if (stagnantCount >= 20 && allGroups.size > 0) break;
        }

        logCallback(`[FB] HOÀN TẤT GIAI ĐOẠN 1. Tổng: ${allGroups.size} nhóm.`);
        
        if (allGroups.size === 0) {
            logCallback('[!] Không tìm thấy nhóm nào phù hợp bài viết gần đây.');
            return;
        }

        logCallback(`[FB] Bắt đầu GIAI ĐOẠN 2: Kiểm tra Chi tiết cho ${allGroups.size} nhóm...`);

        const groupList = Array.from(allGroups.values());
        for (let i = 0; i < groupList.length; i++) {
            const group = groupList[i];
            logCallback(`[FB] [Check ${i+1}/${groupList.length}] ${group.name}`);
            const checkUrl = `https://www.facebook.com/groups/${group.id}/user/${userIdToCheck}/`;
            try {
                await page.goto(checkUrl, { waitUntil: 'load', timeout: 30000 });
                await page.waitForTimeout(4000);
                const details = await page.evaluate(() => {
                    const text = document.body.innerText;
                    const mMatch = text.match(/(\d+[.,]?\d*[KM]?)\s*(thành viên|members)/i);
                    const noPostPatterns = ['Không có bài viết mới', 'No posts available', 'chưa đăng gì trong nhóm', 'Không tìm thấy kết quả', 'No results found'];
                    const hasNoPost = noPostPatterns.some(p => text.includes(p));
                    return {
                        members: mMatch ? mMatch[0] : 'N/A',
                        status: hasNoPost ? 'Không có bài viết' : 'Đã có bài'
                    };
                });
                group.members = details.members;
                group.lastPostStatus = details.status;
                logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: group })}`);
                if (i % 5 === 0) fs.writeFileSync('groups_data.json', JSON.stringify(Array.from(allGroups.values()), null, 2));
            } catch (err) { }
        }
        logCallback(`\n[FB] HOÀN TẤT TOÀN BỘ QUY TRÌNH!`);
    } catch (e) {
        logCallback(`Lỗi: ${e.message}`);
    } finally {
        await page.close();
    }
}

module.exports = { execGetGroups };
