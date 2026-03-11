function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tạo độ trễ ngẫu nhiên giữa min và max (phút)
 */
async function randomDelay(minMinutes, maxMinutes) {
    const delayMs = Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes) * 60 * 1000;
    const minutes = (delayMs / 60000).toFixed(1);
    console.log(`[Scheduler] Đợi ${minutes} phút trước khi đăng bài tiếp theo...`);
    await sleep(delayMs);
}

module.exports = { randomDelay, sleep };
