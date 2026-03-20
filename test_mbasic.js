const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    const userDataDir = path.join(__dirname, 'fb_user_data');
    console.log("Launching browser to test mbasic pagination...");
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    
    let exePath = [
        chromePath, 
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 
        'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe'
    ].find(p => fs.existsSync(p));

    const context = await chromium.launchPersistentContext(userDataDir, {
        executablePath: exePath,
        headless: true,
        viewport: { width: 1280, height: 720 },
    });
    
    const page = await context.newPage();
    console.log("Navigating to mbasic groups...");
    await page.goto('https://mbasic.facebook.com/groups/?seemore', { timeout: 60000 });
    
    console.log("Waiting for load...");
    await page.waitForTimeout(3000);
    
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({
            text: a.innerText.trim(),
            href: a.href
        })).filter(l => l.text).slice(-15);
    });
    
    console.log("=== BOTTOM 15 LINKS ===");
    console.log(JSON.stringify(links, null, 2));
    
    // Also save the full HTML just in case
    fs.writeFileSync('mbasic_debug.html', await page.content());
    console.log("Wrote full HTML to mbasic_debug.html");

    await context.close();
})();
