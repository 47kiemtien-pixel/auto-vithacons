require('dotenv').config();
const FBAutomator = require('./fb_automator');
const { paraphrase } = require('./paraphraser');
const { sleep, randomDelay } = require('./scheduler');

const PARAPHRASE_TIMEOUT_MS = 5000;
const QUICK_POST_VERIFY_DELAY_MS = 1500;
const FAST_GROUP_DELAY_MIN_MS = 15000;
const FAST_GROUP_DELAY_MAX_MS = 30000;

async function startPosting(targetGroups, logCallback = () => {}, browserContext = null, postContent = '', imageFolderPath = '') {
    const fs = require('fs');
    const path = require('path');
    
    // Äá»c danh sÃ¡ch nhÃ³m cáº¥m link
    const antiLinkPath = path.join(__dirname, 'anti_link_groups.txt');
    let antiLinkGroups = new Set();
    if (fs.existsSync(antiLinkPath)) {
        antiLinkGroups = new Set(fs.readFileSync(antiLinkPath, 'utf-8').split('\n').map(l => l.trim()).filter(l => l));
    }

    // XÃ¡c Ä‘á»‹nh ná»™i dung bÃ i viáº¿t
    let baseContent = postContent ? postContent.trim() : '';
    if (!baseContent) {
        const contentPath = path.join(__dirname, 'content.txt');
        if (fs.existsSync(contentPath)) {
            baseContent = fs.readFileSync(contentPath, 'utf-8').trim();
        }
    }

    if (!targetGroups || targetGroups.length === 0 || !baseContent) {
        const err = "Lá»—i: KhÃ´ng cÃ³ danh sÃ¡ch nhÃ³m hoáº·c ná»™i dung bÃ i viáº¿t trá»‘ng.";
        console.error(err);
        logCallback({ type: 'error', message: err });
        return;
    }

    const automator = new FBAutomator((message) => {
        logCallback({ type: 'info', message });
    });
    
    try {
        logCallback({ type: 'info', message: 'Khá»Ÿi táº¡o trÃ¬nh duyá»‡t...' });
        await automator.init(browserContext);
        logCallback({ type: 'info', message: 'Kiá»ƒm tra Ä‘Äƒng nháº­p...' });
        await automator.login();

        // XÃ¡c Ä‘á»‹nh thÆ° má»¥c hÃ¬nh áº£nh
        const os = require('os');
        const mediaDir = imageFolderPath ? imageFolderPath.trim() : path.join(os.homedir(), 'Desktop', 'Máº«u nhÃ  2026');
        
        let imagePaths = [];
        if (fs.existsSync(mediaDir)) {
            imagePaths = fs.readdirSync(mediaDir)
                .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
                .map(file => path.join(mediaDir, file));
            const msg = `[Main] ÄÃ£ tÃ¬m tháº¥y ${imagePaths.length} áº£nh trong thÆ° má»¥c ${mediaDir}`;
            console.log(msg);
            logCallback({ type: 'info', message: msg });
            if (imagePaths.length === 0) {
                logCallback({ type: 'warning', message: `[Main] ThÆ° má»¥c áº£nh cÃ³ tá»“n táº¡i nhÆ°ng khÃ´ng cÃ³ file .jpg/.jpeg/.png/.webp nÃ o: ${mediaDir}` });
            }
        } else {
            const msg = `[Main] KhÃ´ng tÃ¬m tháº¥y thÆ° má»¥c áº£nh: ${mediaDir}`;
            console.log(msg);
            logCallback({ type: 'warning', message: msg });
        }

        for (let i = 0; i < targetGroups.length; i++) {
            let groupObj = targetGroups[i];
            let groupUrl = typeof groupObj === 'string' ? groupObj.trim() : groupObj.url.trim();

            const headerMsg = `\n--- [Äang xá»­ lÃ½ ${i + 1}/${targetGroups.length}] ---`;
            console.log(headerMsg);
            logCallback({ type: 'progress', message: `Äang xá»­ lÃ½ ${i + 1}/${targetGroups.length}: ${groupUrl}`, groupUrl });
            
            // Xá»­ lÃ½ ná»™i dung (paraphrase náº¿u Ä‘Æ°á»£c chá»n)
            console.log(`[Main] Äang chuáº©n bá»‹ ná»™i dung cho nhÃ³m: ${groupUrl}`);
            let finalContent = baseContent;
            
            // KIá»‚M TRA Náº¾U NHÃ“M Cáº¤M LINK -> XOÃ LINK KHá»ŽI Ná»˜I DUNG
            if (antiLinkGroups.has(groupUrl)) {
                logCallback({ type: 'warning', message: `âš ï¸ NhÃ³m nÃ y Cáº¤M LINK. Äang tá»± Ä‘á»™ng loáº¡i bá» cÃ¡c liÃªn káº¿t...`, groupUrl });
                // Regex Ä‘á»ƒ tÃ¬m URL: http, https, .com, .vn, ...
                const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|vn|net|org|info|edu|gov)([^\s]*))/gi;
                finalContent = finalContent.replace(urlRegex, '');
            }

            try {
                const rewritten = await Promise.race([
                    paraphrase(finalContent),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('PARAPHRASE_TIMEOUT')), PARAPHRASE_TIMEOUT_MS))
                ]);
                if (rewritten && rewritten.trim() !== "") {
                    finalContent = rewritten;
                    console.log(`[Main] Ná»™i dung Ä‘Ã£ rewrite:\n"${finalContent}"`);
                    logCallback({ type: 'info', message: 'âœ¨ ÄÃ£ paraphrase ná»™i dung Ä‘á»ƒ trÃ¡nh spam.', groupUrl });
                } else {
                    console.log('[Main] Rewrite rá»—ng, dÃ¹ng ná»™i dung gá»‘c.');
                }
            } catch (err) {
                if (err.message === "QUOTA_EXCEEDED") {
                    const quotaMsg = 'âš ï¸ Cáº¢NH BÃO: API Gemini Ä‘Ã£ háº¿t háº¡n má»©c (Quota Exceeded). Bá»‘t sáº½ dÃ¹ng ná»™i dung gá»‘c Ä‘á»ƒ Ä‘Äƒng tiáº¿p.';
                    console.log(`[Main] ${quotaMsg}`);
                    logCallback({ type: 'warning', message: quotaMsg, groupUrl });
                } else if (err.message === 'PARAPHRASE_TIMEOUT') {
                    const timeoutMsg = 'Paraphrase qua cham, bo qua de dang nhanh hon.';
                    console.log(`[Main] ${timeoutMsg}`);
                    logCallback({ type: 'warning', message: timeoutMsg, groupUrl });
                } else {
                    console.log(`[Main] DÃ¹ng ná»™i dung gá»‘c thay tháº¿ do paraphrase lá»—i: ${err.message}`);
                }
            }

            // Tiáº¿n hÃ nh Ä‘Äƒng bÃ i
            logCallback({ type: 'status', message: `Tiáº¿n hÃ nh láº¥y nÃºt Ä‘Äƒng bÃ i...`, groupUrl });
            logCallback({
                type: 'info',
                message: `[Main] Chuáº©n bá»‹ Ä‘Äƒng vÃ o ${groupUrl} | áº£nh: ${imagePaths.length} | thÆ° má»¥c áº£nh: ${mediaDir}`,
                groupUrl
            });
            // Override console.log temporarily inside automator? Actually just let it print to console.
            const result = await automator.postToGroup(groupUrl, finalContent, imagePaths);
            logCallback({
                type: 'info',
                message: `[Main] Káº¿t quáº£ postToGroup: ${JSON.stringify(result || null)}`,
                groupUrl
            });
            
            if (result && result.success) {
                // Ghi vÃ o file lá»‹ch sá»­ Ä‘á»ƒ cÃ´ng cá»¥ get_groups khÃ´ng láº¥y láº¡i, kÃ¨m thá»i gian Ä‘Äƒng
                const historyPath = path.join(__dirname, 'posted_history.txt');
                const timestamp = Date.now();
                fs.appendFileSync(historyPath, `${groupUrl}|${timestamp}\n`);
                
                if (result.pending) {
                    const msg = `[Main] ÄÄƒng xong, Facebook bÃ¡o ÄANG CHá»œ PHÃŠ DUYá»†T ngay láº­p tá»©c.`;
                    console.log(msg);
                    logCallback({ type: 'success', message: msg, groupUrl, status: 'pending' });
                } else {
                    const msg = `[Main] ÄÄƒng thÃ nh cÃ´ng! Äang Ä‘á»£i 3 giÃ¢y Ä‘á»ƒ kiá»ƒm tra nhanh tráº¡ng thÃ¡i bÃ i...`;
                    console.log(msg);
                    logCallback({ type: 'info', message: msg, groupUrl });
                    
                    await sleep(QUICK_POST_VERIFY_DELAY_MS);
                    
                    const removedStatus = await automator.checkRemovedContent(groupUrl);
                    if (removedStatus === 'removed_by_link' || removedStatus === 'removed_other') {
                        const reason = removedStatus === 'removed_by_link' ? 'do CHá»¨A LINK' : 'nghi ngá» vi pháº¡m/spam';
                        const retryMsg = `âš ï¸ PHÃT HIá»†N: BÃ i viáº¿t vá»«a Ä‘Äƒng Ä‘Ã£ bá»‹ gá»¡ tháº§m láº·ng (${reason}). Tiáº¿n hÃ nh Ä‘Äƒng láº¡i láº§n 2 KHÃ”NG KÃˆM LINK...`;
                        console.log(retryMsg);
                        logCallback({ type: 'warning', message: retryMsg, groupUrl });

                        // LÆ°u vÃ o danh sÃ¡ch cáº¥m link vÄ©nh viá»…n
                        if (!antiLinkGroups.has(groupUrl)) {
                            fs.appendFileSync(antiLinkPath, `${groupUrl}\n`);
                            antiLinkGroups.add(groupUrl);
                        }

                        // Xá»­ lÃ½ láº¡i ná»™i dung (XoÃ¡ sáº¡ch link, khÃ´ng Ä‘á»ƒ láº¡i vÄƒn báº£n thay tháº¿)
                        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|vn|net|org|info|edu|gov)([^\s]*))/gi;
                        const contentNoLink = finalContent.replace(urlRegex, '');
                        
                        // ÄÄƒng láº¡i láº§n 2
                        const retryResult = await automator.postToGroup(groupUrl, contentNoLink, imagePaths);
                        if (retryResult && retryResult.success) {
                            logCallback({ type: 'success', message: 'âœ… ÄÃƒ ÄÄ‚NG Láº I THÃ€NH CÃ”NG (KhÃ´ng kÃ¨m link).', groupUrl, status: 'published' });
                        } else {
                            logCallback({ type: 'error', message: 'âŒ Tháº¥t báº¡i khi cá»‘ gáº¯ng Ä‘Äƒng láº¡i.', groupUrl });
                        }
                    } else {
                        logCallback({ type: 'success', message: 'âœ… BÃ i viáº¿t váº«n á»•n Ä‘á»‹nh (KhÃ´ng bá»‹ gá»¡).', groupUrl, status: 'published' });
                    }
                }
                
                // Nghá»‰ ngÆ¡i giá»¯a cÃ¡c nhÃ³m náº¿u khÃ´ng pháº£i nhÃ³m cuá»‘i cÃ¹ng
                if (i < targetGroups.length - 1) {
                    const delayMs = Math.floor(Math.random() * (FAST_GROUP_DELAY_MAX_MS - FAST_GROUP_DELAY_MIN_MS + 1)) + FAST_GROUP_DELAY_MIN_MS;
                    const delaySeconds = (delayMs / 1000).toFixed(0);
                    const msg = `[Scheduler] Äá»£i ${delaySeconds} giÃ¢y trÆ°á»›c khi Ä‘Äƒng bÃ i tiáº¿p theo...`;
                    console.log(msg);
                    logCallback({ type: 'delay', message: msg, groupUrl });
                    await sleep(delayMs);
                }
            } else {
                if (result && result.reason === 'rejected_link') {
                    const msg = 'âŒ Bá»Š Tá»ª CHá»I: NhÃ³m nÃ y khÃ´ng cho phÃ©p Ä‘Äƒng Link. ÄÃ£ lÆ°u vÃ o danh sÃ¡ch háº¡n cháº¿.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'rejected_link' });
                    
                    // LÆ°u vÃ o danh sÃ¡ch cáº¥m link
                    if (!antiLinkGroups.has(groupUrl)) {
                        fs.appendFileSync(antiLinkPath, `${groupUrl}\n`);
                        antiLinkGroups.add(groupUrl);
                    }
                } else if (result && result.reason === 'image_upload_failed') {
                    const msg = 'âŒ Upload áº£nh chÆ°a thÃ nh cÃ´ng. Bot Ä‘Ã£ dá»«ng trÆ°á»›c khi báº¥m ÄÄƒng Ä‘á»ƒ trÃ¡nh bÃ i chá»‰ cÃ³ ná»™i dung.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'image_upload_failed' });
                } else if (result && result.reason === 'composer_not_found') {
                    const msg = 'âŒ KhÃ´ng tÃ¬m tháº¥y Ã´ má»Ÿ há»™p soáº¡n bÃ i trong nhÃ³m.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'composer_not_found' });
                } else if (result && result.reason === 'textbox_not_found') {
                    const msg = 'âŒ ÄÃ£ má»Ÿ há»™p Ä‘Äƒng nhÆ°ng khÃ´ng nháº­p Ä‘Æ°á»£c ná»™i dung vÃ o Ã´ soáº¡n bÃ i.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'textbox_not_found' });
                } else if (result && result.reason === 'submit_button_not_found') {
                    const msg = 'âŒ KhÃ´ng tÃ¬m tháº¥y nÃºt ÄÄƒng hoáº·c nÃºt bá»‹ khÃ³a quÃ¡ lÃ¢u.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'submit_button_not_found' });
                } else {
                    const msg = `[Main] ÄÄƒng bÃ i tháº¥t báº¡i. LÃ½ do: ${result?.reason || 'unknown'}`;
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'failed' });
                }
            }
        }
        
        const doneMsg = '\n=== ÄÃ£ hoÃ n thÃ nh táº¥t cáº£ bÃ i Ä‘Äƒng! ===';
        console.log(doneMsg);
        logCallback({ type: 'done', message: doneMsg });

    } catch (error) {
        console.error("Lá»—i há»‡ thá»‘ng:", error);
        logCallback({ type: 'error', message: `Lá»—i há»‡ thá»‘ng: ${error.message}` });
    } finally {
        // Chá»‰ Ä‘Ã³ng trang hiá»‡n táº¡i, khÃ´ng Ä‘Ã³ng context dÃ¹ng chung
        // await automator.close(); // Giá»¯ tab láº¡i theo yÃªu cáº§u ngÆ°á»i dÃ¹ng
    }
}

// Giá»¯ nguyÃªn tÃ­nh nÄƒng cháº¡y tá»« dÃ²ng lá»‡nh Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch ngÆ°á»£c
async function main() {
    const fs = require('fs');
    const path = require('path');
    let groups = (process.env.FB_GROUPS || "").split(',').map(g => g.trim()).filter(g => g !== "");
    
    const extractedPath = path.join(__dirname, 'extracted_groups.txt');
    if (fs.existsSync(extractedPath)) {
        const fileContent = fs.readFileSync(extractedPath, 'utf-8');
        const fileGroups = fileContent.split('\n')
            .map(line => line.replace(/,/g, '').trim()) // XÃ³a dáº¥u pháº©y vÃ  khoáº£ng tráº¯ng thá»«a
            .filter(line => line.length > 0 && line.startsWith('http'));
        groups = [...new Set([...groups, ...fileGroups])];
    }
    
    const limit = parseInt(process.argv[2], 10);
    if (!isNaN(limit) && limit > 0) {
        groups = groups.slice(0, limit);
        console.log(`[Main] Giá»›i háº¡n cháº¡y: Chá»‰ xá»­ lÃ½ ${limit} nhÃ³m Ä‘áº§u tiÃªn.`);
    }
    
    await startPosting(groups, (evt) => {
        // Log event cho UI náº¿u cháº¡y Ä‘á»™c láº­p thÃ¬ khÃ´ng cáº§n lÃ m gÃ¬
    });
}

if (require.main === module) {
    main();
}

module.exports = { startPosting };

