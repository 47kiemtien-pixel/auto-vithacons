import React from 'react';
import { Icon } from './Icon';

const SuccessList = ({ groups, onClear }) => {
  return (
    <div className="flex flex-col h-full bg-base-100 rounded-3xl shadow-xl overflow-hidden border border-base-content/5">
      <div className="flex items-center justify-between px-6 py-4 bg-success/5 border-b border-success/10">
        <div className="flex items-center gap-3 text-xs font-black text-success tracking-[0.15em]">
          <Icon.Check />
          <span>BÀI ĐÃ ĐĂNG ({groups.length})</span>
        </div>
        {groups.length > 0 && (
          <button 
            onClick={onClear}
            className="btn btn-ghost btn-xs rounded-lg text-[10px] font-black tracking-widest text-success/70 hover:text-success"
          >
            Dọn dẹp
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 terminal-scroll">
        {groups.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50 space-y-2">
            <Icon.Check />
            <span className="text-xs italic text-center">Chưa có bài đăng nào thành công.</span>
          </div>
        ) : (
          groups.map((item, i) => {
            const isPending = item.status === 'pending';
            const url = typeof item === 'string' ? item : item.url;
            return (
              <div key={url} className={`p-3 border rounded-xl flex items-center justify-between gap-3 animate-in zoom-in-95 duration-300 ${
                isPending ? 'bg-amber-500/5 border-amber-500/10' : 'bg-emerald-500/5 border-emerald-500/10'
              }`}>
                 <div className="flex items-center gap-3 truncate">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] shrink-0 ${
                      isPending ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}>
                      {isPending ? <Icon.Alert size={12} /> : <Icon.Check size={12} />}
                    </div>
                    <div className="truncate leading-tight">
                      <p className={`text-xs font-bold truncate capitalize ${
                        isPending ? 'text-amber-600' : 'text-emerald-500'
                      }`}>
                        {isPending ? 'Chờ duyệt' : 'Thành công'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{url}</p>
                    </div>
                 </div>
                 <a 
                   href={url} 
                   target="_blank" 
                   rel="noreferrer" 
                   className={`p-2 rounded-lg border transition-all ${
                     isPending ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20'
                   }`}
                 >
                   <Icon.Globe />
                 </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SuccessList;
