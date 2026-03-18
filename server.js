const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { startPosting } = require('./index.js');
const { execGetGroups } = require('./get_groups.js'); // Keep this line
const { execDiscoverGroups, execJoinGroup } = require('./discover_groups'); // Changed from .js
const browserManager = require('./browser_manager'); // Changed from .js
const FBAutomator = require('./fb_automator'); // Added
const dotenv = require('dotenv'); // Added

const app = express();
app.use(cors());
app.use(express.json());
// Middleware xử lý lỗi JSON parse để tránh crash server
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('[Server] Lỗi JSON body không hợp lệ:', err.message);
        return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
    }
    next();
});

const PORT = 3001;

let isPosting = false;
let isScanning = false;
let isDiscovering = false;
let activeClients = [];

// API Lấy danh sách nhóm đã tham gia (lưu trong file)
app.get('/api/groups', (req, res) => {
    const dataPath = path.join(__dirname, 'groups_data.json');
    if (fs.existsSync(dataPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Lỗi parse file JSON data', details: e.message });
        }
    } else {
        res.json([]);
    }
});

// API Quét danh sách nhóm đã tham gia từ FB
app.post('/api/fetch-groups', async (req, res) => {
    // Cho phép chạy song song với các tiến trình khác
    isScanning = true;
    const keyword = req.body.keyword || '';
    broadcastLog({ type: 'info', message: `Bắt đầu quét nhóm đã tham gia với từ khóa: "${keyword}"`, source: 'scanning' });
    
    try {
        const context = await browserManager.getContext();
        execGetGroups(context, keyword, (msg) => {
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        broadcastLog({ ...event, source: 'scanning' });
                    } catch(e) {}
                } else {
                    broadcastLog({ type: 'info', message: msg, source: 'scanning' });
                }
            }
        }).then(() => {
            isScanning = false;
            broadcastLog({ type: 'done', message: 'Đã hoàn thành quét nhóm đã tham gia.', source: 'scanning' });
        }).catch(err => {
            isScanning = false;
            broadcastLog({ type: 'error', message: `Lỗi quét nhóm: ${err.message}`, source: 'scanning' });
        });
        
        res.json({ success: true, message: 'Tiến trình quét đang chạy ngầm...' });
    } catch(e) {
        isScanning = false;
        res.status(500).json({ error: 'Không thể khởi tạo trình duyệt', details: e.message });
    }
});

// API Khám phá nhóm mới (Chưa tham gia)
app.post('/api/discover-groups', (req, res) => {
    const keyword = req.body.keyword || '';
    const autoJoin = req.body.autoJoin === true || req.body.autoJoin === 'true';
    
    console.log(`[API] Khởi chạy Khám phá nhóm: ${keyword}, AutoJoin=${autoJoin}`);
    runDiscoveryProcess(keyword, autoJoin);
    
    res.json({ success: true, message: 'Tiến trình khám phá đã bắt đầu và đang chạy ngầm...' });
});

// API Gia nhập nhóm
app.post('/api/join-group', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu' });
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu URL nhóm' });

    broadcastLog({ type: 'info', message: `Yêu cầu gia nhập nhóm: ${url}` });

    try {
        const context = await browserManager.getContext();
        const success = await execJoinGroup(context, url, (msg) => {
            broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        res.json({ success });
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi khi gia nhập nhóm: ${e.message}` });
        res.status(500).json({ error: e.message });
    }
});

// API Đăng bài
app.post('/api/post', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu' });
    const { groups, postContent, imageFolderPath } = req.body;
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
        return res.status(400).json({ error: 'Vui lòng cung cấp danh sách nhóm cần đăng.' });
    }

    // Cho phép chạy song song với Discovery/Scanning
    isPosting = true;
    res.json({ success: true, message: 'Đã bắt đầu tiến trình đăng bài' });
    broadcastLog({ type: 'start', message: `Tiến trình đăng bài bắt đầu với ${groups.length} nhóm`, source: 'posting' });

    try {
        const context = await browserManager.getContext();
        await startPosting(groups, (event) => {
            broadcastLog({ ...event, source: 'posting' });
            
            // Nếu đăng thành công, cập nhật trạng thái ngay lập tức vào file và danh sách hiện tại
            if (event.type === 'success' && event.groupUrl) {
                updateGroupStatusLocally(event.groupUrl, event.status === 'pending' ? 'Chờ phê duyệt' : 'Đã đăng');
            }
        }, context, postContent, imageFolderPath);
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi nội bộ: ${e.message}`, source: 'posting' });
    } finally {
        isPosting = false;
        broadcastLog({ type: 'done', message: 'Tất cả tiến trình đã kết thúc.', source: 'posting' });
    }
});

// Hàm cập nhật trạng thái nhóm cục bộ mà không cần quét lại
function updateGroupStatusLocally(groupUrl, statusText) {
    const dataPath = path.join(__dirname, 'groups_data.json');
    if (fs.existsSync(dataPath)) {
        try {
            let data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
            let found = false;
            data = data.map(g => {
                if (g.url === groupUrl) {
                    g.isSelectable = false;
                    g.lastPostStatus = statusText;
                    found = true;
                }
                return g;
            });
            if (found) {
                fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
                // Thông báo cho UI cập nhật dòng đó ngay lập tức
                broadcastLog({ 
                    type: 'group_found', 
                    group: data.find(g => g.url === groupUrl), 
                    source: 'scanning' // UI thường nghe source này để cập nhật list
                });
            }
        } catch (e) {
            console.error('[Server] Lỗi cập nhật status cục bộ:', e);
        }
    }
}

// Broadcast sự kiện tới toàn bộ client SSE
function broadcastLog(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    activeClients.forEach(client => {
        try {
            client.res.write(payload);
        } catch (e) {}
    });
}

// SSE Endpoint cho Logs
app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Đã kết nối luồng Log.' })}\n\n`);

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    activeClients.push(newClient);

    req.on('close', () => {
        activeClients = activeClients.filter(c => c.id !== clientId);
    });
});

// --- TỰ ĐỘNG KHÁM PHÁ (AUTO-DISCOVERY) ---
// Chạy ngầm mỗi 2 giờ nếu được bật
let autoDiscoveryInterval = null;
function startAutoDiscovery() {
    if (autoDiscoveryInterval) return;
    console.log('[AutoDisc] Khởi tạo luồng Tự động khám phá (lặp lại sau 2 giờ)...');
    autoDiscoveryInterval = setInterval(() => {
        if (!isDiscovering) { // Chỉ kiểm tra nếu chưa có Discovery nào khác ĐANG CHẠY. Có thể chạy cùng lúc với Posting.
            const defaultKeyword = 'việc làm thiết kế nội thất'; // Có thể lấy từ config
            console.log(`[AutoDisc] Đang tự động chạy khám phá với từ khóa: ${defaultKeyword}`);
            runDiscoveryProcess(defaultKeyword, true); 
        }
    }, 2 * 60 * 60 * 1000); 
}

// Hàm chạy discovery tập trung để dùng chung cho API và Auto
async function runDiscoveryProcess(keyword, autoJoin = false) {
    if (isDiscovering) return;
    isDiscovering = true;
    broadcastLog({ type: 'info', message: `🔍 Bắt đầu tiến trình khám phá nhóm: "${keyword}"`, source: 'discovery' });
    
    try {
        console.log(`[Server] Đang kiểm tra đăng nhập trước khi khám phá...`);
        const context = await browserManager.getContext();
        
        // Đảm bảo người dùng đã đăng nhập
        const automator = new FBAutomator((msg) => {
            broadcastLog({ type: 'info', message: msg, source: 'discovery' });
        });
        await automator.init(context);
        await automator.login(); // Đợi đăng nhập tối đa 10 phút
        
        const groups = await execDiscoverGroups(context, keyword, (msg) => {
            console.log(`[Discovery Log] ${msg}`);
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        broadcastLog({ ...event, source: 'discovery' });
                    } catch(e) {}
                } else {
                    broadcastLog({ type: 'info', message: msg, source: 'discovery' });
                }
            }
        });

        if (autoJoin && groups.length > 0) {
            const joinable = groups.filter(g => g.canJoin && !g.isJoined);
            broadcastLog({ type: 'info', message: `[Discovery] Tìm thấy ${groups.length} nhóm. Tiến hành Tham gia ${joinable.length} nhóm...`, source: 'discovery' });
            
            for (let i = 0; i < joinable.length; i++) {
                const g = joinable[i];
                broadcastLog({ type: 'info', message: `[Discovery] Đang tham gia nhóm (${i+1}/${joinable.length}): ${g.name}`, source: 'discovery' });
                const success = await execJoinGroup(context, g.url, (msg) => {
                    broadcastLog({ type: 'info', message: msg, source: 'discovery' });
                });
                
                if (success) {
                    broadcastLog({ type: 'group_discovered', group: { ...g, isJoined: true, canJoin: false }, source: 'discovery' });
                }

                if (i < joinable.length - 1) {
                    const delaySec = Math.floor(Math.random() * (10 - 5 + 1) + 5);
                    await new Promise(r => setTimeout(r, delaySec * 1000));
                }
            }
        }
        broadcastLog({ type: 'done', message: 'Hoàn thành tiến trình khám phá.', source: 'discovery' });
    } catch (err) {
        console.error('[Discovery Error]', err);
        broadcastLog({ type: 'error', message: `Lỗi khám phá: ${err.message}`, source: 'discovery' });
    } finally {
        isDiscovering = false;
    }
}

app.listen(PORT, () => {
    console.log(`[Server] API đang chạy tại http://localhost:${PORT}`);
    // Kích hoạt tự động khám phá khi khởi động server
    startAutoDiscovery();
});
