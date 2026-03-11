const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const COOKIES_PATH = path.join(__dirname, 'cookies.json');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

async function login(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (fs.existsSync(COOKIES_PATH)) {
        console.log("Đang nạp cookies...");
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
        await context.addCookies(cookies);
    }

    await page.goto('https://www.facebook.com');
    
    // Kiểm tra xem đã đăng nhập chưa
    const isLoggedIn = await page.isVisible('aria-label="Facebook"'); // Hoặc selector khác tùy giao diện

    if (!isLoggedIn) {
        console.log("Vui lòng đăng nhập thủ công trong trình duyệt vừa mở. Bot sẽ đợi...");
        // Ở đây chúng ta có thể dừng bot hoặc đợi người dùng tương tác
        // Để đơn giản, tôi sẽ gợi ý người dùng chạy lệnh login riêng để lưu cookies
    }

    return context;
}

async function postToGroup(context, groupUrl, content) {
    const page = await context.newPage();
    try {
        console.log(`Đang truy cập nhóm: ${groupUrl}`);
        await page.goto(groupUrl);

        // Click vào ô "Viết gì đó..."
        // Selector có thể thay đổi tùy theo ngôn ngữ và giao diện của Facebook
        await page.click('text="Viết gì đó..."'); 
        await page.waitForSelector('role=textbox');
        await page.fill('role=textbox', content);

        console.log("Đang nhấn nút Đăng...");
        await page.click('aria-label="Đăng"');
        
        await page.waitForTimeout(5000); // Đợi một chút để bài được đăng xong
        console.log("Đăng thành công!");
    } catch (error) {
        console.error(`Lỗi khi đăng bài lên ${groupUrl}:`, error.message);
    } finally {
        await page.close();
    }
}

async function main() {
    const browser = await chromium.launch({ headless: false }); // Mở trình duyệt để người dùng thấy
    const context = await login(browser);

    for (const groupUrl of config.groups) {
        await postToGroup(context, groupUrl, config.content);
        
        const delay = getRandomDelay(config.delay.min, config.delay.max);
        console.log(`Đợi ${delay / 1000} giây trước khi đăng bài tiếp theo...`);
        await sleep(delay);
    }

    console.log("Hoàn thành tất cả bài đăng!");
    // await browser.close();
}

main().catch(console.error);
