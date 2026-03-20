const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    try {
        const userDataDir = path.join(__dirname, 'fb_user_data');
        const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        
        let exePath = [
            'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe',
            chromePath, 
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        ].find(p => fs.existsSync(p));

        const context = await chromium.launchPersistentContext(userDataDir, {
            executablePath: exePath,
            headless: true,
        });
        
        const page = await context.newPage();
        let userIdToCheck = 'me';
        await page.goto('https://www.facebook.com/me', { waitUntil: 'load', timeout: 30000 });
        const currentUrl = page.url();
        const idMatch = currentUrl.match(/profile\.php\?id=(\d+)/) || currentUrl.match(/facebook\.com\/([^\\/\\?]+)/);
        if (idMatch) userIdToCheck = idMatch[1];
        
        const groupsUrl = `https://www.facebook.com/${userIdToCheck}/groups`;
        console.log("Groups URL:", groupsUrl);
        
        await page.goto(groupsUrl, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(5000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
        
        fs.writeFileSync('profile_groups_debug.html', await page.content());
        console.log("Saved DOM to profile_groups_debug.html");

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/groups/"]')).map(a => a.href).slice(0, 20);
        });
        
        console.log("First 20 /groups/ links found:", links);

        const anyLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 5);
        });
        console.log("First 5 random links on page:", anyLinks);

        await context.close();
    } catch(e) {
        console.error(e);
    }
})();
