const fs = require('fs');
const path = require('path');
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

function normalizeText(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function execGetGroups(primaryContext, keyword = '', logCallback = () => {}, shouldStop = () => false) {
    const normalizedKeyword = normalizeText(keyword);
    logCallback('[FB] Đang quét danh sách nhóm đã tham gia...');
    
    const page = await primaryContext.newPage();
    try {
        await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        let previousCount = 0;
        let sameCountTicks = 0;
        const maxTicks = 10;

        while (true) {
            if (shouldStop()) {
                logCallback('[FB] Đã dừng quét theo yêu cầu.');
                break;
            }

            const currentGroups = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
                const list = [];
                const seen = new Set();
                const cleanText = (v) => (v || '').replace(/\s+/g, ' ').trim();
                const cleanGroupName = (name) => {
                    if (!name) return '';
                    // Tách bỏ phần thông tin bổ sung (thời gian hoạt động, số thành viên, bài viết mới)
                    const splitters = [' Lần hoạt động', ' thành viên', ' member', ' bài viết', ' hoạt động gần đây', ' phút', ' giờ', ' ngày'];
                    let cleaned = name;
                    for (const s of splitters) {
                        const parts = cleaned.split(s);
                        if (parts.length > 1) cleaned = parts[0];
                    }
                    return cleaned.trim();
                };
                
                for (const a of anchors) {
                    const href = a.getAttribute('href') || '';
                    if (!href) continue;
                    const url = new URL(href, location.origin).href.split('?')[0];
                    const match = url.match(/facebook\.com\/groups\/([^/?#]+)/i);
                    if (!match) continue;
                    const id = match[1];
                    if (['feed', 'joins', 'discover', 'search', 'create', 'notifications'].includes(id.toLowerCase())) continue;
                    
                    if (seen.has(url)) continue;
                    seen.add(url);
                    
                    const rawName = cleanText(a.innerText) || cleanText(a.getAttribute('aria-label')) || id;
                    const name = cleanGroupName(rawName);
                    
                    list.push({ id, name, url, lastPostStatus: 'Sẵn sàng', isSelectable: true });
                }
                return list;
            });

            if (currentGroups.length === previousCount) {
                sameCountTicks++;
                if (sameCountTicks >= maxTicks) break;
            } else {
                sameCountTicks = 0;
                previousCount = currentGroups.length;
                logCallback(`[FB] Đã tìm thấy ${currentGroups.length} nhóm...`);
            }

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);
            
            // Emit found groups
            for (const g of currentGroups) {
                if (normalizedKeyword && !normalizeText(g.name).includes(normalizedKeyword)) continue;
                logCallback(`[FB_EVENT] ${JSON.stringify({ type: 'group_found', group: g })}`);
            }
        }
    } catch (e) {
        logCallback(`[FB] Lỗi khi quét nhôm: ${e.message}`);
    } finally {
        await page.close();
    }
}

module.exports = { execGetGroups };
