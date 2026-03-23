import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import LogTerminal from './components/LogTerminal'
import PostConfig from './components/PostConfig'
import SuccessList from './components/SuccessList'
import { Icon } from './components/Icon'

function App() {
  const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';
  const [groups, setGroups] = useState([]);
  const [discoveredGroups, setDiscoveredGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isHarvestingVisible, setIsHarvestingVisible] = useState(false);
  const [autoJoin, setAutoJoin] = useState(true);
  const [successGroups, setSuccessGroups] = useState([]);
  const [activeTab, setActiveTab] = useState('my-groups');
  const [postContent, setPostContent] = useState('');
  const [imageFolderPath, setImageFolderPath] = useState('');
  const [delayBetweenPostsMinutes, setDelayBetweenPostsMinutes] = useState('1');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [workerStatus, setWorkerStatus] = useState({ isRunning: false, pendingCount: 0, isScanning: false, isDiscovering: false });
  const [isWorkerActionLoading, setIsWorkerActionLoading] = useState(false);
  const [theme, setTheme] = useState('light');
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(localStorage.getItem('selectedPageId') || '');


  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchPages();
    fetchSettings();
    const cleanup = setupSSE();
    return cleanup;
  }, []);

  useEffect(() => {
    if (selectedPageId) {
      fetchGroups();
      fetchWorkerStatus();
      localStorage.setItem('selectedPageId', selectedPageId);
    }
  }, [selectedPageId]);

  const fetchPages = async () => {
    try {
      const res = await fetch(`${API_BASE}/pages`);
      if (res.ok) {
        const data = await res.json();
        setPages(data);
        // Ngừng tự động chọn page đầu tiên để bắt người dùng phải chọn
      }
    } catch (error) { console.error('Fetch pages failed:', error); }
  };


  const fetchGroups = async () => {
    if (!selectedPageId) return;
    try {
      const res = await fetch(`${API_BASE}/groups?pageId=${selectedPageId}`);
      if (res.ok) setGroups(await res.json());
    } catch (error) { console.error('Fetch groups failed:', error); }
  };


  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        setDelayBetweenPostsMinutes(String(data.delayBetweenPostsMinutes ?? 1));
      }
    } catch (error) { console.error('Fetch settings failed:', error); }
  };

  const fetchWorkerStatus = async () => {
    if (!selectedPageId) return;
    try {
      const res = await fetch(`${API_BASE}/worker-status?pageId=${selectedPageId}`);
      if (res.ok) setWorkerStatus(await res.json());
    } catch (error) { console.error('Fetch worker status failed:', error); }
  };


  const triggerWorkerAction = async (endpoint) => {
    try {
      setIsWorkerActionLoading(true);
      const res = await fetch(`${API_BASE}${endpoint}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' } 
      });
      const data = await res.json();
      if (data.worker) setWorkerStatus(data.worker);
      await fetchGroups();
    } catch (error) { console.error('Worker action failed:', error); }
    finally { setIsWorkerActionLoading(false); }
  };

  const saveSettings = async () => {
    try {
      setIsSavingSettings(true);
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayBetweenPostsMinutes: Number(delayBetweenPostsMinutes || 0) })
      });
      const data = await res.json();
      if (data.success) {
        setDelayBetweenPostsMinutes(String(data.settings?.delayBetweenPostsMinutes ?? 1));
      }
    } catch (error) { console.error('Save settings failed:', error); }
    finally { setIsSavingSettings(false); }
  };

  const setupSSE = () => {
    const eventSource = new EventSource(`${API_BASE}/logs`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'group_found') {
          setGroups(prev => {
            const index = prev.findIndex(g => g.url === data.group.url);
            if (index !== -1) {
              const next = [...prev];
              next[index] = data.group;
              return next;
            }
            return [...prev, data.group];
          });
        } else if (data.type === 'group_updated') {
          setGroups(prev => {
            const index = prev.findIndex(g => g.url === data.group.url);
            if (index === -1) return prev;
            const next = [...prev];
            next[index] = { ...next[index], ...data.group };
            return next;
          });
        } else if (data.type === 'group_discovered') {
          setDiscoveredGroups(prev => prev.find(g => g.url === data.group.url) ? prev : [...prev, data.group]);
        }
        
        if (data.type === 'success' && data.groupUrl) {
          setSuccessGroups(prev => [...new Set([...prev, data.groupUrl])]);
          setSelectedGroups(prev => {
            const next = new Set(prev);
            next.delete(data.groupUrl);
            return next;
          });
        }

        if (data.type === 'done') {
          if (data.source === 'posting') setIsPosting(false);
          if (data.source === 'scanning') setIsScanning(false);
          if (data.source === 'discovery') setIsDiscovering(false);
          if (data.source === 'visible-harvest') setIsHarvestingVisible(false);
        }

        if (data.type === 'start' && data.source === 'visible-harvest') setIsHarvestingVisible(true);
        if (data.source === 'checking') fetchWorkerStatus();
        
        setLogs((prev) => [...prev, data]);
      } catch (e) { console.error('SSE Parse Error', e); }
    };
    return () => eventSource.close();
  };

  const triggerFetchMyGroups = async (keyword) => {
    if (!selectedPageId) return;
    try {
      setIsScanning(true);
      await fetch(`${API_BASE}/fetch-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, pageId: selectedPageId })
      });
    } catch (e) { setIsScanning(true); setIsScanning(false); }
  };


  const triggerDiscoverGroups = async (keyword) => {
    try {
      setDiscoveredGroups([]);
      setIsDiscovering(true);
      setActiveTab('discover');
      await fetch(`${API_BASE}/discover-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, autoJoin, pageId: selectedPageId })
      });
    } catch (e) { setIsDiscovering(false); }
  };

   const handleJoinGroup = async (url) => {
    const group = discoveredGroups.find(g => g.url === url);
    if (!group || !selectedPageId) return;
    try {
      const res = await fetch(`${API_BASE}/join-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: group.name, pageId: selectedPageId })
      });
      const data = await res.json();
      if (data.success) {
        setDiscoveredGroups(prev => prev.map(g => g.url === url ? { ...g, isJoined: true, canJoin: false } : g));
        fetchGroups(); // Refresh list to show the newly joined group
      }
    } catch (e) { console.error('Join group failed:', e); }
  };

  const handleStartPosting = async () => {
    if (selectedGroups.size === 0 || !selectedPageId) return;
    const groupList = groups.filter(g => selectedGroups.has(g.url));
    setIsPosting(true);
    try {
      await fetch(`${API_BASE}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: groupList, postContent, imageFolderPath, pageId: selectedPageId })
      });
    } catch (error) { setIsPosting(false); }
  };


  const toggleSelect = (url) => {
    const next = new Set(selectedGroups);
    if (next.has(url)) next.delete(url); else next.add(url);
    setSelectedGroups(next);
  };

  const toggleAll = () => {
    const availableGroups = groups.filter(g => g.isSelectable !== false);
    if (selectedGroups.size === availableGroups.length && availableGroups.length > 0) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(availableGroups.map(g => g.url)));
  };

  const selectByTag = (tag) => {
    const next = new Set();
    groups.forEach(g => { if (g.isSelectable !== false && (g.name || '').toLowerCase().includes(tag.toLowerCase())) next.add(g.url); });
    setSelectedGroups(next);
  };

  return (
    <div data-theme={theme === 'dark' ? 'dark' : 'light'} className="h-screen flex flex-col bg-base-200 text-base-content overflow-hidden font-sans">
      <header className="navbar bg-base-100 shadow-lg px-6 lg:px-10 py-3 mb-6">
          <div className="flex items-center gap-4 transition-transform hover:scale-[1.02] duration-300">
             <div className="w-12 h-12 rounded-2xl bg-primary text-primary-content flex items-center justify-center shadow-lg">
                <Icon.Bot />
             </div>
             <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-tight">PostBot 6.0</h1>
                <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Hệ thống Facebook Automation</p>
             </div>
          </div>

        <div className="flex-none flex items-center gap-4">
           {/* Page Selector */}
           <div className="form-control">
             <label className="label py-1">
               <span className="label-text text-[10px] font-bold uppercase opacity-50">Đang dùng Page</span>
             </label>
             <select 
               className="select select-bordered select-sm rounded-xl font-bold bg-base-200 focus:bg-base-100 min-w-[200px]"
               value={selectedPageId}
               onChange={(e) => setSelectedPageId(e.target.value)}
             >
               {pages.map(page => (
                 <option key={page.id} value={page.id}>{page.name}</option>
               ))}
             </select>
           </div>

           {/* Global Stats */}

           <div className="hidden lg:flex stats shadow bg-base-200">
             <div className="stat px-4 py-2">
               <div className="stat-title text-[10px] uppercase font-black opacity-50">Sẵn sàng đăng</div>
               <div className="stat-value text-primary text-lg font-black leading-none">{workerStatus.pendingCount || 0}</div>
             </div>
           </div>

           <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="btn btn-ghost btn-circle shadow-sm"
              title="Đổi giao diện"
           >
              {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
           </button>

           <button 
              onClick={handleStartPosting}
              disabled={isPosting || selectedGroups.size === 0}
              className={`btn btn-primary px-8 font-black tracking-widest ${
                isPosting || selectedGroups.size === 0 ? 'btn-disabled opacity-50' : 'shadow-xl shadow-primary/20'
              }`}
           >
              {isPosting ? <span className="loading loading-spinner"></span> : null}
              {isPosting ? 'ĐANG ĐĂNG...' : 'BẮT ĐẦU'}
           </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-4 lg:p-6 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-4 h-full gap-6">
          {/* Column 1: Groups & Discovery */}
          <div className="xl:col-span-1 h-full min-h-0 flex flex-col gap-6">
            <Sidebar 
               groups={groups} 
               discoveredGroups={discoveredGroups}
               activeTab={activeTab}
               setActiveTab={setActiveTab}
               selectedGroups={selectedGroups}
               toggleSelect={toggleSelect}
               toggleAll={toggleAll}
               selectByTag={selectByTag}
               isScanning={isScanning}
               triggerFetchMyGroups={triggerFetchMyGroups}
               stopScanning={() => fetch(`${API_BASE}/stop-scan`, { method: 'POST' })}
               isDiscovering={isDiscovering}
               triggerDiscoverGroups={triggerDiscoverGroups}
               stopDiscovering={() => fetch(`${API_BASE}/stop-discover`, { method: 'POST' })}
               isHarvestingVisible={isHarvestingVisible}
               startVisibleHarvest={() => fetch(`${API_BASE}/start-visible-harvest`, { 
                  method: 'POST', 
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pageId: selectedPageId })
                })}
               stopVisibleHarvest={() => fetch(`${API_BASE}/stop-visible-harvest`, { method: 'POST' })}
               handleJoinGroup={handleJoinGroup}
            />
          </div>

          {/* Column 2 & 3: Content & Logs */}
          <div className="xl:col-span-2 h-full min-h-0 flex flex-col gap-6">
            {/* Post Content area */}
            <div className="h-1/2 min-h-0">
               <PostConfig 
                  postContent={postContent}
                  setPostContent={setPostContent}
                  imageFolderPath={imageFolderPath}
                  setImageFolderPath={setImageFolderPath}
                  delayBetweenPostsMinutes={delayBetweenPostsMinutes}
                  setDelayBetweenPostsMinutes={setDelayBetweenPostsMinutes}
                  saveSettings={saveSettings}
                  isSavingSettings={isSavingSettings}
                  workerStatus={workerStatus}
                  triggerWorkerAction={triggerWorkerAction}
                  isWorkerActionLoading={isWorkerActionLoading}
                  layout="content-only"
               />
            </div>
            {/* Terminal area */}
            <div className="h-1/2 min-h-0">
               <LogTerminal 
                  logs={logs} 
                  onClear={() => setLogs([])} 
               />
            </div>
          </div>

          {/* Column 4: Settings, Controls & Success */}
          <div className="xl:col-span-1 h-full min-h-0 flex flex-col gap-6">
            <div className="flex-1 min-h-0 flex flex-col gap-6">
               <PostConfig 
                  delayBetweenPostsMinutes={delayBetweenPostsMinutes}
                  setDelayBetweenPostsMinutes={setDelayBetweenPostsMinutes}
                  saveSettings={saveSettings}
                  isSavingSettings={isSavingSettings}
                  workerStatus={workerStatus}
                  triggerWorkerAction={triggerWorkerAction}
                  isWorkerActionLoading={isWorkerActionLoading}
                  layout="controls-only"
               />
               <div className="flex-1 min-h-0">
                  <SuccessList 
                     groups={successGroups} 
                     onClear={() => setSuccessGroups([])} 
                  />
               </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mandatory Page Selector Overlay */}
      {!selectedPageId && (
        <div className="fixed inset-0 z-[100] bg-base-300/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-base-100 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-primary/20 flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
             <div className="w-20 h-20 rounded-3xl bg-primary text-primary-content flex items-center justify-center shadow-2xl shadow-primary/30">
                <Icon.Bot size={40} />
             </div>
             <div className="text-center">
                <h2 className="text-2xl font-black mb-1">Chào mừng bạn!</h2>
                <p className="text-sm opacity-60 font-medium">Vui lòng chọn Fanpage bạn muốn quản lý để tiếp tục.</p>
             </div>
             
             <div className="w-full space-y-4">
               <div className="grid gap-2">
                 {pages.map(page => (
                   <button 
                     key={page.id}
                     onClick={() => setSelectedPageId(page.id)}
                     className="btn btn-lg btn-outline hover:btn-primary border-2 rounded-2xl flex items-center justify-between px-6 group transition-all"
                   >
                     <div className="flex flex-col items-start">
                        <span className="text-xs font-black opacity-40 uppercase tracking-tighter">Fanpage</span>
                        <span className="font-bold">{page.name}</span>
                     </div>
                     <Icon.Group className="opacity-0 group-hover:opacity-100 transition-all" />
                   </button>
                 ))}
               </div>
             </div>
             
             <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em]">Hệ thống PostBot 6.0 Premium</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
