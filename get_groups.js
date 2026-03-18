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
    logCallback('[FB] Đang khởi tạo bộ quét Tìm kiếm thông minh (Song song)...');
    
    const page = await primaryContext.newPage();
    const detailPage = await primaryContext.newPage(); // Sử dụng page riêng để tránh xung đột
    const allGroups = new Map();
    let userIdToCheck = ''; // Sẽ lấy tự động
    const groupQueue = [];
    let isScanningDone = false;

    // --- Đọc lịch sử đăng bài cục bộ ---
    const historyPath = path.join(__dirname, 'posted_history.txt');
    const localHistory = new Map(); // url -> timestamp
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
        const currentUrl = page.url();
        // Trích xuất ID từ URL (có thể là username hoặc ID số)
        const idMatch = currentUrl.match(/profile\.php\?id=(\d+)/) || currentUrl.match(/facebook\.com\/([^\/\?]+)/);
        if (idMatch) {
            userIdToCheck = idMatch[1];
            logCallback(`[FB] Đã xác định User ID: ${userIdToCheck}`);
        } else {
            logCallback('[!] Không thể tự động lấy User ID. Sử dụng ID mặc định.');
            userIdToCheck = '100063596562296';
        }
    } catch (e) {
        logCallback(`[!] Lỗi khi lấy User ID: ${e.message}. Sử dụng ID mặc định.`);
        userIdToCheck = '100063596562296';
    }

    // --- Worker: Kiểm tra chi tiết nhóm song song ---
    const detailWorker = async () => {
        logCallback('[FB] Background Worker đã bắt đầu hoạt động...');
        while (!isScanningDone || groupQueue.length > 0) {
            if (groupQueue.length === 0) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            const group = groupQueue.shift();
            logCallback(`[FB] [Worker] Đang kiểm tra chi tiết: ${group.name}`);
            
            // KIỂM TRA LỊCH SỬ CỤC BỘ TRƯỚC
            const lastPostTs = localHistory.get(group.url);
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            
            if (lastPostTs && lastPostTs > oneDayAgo) {
                logCallback(`[FB] [Worker] Nhóm ${group.name} đã có trong lịch sử đăng (vừa mới đăng).`);
                group.isSelectable = false;
                group.lastPostStatus = "Đã đăng (Lịch sử)";
                group.postedTime = lastPostTs;
                logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: group })}`);
                continue;
            }

            const checkUrl = `https://www.facebook.com/groups/${group.id}/user/${userIdToCheck}/`;
            try {
                // Sử dụng domcontentloaded để nhanh hơn và timeout dài hơn
                await detailPage.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await detailPage.waitForTimeout(2000);
                
                // Kiểm tra nếu bị redirect sang trang login
                const isLogin = await detailPage.evaluate(() => {
                    return document.body.innerText.includes('Đăng nhập') || !!document.querySelector('input[name="email"]');
                });
                
                if (isLogin) {
                    throw new Error('Trình duyệt bị đẩy ra trang Login. Vui lòng đăng nhập lại.');
                }
                
                const details = await detailPage.evaluate(() => {
                    const text = document.body.innerText;
                    const mMatch = text.match(/(\d+[.,]?\d*[KM]?)\s*(thành viên|members)/i);
                    const timeLinks = Array.from(document.querySelectorAll('a[role="link"]'))
                        .filter(a => a.href.includes('/posts/') && a.innerText.length > 0)
                        .map(a => a.innerText.trim());
                    const latestTime = timeLinks.length > 0 ? timeLinks[0] : null;

                    const noPostPatterns = ['Không có bài viết mới', 'No posts available', 'chưa đăng gì trong nhóm', 'Không tìm thấy kết quả', 'No results found'];
                    const hasNoPost = noPostPatterns.some(p => text.includes(p));
                    
                    return {
                        members: mMatch ? mMatch[0] : 'N/A',
                        status: hasNoPost ? 'Chưa đăng' : 'Đã đăng',
                        postedTimeStr: latestTime
                    };
                });

                group.members = details.members;
                if (!details.postedTimeStr || details.status === 'Chưa đăng') {
                    group.postedTime = null;
                    group.isSelectable = true;
                    group.lastPostStatus = "Sẵn sàng (Chưa đăng)";
                } else {
                    const postDate = parseFBTime(details.postedTimeStr);
                    group.postedTime = (postDate && typeof postDate.getTime === 'function') ? postDate.getTime() : null;
                    let isSelectable = false;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Đặt về đầu ngày hiện tại (00:00:00)

                    if (!postDate) {
                        isSelectable = true; // Không lấy được thời gian coi như chưa đăng
                    } else {
                        const postD = new Date(postDate);
                        postD.setHours(0, 0, 0, 0);
                        // Chỉ thỏa mãn khi ngày đăng (postD) bé hơn NGÀY HIỆN TẠI (today)
                        isSelectable = postD.getTime() < today.getTime();
                    }

                    group.isSelectable = isSelectable;
                    group.lastPostStatus = isSelectable ? `Sẵn sàng (${details.postedTimeStr})` : `Chờ (${details.postedTimeStr})`;
                }

                logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: group })}`);
                fs.writeFileSync('groups_data.json', JSON.stringify(Array.from(allGroups.values()), null, 2));
            } catch (err) {
                console.error(`[Scanning Error] Lỗi check nhóm ${group.name}:`, err);
                logCallback(`[!] Lỗi check nhóm ${group.name}: ${err.message}`);
                // Nếu lỗi, tạm thời đánh dấu là chờ
                group.lastPostStatus = "Lỗi check (Thử lại sau)";
                logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: group })}`);
            }

            // Nghỉ an toàn ngẫu nhiên 5-10 giây giữa các lần check nhóm
            const delay = Math.floor(Math.random() * 5000) + 5000;
            logCallback(`[FB] Nghỉ an toàn ${Math.floor(delay/1000)}s tiếp theo...`);
            await new Promise(r => setTimeout(r, delay));
        }
        logCallback('[FB] Worker đã hoàn tất công việc.');
    };

    // Chạy worker ngầm
    const workerPromise = detailWorker();

    try {
        const searchUrl = `https://www.facebook.com/groups/joins/?nav_source=tab`;
        logCallback(`[FB] Truy cập trang quản lý nhóm: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 90000 });
        
        const isLoginPage = await page.evaluate(() => document.body.innerText.includes('Đăng nhập') || document.querySelector('input[name="email"]'));
        if (isLoginPage) {
            logCallback('[!] Bạn chưa đăng nhập. Vui lòng đăng nhập trên Cốc Cốc.');
            await page.waitForFunction(() => !document.querySelector('input[name="email"]'), { timeout: 300000 });
            await page.goto(searchUrl, { waitUntil: 'load' });
        }

        await page.waitForTimeout(5000);
        logCallback(`[FB] GIAI ĐOẠN 1: Bắt đầu lướt và thu thập nhóm...`);

        let lastHeight = 0;
        let stagnantCount = 0;
        const maxScrollAttempts = 400;

        for (let i = 0; i < maxScrollAttempts; i++) {
            const discovered = await page.evaluate((kw) => {
                const results = [];
                const items = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
                for (const a of items) {
                    const href = a.href;
                    if (href.includes('/user/') || href.includes('/posts/') || 
                        href.includes('/groups/feed/') || href.includes('/groups/discover/') ||
                        href.includes('/groups/categories/') ||
                        href.endsWith('/groups/') || href.includes('/groups/joins/')) continue;

                    const idMatch = href.match(/\/groups\/(\d+)\/?/) || href.match(/\/groups\/([^\/\?]+)/);
                    if (idMatch) {
                        const id = idMatch[1];
                        const nameEl = a.querySelector('span[dir="auto"]') || 
                                     a.closest('div[role="listitem"]')?.querySelector('span[dir="auto"]') || a;
                        const name = nameEl.innerText.trim();
                        if (name.toLowerCase() === 'xem nhóm' || name.toLowerCase() === 'view group' || 
                            name.toLowerCase() === 'tham gia nhóm' || name.toLowerCase() === 'join group') continue;
                        
                        // LỌC CHÍNH XÁC: Tên phải chứa cụm từ người dùng nhập
                        if (kw && !name.toLowerCase().includes(kw.toLowerCase())) continue;
                        if (name.length > 2 && name.length < 150) {
                            results.push({ id, name, url: `https://www.facebook.com/groups/${id}/` });
                        }
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
                        members: 'Đang check...',
                        postedTime: null,
                        lastPostStatus: 'Đang xếp hàng...',
                        isSelectable: false
                    };
                    allGroups.set(g.url, groupData);
                    groupQueue.push(groupData); // Đưa vào hàng đợi
                    logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: groupData })}`);
                }
            }

            // Scroll xuống
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(2000);

            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === lastHeight) stagnantCount++;
            else { stagnantCount = 0; lastHeight = currentHeight; }

            if (i % 5 === 0) logCallback(`[FB] Đang quét... Tìm thấy ${allGroups.size} nhóm. Queue: ${groupQueue.length}`);
            if (stagnantCount >= 10 && i > 5) break;
        }

        isScanningDone = true;
        logCallback(`[FB] GIAI ĐOẠN 1 XONG. Đang chờ xử lý nốt ${groupQueue.length} nhóm trong hàng đợi...`);
        
        // Đợi worker hoàn tất
        await workerPromise;
        
        logCallback(`\n[FB] HOÀN TẤT TOÀN BỘ QUY TRÌNH!`);
    } catch (e) {
        logCallback(`Lỗi: ${e.message}`);
    } finally {
        // Đảm bảo đóng các page
        // try { await page.close(); } catch(e) {}
        // try { await detailPage.close(); } catch(e) {}
    }
}

module.exports = { execGetGroups };
