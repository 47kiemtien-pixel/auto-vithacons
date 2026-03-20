const fs = require('fs');
const path = require('path');

function parseFBTime(timeStr) {
    if (!timeStr) return null;
    const now = new Date();
    const s = timeStr.toLowerCase();
    
    if (s.includes('vừa xong') || s.includes('mới đây')) return now;
    
    const numMatch = s.match(/\d+/);
    if (!numMatch) {
        if (s.includes('hôm qua')) {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            return d;
        }
        if (s.includes('tháng')) return new Date(2000, 0, 1);
        return now;
    }
    
    const num = parseInt(numMatch[0]);
    
    if (s.includes('phút')) return new Date(now.getTime() - num * 60000);
    if (s.includes('giờ')) return new Date(now.getTime() - num * 3600000);
    if (s.includes('ngày')) return new Date(now.getTime() - num * 86400000);
    if (s.includes('hôm qua')) {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d;
    }
    if (s.includes('tháng') || s.includes('năm')) {
        return new Date(2000, 0, 1);
    }
    
    return now;
}

async function execGetGroups(primaryContext, keyword, logCallback = () => {}) {
    logCallback('[FB] Đang khởi tạo bộ quét Tìm kiếm thông minh (Trang cá nhân)...');
    
    const page = await primaryContext.newPage();
    const allGroups = new Map();
    let userIdToCheck = 'me'; 
    const groupQueue = [];
    let isScanningDone = false;

    // --- Đọc lịch sử đăng bài cục bộ ---
    const historyPath = path.join(__dirname, 'posted_history.txt');
    const localHistory = new Map(); 
    if (fs.existsSync(historyPath)) {
        const lines = fs.readFileSync(historyPath, 'utf-8').split('\n');
        for (const line of lines) {
            const [url, ts] = line.split('|');
            if (url && ts) {
                localHistory.set(url.trim(), parseInt(ts));
            }
        }
    }

    // --- Lấy User ID của chính mình ---
    try {
        logCallback('[FB] Đang xác định User ID của bạn...');
        await page.goto('https://www.facebook.com/me', { waitUntil: 'load', timeout: 30000 });
        
        // Chờ Facebook chuyển hướng từ /me sang profile thật
        await page.waitForFunction(() => {
            const url = window.location.href;
            return !url.endsWith('facebook.com/me') && !url.endsWith('facebook.com/me/');
        }, { timeout: 15000 }).catch(() => {});

        const userId = await page.evaluate(() => {
            // Thử lấy từ Cookie (phổ biến và chính xác nhất)
            const cookieMatch = document.cookie.match(/c_user=(\d+)/);
            if (cookieMatch) return cookieMatch[1];
            
            // Thử lấy từ các biến nội bộ của Facebook (Comet)
            try {
                if (window.require) {
                    const config = window.require('CometCurrentUserConfig');
                    if (config && config.userID) return config.userID;
                }
            } catch (e) {}

            // Cuối cùng mới lấy từ URL nếu chứa ID số
            const urlMatch = window.location.href.match(/profile\.php\?id=(\d+)/);
            if (urlMatch) return urlMatch[1];
            
            return null;
        });

        if (userId) {
            userIdToCheck = userId;
            logCallback(`[FB] Đã xác định User ID (Numeric): ${userIdToCheck}`);
        } else {
            // Fallback lấy username từ URL nếu không tìm thấy ID số
            const currentUrl = page.url();
            const usernameMatch = currentUrl.match(/facebook\.com\/([^\/\?]+)/);
            if (usernameMatch && usernameMatch[1] !== 'me') {
                userIdToCheck = usernameMatch[1];
                logCallback(`[FB] Đã xác định User Username: ${userIdToCheck}`);
            } else {
                logCallback('[!] Không thể tự động lấy User ID. Sử dụng dự phòng "me".');
                userIdToCheck = 'me';
            }
        }
    } catch (e) {
        logCallback(`[!] Lỗi khi lấy User ID: ${e.message}.`);
        userIdToCheck = 'me';
    }

    // --- Worker: Kiểm tra chi tiết nhóm ---
    const detailWorker = async () => {
        logCallback('[FB] Background Worker đã bắt đầu hoạt động...');
        const detailPage = await primaryContext.newPage();
        try {
            while (!isScanningDone || groupQueue.length > 0) {
                if (groupQueue.length === 0) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                const group = groupQueue.shift();
                logCallback(`[FB] [Worker] Đang kiểm tra chi tiết: ${group.name}`);
                
                const lastPostTs = localHistory.get(group.url);
                const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
                
                if (lastPostTs && lastPostTs > twoDaysAgo) {
                    group.postedTime = new Date(lastPostTs).toLocaleString('vi-VN');
                    group.lastPostStatus = 'Đã đăng (trong 2 ngày)';
                    group.isSelectable = false;
                    logCallback(`[FB] [Worker] Bỏ qua ${group.name} (Đã đăng trong 48h qua)`);
                    continue;
                }

                try {
                    const checkUrl = `${group.url.replace(/\/$/, '')}/user/${userIdToCheck}/`;
                    logCallback(`[FB] [Worker] Đang check bài tại: ${checkUrl}`);
                    await detailPage.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await detailPage.waitForTimeout(2000);
                    
                    const detail = await detailPage.evaluate(() => {
                        const postEls = Array.from(document.querySelectorAll('div[role="feed"] [role="article"], div[role="main"] [role="article"]'));
                        let newestTs = null;
                        if (postEls.length > 0) {
                            const timeEl = postEls[0].querySelector('a[href*="/posts/"] span, a[href*="/groups/"] span');
                            if (timeEl) newestTs = timeEl.innerText;
                        }
                        
                        const memberEl = Array.from(document.querySelectorAll('span, div')).find(el => 
                            el.innerText && el.innerText.match(/(\d+[.,]?\d*[KM]?)\s*(thành viên|members)/i)
                        );
                        
                        return {
                            timeStr: newestTs,
                            memberStr: memberEl ? memberEl.innerText.match(/(\d+[.,]?\d*[KM]?)\s*(thành viên|members)/i)[0] : 'N/A'
                        };
                    });

                    group.members = detail.memberStr;
                    const parsedTime = parseFBTime(detail.timeStr);
                    if (parsedTime) {
                        group.postedTime = parsedTime.toLocaleString('vi-VN');
                        if (parsedTime.getTime() > twoDaysAgo) {
                            group.lastPostStatus = 'Đã có bài mới (trong 2 ngày)';
                            group.isSelectable = false;
                        } else {
                            group.lastPostStatus = 'Sẵn sàng (> 2 ngày)';
                            group.isSelectable = true;
                        }
                    } else {
                        group.lastPostStatus = 'Sẵn sàng (Chưa rõ ngày)';
                        group.isSelectable = true;
                    }
                    
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_updated', group })}`);
                } catch (e) {
                    if (e.message.includes('Target page, context or browser has been closed')) {
                        logCallback(`[!] [Worker] Trình duyệt hoặc Trang đã bị đóng đột ngột. Dừng worker.`);
                        return; // Dừng hẳn worker
                    }
                    logCallback(`[!] Lỗi check chi tiết ${group.name}: ${e.message}`);
                    group.lastPostStatus = 'Lỗi check bài';
                    group.isSelectable = true;
                }

                const delay = Math.floor(Math.random() * 5000) + 5000;
                await new Promise(r => setTimeout(r, delay));
            }
        } finally {
            try { await detailPage.close(); } catch(e) {}
            logCallback('[FB] Worker đã hoàn tất công việc.');
        }
    };

    const workerPromise = detailWorker();

    try {
        const searchUrl = `https://www.facebook.com/${userIdToCheck}/groups`;
        logCallback(`[FB] Truy cập trang quản lý nhóm: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 90000 });
        
        const isLoginPage = await page.evaluate(() => document.body.innerText.includes('Đăng nhập') || document.querySelector('input[name="email"]'));
        if (isLoginPage) {
            logCallback('[!] Bạn chưa đăng nhập. Vui lòng đăng nhập...');
            await page.waitForFunction(() => !document.querySelector('input[name="email"]'), { timeout: 300000 });
            await page.goto(searchUrl, { waitUntil: 'load' });
        }

        await page.waitForTimeout(5000);
        logCallback(`[FB] GIAI ĐOẠN 1: Bắt đầu thu thập nhóm từ Trang cá nhân...`);

        let lastGroupCount = 0;
        let stagnantCount = 0;
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

                    const idMatch = href.match(/\/groups\/(\d+)\/?/) || href.match(/\/groups\/([^\/\?]+)/);
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
                    
                    if (name.toLowerCase() === 'xem nhóm' || name.toLowerCase() === 'view group') continue;
                    if (kw && !name.toLowerCase().includes(kw.toLowerCase())) continue;
                    
                    if (name.length > 2 && name.length < 150) {
                        results.push({ 
                            id, 
                            name, 
                            url: `https://www.facebook.com/groups/${id}/`,
                            members: 'N/A'
                        });
                        seenIds.add(id);
                    }
                }
                return results;
            }, keyword);

            for (const g of discovered) {
                if (!allGroups.has(g.url)) {
                    const groupData = { ...g, postedTime: null, lastPostStatus: 'Hàng đợi...', isSelectable: false };
                    allGroups.set(g.url, groupData);
                    groupQueue.push(groupData);
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: groupData })}`);
                }
            }

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1000);
            await page.keyboard.press('PageDown');
            await page.waitForTimeout(2000);

            const currentCount = allGroups.size;
            if (currentCount === lastGroupCount) stagnantCount++;
            else { stagnantCount = 0; lastGroupCount = currentCount; }
            if (i % 5 === 0) logCallback(`[FB] Đang quét... Tìm thấy ${allGroups.size} nhóm.`);
            if (stagnantCount >= 12 && i > 5) break;
        }

        isScanningDone = true;
        await workerPromise;
        logCallback(`\n[FB] HOÀN TẤT TOÀN BỘ QUY TRÌNH!`);
    } catch (e) {
        logCallback(`Lỗi: ${e.message}`);
    } finally {
        isScanningDone = true;
        if (workerPromise) {
            await workerPromise.catch(() => {});
        }
        try { await page.close(); } catch(e) {}
    }
}

module.exports = { execGetGroups };
