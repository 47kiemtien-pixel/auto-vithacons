const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { startPosting } = require('./index.js');
const { execGetGroups } = require('./get_groups.js');
const { execDiscoverGroups, execJoinGroup } = require('./discover_groups.js');
const browserManager = require('./browser_manager.js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

let isPosting = false;
let isScanning = false;
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
    isScanning = true;
    const keyword = req.body.keyword || '';
    broadcastLog({ type: 'info', message: `Bắt đầu quét nhóm đã tham gia với từ khóa: "${keyword}"` });
    
    try {
        const context = await browserManager.getContext();
        execGetGroups(context, keyword, (msg) => {
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        broadcastLog(event);
                    } catch(e) {}
                } else {
                    broadcastLog({ type: 'info', message: msg });
                }
            }
        }).then(() => {
            isScanning = false;
            broadcastLog({ type: 'done', message: 'Đã hoàn thành quét nhóm đã tham gia.' });
        }).catch(err => {
            isScanning = false;
            broadcastLog({ type: 'error', message: `Lỗi quét nhóm: ${err.message}` });
        });
        
        res.json({ success: true, message: 'Tiến trình quét đang chạy ngầm...' });
    } catch(e) {
        isScanning = false;
        res.status(500).json({ error: 'Không thể khởi tạo trình duyệt', details: e.message });
    }
});

// API Khám phá nhóm mới (Chưa tham gia)
app.post('/api/discover-groups', async (req, res) => {
    const keyword = req.body.keyword || '';
    broadcastLog({ type: 'info', message: `Bắt đầu khám phá nhóm mới với từ khóa: "${keyword}"` });
    
    try {
        const context = await browserManager.getContext();
        execDiscoverGroups(context, keyword, (msg) => {
            if (typeof msg === 'string') {
                if (msg.startsWith('[FB_EVENT] ')) {
                    try {
                        const event = JSON.parse(msg.substring(11));
                        broadcastLog(event);
                    } catch(e) {}
                } else {
                    broadcastLog({ type: 'info', message: msg });
                }
            }
        }).then((groups) => {
            broadcastLog({ type: 'done', message: `Đã hoàn thành khám phá nhóm. Tìm thấy ${groups.length} nhóm.` });
        }).catch(err => {
            broadcastLog({ type: 'error', message: `Lỗi khám phá nhóm: ${err.message}` });
        });
        
        res.json({ success: true, message: 'Tiến trình khám phá đang chạy ngầm...' });
    } catch(e) {
        res.status(500).json({ error: 'Lỗi khởi tạo', details: e.message });
    }
});

// API Gia nhập nhóm
app.post('/api/join-group', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu URL nhóm' });

    broadcastLog({ type: 'info', message: `Yêu cầu gia nhập nhóm: ${url}` });

    try {
        const context = await browserManager.getContext();
        const success = await execJoinGroup(context, url, (msg) => {
            broadcastLog({ type: 'info', message: msg });
        });
        res.json({ success });
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi khi gia nhập nhóm: ${e.message}` });
        res.status(500).json({ error: e.message });
    }
});

// API Đăng bài
app.post('/api/post', async (req, res) => {
    const { groups } = req.body;
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
        return res.status(400).json({ error: 'Vui lòng cung cấp danh sách nhóm cần đăng.' });
    }

    isPosting = true;
    res.json({ success: true, message: 'Đã bắt đầu tiến trình đăng bài' });
    broadcastLog({ type: 'start', message: `Tiến trình đăng bài bắt đầu với ${groups.length} nhóm` });

    try {
        const context = await browserManager.getContext();
        await startPosting(groups, (event) => {
            broadcastLog(event);
        }, context);
    } catch (e) {
        broadcastLog({ type: 'error', message: `Lỗi nội bộ: ${e.message}` });
    } finally {
        isPosting = false;
        broadcastLog({ type: 'done', message: 'Tất cả tiến trình đã kết thúc.' });
    }
});

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

app.listen(PORT, () => {
    console.log(`[Server] API đang chạy tại http://localhost:${PORT}`);
});
