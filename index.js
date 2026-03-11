require('dotenv').config();
const FBAutomator = require('./fb_automator');
const { paraphrase } = require('./paraphraser');
const { sleep, randomDelay } = require('./scheduler');

async function startPosting(targetGroups, logCallback = () => {}, browserContext = null) {
    const fs = require('fs');
    const path = require('path');
    
    // Đọc nội dung từ file content.txt
    const contentPath = path.join(__dirname, 'content.txt');
    let baseContent = '';
    if (fs.existsSync(contentPath)) {
        baseContent = fs.readFileSync(contentPath, 'utf-8').trim();
    } else {
        const err = '[Main] Lỗi: Không tìm thấy file content.txt';
        console.error(err);
        logCallback({ type: 'error', message: err });
        return;
    }

    if (!targetGroups || targetGroups.length === 0 || !baseContent) {
        const err = "Lỗi: Không có danh sách nhóm hoặc file content.txt trống.";
        console.error(err);
        logCallback({ type: 'error', message: err });
        return;
    }

    const automator = new FBAutomator();
    
    try {
        logCallback({ type: 'info', message: 'Khởi tạo trình duyệt...' });
        await automator.init(browserContext);
        logCallback({ type: 'info', message: 'Kiểm tra đăng nhập...' });
        await automator.login();

        const fs = require('fs');
        const path = require('path');
        // Sử dụng thư mục người dùng đã chỉ định trên Desktop
        const os = require('os');
        const mediaDir = path.join(os.homedir(), 'Desktop', 'Mẫu nhà 2026');
        let imagePaths = [];
        if (fs.existsSync(mediaDir)) {
            imagePaths = fs.readdirSync(mediaDir)
                .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
                .map(file => path.join(mediaDir, file));
            const msg = `[Main] Đã tìm thấy ${imagePaths.length} ảnh trong thư mục ${mediaDir}`;
            console.log(msg);
            logCallback({ type: 'info', message: msg });
        } else {
            const msg = `[Main] Không tìm thấy thư mục ảnh: ${mediaDir}`;
            console.log(msg);
            logCallback({ type: 'warning', message: msg });
        }

        const fbUserId = process.env.FB_USER_ID;

        for (let i = 0; i < targetGroups.length; i++) {
            let groupObj = targetGroups[i];
            let groupUrl = typeof groupObj === 'string' ? groupObj.trim() : groupObj.url.trim();

            const headerMsg = `\n--- [Đang xử lý ${i + 1}/${targetGroups.length}] ---`;
            console.log(headerMsg);
            logCallback({ type: 'progress', message: `Đang xử lý ${i + 1}/${targetGroups.length}: ${groupUrl}`, groupUrl });
            
            // Xử lý nội dung (paraphrase nếu được chọn)
            console.log(`[Main] Đang chuẩn bị nội dung cho nhóm: ${groupUrl}`);
            let finalContent = baseContent;
            
            try {
                const rewritten = await paraphrase(baseContent);
                if (rewritten && rewritten.trim() !== "") {
                    finalContent = rewritten;
                    console.log(`[Main] Nội dung đã rewrite:\n"${finalContent}"`);
                } else {
                    console.log('[Main] Rewrite rỗng, dùng nội dung gốc.');
                }
            } catch (err) {
                console.log(`[Main] Dùng nội dung gốc thay thế do paraphrase lỗi.`);
            }

            // Tiến hành đăng bài
            logCallback({ type: 'status', message: `Tiến hành lấy nút đăng bài...`, groupUrl });
            // Override console.log temporarily inside automator? Actually just let it print to console.
            const result = await automator.postToGroup(groupUrl, finalContent, imagePaths);
            
            if (result && result.success) {
                // Ghi vào file lịch sử để công cụ get_groups không lấy lại, kèm thời gian đăng
                const historyPath = path.join(__dirname, 'posted_history.txt');
                const timestamp = Date.now();
                fs.appendFileSync(historyPath, `${groupUrl}|${timestamp}\n`);
                
                if (result.pending) {
                    const msg = `[Main] Đăng xong, Facebook báo ĐANG CHỜ PHÊ DUYỆT ngay lập tức.`;
                    console.log(msg);
                    logCallback({ type: 'success', message: msg, groupUrl, status: 'pending' });
                } else if (fbUserId) {
                    // Kiểm tra URL nhóm / user
                    // await automator.verifyPost(groupUrl, fbUserId, finalContent);
                    logCallback({ type: 'success', message: 'Đăng thành công!', groupUrl, status: 'published' });
                } else {
                    const msg = `[Main] Đăng thành công (Chưa có tính năng verify vì thiếu FB_USER_ID).`;
                    console.log(msg);
                    logCallback({ type: 'success', message: msg, groupUrl, status: 'published' });
                }
                
                // Nghỉ ngơi giữa các nhóm nếu không phải nhóm cuối cùng
                if (i < targetGroups.length - 1) {
                    const minMin = 1;
                    const maxMin = 3;
                    const delayMs = Math.floor(Math.random() * (maxMin - minMin + 1) + minMin) * 60 * 1000;
                    const delayMinutes = (delayMs / 60000).toFixed(0);
                    const msg = `[Scheduler] Đợi ${delayMinutes} phút trước khi đăng bài tiếp theo để tránh spam...`;
                    console.log(msg);
                    logCallback({ type: 'delay', message: msg, groupUrl });
                    await sleep(delayMs);
                }
            } else {
                const msg = '[Main] Đăng bài thất bại.';
                console.log(msg);
                logCallback({ type: 'error', message: msg, groupUrl, status: 'failed' });
            }
        }
        
        const doneMsg = '\n=== Đã hoàn thành tất cả bài đăng! ===';
        console.log(doneMsg);
        logCallback({ type: 'done', message: doneMsg });

    } catch (error) {
        console.error("Lỗi hệ thống:", error);
        logCallback({ type: 'error', message: `Lỗi hệ thống: ${error.message}` });
    } finally {
        // Chỉ đóng trang hiện tại, không đóng context dùng chung
        await automator.close();
    }
}

// Giữ nguyên tính năng chạy từ dòng lệnh để tương thích ngược
async function main() {
    const fs = require('fs');
    const path = require('path');
    let groups = (process.env.FB_GROUPS || "").split(',').map(g => g.trim()).filter(g => g !== "");
    
    const extractedPath = path.join(__dirname, 'extracted_groups.txt');
    if (fs.existsSync(extractedPath)) {
        const fileContent = fs.readFileSync(extractedPath, 'utf-8');
        const fileGroups = fileContent.split('\n')
            .map(line => line.replace(/,/g, '').trim()) // Xóa dấu phẩy và khoảng trắng thừa
            .filter(line => line.length > 0 && line.startsWith('http'));
        groups = [...new Set([...groups, ...fileGroups])];
    }
    
    const limit = parseInt(process.argv[2], 10);
    if (!isNaN(limit) && limit > 0) {
        groups = groups.slice(0, limit);
        console.log(`[Main] Giới hạn chạy: Chỉ xử lý ${limit} nhóm đầu tiên.`);
    }
    
    await startPosting(groups, (evt) => {
        // Log event cho UI nếu chạy độc lập thì không cần làm gì
    });
}

if (require.main === module) {
    main();
}

module.exports = { startPosting };
