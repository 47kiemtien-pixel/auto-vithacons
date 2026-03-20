const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    try {
        const userDataDir = path.join(__dirname, 'fb_user_data');
        const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        
        let exePath = [
            chromePath, 
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 
            'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe'
        ].find(p => fs.existsSync(p));

        const context = await chromium.launchPersistentContext(userDataDir, {
            executablePath: exePath,
            headless: false,
        });
        
        const page = await context.newPage();
        let userIdToCheck = 'me';
        await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 60000 });
        const currentUrl = page.url();
        const idMatch = currentUrl.match(/profile\.php\?id=(\d+)/) || currentUrl.match(/facebook\.com\/([^\\/\\?]+)/);
        if (idMatch) userIdToCheck = idMatch[1];
        
        const groupsUrl = `https://www.facebook.com/${userIdToCheck}/groups`;
        console.log("Groups URL:", groupsUrl);
        
        await page.goto(groupsUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(5000);
        
        const dump = await page.evaluate(() => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
            for (let a of links.slice(0, 30)) {
                let text1 = a.innerText.trim();
                let text2 = a.querySelector('span[dir="auto"]') ? a.querySelector('span[dir="auto"]').innerText.trim() : '';
                results.push({ href: a.href, innerText: text1, spanText: text2 });
            }
            return results;
        });
        
        console.log("Extracted Links:");
        console.log(JSON.stringify(dump, null, 2));

        await context.close();
    } catch(e) {
        console.error(e);
    }
})();
