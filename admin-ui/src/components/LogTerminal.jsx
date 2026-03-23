import React, { useEffect, useRef } from 'react';
import { Icon } from './Icon';

const LogTerminal = ({ logs, onClear }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const cleanMojibake = (str) => {
    if (typeof str !== 'string') return str;
    
    // 1. Dùng TextDecoder để "giải mã" chuỗi bị sai định dạng (Double-encoded UTF-8)
    try {
        const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)));
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        // Nếu có chứa các dấu tiếng Việt phổ biến thì ổn
        if (/[àáảãạăâêôơưđĐ]/.test(decoded)) return decoded;
    } catch (e) {}

    // 2. Dự phòng: Bản đồ thay thế thủ công nếu TextDecoder không xử lý hết
    const replacements = {
        'Ã ': 'à', 'Ã¡': 'á', 'áº£': 'ả', 'Ã£': 'ã', 'áº¡': 'ạ',
        'Äƒ': 'ă', 'áº±': 'ằ', 'áº¯': 'ắ', 'áº³': 'ẳ', 'áºµ': 'ẵ', 'áº·': 'ặ',
        'Ã¢': 'â', 'áº§': 'ầ', 'áº¥': 'ấ', 'áº©': 'ẩ', 'áº«': 'ẫ', 'áº­': 'ậ',
        'Ã¨': 'è', 'Ã©': 'é', 'áº½': 'ẽ', 'áº¹': 'ẹ', 'á»ƒ': 'ẻ',
        'Ãª': 'ê', 'á» ': 'ề', 'áº¿': 'ế', 'á»ƒ': 'ể', 'á»…': 'ễ', 'á»‡': 'ệ',
        'Ã¬': 'ì', 'Ã­': 'í', 'á»‰': 'ỉ', 'Ä©': 'ĩ', 'á»‹': 'ị',
        'Ã²': 'ò', 'Ã³': 'ó', 'á» ': 'ỏ', 'Ãµ': 'õ', 'á» ': 'ọ',
        'Ã´': 'ô', 'á»“': 'ồ', 'á»‘': 'ố', 'á»•': 'ổ', 'á»—': 'ỗ', 'á»™': 'ộ',
        'Æ¡': 'ơ', 'á» ': 'ờ', 'á»›': 'ớ', 'á»Ÿ': 'ở', 'á»¡': 'ỡ', 'á»£': 'ợ',
        'Ã¹': 'ù', 'Ãº': 'ú', 'á»§': 'ủ', 'Å©': 'ũ', 'á»¥': 'ụ',
        'Æ°': 'ư', 'á»«': 'ừ', 'á»©': 'ứ', 'á»­': 'ử', 'á»¯': 'ữ', 'á»±': 'ự',
        'á»³': 'ỳ', 'Ã½': 'ý', 'á»·': 'ỷ', 'á»¹': 'ỹ', 'á»µ': 'ỵ',
        'Ä‘': 'đ', 'Ä ': 'Đ', 'Ä Ã£': 'Đã'
    };
    
    let out = str;
    // Sắp xếp các key dài nhất lên trước để tránh thay thế cục bộ sai
    const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        out = out.split(key).join(replacements[key]);
    }
    return out;
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'error': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'success': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'delay': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'done': return 'text-purple-500 bg-purple-500/10 border-purple-500/20 font-bold';
      case 'start': return 'text-sky-500 bg-sky-500/10 border-sky-500/20 font-bold';
      default: return 'text-slate-500 bg-slate-400/5 border-slate-400/10';
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral text-neutral-content rounded-3xl shadow-2xl overflow-hidden border border-neutral-focus">
      <div className="flex items-center justify-between px-6 py-4 bg-black/20 border-b border-white/5">
        <div className="flex items-center gap-3 text-xs font-black tracking-[0.15em] opacity-50">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          <span>HOẠT ĐỘNG HỆ THỐNG</span>
        </div>
        <button 
          onClick={onClear}
          className="btn btn-ghost btn-xs rounded-lg text-[10px] font-black tracking-widest opacity-60 hover:opacity-100"
        >
          XÓA NHẬT KÝ
        </button>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 terminal-scroll font-mono text-[13px] scroll-smooth"
      >
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40 space-y-3">
            <Icon.Terminal />
            <span className="text-xs font-medium tracking-wide">Đang chờ tín hiệu hệ thống...</span>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`flex items-start gap-3 p-2 rounded-lg border transition-all animate-in fade-in slide-in-from-left-2 duration-300 ${getLogColor(log.type)}`}>
              <span className="text-[10px] opacity-50 mt-1 font-sans shrink-0">
                {new Date().toLocaleTimeString('vi-VN', { hour12: false })}
              </span>
              <div className="break-words leading-relaxed whitespace-pre-wrap">
                {typeof log.message === 'string' 
                   ? cleanMojibake(log.message) 
                   : cleanMojibake(JSON.stringify(log.message, null, 2))
                }
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogTerminal;
