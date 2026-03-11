const { chromium } = require('playwright');
const path = require('path');

class BrowserManager {
    constructor() {
        this.context = null;
        this.userDataDir = path.join(__dirname, 'fb_user_data');
    }

    async getContext() {
        if (this.context) {
            // Kiểm tra xem context còn sống không
            if (!this.context.browser() || !this.context.browser().isConnected()) {
                console.log('[BrowserManager] Trình duyệt đã bị đóng bên ngoài, đang khởi tạo lại...');
                this.context = null;
            }
        }

        if (!this.context) {
            console.log('[BrowserManager] Khởi tạo Browser Context duy nhất...');
            this.context = await chromium.launchPersistentContext(this.userDataDir, {
                headless: false,
                viewport: { width: 1280, height: 720 },
                args: ['--disable-notifications']
            });

            // Lắng nghe sự kiện đóng để reset
            this.context.on('close', () => {
                console.log('[BrowserManager] Context đã bị đóng.');
                this.context = null;
            });
        }
        return this.context;
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
    }
}

module.exports = new BrowserManager();
