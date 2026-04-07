import React from 'react';
import { Icon } from './Icon';

const PostConfig = ({
  postContent, setPostContent,
  mediaType, setMediaType,
  imageFolderPath, setImageFolderPath,
  videoFolderPath, setVideoFolderPath,
  manualActorId, setManualActorId,
  delayBetweenPostsMinutes, setDelayBetweenPostsMinutes,
  autoDiscoveryEnabled, setAutoDiscoveryEnabled,
  autoDiscoveryIntervalHours, setAutoDiscoveryIntervalHours,
  autoDiscoveryKeyword, setAutoDiscoveryKeyword,
  discoverJoinCooldownHours, setDiscoverJoinCooldownHours,
  maxAutoJoinPerRun, setMaxAutoJoinPerRun,
  saveSettings, isSavingSettings,
  workerStatus, triggerWorkerAction, isWorkerActionLoading,
  layout = 'full'
}) => {
  const showContent = layout === 'full' || layout === 'content-only';
  const showControls = layout === 'full' || layout === 'controls-only';

  return (
    <div className="flex flex-col h-full gap-4">
      {showContent && (
        <div className="flex-1 min-h-0 bg-base-100 rounded-3xl shadow-xl overflow-hidden border border-base-content/5 flex flex-col">
          <div className="p-4 border-b border-base-content/5 bg-base-200/50">
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
              <Icon.Send /> SOAN NOI DUNG
            </h3>
          </div>
          <div className="flex-1 p-6 overflow-y-auto space-y-4 terminal-scroll">
            <div className="form-control w-full flex-1 min-h-0">
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Nhap noi dung bai viet..."
                className="textarea textarea-bordered w-full h-full flex-1 rounded-2xl bg-base-200 focus:bg-base-100 transition-all font-medium text-sm leading-relaxed p-4"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
                <Icon.Settings /> LOAI MEDIA
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMediaType?.('image')}
                  className={`btn btn-sm rounded-2xl ${mediaType === 'image' ? 'btn-primary' : 'btn-outline'}`}
                >
                  Dang anh
                </button>
                <button
                  type="button"
                  onClick={() => setMediaType?.('video')}
                  className={`btn btn-sm rounded-2xl ${mediaType === 'video' ? 'btn-primary' : 'btn-outline'}`}
                >
                  Dang video
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
                <Icon.Group /> {mediaType === 'video' ? 'THU MUC VIDEO' : 'THU MUC ANH'}
              </label>
              <input
                type="text"
                value={mediaType === 'video' ? (videoFolderPath || '') : (imageFolderPath || '')}
                onChange={(e) => {
                  if (mediaType === 'video') setVideoFolderPath?.(e.target.value);
                  else setImageFolderPath?.(e.target.value);
                }}
                placeholder={mediaType === 'video' ? 'Vi du: C:\\VideoDang' : 'Vi du: C:\\HinhAnh'}
                className="input input-bordered w-full rounded-2xl bg-base-200 focus:bg-base-100 transition-all font-medium text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {showControls && (
        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto terminal-scroll">
          <div className="bg-base-100 rounded-3xl shadow-xl border border-base-content/5 p-5 space-y-4">
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-widest flex items-center gap-2">
              <Icon.Settings /> CAI DAT
            </h3>

            <div className="space-y-2">
              <span className="text-[9px] font-bold opacity-40 uppercase">Delay ngau nhien giua cac bai (1 - {delayBetweenPostsMinutes} phut)</span>
              <input
                type="number"
                min="0"
                value={delayBetweenPostsMinutes}
                onChange={(e) => setDelayBetweenPostsMinutes(e.target.value)}
                className="input input-sm input-bordered w-full bg-base-200"
              />
            </div>

            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={autoDiscoveryEnabled}
                onChange={(e) => setAutoDiscoveryEnabled(e.target.checked)}
              />
              <span className="text-[10px] font-black opacity-70 uppercase tracking-widest">Auto discovery chay nen</span>
            </label>

            <div className="space-y-2">
              <span className="text-[9px] font-bold opacity-40 uppercase">Tu khoa discovery</span>
              <input
                type="text"
                value={autoDiscoveryKeyword}
                onChange={(e) => setAutoDiscoveryKeyword(e.target.value)}
                placeholder="VD: nha dat, bat dong san"
                className="input input-sm input-bordered w-full bg-base-200"
              />
            </div>

            <div className="space-y-2">
              <span className="text-[9px] font-bold opacity-40 uppercase">Chu ky chay nen (gio)</span>
              <input
                type="number"
                min="1"
                value={autoDiscoveryIntervalHours}
                onChange={(e) => setAutoDiscoveryIntervalHours(e.target.value)}
                className="input input-sm input-bordered w-full bg-base-200"
              />
            </div>

            <div className="space-y-2">
              <span className="text-[9px] font-bold opacity-40 uppercase">Cooldown join lai cung nhom (gio)</span>
              <input
                type="number"
                min="0"
                value={discoverJoinCooldownHours}
                onChange={(e) => setDiscoverJoinCooldownHours(e.target.value)}
                className="input input-sm input-bordered w-full bg-base-200"
              />
            </div>

            <div className="space-y-2">
              <span className="text-[9px] font-bold opacity-40 uppercase">Toi da nhom join moi dot</span>
              <input
                type="number"
                min="0"
                value={maxAutoJoinPerRun}
                onChange={(e) => setMaxAutoJoinPerRun(e.target.value)}
                className="input input-sm input-bordered w-full bg-base-200"
              />
            </div>

            <button
              onClick={saveSettings}
              disabled={isSavingSettings}
              className="btn btn-primary btn-sm w-full rounded-2xl font-black text-[10px] tracking-widest"
            >
              {isSavingSettings ? 'DANG LUU...' : 'LUU CAI DAT'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostConfig;
