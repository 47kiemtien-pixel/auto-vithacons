require('dotenv').config();
const FBAutomator = require('./fb_automator');
const { paraphrase } = require('./paraphraser');
const { sleep } = require('./scheduler');

const PARAPHRASE_TIMEOUT_MS = 5000;
const QUICK_POST_VERIFY_DELAY_MS = 10000;
async function startPosting(targetGroups, logCallback = () => {}, browserContext = null, postContent = '', imageFolderPath = '', delayBetweenPostsMinutes = 1) {
    const fs = require('fs');
    const path = require('path');
    let consecutiveImageUploadFailures = 0;
    
    // Đọc danh sách nhóm cấm link
    const antiLinkPath = path.join(__dirname, 'anti_link_groups.txt');
    let antiLinkGroups = new Set();
    if (fs.existsSync(antiLinkPath)) {
        antiLinkGroups = new Set(fs.readFileSync(antiLinkPath, 'utf-8').split('\n').map(l => l.trim()).filter(l => l));
    }

    // Xác định nội dung bài viết
    let baseContent = postContent ? postContent.trim() : '';
    if (!baseContent) {
        const contentPath = path.join(__dirname, 'content.txt');
        if (fs.existsSync(contentPath)) {
            baseContent = fs.readFileSync(contentPath, 'utf-8').trim();
        }
    }

    if (!targetGroups || targetGroups.length === 0 || !baseContent) {
        const err = "Lỗi: Không có danh sách nhóm hoặc nội dung bài viết trống.";
        console.error(err);
        logCallback({ type: 'error', message: err });
        return;
    }

    const automator = new FBAutomator((message) => {
        logCallback({ type: 'info', message });
    });
    
    try {
        logCallback({ type: 'info', message: 'Khởi tạo trình duyệt...' });
        await automator.init(browserContext);
        logCallback({ type: 'info', message: 'Kiểm tra đăng nhập...' });
        await automator.login();

        // Xác định thư mục hình ảnh
        const os = require('os');
        const mediaDir = imageFolderPath ? imageFolderPath.trim() : path.join(os.homedir(), 'Desktop', 'Mẫu nhà 2026');
        
        let imagePaths = [];
        if (fs.existsSync(mediaDir)) {
            imagePaths = fs.readdirSync(mediaDir)
                .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
                .map(file => path.join(mediaDir, file));
            const msg = `[Main] Đã tìm thấy ${imagePaths.length} ảnh trong thư mục ${mediaDir}`;
            console.log(msg);
            logCallback({ type: 'info', message: msg });
            if (imagePaths.length === 0) {
                logCallback({ type: 'warning', message: `[Main] Thư mục ảnh có tồn tại nhưng không có file .jpg/.jpeg/.png/.webp nào: ${mediaDir}` });
            }
        } else {
            const msg = `[Main] Không tìm thấy thư mục ảnh: ${mediaDir}`;
            console.log(msg);
            logCallback({ type: 'warning', message: msg });
        }

        for (let i = 0; i < targetGroups.length; i++) {
            let groupObj = targetGroups[i];
            let groupUrl = typeof groupObj === 'string' ? groupObj.trim() : groupObj.url.trim();

            const headerMsg = `\n--- [Đang xử lý ${i + 1}/${targetGroups.length}] ---`;
            console.log(headerMsg);
            logCallback({ type: 'progress', message: `Đang xử lý ${i + 1}/${targetGroups.length}: ${groupUrl}`, groupUrl });
            
            // Xử lý nội dung (paraphrase nếu được chọn)
            console.log(`[Main] Đang chuẩn bị nội dung cho nhóm: ${groupUrl}`);
            let finalContent = baseContent;
            
            // KIỂM TRA NẾU NHÓM CẤM LINK -> XOÁ LINK KHỎI NỘI DUNG
            if (antiLinkGroups.has(groupUrl)) {
                logCallback({ type: 'warning', message: `⚠️ Nhóm này CẤM LINK. Đang tự động loại bỏ các liên kết...`, groupUrl });
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
                    console.log(`[Main] Nội dung đã rewrite:\n"${finalContent}"`);
                    logCallback({ type: 'info', message: '✨ Đã paraphrase nội dung để tránh spam.', groupUrl });
                } else {
                    console.log('[Main] Rewrite rỗng, dùng nội dung gốc.');
                }
            } catch (err) {
                if (err.message === "QUOTA_EXCEEDED") {
                    const quotaMsg = '⚠️ CẢNH BÁO: API Gemini đã hết hạn mức (Quota Exceeded). Bốt sẽ dùng nội dung gốc để đăng tiếp.';
                    console.log(`[Main] ${quotaMsg}`);
                    logCallback({ type: 'warning', message: quotaMsg, groupUrl });
                } else if (err.message === 'PARAPHRASE_TIMEOUT') {
                    const timeoutMsg = 'Paraphrase quá chậm, bỏ qua để đăng nhanh hơn.';
                    console.log(`[Main] ${timeoutMsg}`);
                    logCallback({ type: 'warning', message: timeoutMsg, groupUrl });
                } else {
                    console.log(`[Main] Dùng nội dung gốc thay thế do paraphrase lỗi: ${err.message}`);
                }
            }

            // Tiến hành đăng bài
            logCallback({ type: 'status', message: `Tiến hành lấy nút đăng bài...`, groupUrl });
            logCallback({
                type: 'info',
                message: `[Main] Chuẩn bị đăng vào ${groupUrl} | ảnh: ${imagePaths.length} | thư mục ảnh: ${mediaDir}`,
                groupUrl
            });
            const POST_TIMEOUT_MS = 180000; // 3 phút tối đa cho 1 nhóm
            let result;
            try {
                result = await Promise.race([
                    automator.postToGroup(groupUrl, finalContent, imagePaths),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('POST_TIMEOUT')), POST_TIMEOUT_MS))
                ]);
            } catch (err) {
                if (err.message === 'POST_TIMEOUT') {
                    result = { success: false, pending: false, reason: 'quá thời gian (3 phút)' };
                    logCallback({ type: 'error', message: `⚠️ CẢNH BÁO: Nhóm ${groupUrl} xử lý quá lâu (hơn 3 phút). Đã bỏ qua.`, groupUrl });
                } else {
                    throw err;
                }
            }

            logCallback({
                type: 'info',
                message: `[Main] Kết quả postToGroup: ${JSON.stringify(result || null)}`,
                groupUrl
            });
            
            if (result && result.success) {
                consecutiveImageUploadFailures = 0;
                
                if (result.pending) {
                    const msg = `[Main] Đăng xong, chờ Facebook phê duyệt. Đã ghi vào lịch sử.`;
                    console.log(msg);
                    logCallback({ type: 'success', message: msg, groupUrl, status: 'pending' });
                } else {
                    const msg = `[Main] Đăng thành công! Đang đợi 3 giây để kiểm tra nhanh trạng thái bài...`;
                    console.log(msg);
                    logCallback({ type: 'info', message: msg, groupUrl });
                    
                    await sleep(QUICK_POST_VERIFY_DELAY_MS);
                    
                    const removedStatus = await automator.checkRemovedContent(groupUrl);
                    if (removedStatus === 'removed_by_link' || removedStatus === 'removed_other') {
                        const reason = removedStatus === 'removed_by_link' ? 'do CHỨA LINK' : 'nghi ngờ vi phạm/spam';
                        const failMsg = `⚠️ PHÁT HIỆN: Bài viết vừa đăng đã bị gỡ thầm lặng (${reason}). Không ghi vào lịch sử.`;
                        console.log(failMsg);
                        logCallback({ type: 'error', message: failMsg, groupUrl });

                        if (!antiLinkGroups.has(groupUrl)) {
                            fs.appendFileSync(antiLinkPath, `${groupUrl}\n`);
                            antiLinkGroups.add(groupUrl);
                        }

                        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|vn|net|org|info|edu|gov)([^\s]*))/gi;
                        const contentNoLink = finalContent.replace(urlRegex, '');
                        
                        const retryResult = await automator.postToGroup(groupUrl, contentNoLink, imagePaths);
                        if (retryResult && retryResult.success) {
                            logCallback({ type: 'success', message: '✅ ĐÃ ĐĂNG LẠI THÀNH CÔNG (Không kèm link).', groupUrl, status: 'published' });
                        } else {
                            logCallback({ type: 'error', message: '❌ Thất bại khi cố gắng đăng lại.', groupUrl });
                        }
                    } else {
                        logCallback({ type: 'success', message: '✅ Bài viết vẫn ổn định (Không bị gỡ).', groupUrl, status: 'published' });
                    }
                }
                
                if (i < targetGroups.length - 1) {
                    const safeDelayMinutes = Math.max(0, Number(delayBetweenPostsMinutes) || 0);
                    const chosenDelayMinutes = safeDelayMinutes > 0
                        ? Math.floor(Math.random() * safeDelayMinutes) + 1
                        : 0;
                    const delayMs = chosenDelayMinutes * 60 * 1000;
                    const msg = `[Scheduler] Đợi ngẫu nhiên ${chosenDelayMinutes} phút trước khi đăng bài tiếp theo...`;
                    console.log(msg);
                    logCallback({ type: 'delay', message: msg, groupUrl });
                    if (delayMs > 0) {
                        await sleep(delayMs);
                    }
                }
            } else {
                if (result && result.reason === 'rejected_link') {
                    const msg = '❌ BỊ TỪ CHỐI: Nhóm này không cho phép đăng Link. Đã lưu vào danh sách hạn chế.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'rejected_link' });
                    
                    if (!antiLinkGroups.has(groupUrl)) {
                        fs.appendFileSync(antiLinkPath, `${groupUrl}\n`);
                        antiLinkGroups.add(groupUrl);
                    }
                } else if (result && result.reason === 'image_upload_failed') {
                    consecutiveImageUploadFailures += 1;
                    const msg = '❌ Upload ảnh chưa thành công. Bot đã dừng trước khi bấm Đăng để tránh bài chỉ có nội dung.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'image_upload_failed' });
                    if (consecutiveImageUploadFailures >= 3) {
                        const stopMsg = 'Dừng batch đăng bài vì upload ảnh thất bại liên tiếp 3 nhóm. Khả năng cao là luồng upload đang lỗi toàn cục.';
                        console.log(`[Main] ${stopMsg}`);
                        logCallback({ type: 'error', message: `[Main] ${stopMsg}`, groupUrl, status: 'stopped_after_repeated_image_failures' });
                        break;
                    }
                } else if (result && result.reason === 'composer_not_found') {
                    consecutiveImageUploadFailures = 0;
                    const msg = '❌ Không tìm thấy ô mở hộp soạn bài trong nhóm.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'composer_not_found' });
                } else if (result && result.reason === 'textbox_not_found') {
                    consecutiveImageUploadFailures = 0;
                    const msg = '❌ Đã mở hộp đăng nhưng không nhập được nội dung vào ô soạn bài.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'textbox_not_found' });
                } else if (result && result.reason === 'submit_button_not_found') {
                    consecutiveImageUploadFailures = 0;
                    const msg = '❌ Không tìm thấy nút Đăng hoặc nút bị khóa quá lâu.';
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'submit_button_not_found' });
                } else {
                    consecutiveImageUploadFailures = 0;
                    const msg = `[Main] Đăng bài thất bại. Lý do: ${result?.reason || 'unknown'}`;
                    console.log(msg);
                    logCallback({ type: 'error', message: msg, groupUrl, status: 'failed' });
                }
            }
        }
        
        const doneMsg = '\n=== Đã hoàn thành tất cả bài đăng! ===';
        console.log(doneMsg);
        logCallback({ type: 'done', message: doneMsg });

    } catch (error) {
        console.error("Lỗi hệ thống:", error);
        logCallback({ type: 'error', message: `Lỗi hệ thống: ${error.message}` });
    } finally {
        // await automator.close();
    }
}

async function main() {
    const fs = require('fs');
    const path = require('path');
    let groups = (process.env.FB_GROUPS || "").split(',').map(g => g.trim()).filter(g => g !== "");
    const extractedPath = path.join(__dirname, 'extracted_groups.txt');
    if (fs.existsSync(extractedPath)) {
        const fileContent = fs.readFileSync(extractedPath, 'utf-8');
        const fileGroups = fileContent.split('\n')
            .map(line => line.replace(/,/g, '').trim())
            .filter(line => line.length > 0 && line.startsWith('http'));
        groups = [...new Set([...groups, ...fileGroups])];
    }
    const limit = parseInt(process.argv[2], 10);
    if (!isNaN(limit) && limit > 0) {
        groups = groups.slice(0, limit);
        console.log(`[Main] Giới hạn chạy: Chỉ xử lý ${limit} nhóm đầu tiên.`);
    }
    await startPosting(groups, (evt) => {});
}

if (require.main === module) {
    main();
}

module.exports = { startPosting };
