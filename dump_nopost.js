require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testNoPost() {
    const userDataDir = path.join(__dirname, 'fb_user_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-notifications']
    });
    const page = await context.newPage();
    try {
        const url = 'https://www.facebook.com/groups/1298789390857814/user/100063596562296/';
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        
        await page.screenshot({ path: 'fb_user_nopost.png' });
        
        const html = await page.evaluate(() => {
            return document.body.innerText;
        });
        fs.writeFileSync('dump_user_nopost.txt', html);
        console.log("Dump no post successful");
    } catch(e) {
        console.error(e);
    } finally {
        await context.close();
    }
}
testNoPost();
