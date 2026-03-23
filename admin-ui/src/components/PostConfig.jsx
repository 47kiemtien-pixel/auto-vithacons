import React from 'react';
import { Icon } from './Icon';

const PostConfig = ({ 
  postContent, setPostContent, 
  imageFolderPath, setImageFolderPath, 
  manualActorId, setManualActorId,
  delayBetweenPostsMinutes, setDelayBetweenPostsMinutes,
  saveSettings, isSavingSettings,
  workerStatus, triggerWorkerAction, isWorkerActionLoading,
  layout = 'full' // 'full', 'content-only', 'controls-only'
}) => {
  const showContent = layout === 'full' || layout === 'content-only';
  const showControls = layout === 'full' || layout === 'controls-only';

  return (
    <div className="flex flex-col h-full gap-4">
      {showContent && (
        <div className="flex-1 min-h-0 bg-base-100 rounded-3xl shadow-xl overflow-hidden border border-base-content/5 flex flex-col">
          <div className="p-4 border-b border-base-content/5 bg-base-200/50">
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
              <Icon.Send /> SOẠN NỘI DUNG
            </h3>
          </div>
          <div className="flex-1 p-6 overflow-y-auto space-y-4 terminal-scroll">
            <div className="form-control w-full flex-1 min-h-0">
              <textarea 
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Nhập nội dung bài viết..."
                className="textarea textarea-bordered w-full h-full flex-1 rounded-2xl bg-base-200 focus:bg-base-100 transition-all font-medium text-sm leading-relaxed p-4"
              />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
                  <Icon.Group /> THƯ MỤC ẢNH
                </label>
                <input 
                    type="text"
                    value={imageFolderPath}
                    onChange={(e) => setImageFolderPath(e.target.value)}
                    placeholder="Ví dụ: C:\HinhAnh"
                    className="input input-bordered w-full rounded-2xl bg-base-200 focus:bg-base-100 transition-all font-medium text-xs"
                />
            </div>
          </div>
        </div>
      )}

      {showControls && (
        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto terminal-scroll">
          {/* Settings Section */}
          <div className="bg-base-100 rounded-3xl shadow-xl border border-base-content/5 p-5 space-y-4">
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
              <Icon.Settings /> CÀI ĐẶT
            </h3>
            
            {/* Removed Actor ID setting */}

            <div className="space-y-2">
              <span className="text-[9px] font-bold opacity-40 uppercase">Trễ ngẫu nhiên (1 - {delayBetweenPostsMinutes} Phút)</span>
              <input
                  type="number"
                  min="0"
                  value={delayBetweenPostsMinutes}
                  onChange={(e) => setDelayBetweenPostsMinutes(e.target.value)}
                  className="input input-sm input-bordered w-full bg-base-200"
              />
            </div>
          </div>

          {/* System Status info removed - redundant with header */}
        </div>
      )}
    </div>
  );
};

export default PostConfig;
