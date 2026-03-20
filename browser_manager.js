const { chromium } = require('playwright');
const path = require('path');

class BrowserManager {
    constructor() {
        this.context = null;
        this.userDataDir = path.join(__dirname, 'fb_user_data');
        this.initializing = null; // Mutex để tránh khởi tạo song song
    }

    async getContext() {
        if (this.initializing) {
            console.log('[BrowserManager] Đang đợi trình duyệt khởi động...');
            return await this.initializing;
        }

        if (this.context) {
            // Kiểm tra xem context còn sống không
            if (!this.context.browser() || !this.context.browser().isConnected()) {
                console.log('[BrowserManager] Trình duyệt đã bị đóng bên ngoài, đang khởi tạo lại...');
                this.context = null;
            }
        }

        if (!this.context) {
            this.initializing = (async () => {
                try {
                    const fs = require('fs');
                    const { execSync } = require('child_process');

                    // 1. Chỉ dọn dẹp file khóa, không diệt tiến trình để tránh tắt tab của người dùng
                    const cleanLocksAndJournals = (dir) => {
                        if (!fs.existsSync(dir)) return;
                        try {
                            const files = fs.readdirSync(dir);
                            for (const file of files) {
                                const fullPath = path.join(dir, file);
                                const stat = fs.lstatSync(fullPath);
                                if (stat.isDirectory()) {
                                    cleanLocksAndJournals(fullPath);
                                } else if (file === 'LOCK' || file === 'SingletonLock' || file.endsWith('-journal') || file.endsWith('.db-journal')) {
                                    try {
                                        fs.unlinkSync(fullPath);
                                    } catch (e) {}
                                }
                            }
                        } catch(e) {}
                    };

                    console.log('[BrowserManager] Đang quét dọn rác trong profile...');
                    cleanLocksAndJournals(this.userDataDir);

                    console.log('[BrowserManager] Khởi tạo Browser Context duy nhất...');
                    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
                    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
                    const coccocPath = 'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe';
                    
                    let exePath = undefined;
                    if (fs.existsSync(chromePath)) exePath = chromePath;
                    else if (fs.existsSync(edgePath)) exePath = edgePath;
                    else if (fs.existsSync(coccocPath)) exePath = coccocPath;

                    this.context = await chromium.launchPersistentContext(this.userDataDir, {
                        executablePath: exePath,
                        headless: false,
                        viewport: { width: 1280, height: 720 },
                        args: [
                            '--no-sandbox',
                            '--disable-notifications',
                            '--no-first-run',
                            '--no-default-browser-check'
                        ],
                        timeout: 60000 
                    });
                    console.log('[BrowserManager] Khởi tạo Browser Context THÀNH CÔNG.');

                    // Lắng nghe sự kiện đóng để reset
                    this.context.on('close', () => {
                        console.log('[BrowserManager] Context đã bị đóng.');
                        this.context = null;
                        this.initializing = null;
                    });

                    return this.context;
                } catch (error) {
                    console.error('[BrowserManager] LỖI KHỞI CHẠY TRÌNH DUYỆT!');
                    this.context = null;
                    this.initializing = null;
                    throw error;
                } finally {
                    this.initializing = null;
                }
            })();

            return await this.initializing;
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
