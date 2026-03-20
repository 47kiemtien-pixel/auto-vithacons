const fs = require('fs');
let code = fs.readFileSync('get_groups.js', 'utf-8');

code = code.replace(
    /await page\.goto\('https:\/\/www\.facebook\.com\/me', \{ waitUntil: 'load', timeout: 30000 \}\);\s*const currentUrl = page\.url\(\);/,
    `await page.goto('https://www.facebook.com/me', { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => {
            const url = window.location.href;
            return !url.endsWith('facebook.com/me') && !url.endsWith('facebook.com/me/');
        }, { timeout: 15000 }).catch(() => {});
        const currentUrl = page.url();`
);

code = code.replace(/if \(idMatch\) \{/, `if (idMatch && idMatch[1] !== 'me') {`);

fs.writeFileSync('get_groups.js', code, 'utf-8');
console.log('Success');
