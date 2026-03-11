const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function dumpHTML() {
    const userDataDir = path.join(__dirname, 'fb_user_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        args: ['--disable-notifications']
    });
    const page = await context.newPage();
    try {
        await page.goto('https://www.facebook.com/groups/joins/');
        await page.waitForTimeout(5000); // Đợi tải
        
        const data = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const groupLinks = links.filter(a => a.href && a.href.includes('/groups/') && !a.href.includes('/user/') && !a.href.includes('/about/'));
            return groupLinks.map(a => a.innerText || a.textContent).filter(t => t.trim().length > 0).slice(0, 10);
        });
        fs.writeFileSync('dump_fb_text.json', JSON.stringify(data, null, 2));
        console.log("Dump successful");
    } catch(e) {
        console.error(e);
    } finally {
        await context.close();
    }
}
dumpHTML();
