const { chromium } = require('playwright');
const path = require('path');

async function testDOM() {
    console.log("Khởi tạo trình duyệt để test DOM chậm rãi...");
    const userDataDir = path.join(__dirname, 'fb_user_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 720 },
        args: ['--disable-notifications']
    });
    
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    try {
        console.log("1. Đang truy cập group...");
        await page.goto('https://www.facebook.com/groups/2144691542516931', { waitUntil: 'domcontentloaded' });
        console.log("   - Chờ 10 giây để web load hoàn tất...");
        await page.waitForTimeout(10000); 
        
        console.log("2. Đang tìm nút mở hộp thoại đăng bài...");
        const postBoxSelectors = [
            'text="Bạn viết gì đi..."',
            'div[role="button"]:has(span:has-text("Bạn viết gì đi..."))',
            'div[role="button"] span:has-text("Bạn đang nghĩ gì?")',
            'div[role="button"] span:has-text("Viết nội dung nào đó...")'
        ];

        let clicked = false;
        for (const selector of postBoxSelectors) {
            try {
                const elements = await page.$$(selector);
                for (let el of elements) {
                    if (await el.isVisible()) {
                        console.log(`   - Đã click vào: ${selector}`);
                        await el.click();
                        clicked = true;
                        break;
                    }
                }
                if(clicked) break;
            } catch (e) {}
        }

        if (!clicked) {
            console.log("   - Không thể click mở form đăng bài, dừng test.");
            return;
        }

        console.log("3. Chờ hộp thoại hiện lên (5 giây)...");
        await page.waitForTimeout(5000);

        console.log("4. Kiểm tra nút Ảnh/Video và tải ảnh thử...");
        const photoVideoBtn = await page.$('div[aria-label="Ảnh/video"], div[aria-label="Ảnh/Video"], div[aria-label="Photo/video"], div[aria-label="Photo/Video"]');
        if (photoVideoBtn) {
            await photoVideoBtn.click();
            console.log("   - Đã click nút Ảnh/Video. Chờ menu/file input mở (3 giây)...");
            await page.waitForTimeout(3000);
            
            // Tìm input multiple trước
            let fileInput = await page.$('input[type="file"][multiple]');
            if (!fileInput) {
                console.log("   - Không tìm thấy input multiple, tìm input single...");
                fileInput = await page.$('input[type="file"]');
            }

            if (fileInput) {
                console.log("   - Đã tìm thấy DOM input type=file. Tiến hành đẩy ảnh vào...");
                const imgPath = path.join(__dirname, 'media', 'image1.jpg');
                await fileInput.setInputFiles([imgPath]);
                console.log("   - Đã đẩy 1 ảnh. Chờ upload xử lý (10 giây)...");
                await page.waitForTimeout(10000);
            } else {
                console.log("   - Lỗi: Không tìm thấy input type=file nào trên DOM.");
            }
        } else {
            console.log("   - Lỗi: Không tìm thấy nút mở mục Ảnh/Video.");
        }

        console.log("5. Đang thử nhập chữ vào ô văn bản...");
        const inputSelector = 'div[role="textbox"][contenteditable="true"]';
        const textboxes = await page.$$(inputSelector);
        let typed = false;
        for(let tb of textboxes) {
            if(await tb.isVisible()) {
                await tb.click();
                await page.waitForTimeout(1000); // Đợi forcus
                await page.keyboard.insertText("Đây là nội dung test bot đăng kèm ảnh...");
                console.log("   - Đã nhập chữ thành công.");
                typed = true;
                break;
            }
        }
        if(!typed) {
            console.log("   - Lỗi: Không thể forcus hoặc gõ vào ô nhập văn bản.");
        }
        
        console.log("   - Chờ DOM nhận diện text (3 giây)...");
        await page.waitForTimeout(3000);
        
        console.log("6. Tìm nút Đăng và xem nút có bị disable không...");
        const submitButtonSelectors = [
            'div[aria-label="Đăng"]',
            'div[aria-label="Post"]',
            'div[aria-label="Đăng bài"]'
        ];

        let submitButton = null;
        for (const selector of submitButtonSelectors) {
            try {
                const elements = await page.$$(selector);
                for (let el of elements) {
                    if (await el.isVisible()) {
                        const isDisabled = await el.getAttribute('aria-disabled');
                        console.log(`   - Tìm thấy nút Đăng (selector: ${selector}). Trạng thái aria-disabled = ${isDisabled}`);
                        if (isDisabled !== 'true') {
                            submitButton = el;
                        }
                        break;
                    }
                }
                if(submitButton) break;
            } catch(e) {}
        }

        if (submitButton) {
            console.log("==> DOM TEST THÀNH CÔNG: Mọi dữ liệu đã điền xong, nút Đăng đang bật! (Chỉ giả định thành công, không bấm đăng thật)");
        } else {
            console.log("==> DOM TEST THẤT BẠI: Nút Đăng không tìm thấy hoặc đang bị khóa.");
        }

    } catch(e) {
        console.error("Lỗi khi test DOM:", e);
    } finally {
        await context.close();
    }
}
testDOM();
