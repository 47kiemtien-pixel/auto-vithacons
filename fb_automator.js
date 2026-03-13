const { chromium } = require('playwright');
const path = require('path');
const { sleep } = require('./scheduler');

class FBAutomator {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.userDataDir = path.join(__dirname, 'fb_user_data');
    }

    async init(externalContext) {
        if (externalContext) {
            this.context = externalContext;
            console.log('[FB] Sử dụng context trình duyệt từ máy chủ...');
        } else {
            console.log('[FB] Khởi tạo trình duyệt độc lập...');
            this.context = await chromium.launchPersistentContext(this.userDataDir, {
                headless: false,
                viewport: { width: 1280, height: 720 },
                args: ['--disable-notifications']
            });
        }
        this.page = await this.context.newPage();
    }

    async login() {
        console.log('[FB] Kiểm tra đăng nhập...');
        await this.page.goto('https://www.facebook.com');
        
        // Kiểm tra xem đã đăng nhập chưa
        const isLoggedIn = await this.page.$('[aria-label="Your profile"]') || await this.page.$('[aria-label="Trang cá nhân của bạn"]');
        
        if (!isLoggedIn) {
            console.log('[FB] Chưa đăng nhập. Vui lòng đăng nhập thủ công trên cửa sổ trình duyệt...');
            // Đợi người dùng đăng nhập thủ công (tối đa 5 phút)
            await this.page.waitForSelector('[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"]', { timeout: 300000 });
            console.log('[FB] Đăng nhập thành công!');
        } else {
            console.log('[FB] Đã đăng nhập từ phiên trước.');
        }
    }

    async postToGroup(groupUrl, content, imagePaths = []) {
        try {
            console.log(`[FB] Đang truy cập nhóm: ${groupUrl}`);
            await this.page.goto(groupUrl);
            await sleep(3000);

            const postBoxSelectors = [
                'text="Bạn viết gì đi..."',
                'div[role="button"]:has(span:has-text("Bạn viết gì đi..."))',
                'div[role="button"] span:has-text("Bạn đang nghĩ gì?")',
                'div[role="button"] span:has-text("Viết nội dung nào đó...")',
                'div[role="button"]:has-text("Bạn đang nghĩ gì?")',
                'div[role="button"]:has-text("Write something...")',
                '[aria-label="Bạn đang nghĩ gì?"]',
                '[aria-label="What\'s on your mind?"]'
            ];

            let clicked = false;
            for (const selector of postBoxSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (let el of elements) {
                        if (await el.isVisible()) {
                            await el.click();
                            clicked = true;
                            break;
                        }
                    }
                    if(clicked) break;
                } catch (e) {}
            }

            if (!clicked) {
                // Selector dự phòng cuối cùng
                const mainPostButton = await this.page.$('[role="main"] [role="button"]:has-text("Bạn"), [role="main"] [role="button"]:has-text("Write")');
                if (mainPostButton) {
                    await mainPostButton.click();
                    clicked = true;
                }
            }

            if (!clicked) {
                console.error('[FB] Không tìm thấy ô để bắt đầu soạn bài.');
                return false;
            }

            await sleep(3000); // Đợi hộp thoại hiện lên

            // Tải ảnh lên nếu có
            if (imagePaths.length > 0) {
                console.log(`[FB] Đang tải lên ${imagePaths.length} ảnh...`);
                // Tìm đúng nút ảnh trong hộp thoại soạn thảo. Lưu ý case-sensitive của "video"
                const photoVideoBtn = await this.page.$('div[aria-label="Ảnh/video"], div[aria-label="Ảnh/Video"], div[aria-label="Photo/video"], div[aria-label="Photo/Video"]');
                if (photoVideoBtn) {
                    await photoVideoBtn.click();
                    await sleep(2000);
                    
                    const fileInput = await this.page.$('input[type="file"][multiple]');
                    if (fileInput) {
                        await fileInput.setInputFiles(imagePaths);
                        await sleep(5000); // Đợi ảnh load kỹ hơn
                    } else {
                        // Dự phòng nếu không tìm thấy multiple
                        const singleInput = await this.page.$('input[type="file"]');
                        if (singleInput && imagePaths.length > 0) {
                             console.log('[FB] Cảnh báo: Chỉ tìm thấy input đơn, tải lên ảnh đầu tiên.');
                             await singleInput.setInputFiles([imagePaths[0]]);
                             await sleep(3000);
                        }
                    }
                }
            }

            console.log('[FB] Đang nhập nội dung bài đăng...');
            // Tìm đến ô nhâp text nằm TRONG hộp thoại đăng bài (dialog) để tránh nhầm với ô bình luận
            const inputSelector = 'div[role="dialog"] div[role="textbox"][contenteditable="true"]';
            await this.page.waitForSelector(inputSelector);
            await sleep(1000);
            const textboxes = await this.page.$$(inputSelector);
            let typed = false;
            for(let tb of textboxes) {
                if(await tb.isVisible()) {
                    console.log("[FB] Tìm thấy ô nhập chữ trong dialog, tiến hành gõ nội dung...");
                    await tb.click();
                    await sleep(500);
                    // Dùng bàn phím để gõ từng chữ một sẽ an toàn hơn trên các framework React phức tạp như Facebook
                    await this.page.keyboard.insertText(content);
                    typed = true;
                    break;
                }
            }
            
            if(!typed) {
                console.log("[FB] Vẫn không nhập được văn bản bằng click. Thử fallback...");
                // Tìm aria-label cụ thể
                const fallbackInput = await this.page.$('div[aria-label="Bạn viết gì đi..."][contenteditable="true"]');
                if (fallbackInput) {
                    await fallbackInput.fill(content);
                    typed = true;
                }
            }
            
            await sleep(3000);
            console.log('[FB] Đang nhấn nút Đăng...');
            
            const submitButtonSelectors = [
                'div[aria-label="Đăng"]',
                'div[aria-label="Post"]',
                'div[aria-label="Đăng bài"]',
                'div[role="button"]:has-text("Đăng")',
                'div[role="button"]:has-text("Post")'
            ];

            let submitButton = null;
            for (const selector of submitButtonSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (let el of elements) {
                        if (await el.isVisible()) {
                            // Kiểm tra xem nút có bị disabled không do đang tải ảnh
                            let isDisabled = await el.getAttribute('aria-disabled');
                            let waitCount = 0;
                            while (isDisabled === 'true' && waitCount < 30) {
                                console.log(`[FB] Nút Đăng đang bị vô hiệu hóa (đang tải ảnh...), đợi thêm... (${waitCount * 2}s)`);
                                await sleep(2000);
                                isDisabled = await el.getAttribute('aria-disabled');
                                waitCount++;
                            }

                            if (isDisabled !== 'true') {
                                submitButton = el;
                                break;
                            } else {
                                console.log('[FB] Quá thời gian chờ tải ảnh (60s), nút Đăng vẫn bị khóa.');
                            }
                        }
                    }
                    if(submitButton) break;
                } catch(e) {}
            }

            if (submitButton) {
                await submitButton.click();
                console.log('[FB] Đã nhấn nút Đăng! Đang chờ tiến trình tải lên hoàn tất...');
                
                // Đợi hộp thoại chính ẩn đi HOẶC xuất hiện hộp thoại Alert của Facebook
                let postStatus = 'success';
                try {
                    // Chờ Dialog chính đóng lại
                    await this.page.waitForSelector('div[role="dialog"]', { state: 'hidden', timeout: 30000 });
                    console.log('[FB] Hộp thoại đăng bài đã đóng (Tải lên hoàn tất).');
                } catch(e) {
                     // Nếu dialog chưa đóng, kiểm tra xem có popup "Hệ thống đã tự động từ chối" không
                     const pageText = await this.page.innerText('body');
                     if (pageText.includes('tự động từ chối bài viết') || pageText.includes('không đáp ứng tiêu chí') || pageText.includes('Liên kết trong bài viết')) {
                         console.log('[FB] PHÁT HIỆN: Bài viết bị nhóm TỪ CHỐI TỰ ĐỘNG (Auto-mod declined).');
                         if (pageText.includes('liên kết') || pageText.includes('link') || pageText.includes('Link')) {
                             postStatus = 'rejected_link';
                             console.log('[FB] Lý do: Nhóm này CẤM CHÈN LINK.');
                         } else {
                             postStatus = 'rejected_other';
                         }
                         
                         // Cố gắng đóng popup X để không kẹt
                         try {
                             const closeX = await this.page.$('div[aria-label="Đóng"], div[aria-label="Close"]');
                             if (closeX) await closeX.click();
                         } catch(e2) {}
                     } else {
                         console.log('[FB] Hộp thoại chưa đóng sau 30s nhưng không thấy popup từ chối rõ ràng.');
                     }
                }
                
                if (postStatus === 'rejected_link') return { success: false, reason: 'rejected_link' };
                if (postStatus === 'rejected_other') return { success: false, reason: 'rejected_other' };

                // Đợi một chút để Facebook xử lý và hiển thị thông báo (nếu có)
                await sleep(5000);
                
                // Bắt nhanh popup "Đang chờ phê duyệt" ngay sau khi đăng
                let isPending = false;
                try {
                    const pageText = await this.page.innerText('body');
                    if (pageText.includes('đang chờ phê duyệt') || pageText.includes('Đang chờ quản trị viên')) {
                        isPending = true;
                        console.log('[FB] Đã thấy thông báo bài đăng đang chờ duyệt ngay tại popup.');
                    }
                } catch(e) {}
                
                await sleep(5000);
                
                return { success: true, pending: isPending };
            } else {
                console.error('[FB] Không tìm thấy nút Đăng hoặc nút bị vô hiệu hóa vĩnh viễn.');
                return { success: false, pending: false };
            }

        } catch (error) {
            console.error(`[FB] Lỗi khi đăng bài lên ${groupUrl}:`, error);
            return { success: false, pending: false };
        }
    }

    // Hàm verify bằng cách truy cập thẳng link nhóm / user
    async verifyPost(groupUrl, userId, content) {
        try {
            if (!userId) {
                console.log('[FB] Bỏ qua bước kiểm tra bài đăng vì chưa cấu hình FB_USER_ID.');
                return;
            }
            // Tạo link chuẩn: https://www.facebook.com/groups/id_nhom/user/id_user/
            const checkUrl = `${groupUrl.replace(/\/$/, '')}/user/${userId}/`;
            console.log(`[FB] Đang kiểm tra trạng thái bài đăng tại: ${checkUrl}`);
            await this.page.goto(checkUrl);
            await sleep(8000); // Đợi trang load các bài post
            
            const pageText = await this.page.innerText('body') || '';
            const shortContent = content.substring(0, 40).trim(); // Lấy 40 ký tự đầu làm từ khóa tìm kiếm
            
            if (pageText.includes('đang chờ phê duyệt') || pageText.includes('Đang chờ quản trị viên') || pageText.includes('Bài viết đang chờ xử lý')) {
                 console.log('==> [KẾT QUẢ]: Bài đăng thành công nhưng ĐANG CHỜ QUẢN TRỊ VIÊN PHÊ DUYỆT.');
                 return 'pending';
            }
            
            if (pageText.includes(shortContent)) {
                 console.log('==> [KẾT QUẢ]: Bài đăng ĐÃ ĐƯỢC XUẤT BẢN THÀNH CÔNG trên nhóm!');
                 return 'published';
            }
            
            console.log('==> [KẾT QUẢ]: Không tìm thấy bài đăng tại link cá nhân. Có thể bài đã bị gỡ hoặc chưa hiển thị.');
            return 'not_found';
            
        } catch (error) {
            console.error('[FB] Lỗi khi kiểm tra bài đăng:', error);
            return 'error';
        }
    }

    async checkRemovedContent(groupUrl) {
        try {
            const removedUrl = `${groupUrl.replace(/\/$/, '')}/my_removed_content/`;
            console.log(`[FB] Đang kiểm tra nội dung bị gỡ tại: ${removedUrl}`);
            await this.page.goto(removedUrl, { waitUntil: 'networkidle' }).catch(() => {});
            await sleep(5000);
            
            // Cuộn xuống để load nội dung
            await this.page.mouse.wheel(0, 500);
            await sleep(2000);
            
            // Chụp ảnh để debug
            await this.page.screenshot({ path: path.join(__dirname, 'debug_removed_content.png') });

            const pageText = await this.page.innerText('body') || '';
            
            // TRƯỜNG HỢP 1: Trang trống (Không có bài viết bị gỡ)
            if (pageText.includes('Không có bài viết nào để hiển thị') || 
                pageText.includes('No posts to show') ||
                pageText.includes('No content found')) {
                console.log('[FB] Xác nhận: Trang nội dung bị gỡ trống trơn. Không có vấn đề gì.');
                return 'clean';
            }

            // TRƯỜNG HỢP 2: Tìm kiếm từ khóa cảnh báo trong văn bản hiển thị (innerText)
            // Lưu ý: Không dùng page.content() vì nó quá rộng, dễ bị nhiễu bởi menu/script
            const warningKeywords = [
                'Nhiều người báo cáo', 'vi phạm tiêu chuẩn cộng đồng',
                'Tự động gỡ', 'Auto-removed', 'đã bị gỡ', 'Nội dung bị gỡ',
                'Removed content', 'Gỡ bởi', 'declined', 'denied', 'từ chối',
                'Từ khóa', 'tiêu chí', 'đáp ứng'
            ];

            let isRemoved = false;
            let matchedKw = '';
            for (const kw of warningKeywords) {
                if (pageText.toLowerCase().includes(kw.toLowerCase())) {
                    matchedKw = kw;
                    isRemoved = true;
                    break;
                }
            }

            // Riêng từ khóa "Link" hoặc "Liên kết" phải đi kèm với dấu hiệu bị gỡ để tránh nhận nhầm menu
            if (!isRemoved) {
                const linkKeywords = ['liên kết', 'link'];
                const removalIndicators = ['gỡ', 'vi phạm', 'removed', 'declined', 'not approved'];
                
                for (const lkw of linkKeywords) {
                    if (pageText.toLowerCase().includes(lkw)) {
                        // Kiểm tra xem có từ "gỡ" hoặc "vi phạm" ở gần đó không (trong cùng trang văn bản)
                        for (const ind of removalIndicators) {
                            if (pageText.toLowerCase().includes(ind)) {
                                console.log(`[FB] Phát hiện cặp từ khóa nghi ngờ: "${lkw}" + "${ind}"`);
                                matchedKw = `${lkw} + ${ind}`;
                                isRemoved = true;
                                break;
                            }
                        }
                    }
                    if (isRemoved) break;
                }
            }

            if (isRemoved) {
                console.log(`==> [CẢNH BÁO]: Phát hiện bài viết bị gỡ. Lý do nghi ngờ: ${matchedKw}`);
                if (pageText.toLowerCase().includes('liên kết') || pageText.toLowerCase().includes('link')) {
                    return 'removed_by_link';
                }
                return 'removed_other';
            }
            
            console.log('[FB] Không thấy dấu hiệu bài viết bị gỡ dựa trên văn bản hiển thị.');
            return 'clean';
        } catch (error) {
            console.error('[FB] Lỗi khi kiểm tra removed content:', error);
            return 'error';
        }
    }

    async close() {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
    }
}

module.exports = FBAutomator;
