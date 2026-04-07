require('dotenv').config();
const { paraphrase } = require('./paraphraser');

async function testParaphrase() {
    const testContent = "Cần bán nhà lầu 2 tấm, diện tích 100m2, giá 2 tỷ. Liên hệ 0901234567.";
    console.log(`[Test] Nội dung gốc: ${testContent}`);
    console.log('[Test] Đang gọi paraphrase...');
    
    // Gọi hàm và đo thời gian
    const start = Date.now();
    const result = await paraphrase(testContent);
    const end = Date.now();
    
    console.log(`[Test] Thời gian phản hồi: ${end - start}ms`);
    console.log(`[Test] Kết quả nhận được:\n"${result}"`);
    
    if (result === testContent) {
        console.log('[Test] CHÚ Ý: Kết quả giống hệt bản gốc.');
    } else {
        console.log('[Test] THÀNH CÔNG: Nội dung đã được AI thay đổi!');
    }
}

testParaphrase();
