require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function paraphrase(content) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `Hãy điều chỉnh cực kỳ ít nội dung sau đây (chỉ thay đổi 1-2 từ đồng nghĩa hoặc đảo nhẹ cấu trúc câu) để tránh bị Facebook quét spam, nhưng phải GIỮ NGUYÊN 95% văn bản gốc và không được làm thay đổi phong cách viết hay ý nghĩa. 
        
        Yêu cầu:
        1. Thay đổi ít nhất có thể.
        2. Giữ nguyên các thông tin liên hệ, link, hoặc thông số kỹ thuật.
        3. Chỉ trả về nội dung đã điều chỉnh, không thêm lời dẫn.

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
