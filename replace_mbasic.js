const fs = require('fs');

let content = fs.readFileSync('get_groups.js', 'utf8');

const regexToReplace = /const searchUrl = `https:\/\/www\.facebook\.com\/groups\/joins\/\?nav_source=tab`;[\s\S]*?if \(stagnantCount >= 12 && i > 5\) {[\s\S]*?break;\s*}\s*}/;

const newCode = `const searchUrl = \`https://mbasic.facebook.com/groups/?seemore\`;
        logCallback(\`[FB] Truy cập trang quản lý nhóm (mbasic): \${searchUrl}\`);
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 90000 });
        
        const isLoginPage = await page.evaluate(() => document.body.innerText.includes('Đăng nhập') || document.querySelector('input[name="email"]'));
        if (isLoginPage) {
            logCallback('[!] Bạn chưa đăng nhập trên mbasic. Vui lòng đăng nhập...');
            await page.waitForFunction(() => !document.querySelector('input[name="email"]'), { timeout: 300000 });
            await page.goto(searchUrl, { waitUntil: 'load' });
        }

        await page.waitForTimeout(3000);
        logCallback(\`[FB] GIAI ĐOẠN 1: Bắt đầu dò tìm nhóm mbasic...\`);

        let clickCount = 0;
        const maxScrollAttempts = 400;

        for (let i = 0; i < maxScrollAttempts; i++) {
            const discovered = await page.evaluate((kw) => {
                const results = [];
                const seenIds = new Set();
                const allGroupLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
                
                for (const a of allGroupLinks) {
                    const href = a.href;
                    if (href.includes('/user/') || href.includes('/posts/') || 
                        href.includes('/groups/feed/') || href.includes('/groups/discover/') ||
                        href.includes('/groups/categories/') ||
                        href.endsWith('/groups/') || href.includes('/groups/joins/')) continue;

                    const idMatch = href.match(/\\/groups\\/(\\d+)\\/?/) || href.match(/\\/groups\\/([^\\/\\?]+)/);
                    if (!idMatch) continue;
                    
                    const id = idMatch[1];
                    if (seenIds.has(id)) continue;

                    let name = a.innerText.trim();
                    if (name.includes('Lần hoạt động')) name = name.split('Lần hoạt động')[0].trim();
                    if (name.includes('Last active')) name = name.split('Last active')[0].trim();
                    
                    if (name.toLowerCase() === 'xem nhóm' || name.toLowerCase() === 'view group' || 
                        name.toLowerCase() === 'tham gia nhóm' || name.toLowerCase() === 'join group' ||
                        name.toLowerCase() === 'xem thêm' || name.toLowerCase() === 'see more') continue;
                    
                    if (kw && !name.toLowerCase().includes(kw.toLowerCase())) continue;
                    
                    if (name.length > 2 && name.length < 150) {
                        results.push({ 
                            id, 
                            name, 
                            url: \`https://www.facebook.com/groups/\${id}/\`,
                            members: 'N/A'
                        });
                        seenIds.add(id);
                    }
                }
                return results;
            }, keyword);

            for (const g of discovered) {
                if (!allGroups.has(g.url)) {
                    const groupData = {
                        id: g.id,
                        name: g.name,
                        url: g.url,
                        members: g.members || 'N/A',
                        postedTime: null,
                        lastPostStatus: 'Đang xếp hàng...',
                        isSelectable: false
                    };
                    allGroups.set(g.url, groupData);
                    groupQueue.push(groupData); 
                    logCallback(\`[FB_EVENT] \${JSON.stringify({ type: 'group_found', group: groupData })}\`);
                }
            }

            if (i % 2 === 0) logCallback(\`[FB] Đang quét... Đã vét được \${allGroups.size} nhóm.\`);
            
            const nextUrl = await page.evaluate(() => {
                const seeMore = Array.from(document.querySelectorAll('a')).find(a => 
                    a.innerText.toLowerCase().includes('xem thêm') || 
                    a.innerText.toLowerCase().includes('see more') ||
                    (a.href && a.href.includes('seemore'))
                );
                return seeMore ? seeMore.href : null;
            });

            if (nextUrl && nextUrl !== page.url()) {
                await page.goto(nextUrl, { waitUntil: 'load', timeout: 30000 }).catch(()=>null);
                await page.waitForTimeout(1500);
            } else {
                logCallback(\`[FB] Đã vét ĐẾN ĐÁY danh sách! Tổng cộng: \${allGroups.size} nhóm.\`);
                break;
            }
        }`;

if (regexToReplace.test(content)) {
    content = content.replace(regexToReplace, newCode);
    fs.writeFileSync('get_groups.js', content, 'utf8');
    console.log("SUCCESS");
} else {
    console.log("FAILED TO MATCH");
}
