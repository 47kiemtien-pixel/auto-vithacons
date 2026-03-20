const fs = require('fs');
let code = fs.readFileSync('get_groups.js', 'utf-8');

// 1. Change the search URL
code = code.replace(
    'const searchUrl = `https://www.facebook.com/groups/joins/?nav_source=tab`;',
    'const searchUrl = `https://www.facebook.com/${userIdToCheck}/groups`;'
);

// 2. Fix the parser logic
const oldParser = `                // Lấy tất cả listitem để bóc tách thông tin đi kèm
                const listItems = Array.from(document.querySelectorAll('div[role="listitem"]'));
                
                for (const item of listItems) {
                    const a = item.querySelector('a[href*="/groups/"]');
                    if (!a) continue;
                    
                    const href = a.href;
                    if (href.includes('/user/') || href.includes('/posts/') || 
                        href.includes('/groups/feed/') || href.includes('/groups/discover/') ||
                        href.includes('/groups/categories/') ||
                        href.endsWith('/groups/') || href.includes('/groups/joins/')) continue;

                    const idMatch = href.match(/\\/groups\\/(\\d+)\\/?/) || href.match(/\\/groups\\/([^\\/\\?]+)/);
                    if (idMatch) {
                        const id = idMatch[1];
                        const nameEl = a.querySelector('span[dir="auto"]') || a;
                        const name = nameEl.innerText.trim();
                        
                        if (name.toLowerCase() === 'xem nhóm' || name.toLowerCase() === 'view group' || 
                            name.toLowerCase() === 'tham gia nhóm' || name.toLowerCase() === 'join group') continue;
                        
                        // LỌC CHÍNH XÁC: Tên phải chứa cụm từ người dùng nhập
                        if (kw && !name.toLowerCase().includes(kw.toLowerCase())) continue;
                        
                        if (name.length > 2 && name.length < 150) {
                            // Bóc tách số lượng thành viên từ text của item
                            const itemText = item.innerText;
                            const mMatch = itemText.match(/(\\d+[.,]?\\d*[KM]?)\\s*(thành viên|members)/i);
                            
                            results.push({ 
                                id, 
                                name, 
                                url: \`https://www.facebook.com/groups/\${id}/\`,
                                members: mMatch ? mMatch[0] : 'N/A'
                            });
                        }
                    }
                }`;

const newParser = `                const seenIds = new Set();
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

                    let name = '';
                    const nameEl = a.querySelector('span[dir="auto"]');
                    if (nameEl) {
                        name = nameEl.innerText.trim();
                    } else {
                        name = a.innerText.trim();
                    }
                    
                    if (name.includes('Lần hoạt động')) name = name.split('Lần hoạt động')[0].trim();
                    if (name.includes('Last active')) name = name.split('Last active')[0].trim();
                    
                    if (name.toLowerCase() === 'xem nhóm' || name.toLowerCase() === 'view group' || 
                        name.toLowerCase() === 'tham gia nhóm' || name.toLowerCase() === 'join group') continue;
                    
                    if (kw && !name.toLowerCase().includes(kw.toLowerCase())) continue;
                    
                    if (name.length > 2 && name.length < 150) {
                        let members = 'N/A';
                        let parent = a.parentElement;
                        for(let k=0; k<5; k++) {
                            if(!parent) break;
                            const text = parent.innerText || '';
                            const mMatch = text.match(/(\\d+[.,]?\\d*[KM]?)\\s*(thành viên|members)/i);
                            if (mMatch) {
                                members = mMatch[0];
                                break;
                            }
                            parent = parent.parentElement;
                        }
                        
                        results.push({ 
                            id, 
                            name, 
                            url: \`https://www.facebook.com/groups/\${id}/\`,
                            members: members
                        });
                        seenIds.add(id);
                    }
                }`;

code = code.replace(oldParser, newParser);

// 3. Fix the scrolling logic
const oldScroll = `        let lastHeight = 0;
        let stagnantCount = 0;
        const maxScrollAttempts = 400;`;

const newScroll = `        let lastGroupCount = 0;
        let stagnantCount = 0;
        const maxScrollAttempts = 400;`;

code = code.replace(oldScroll, newScroll);

const oldScrollLoop = `            // Scroll xuống
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(2000);

            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === lastHeight) stagnantCount++;
            else { stagnantCount = 0; lastHeight = currentHeight; }

            if (i % 5 === 0) logCallback(\`[FB] Đang quét... Tìm thấy \${allGroups.size} nhóm. Queue: \${groupQueue.length}\`);
            if (stagnantCount >= 10 && i > 5) break;`;

const newScrollLoop = `            // Scroll xuống bằng cách cuộn trang thực tế để tải nhóm mới
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1000);
            await page.keyboard.press('PageDown');
            await page.waitForTimeout(2000);

            // Kiểm tra số lượng nhóm thay vì chiều cao
            const currentCount = allGroups.size;
            if (currentCount === lastGroupCount) stagnantCount++;
            else { stagnantCount = 0; lastGroupCount = currentCount; }

            if (i % 5 === 0) logCallback(\`[FB] Đang quét... Tìm thấy \${allGroups.size} nhóm. Queue: \${groupQueue.length}\`);
            
            if (stagnantCount >= 12 && i > 5) {
                logCallback(\`[FB] Đã đạt giới hạn cuộn trang hoặc không thể tải thêm nhóm mới.\`);
                break;
            }`;

code = code.replace(oldScrollLoop, newScrollLoop);

fs.writeFileSync('get_groups.js', code, 'utf-8');
console.log("Patched get_groups.js successfully.");
