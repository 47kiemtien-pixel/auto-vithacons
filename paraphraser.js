require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function paraphrase(content) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `NHIỆM VỤ: Chỉ điều chỉnh tối thiểu nội dung sau (thay đổi tối đa 1-3 từ đồng nghĩa đơn giản) và THÊM 3-5 hashtag liên quan ở cuối bài.
        
        QUY TẮC CỨNG:
        1. KHÔNG được thay đổi cấu trúc câu. Giữ nguyên 100% thứ tự các câu.
        2. KHÔNG được thêm bớt thông tin trong phần nội dung chính.
        3. GIỮ NGUYÊN tất cả số điện thoại, link, và thông số kỹ thuật.
        4. Tỉ lệ giống bản gốc phải đạt trên 98%.
        5. Tự động thêm 3-5 hashtag liên quan ở cuối bài (Vd: #xaydung #vithacons #nhaon...).
        6. Chỉ trả về văn bản đã chỉnh sửa kèm hashtag, không có lời dẫn.

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
