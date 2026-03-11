require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function checkUserPosts() {
    const userDataDir = path.join(__dirname, 'fb_user_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-notifications']
    });
    const page = await context.newPage();
    try {
        const url = 'https://www.facebook.com/groups/754966476761029/user/100063596562296/';
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        
        await page.screenshot({ path: 'fb_user_history.png' });
        
        const html = await page.evaluate(() => {
            return document.body.innerText;
        });
        fs.writeFileSync('dump_user_history.txt', html);
        console.log("Dump history successful");
    } catch(e) {
        console.error(e);
    } finally {
        await context.close();
    }
}
checkUserPosts();
