import React, { useState } from 'react';
import { Icon } from './Icon';
import GroupCard from './GroupCard';

const Sidebar = ({ 
  groups, discoveredGroups, activeTab, setActiveTab,
  selectedGroups, toggleSelect, toggleAll, toggleByTag,
  isScanning, triggerFetchMyGroups, stopScanning,
  isDiscovering, triggerDiscoverGroups, stopDiscovering,
  isHarvestingVisible, startVisibleHarvest, stopVisibleHarvest,
  handleJoinGroup
}) => {
  const [searchMyGroups, setSearchMyGroups] = useState('');
  const [searchDiscovery, setSearchDiscovery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredMyGroups = groups.filter(g => {
    const nameMatch = (g.name || '').toLowerCase().includes(searchMyGroups.toLowerCase());
    if (!nameMatch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'ready') return !g.lastPostStatus;
    if (statusFilter === 'posted') return g.lastPostStatus === 'Đã đăng';
    if (statusFilter === 'pending') return g.lastPostStatus === 'Đang chờ duyệt' || g.lastPostStatus === 'Chờ duyệt';
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-base-100 rounded-3xl shadow-xl overflow-hidden border border-base-content/5">
      <div role="tablist" className="tabs tabs-box m-4 bg-base-200">
         <button 
            role="tab"
            onClick={() => setActiveTab('my-groups')}
            className={`tab gap-2 font-black text-[11px] ${activeTab === 'my-groups' ? 'tab-active !bg-primary !text-primary-content' : 'opacity-60'}`}
         >
            <Icon.Group /> NHÓM CỦA TÔI ({groups.length})
         </button>
         <button 
            role="tab"
            onClick={() => setActiveTab('discover')}
            className={`tab gap-2 font-black text-[11px] ${activeTab === 'discover' ? 'tab-active !bg-primary !text-primary-content' : 'opacity-60'}`}
         >
            <Icon.Search /> KHÁM PHÁ ({discoveredGroups.length})
         </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Controls Section */}
        <div className="px-4 py-2 space-y-4 border-b border-white/5 bg-white/5">
           {activeTab === 'my-groups' ? (
             <div className="space-y-3">
               <div className="relative group">
                 <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-40 group-focus-within:text-primary group-focus-within:opacity-100 transition-all">
                   <Icon.Search />
                 </div>
                 <input 
                   type="text"
                   placeholder="Tìm nhanh nhóm của bạn..."
                   value={searchMyGroups}
                   onChange={(e) => setSearchMyGroups(e.target.value)}
                   className="input input-bordered w-full pl-12 rounded-2xl bg-base-200 focus:bg-base-100 transition-all"
                 />
               </div>

               <div className="flex gap-2">
                 <button 
                   onClick={() => triggerFetchMyGroups(searchMyGroups)}
                   disabled={isScanning}
                   className="btn btn-primary flex-1 rounded-2xl font-black text-[10px] tracking-widest"
                 >
                   {isScanning ? <span className="loading loading-spinner loading-xs"></span> : null}
                   {isScanning ? 'ĐANG QUÉT...' : 'QUÉT TỪ FB'}
                 </button>
                 {isScanning && (
                   <button onClick={stopScanning} className="btn btn-error btn-square rounded-2xl">
                     <Icon.Pause />
                   </button>
                 )}
               </div>

                <div className="divider text-[9px] font-bold opacity-30 uppercase tracking-[0.2em] my-1">Chọn nhanh theo từ khóa</div>
                <div className="join w-full">
                  <input 
                    type="text" 
                    placeholder="Từ khóa (vD: nha dat, bat dong san)..." 
                    className="input input-bordered input-sm join-item flex-1 bg-base-200"
                    onKeyDown={(e) => { 
                      if (e.key === 'Enter') toggleByTag(e.currentTarget.value); 
                    }}
                    id="tag-input"
                  />
                  <button 
                    className="btn btn-sm btn-primary join-item px-6"
                    onClick={() => {
                      const input = document.getElementById('tag-input');
                      if (input) toggleByTag(input.value);
                    }}
                  >
                    CHỌN / BỎ
                  </button>
                </div>

               <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={startVisibleHarvest} 
                    disabled={isHarvestingVisible}
                    className="py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 rounded-xl text-[9px] font-bold uppercase transition-all"
                  >
                    {isHarvestingVisible ? 'Đang thu thập...' : 'Quét nhóm từ màn hình'}
                  </button>
                  <button 
                    onClick={stopVisibleHarvest} 
                    disabled={!isHarvestingVisible}
                    className="py-2 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 rounded-xl text-[9px] font-bold uppercase transition-all"
                  >
                    Dừng quét
                  </button>
               </div>
             </div>
           ) : (
             <div className="space-y-3">
               <div className="relative group">
                 <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-40 group-focus-within:text-primary group-focus-within:opacity-100 transition-all">
                   <Icon.Search />
                 </div>
                 <input 
                   type="text"
                   placeholder="Tìm tên nhóm mới..."
                   value={searchDiscovery}
                   onChange={(e) => setSearchDiscovery(e.target.value)}
                   className="input input-bordered w-full pl-12 rounded-2xl bg-base-200 focus:bg-base-100 transition-all"
                 />
               </div>
               <button 
                 onClick={() => triggerDiscoverGroups(searchDiscovery)}
                 disabled={isDiscovering || !searchDiscovery}
                 className="btn btn-primary w-full rounded-2xl font-black text-xs tracking-widest"
               >
                 {isDiscovering ? <span className="loading loading-spinner loading-xs"></span> : null}
                 {isDiscovering ? 'ĐANG TÌM...' : 'TÌM NHÓM MỚI'}
               </button>
             </div>
           )}
        </div>

        {/* List Section */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 terminal-scroll">
           {activeTab === 'my-groups' ? (
             <>
                <div className="flex flex-wrap gap-1 mb-3">
                  {[
                    { id: 'all', label: 'Tất cả', color: 'bg-base-300' },
                    { id: 'ready', label: 'Sẵn sàng', color: 'bg-emerald-500/20 text-emerald-600' },
                    { id: 'posted', label: 'Đã đăng', color: 'bg-blue-500/20 text-blue-600' },
                    { id: 'pending', label: 'Chờ duyệt', color: 'bg-amber-500/20 text-amber-600' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all ${
                        statusFilter === f.id ? `${f.color} ring-1 ring-current` : 'bg-base-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Đã chọn: {selectedGroups.size} / {filteredMyGroups.length}</span>
                  <button onClick={toggleAll} className="text-[10px] font-bold text-primary-500 hover:text-primary-400 uppercase tracking-tighter">
                    {selectedGroups.size === filteredMyGroups.length && filteredMyGroups.length > 0 ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                  </button>
                </div>
               {filteredMyGroups.length === 0 ? (
                 <div className="text-center py-10 text-slate-500 text-xs italic">Không tìm thấy nhóm nào.</div>
               ) : filteredMyGroups.map(g => (
                 <GroupCard 
                    key={g.url} 
                    group={g} 
                    isSelected={selectedGroups.has(g.url)} 
                    onToggle={toggleSelect} 
                 />
               ))}
             </>
           ) : (
             <div className="space-y-4">
                {isDiscovering && <div className="text-center p-4 text-primary-500 animate-pulse text-xs font-bold border border-primary-500/20 rounded-xl bg-primary-500/5">Đang tìm trên Facebook...</div>}
                {discoveredGroups.length === 0 && !isDiscovering ? (
                   <div className="text-center py-10 text-slate-500 text-xs italic">Nhập từ khóa để tìm kiếm nhóm mới.</div>
                ) : discoveredGroups.map(g => (
                  <div key={g.url} className="glass-card bg-slate-800/20 p-4 rounded-xl border border-white/5 space-y-3 hover:border-white/10 transition-all">
                    <div className="flex justify-between items-start gap-4">
                      <h4 className="text-sm font-bold text-slate-200 leading-tight">{g.name}</h4>
                      <a href={g.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-primary-400 mt-1"><Icon.Globe /></a>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-medium">{g.info}</p>
                    <div className="flex justify-between items-center">
                       {g.isJoined || !g.canJoin ? (
                          <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                             <Icon.Check /> ĐàTHAM GIA
                          </span>
                       ) : (
                          <button 
                             onClick={() => handleJoinGroup(g.url)}
                             className="text-[9px] font-bold text-white bg-primary-600 px-3 py-1 rounded hover:bg-primary-700 transition-all active:scale-90 shadow-lg shadow-primary-500/20"
                          >
                             + GIA NHẬP NHÓM
                          </button>
                       )}
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
