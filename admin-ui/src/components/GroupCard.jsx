import React from 'react';
import { Icon } from './Icon';

const GroupCard = ({ group, isSelected, onToggle, isSuccess }) => {
  const isRecent = group.isSelectable === false;

  const getStatusColor = () => {
    if (isSuccess) return 'alert alert-success !bg-success/10 !border-success/20';
    if (group.lastPostStatus === 'Không có bài viết') return 'alert alert-error !bg-error/10 !border-error/20';
    if (group.lastPostStatus === 'Dang check bai...') return 'alert alert-info !bg-info/10 !border-info/20 animate-pulse';
    if (isRecent) return 'opacity-40 grayscale';
    return isSelected 
      ? 'bg-primary/5 border-primary/20 shadow-lg' 
      : 'bg-base-200/50 border-base-content/5 hover:bg-base-200 hover:border-base-content/10';
  };

  return (
    <div 
      onClick={() => !isRecent && onToggle(group.url)}
      className={`card card-compact border transition-all duration-200 cursor-pointer select-none ${getStatusColor()}`}
    >
      <div className="card-body flex-row items-center gap-4">
        {!isSuccess && (
          <input 
            type="checkbox" 
            checked={isSelected}
            readOnly
            className={`checkbox checkbox-sm checkbox-primary rounded-lg transition-all ${isSelected ? '' : 'opacity-40'}`} 
          />
        )}
        
        {isSuccess && (
          <div className="mt-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
            <Icon.Check />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex justify-between items-start">
            <h3 className="text-xs font-bold truncate group-hover:text-primary-600 transition-colors" style={{ color: 'var(--text-primary)' }}>
              {group.name || group.url}
            </h3>
            <a 
              href={group.url} 
              target="_blank" 
              rel="noreferrer" 
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-primary-400 transition-all"
              title="Open on Facebook"
            >
              <Icon.Globe />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {group.members && (
              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                <Icon.Group /> {group.members}
              </span>
            )}
            {group.lastPostStatus && (
              <span className={`text-[10px] font-bold uppercase tracking-tight`}>
                {group.lastPostStatus}
              </span>
            )}
          </div>

          {(group.lastPost || group.postedTime) && (
            <p className="text-[10px] font-medium italic text-slate-500 truncate pt-1 border-t border-white/5">
              {group.lastPost 
                ? `Gần nhất: ${group.lastPost}` 
                : (typeof group.postedTime === 'string' && group.postedTime.includes(':'))
                  ? `Vừa đăng: ${group.postedTime}`
                  : `Vừa đăng: ${new Date(group.postedTime).toLocaleString('vi-VN')}`
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupCard;
