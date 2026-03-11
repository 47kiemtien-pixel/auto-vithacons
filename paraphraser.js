require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function paraphrase(content) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const postBoxSelectors = [
            'div[role="button"] span:has-text("Bạn đang nghĩ gì?")',
            'div[role="button"] span:has-text("Viết nội dung nào đó...")',
            'div[role="button"]:has-text("Bạn đang nghĩ gì?")',
            'div[role="button"]:has-text("Write something...")',
            'div[role="button"]:has-text("Tạo một bài viết công khai...")',
            'div[role="button"]:has-text("Create a public post...")',
            '[aria-label="Bạn đang nghĩ gì?"]',
            '[aria-label="What\'s on your mind?"]',
            '[role="main"] [role="button"]' // General fallback in main area
        ];
        const prompt = `Hãy viết lại nội dung sau đây để đăng lên Facebook sao cho tự nhiên, thu hút và tránh bị hệ thống quét spam. 
        Giữ nguyên ý nghĩa chính và các thông tin quan trọng. 
        Chỉ trả về nội dung đã viết lại, không thêm lời dẫn giải.
        
        Nội dung gốc:
        ${content}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Lỗi khi paraphrase:", error);
        return content; // Trả về nội dung gốc nếu lỗi
    }
}

module.exports = { paraphrase };
