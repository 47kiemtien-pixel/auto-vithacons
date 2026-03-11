require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(bodyParser.json());

// Endpoint kiểm tra server
app.get('/', (req, res) => {
    res.send('Vithacon AI Chatbot Server is running on i5-4590!');
});

// Cấu hình OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Các biến môi trường cho Facebook Messenger
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const PROMPT_ID = process.env.OPENAI_PROMPT_ID;

// Map để lưu trữ conversation_id cho từng người dùng (sender_psid)
// Trong thực tế nên dùng database (Redis/MongoDB) để lưu trữ lâu dài
const userConversations = new Map();

// Endpoint xác thực Webhook với Facebook
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// Endpoint nhận tin nhắn từ Messenger
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry) => {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                await handleMessage(sender_psid, webhook_event.message.text);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// Hàm xử lý tin nhắn và phản hồi bằng AI (Sử dụng Responses API)
async function handleMessage(sender_psid, received_message) {
    console.log(`Đang xử lý tin nhắn từ ${sender_psid}: ${received_message}`);

    try {
        let conversation_id = userConversations.get(sender_psid);

        // 1. Tạo conversation mới nếu chưa có
        if (!conversation_id) {
            const conversation = await openai.conversations.create();
            conversation_id = conversation.id;
            userConversations.set(sender_psid, conversation_id);
        }

        // 2. Gửi tin nhắn và nhận phản hồi ngay lập tức với Responses API
        const response = await openai.responses.create({
            prompt: { id: PROMPT_ID },
            conversation_id: conversation_id,
            input: [{
                role: "user",
                content: received_message
            }]
        });

        // 3. Trích xuất nội dung trả lời
        const ai_text = response.output_text || "Tôi đã nhận được thông tin, vui lòng chờ trong giây lát.";

        // 4. Gửi tin nhắn trả lời lại cho Facebook
        await callSendAPI(sender_psid, ai_text);

    } catch (error) {
        console.error("Lỗi khi gọi OpenAI Responses API:", error);
        await callSendAPI(sender_psid, "Xin lỗi, tôi đang gặp chút sự cố kỹ thuật. Bạn vui lòng thử lại sau hoặc gọi hotline 0972 524 799 nhé!");
    }
}

// Hàm gọi Facebook Graph API để gửi tin nhắn
async function callSendAPI(sender_psid, response_text) {
    const request_body = {
        "recipient": { "id": sender_psid },
        "message": { "text": response_text }
    };

    try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
        console.log('Tin nhắn đã được gửi!');
    } catch (error) {
        console.error('Lỗi khi gửi tin nhắn cho Facebook:', error.response.data);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server đang chạy tại port ${PORT}`));
