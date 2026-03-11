require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function debugSearch() {
    const userDataDir = path.join(__dirname, 'fb_user_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 720 },
        args: ['--disable-notifications']
    });
    const page = await context.newPage();
    try {
        const keyword = 'Bất động sản Gia Lai';
        const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
        console.log(`[Debug] Truy cập: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(5000);
        
        await page.screenshot({ path: 'debug_search_groups.png' });
        
        const data = await page.evaluate(() => {
            const results = [];
            // Tìm tất cả các container kết quả tìm kiếm (thường là các div có vai trò article hoặc listitem)
            const items = document.querySelectorAll('div[role="article"], div[role="listitem"]');
            items.forEach(item => {
                const link = item.querySelector('a[href*="/groups/"]');
                if (link) {
                    const name = item.innerText.split('\n')[0];
                    const joinBtn = item.querySelector('div[aria-label="Tham gia"], div[aria-label="Join"], div[aria-label="Tham gia nhóm"]');
                    results.push({
                        name: name,
                        url: link.href,
                        hasJoinButton: !!joinBtn,
                        fullText: item.innerText.substring(0, 200)
                    });
                }
            });
            return {
                html: document.body.innerHTML.substring(0, 10000), // Lấy đoạn đầu
                results: results
            };
        });
        
        fs.writeFileSync('debug_search_results.json', JSON.stringify(data.results, null, 2));
        fs.writeFileSync('debug_search_dom.html', data.html);
        console.log('[Debug] Đã dump dữ liệu tìm kiếm.');
    } catch(e) {
        console.error(e);
    } finally {
        await context.close();
    }
}
debugSearch();
