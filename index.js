require('dotenv').config();
const FBAutomator = require('./fb_automator');
const { paraphrase } = require('./paraphraser');
const { sleep } = require('./scheduler');

const PARAPHRASE_TIMEOUT_MS = 5000;
const QUICK_POST_VERIFY_DELAY_MS = 10000;

function loadMediaPaths(mediaType, imageFolderPath = '', videoFolderPath = '') {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const normalizedMediaType = mediaType === 'video' ? 'video' : 'image';
    const mediaDir = normalizedMediaType === 'video'
        ? (videoFolderPath ? videoFolderPath.trim() : path.join(os.homedir(), 'Desktop', 'Mau video 2026'))
        : (imageFolderPath ? imageFolderPath.trim() : path.join(os.homedir(), 'Desktop', 'Mau nha 2026'));

    const matcher = normalizedMediaType === 'video'
        ? /\.(mp4|mov|avi|mkv|webm)$/i
        : /\.(jpg|jpeg|png|webp)$/i;

    if (!fs.existsSync(mediaDir)) {
        return {
            normalizedMediaType,
            mediaDir,
            mediaPaths: [],
            exists: false
        };
    }

    const mediaPaths = fs.readdirSync(mediaDir)
        .filter((file) => matcher.test(file))
        .map((file) => path.join(mediaDir, file));

    return {
        normalizedMediaType,
        mediaDir,
        mediaPaths,
        exists: true
    };
}

async function startPosting(
    targetGroups,
    logCallback = () => {},
    browserContext = null,
    postContent = '',
    mediaType = 'image',
    imageFolderPath = '',
    videoFolderPath = '',
    delayBetweenPostsMinutes = 1
) {
    const fs = require('fs');
    const path = require('path');
    let consecutiveMediaUploadFailures = 0;

    const antiLinkPath = path.join(__dirname, 'anti_link_groups.txt');
    let antiLinkGroups = new Set();
    if (fs.existsSync(antiLinkPath)) {
        antiLinkGroups = new Set(
            fs.readFileSync(antiLinkPath, 'utf-8')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
        );
    }

    let baseContent = postContent ? postContent.trim() : '';
    if (!baseContent) {
        const contentPath = path.join(__dirname, 'content.txt');
        if (fs.existsSync(contentPath)) {
            baseContent = fs.readFileSync(contentPath, 'utf-8').trim();
        }
    }

    if (!targetGroups || targetGroups.length === 0 || !baseContent) {
        const err = 'Loi: Khong co danh sach nhom hoac noi dung bai viet trong.';
        console.error(err);
        logCallback({ type: 'error', message: err });
        return;
    }

    const automator = new FBAutomator((message) => {
        logCallback({ type: 'info', message });
    });

    try {
        logCallback({ type: 'info', message: 'Khoi tao trinh duyet...' });
        await automator.init(browserContext);
        logCallback({ type: 'info', message: 'Kiem tra dang nhap...' });
        await automator.login();

        const mediaInfo = loadMediaPaths(mediaType, imageFolderPath, videoFolderPath);
        const mediaLabel = mediaInfo.normalizedMediaType === 'video' ? 'video' : 'anh';

        if (mediaInfo.exists) {
            const msg = `[Main] Da tim thay ${mediaInfo.mediaPaths.length} ${mediaLabel} trong thu muc ${mediaInfo.mediaDir}`;
            console.log(msg);
            logCallback({ type: 'info', message: msg });
            if (mediaInfo.mediaPaths.length === 0) {
                logCallback({
                    type: 'warning',
                    message: `[Main] Thu muc ${mediaLabel} co ton tai nhung khong co file hop le: ${mediaInfo.mediaDir}`
                });
            }
        } else {
            const msg = `[Main] Khong tim thay thu muc ${mediaLabel}: ${mediaInfo.mediaDir}`;
            console.log(msg);
            logCallback({ type: 'warning', message: msg });
        }

        for (let i = 0; i < targetGroups.length; i++) {
            const groupObj = targetGroups[i];
            const groupUrl = typeof groupObj === 'string' ? groupObj.trim() : groupObj.url.trim();

            console.log(`\n--- [Dang xu ly ${i + 1}/${targetGroups.length}] ---`);
            logCallback({ type: 'progress', message: `Dang xu ly ${i + 1}/${targetGroups.length}: ${groupUrl}`, groupUrl });

            let finalContent = baseContent;
            if (antiLinkGroups.has(groupUrl)) {
                logCallback({ type: 'warning', message: 'Nhom nay cam link. Dang tu dong loai bo lien ket...', groupUrl });
                const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|vn|net|org|info|edu|gov)([^\s]*))/gi;
                finalContent = finalContent.replace(urlRegex, '');
            }

            try {
                const rewritten = await Promise.race([
                    paraphrase(finalContent),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('PARAPHRASE_TIMEOUT')), PARAPHRASE_TIMEOUT_MS))
                ]);
                if (rewritten && rewritten.trim() !== '') {
                    finalContent = rewritten;
                    logCallback({ type: 'info', message: 'Da paraphrase noi dung de tranh spam.', groupUrl });
                }
            } catch (err) {
                if (err.message === 'QUOTA_EXCEEDED') {
                    logCallback({ type: 'warning', message: 'API Gemini da het han muc. Bot se dung noi dung goc.', groupUrl });
                } else if (err.message === 'PARAPHRASE_TIMEOUT') {
                    logCallback({ type: 'warning', message: 'Paraphrase qua cham, bo qua de dang nhanh hon.', groupUrl });
                }
            }

            logCallback({ type: 'status', message: 'Tien hanh lay nut dang bai...', groupUrl });
            logCallback({
                type: 'info',
                message: `[Main] Chuan bi dang vao ${groupUrl} | mediaType: ${mediaInfo.normalizedMediaType} | files: ${mediaInfo.mediaPaths.length} | thu muc: ${mediaInfo.mediaDir}`,
                groupUrl
            });

            const POST_TIMEOUT_MS = 180000;
            let result;
            try {
                result = await Promise.race([
                    automator.postToGroup(groupUrl, finalContent, mediaInfo.mediaPaths, mediaInfo.normalizedMediaType),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('POST_TIMEOUT')), POST_TIMEOUT_MS))
                ]);
            } catch (err) {
                if (err.message === 'POST_TIMEOUT') {
                    result = { success: false, pending: false, reason: 'post_timeout' };
                    logCallback({ type: 'error', message: `Nhom ${groupUrl} xu ly qua lau (hon 3 phut). Da bo qua.`, groupUrl });
                } else {
                    throw err;
                }
            }

            logCallback({
                type: 'info',
                message: `[Main] Ket qua postToGroup: ${JSON.stringify(result || null)}`,
                groupUrl
            });

            if (result && result.success) {
                consecutiveMediaUploadFailures = 0;

                if (result.pending) {
                    logCallback({ type: 'success', message: 'Dang xong, cho Facebook phe duyet. Da ghi vao lich su.', groupUrl, status: 'pending' });
                } else {
                    logCallback({ type: 'info', message: 'Dang thanh cong. Dang doi kiem tra nhanh trang thai bai...', groupUrl });
                    await sleep(QUICK_POST_VERIFY_DELAY_MS);

                    const removedStatus = await automator.checkRemovedContent(groupUrl);
                    if (removedStatus === 'removed_by_link' || removedStatus === 'removed_other') {
                        const reason = removedStatus === 'removed_by_link' ? 'do chua link' : 'nghi ngo vi pham/spam';
                        logCallback({ type: 'error', message: `Phat hien bai vua dang da bi go tham lang (${reason}). Khong ghi vao lich su.`, groupUrl });

                        if (!antiLinkGroups.has(groupUrl)) {
                            fs.appendFileSync(antiLinkPath, `${groupUrl}\n`);
                            antiLinkGroups.add(groupUrl);
                        }

                        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|vn|net|org|info|edu|gov)([^\s]*))/gi;
                        const contentNoLink = finalContent.replace(urlRegex, '');
                        const retryResult = await automator.postToGroup(groupUrl, contentNoLink, mediaInfo.mediaPaths, mediaInfo.normalizedMediaType);
                        if (retryResult && retryResult.success) {
                            logCallback({ type: 'success', message: 'Da dang lai thanh cong (khong kem link).', groupUrl, status: 'published' });
                        } else {
                            logCallback({ type: 'error', message: 'That bai khi co gang dang lai.', groupUrl });
                        }
                    } else {
                        logCallback({ type: 'success', message: 'Bai viet van on dinh (khong bi go).', groupUrl, status: 'published' });
                    }
                }

                if (i < targetGroups.length - 1) {
                    const safeDelayMinutes = Math.max(0, Number(delayBetweenPostsMinutes) || 0);
                    const chosenDelayMinutes = safeDelayMinutes > 0 ? Math.floor(Math.random() * safeDelayMinutes) + 1 : 0;
                    const delayMs = chosenDelayMinutes * 60 * 1000;
                    logCallback({ type: 'delay', message: `[Scheduler] Doi ngau nhien ${chosenDelayMinutes} phut truoc khi dang bai tiep theo...`, groupUrl });
                    if (delayMs > 0) {
                        await sleep(delayMs);
                    }
                }
            } else {
                if (result && result.reason === 'rejected_link') {
                    logCallback({ type: 'error', message: 'Bi tu choi: nhom nay khong cho phep dang link.', groupUrl, status: 'rejected_link' });
                    if (!antiLinkGroups.has(groupUrl)) {
                        fs.appendFileSync(antiLinkPath, `${groupUrl}\n`);
                        antiLinkGroups.add(groupUrl);
                    }
                } else if (result && result.reason === 'media_upload_failed') {
                    consecutiveMediaUploadFailures += 1;
                    const msg = mediaInfo.normalizedMediaType === 'video'
                        ? 'Upload video chua thanh cong. Bot da dung truoc khi bam Dang de tranh bai chi co noi dung.'
                        : 'Upload anh chua thanh cong. Bot da dung truoc khi bam Dang de tranh bai chi co noi dung.';
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'media_upload_failed' });
                    if (consecutiveMediaUploadFailures >= 3) {
                        logCallback({
                            type: 'error',
                            message: `[Main] Dung batch dang bai vi upload ${mediaInfo.normalizedMediaType === 'video' ? 'video' : 'anh'} that bai lien tiep 3 nhom.`,
                            groupUrl,
                            status: 'stopped_after_repeated_media_failures'
                        });
                        break;
                    }
                } else if (result && result.reason === 'composer_not_found') {
                    consecutiveMediaUploadFailures = 0;
                    logCallback({ type: 'error', message: 'Khong tim thay o mo hop soan bai trong nhom.', groupUrl, status: 'composer_not_found' });
                } else if (result && result.reason === 'textbox_not_found') {
                    consecutiveMediaUploadFailures = 0;
                    logCallback({ type: 'error', message: 'Da mo hop dang nhung khong nhap duoc noi dung.', groupUrl, status: 'textbox_not_found' });
                } else if (result && result.reason === 'submit_button_not_found') {
                    consecutiveMediaUploadFailures = 0;
                    logCallback({ type: 'error', message: 'Khong tim thay nut Dang hoac nut bi khoa qua lau.', groupUrl, status: 'submit_button_not_found' });
                } else {
                    consecutiveMediaUploadFailures = 0;
                    logCallback({ type: 'error', message: `[Main] Dang bai that bai. Ly do: ${result?.reason || 'unknown'}`, groupUrl, status: 'failed' });
                }
            }
        }

        logCallback({ type: 'done', message: '\n=== Da hoan thanh tat ca bai dang! ===' });
    } catch (error) {
        console.error('Loi he thong:', error);
        logCallback({ type: 'error', message: `Loi he thong: ${error.message}` });
    }
}

async function main() {
    const fs = require('fs');
    const path = require('path');
    let groups = (process.env.FB_GROUPS || '').split(',').map((g) => g.trim()).filter(Boolean);
    const extractedPath = path.join(__dirname, 'extracted_groups.txt');
    if (fs.existsSync(extractedPath)) {
        const fileContent = fs.readFileSync(extractedPath, 'utf-8');
        const fileGroups = fileContent
            .split('\n')
            .map((line) => line.replace(/,/g, '').trim())
            .filter((line) => line.length > 0 && line.startsWith('http'));
        groups = [...new Set([...groups, ...fileGroups])];
    }

    const limit = parseInt(process.argv[2], 10);
    if (!Number.isNaN(limit) && limit > 0) {
        groups = groups.slice(0, limit);
        console.log(`[Main] Gioi han chay: chi xu ly ${limit} nhom dau tien.`);
    }

    await startPosting(groups, () => {});
}

if (require.main === module) {
    main();
}

module.exports = { startPosting };
