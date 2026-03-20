const fs = require('fs');
try {
    const html = fs.readFileSync('debug_dom.html', 'utf8');
    const rr = /<a[^>]+href="([^"]+\/groups\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
    let m;
    let count = 0;
    while((m = rr.exec(html)) !== null && count < 20) {
        if (!m[1].includes('/user/') && !m[1].includes('/posts/')) {
            const text = m[2].replace(/<[^>]+>/g, '').trim();
            if (text && text.length > 2) {
                console.log(`[${m[1]}] -> ${text}`);
                count++;
            }
        }
    }
} catch(e) { console.error(e); }
