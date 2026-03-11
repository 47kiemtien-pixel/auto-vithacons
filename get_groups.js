const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function execGetGroups(context, keyword, logCallback = () => {}) {
    const page = await context.newPage();
    const page2 = await context.newPage(); // Tab 2 để soi thành viên
    
    try {
        logCallback('[FB] Đang truy cập trang danh sách nhóm đã tham gia...');
        await page.goto('https://www.facebook.com/groups/joins/');
        
        let keywordLower = keyword ? keyword.toLowerCase() : '';
        const historyPath = path.join(__dirname, 'posted_history.txt');
        const postedGroups = new Map();
        if (fs.existsSync(historyPath)) {
            const lines = fs.readFileSync(historyPath, 'utf-8').split('\n').map(l => l.trim()).filter(l => l.length > 0);
            for (const line of lines) {
                const parts = line.split('|');
                const url = parts[0];
                const timestamp = parts.length > 1 ? parseInt(parts[1], 10) : 0;
                if (!postedGroups.has(url) || postedGroups.get(url) < timestamp) {
                    postedGroups.set(url, timestamp);
                }
            }
        }
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        logCallback('[FB] Đang cuộn trang để tải thêm danh sách nhóm (mất khoảng 30-40 giây)...');
        
        let previousHeight = 0;
        let scrollAttempts = 0;
        const seenUrls = new Set();
        const finalGroups = [];
        
        while (scrollAttempts < 20) {
            // Click See more nếu có
            try {
                const seeMoreBtns = await page.$$('div[role="button"]:has-text("Xem thêm"), div[role="button"]:has-text("See more")');
                for (const btn of seeMoreBtns) {
                    if (await btn.isVisible()) {
                        await btn.click();
                        await page.waitForTimeout(1000);
                    }
                }
            } catch(e) {}

            // Trích xuất các nhóm đang hiển thị trên màn hình hiện tại
            const currentGroups = await page.evaluate(() => {
                const links = document.querySelectorAll('a[role="link"]');
                const result = [];
                for (const a of links) {
                    let url = a.href;
                    if (!url) continue;
                    url = url.split('?')[0]; // Bỏ các tham số theo dõi của FB
                    if (!url.endsWith('/')) url += '/';
                    if (url.match(/\/groups\/\d+\/$/) || url.match(/\/groups\/[a-zA-Z0-9._-]+\/$/)) {
                        if (!url.includes('/user/') && !url.includes('/buy_sell_discussion/') && !url.includes('/about/')) {
                             let imgTag = a.querySelector('image') || a.querySelector('img') || (a.closest('div[role="listitem"]') && a.closest('div[role="listitem"]').querySelector('image'));
                             let avatar = imgTag ? (imgTag.getAttribute('xlink:href') || imgTag.src) : null;
                             
                             let rawText = (a.innerText || a.textContent || '').trim();
                             if (!rawText && a.getAttribute('aria-label')) rawText = a.getAttribute('aria-label');
                             
                             let name = rawText;
                             let members = '';
                             let lastActive = '';
                             
                             let lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
                             if (lines.length > 0) {
                                name = lines[0];
                                for (let i = 1; i < lines.length; i++) {
                                     let l = lines[i];
                                     if (l.includes('Lần hoạt động gần nhất') || l.includes('vừa xong') || l.includes('trước')) {
                                         lastActive = l;
                                     } else if (l.includes('thành viên') || l.includes('K ')) {
                                         members = l;
                                     }
                                }
                             }

                             if (lines.length === 1) {
                                 let text = name;
                                 let activeIdx = text.indexOf('Lần hoạt động');
                                 if (activeIdx !== -1) {
                                     lastActive = text.substring(activeIdx).trim();
                                     text = text.substring(0, activeIdx).trim();
                                 }
                                 let memberIdx = text.indexOf('thành viên');
                                 if (memberIdx !== -1) {
                                     let words = text.substring(0, memberIdx + 11).split(' ');
                                     let memberString = words.slice(Math.max(words.length - 3, 0)).join(' ').trim();
                                     members = memberString;
                                     text = text.substring(0, text.indexOf(memberString)).trim();
                                 }
                                 name = text;
                             }
                             if (name) {
                                 result.push({ url: url, name: name, avatar: avatar, members: members, lastActive: lastActive });
                             }
                        }
                    }
                }
                return result;
            });

            for (let g of currentGroups) {
                if (!seenUrls.has(g.url)) {
                    seenUrls.add(g.url);
                    if (["Tham gia", "Join", "Rời nhóm"].includes(g.name)) continue;
                    if (keywordLower && !g.name.toLowerCase().includes(keywordLower)) continue;
                    
                    const extractGroupId = (str) => {
                        const match = str.match(/\/groups\/([a-zA-Z0-9._-]+)/);
                        return match ? match[1] : null;
                    };
                    const gId = extractGroupId(g.url);
                    const matchingUrlKey = Array.from(postedGroups.keys()).find(u => {
                        const uId = extractGroupId(u);
                        return gId && uId && gId === uId;
                    });
                    
                    if (matchingUrlKey) {
                        g.postedTime = postedGroups.get(matchingUrlKey);
                    } else {
                        g.postedTime = null;
                    }
                    
                    try {
                        await page2.goto(g.url + 'about/', { waitUntil: 'domcontentloaded', timeout: 20000 });
                        await page2.waitForTimeout(2000);
                        const memberCount = await page2.evaluate(() => {
                            const nodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                            let n;
                            while(n = nodes.nextNode()) {
                                let t = n.textContent.trim();
                                if(t.includes('thành viên') && (t.match(/\d+/) || t.includes('K '))) return t;
                            }
                            return '';
                        });
                        if (memberCount) g.members = memberCount;
                    } catch(e) {}

                    const fbUserId = process.env.FB_USER_ID;
                    if (fbUserId && !g.postedTime) {
                        try {
                            const userUrl = g.url + 'user/' + fbUserId + '/';
                            await page2.goto(userUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                            await page2.waitForTimeout(2000);
                            const pageText = await page2.evaluate(() => document.body.innerText);
                            const hasNoPosts = pageText.includes('chưa đăng') || pageText.includes('Không có bài viết') || pageText.includes('chưa có bài viết');
                            if (!hasNoPosts && pageText.includes('Bình luận')) {
                                g.postedTime = Date.now() - 1000;
                            }
                        } catch(e) {}
                    }

                    finalGroups.push(g);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: g })}`);
                }
            }

            await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);
            const newHeight = await page.evaluate(() => document.body.scrollHeight);
            if (newHeight === previousHeight) {
                scrollAttempts++;
            } else {
                scrollAttempts = 0;
                previousHeight = newHeight;
            }
        }

        if (finalGroups.length > 0) {
            fs.writeFileSync('groups_data.json', JSON.stringify(finalGroups, null, 2));
            logCallback('\n[FB] Đã lưu danh sách nhóm vào file: groups_data.json');
        } else {
            logCallback('[FB] Không tìm thấy nhóm nào phù hợp.');
            fs.writeFileSync('groups_data.json', JSON.stringify([], null, 2));
        }

    } catch (e) {
        logCallback(`Lỗi khi quét nhóm: ${e.message}`);
    } finally {
        await page.close();
        await page2.close();
    }
}

module.exports = { execGetGroups };
