const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, 'cookies.json');

async function login() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.facebook.com');

    console.log("Vui lòng đăng nhập vào Facebook.");
    console.log("Sau khi đăng nhập xong, hãy nhấn Enter tại terminal này để lưu cookies.");

    process.stdin.once('data', async () => {
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        console.log("Đã lưu cookies vào cookies.json!");
        await browser.close();
        process.exit();
    });
}

login().catch(console.error);
