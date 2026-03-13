require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function paraphrase(content) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `NHIỆM VỤ: Chỉ điều chỉnh tối thiểu nội dung sau (thay đổi tối đa 1-3 từ đồng nghĩa đơn giản) và THÊM 3-5 hashtag liên quan ở cuối bài.
        
        QUY TẮC CỨNG:
        1. SỬ DỤNG NGÔN NGỮ CHUYÊN NGHIỆP: Sử dụng hệ từ vựng ngành kiến trúc/xây dựng.
        2. KHÔNG được thay đổi cấu trúc câu.
        3. KHÔNG được thêm bớt thông tin.
        4. GIỮ NGUYÊN số điện thoại, link, thông số.
        5. Tỉ lệ giống bản gốc phải đạt trên 98%.
        6. Thêm 3-5 hashtag ở cuối.
        7. Chỉ trả về văn bản đã chỉnh sửa.

        Nội dung gốc:
        ${content}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        if (error.status === 429 || error.message.includes('429')) {
            throw new Error("QUOTA_EXCEEDED");
        }
        console.error("Lỗi khi paraphrase:", error);
        return content;
    }
}

module.exports = { paraphrase };
