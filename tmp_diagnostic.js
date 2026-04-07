const FBAutomator = require('./fb_automator');
const browserManager = require('./browser_manager');

async function diagnostic() {
    console.log('[Diagnostic] Khởi tạo trình duyệt...');
    try {
        const context = await browserManager.getContext();
        const automator = new FBAutomator((msg) => console.log(`[FB Log] ${msg}`));
        await automator.init(context);
        
        const testGroup = 'https://www.facebook.com/groups/718620716401258/'; // Nhóm thợ xây Eakar
        console.log(`[Diagnostic] Đang thử truy cập nhóm: ${testGroup}`);
        
        await automator.page.goto(testGroup);
        await new Promise(r => setTimeout(r, 5000));
        
        const screenshotPath = 'diagnostic_screenshot.png';
        await automator.page.screenshot({ path: screenshotPath });
        console.log(`[Diagnostic] Đã chụp ảnh màn hình: ${screenshotPath}`);
        
        const composerFound = await automator.page.evaluate(() => {
            const selectors = [
                'div[role="button"]:has-text("Bạn viết gì đi")',
                'div[role="button"]:has-text("Bạn đang nghĩ gì")',
                'div[role="button"]:has-text("Write something")',
                '[aria-label*="Bạn đang nghĩ gì"]'
            ];
            return selectors.some(s => !!document.querySelector(s));
        });
        
        console.log(`[Diagnostic] Trạng thái tìm thấy nút soạn bài: ${composerFound ? 'OK' : 'KHÔNG THẤY'}`);
        
        // Không đóng browser để user có thể xem (nếu họ đang nhìn màn hình)
    } catch (e) {
        console.error(`[Diagnostic] Lỗi: ${e.message}`);
    }
}

diagnostic();
