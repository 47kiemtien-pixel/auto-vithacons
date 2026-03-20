const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class BrowserManager {
    constructor() {
        this.context = null;
        this.projectUserDataDir = path.join(__dirname, 'fb_user_data');
        this.projectCocCocUserDataDir = path.join(__dirname, 'fb_coccoc_profile');
        this.initializing = null;
    }

    getBrowserLaunchConfig() {
        const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
        const coccocCandidates = [
            path.join(localAppData, 'CocCoc', 'Browser', 'Application', 'browser.exe'),
            'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe'
        ];
        const coccocPath = coccocCandidates.find((candidate) => fs.existsSync(candidate));

        if (!coccocPath) {
            throw new Error('Khong tim thay Coc Coc tren may. Hay cai Coc Coc hoac kiem tra lai duong dan browser.exe.');
        }

        return {
            executablePath: coccocPath,
            userDataDir: this.projectCocCocUserDataDir,
            args: [
                '--no-sandbox',
                '--disable-notifications',
                '--no-first-run',
                '--no-default-browser-check'
            ],
            shouldCleanLocks: true
        };
    }

    cleanLocksAndJournals(dir) {
        if (!fs.existsSync(dir)) return;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.lstatSync(fullPath);
                if (stat.isDirectory()) {
                    this.cleanLocksAndJournals(fullPath);
                } else if (
                    file === 'LOCK' ||
                    file === 'SingletonLock' ||
                    file.endsWith('-journal') ||
                    file.endsWith('.db-journal')
                ) {
                    try {
                        fs.unlinkSync(fullPath);
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    async getContext() {
        if (this.initializing) return await this.initializing;

        if (this.context && (!this.context.browser() || !this.context.browser().isConnected())) {
            this.context = null;
        }

        if (!this.context) {
            this.initializing = (async () => {
                try {
                    const launchConfig = this.getBrowserLaunchConfig();

                    if (launchConfig.shouldCleanLocks) {
                        this.cleanLocksAndJournals(launchConfig.userDataDir);
                    }

                    try {
                        this.context = await chromium.launchPersistentContext(launchConfig.userDataDir, {
                            executablePath: launchConfig.executablePath,
                            headless: false,
                            viewport: { width: 1280, height: 720 },
                            args: launchConfig.args,
                            timeout: 60000
                        });
                    } catch (error) {
                        throw error;
                    }

                    this.context.on('close', () => {
                        this.context = null;
                        this.initializing = null;
                    });

                    return this.context;
                } catch (error) {
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
