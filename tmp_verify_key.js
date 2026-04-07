require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function checkApiKey() {
    console.log(`[Verify] Key: ${process.env.GEMINI_API_KEY ? 'Present' : 'MISSING'}`);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        console.log('[Verify] Đang thử kết nối để lấy danh sách model...');
        // Google Generative AI Node SDK doesn't have a simple "listModels" on the main object 
        // in the way I expect for a quick ping. 
        // Let's just try to call a simple model.
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("hello");
        console.log('[Verify] KẾT QUẢ OK:', result.response.text());
    } catch (e) {
        console.error('[Verify] LỖI:', e);
    }
}

checkApiKey();
