import { useState, useEffect, useRef } from 'react'

function App() {
  const [groups, setGroups] = useState([]);
  const [discoveredGroups, setDiscoveredGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [successGroups, setSuccessGroups] = useState([]);
  const [activeTab, setActiveTab] = useState('my-groups'); // 'my-groups' hoặc 'discover'
  const logsEndRef = useRef(null);

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    fetchGroups();
    setupSSE();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/groups`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };

  const setupSSE = () => {
    const eventSource = new EventSource(`${API_BASE}/logs`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'group_found') {
          setGroups(prev => {
            if (prev.find(g => g.url === data.group.url)) return prev;
            return [...prev, data.group];
          });
        } else if (data.type === 'group_discovered') {
          setDiscoveredGroups(prev => {
            if (prev.find(g => g.url === data.group.url)) return prev;
            return [...prev, data.group];
          });
        } else {
            setLogs((prev) => [...prev, data]);
        }
        
        if (data.type === 'success' && data.groupUrl) {
          setSuccessGroups(prev => [...new Set([...prev, data.groupUrl])]);
          setGroups(prev => prev.filter(g => g.url !== data.groupUrl));
        }
        
        if (data.type === 'done') {
          setIsPosting(false);
          setIsDiscovering(false);
        }
      } catch (e) {
        console.error('SSE Pare Error', e);
      }
    };
    return () => eventSource.close();
  };

  const triggerFetchMyGroups = async () => {
    const keyword = prompt("Nhập từ khóa để lọc nhóm ĐÃ THAM GIA:", "");
    if (keyword === null) return;
    try {
      setGroups([]);
      setSelectedGroups(new Set());
      await fetch(`${API_BASE}/fetch-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });
    } catch (e) {
      alert('Lỗi khi gọi API');
    }
  };

  const triggerDiscoverGroups = async () => {
    const keyword = prompt("Nhập từ khóa để TÌM KIẾM nhóm mới:", "");
    if (!keyword) return;
    try {
      setDiscoveredGroups([]);
      setIsDiscovering(true);
      setActiveTab('discover');
      await fetch(`${API_BASE}/discover-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });
    } catch (e) {
      alert('Lỗi khi gọi API');
      setIsDiscovering(false);
    }
  };

  const handleJoinGroup = async (url) => {
    try {
      const res = await fetch(`${API_BASE}/join-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success) {
        setDiscoveredGroups(prev => prev.map(g => g.url === url ? { ...g, isJoined: true, canJoin: false } : g));
      }
    } catch (e) {
      alert('Lỗi khi yêu cầu gia nhập');
    }
  };

  const handleStartPosting = async () => {
    if (selectedGroups.size === 0) {
      alert('Vui lòng chọn ít nhất 1 nhóm để đăng!');
      return;
    }
    const groupList = groups.filter(g => selectedGroups.has(g.url));
    setIsPosting(true);
    setLogs([]);
    try {
      const req = await fetch(`${API_BASE}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: groupList })
      });
      const res = await req.json();
      if (!res.success) {
        alert(res.error || 'Có lỗi xảy ra!');
        setIsPosting(false);
      }
    } catch (error) {
      alert('Lỗi kết nối tới Server');
      setIsPosting(false);
    }
  };

  const toggleSelect = (url) => {
    const next = new Set(selectedGroups);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedGroups(next);
  };

  const toggleAll = () => {
    const availableGroups = groups.filter(g => !(g.postedTime && (Date.now() - g.postedTime < 7 * 24 * 60 * 60 * 1000)));
    if (selectedGroups.size === availableGroups.length && availableGroups.length > 0) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(availableGroups.map(g => g.url)));
    }
  };

  return (
    <div className="min-h-screen flex flex-col pt-4 px-6 bg-gray-50 text-gray-800">
      <header className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">PostBot 5.0</h1>
          <p className="text-sm text-gray-500 mt-1">Hệ thống Facebook Automation Chuyên Nghiệp</p>
        </div>
        <div className="flex gap-3">
           <button 
                onClick={triggerFetchMyGroups}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 transition-all font-medium text-sm flex items-center gap-2"
            >
                👥 Quét nhóm của tôi
            </button>
            <button 
                onClick={triggerDiscoverGroups}
                className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg shadow-sm hover:bg-blue-100 transition-all font-medium text-sm flex items-center gap-2"
            >
                🔍 Khám phá nhóm mới
            </button>
            <button 
                onClick={handleStartPosting}
                disabled={isPosting || selectedGroups.size === 0}
                className={`px-6 py-2 rounded-lg shadow-md font-bold text-white transition-all ${
                isPosting || selectedGroups.size === 0 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'
                }`}
            >
                {isPosting ? '⏳ ĐANG ĐĂNG BÀI...' : '🚀 BẮT ĐẦU ĐĂNG'}
            </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-6 h-full pb-6 overflow-hidden">
        
        {/* CỘT 1: QUẢN LÝ NHÓM */}
        <section className="col-span-4 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-[85vh]">
          <div className="flex border-b">
             <button 
                onClick={() => setActiveTab('my-groups')}
                className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'my-groups' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
             >
                NHÓM CỦA TÔI ({groups.length})
             </button>
             <button 
                onClick={() => setActiveTab('discover')}
                className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'discover' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
             >
                KHÁM PHÁ ({discoveredGroups.length})
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {activeTab === 'my-groups' ? (
                <div className="space-y-2">
                   <div className="px-2 py-1 flex justify-between items-center text-xs">
                      <span className="text-gray-500">Đã chọn: <strong>{selectedGroups.size}</strong></span>
                      <button onClick={toggleAll} className="text-blue-600 hover:underline">{selectedGroups.size === groups.length && groups.length > 0 ? 'Bỏ chọn' : 'Chọn hết'}</button>
                   </div>
                   {groups.length === 0 ? (
                      <div className="text-center text-gray-400 mt-10 text-sm italic">Chưa có dữ liệu nhóm đã tham gia.</div>
                   ) : groups.map(g => {
                      const isRecent = g.postedTime && (Date.now() - g.postedTime < 7 * 24 * 60 * 60 * 1000);
                      return (
                        <div 
                            key={g.url} 
                            onClick={() => !isRecent && toggleSelect(g.url)}
                            className={`p-3 rounded-lg border flex items-start gap-3 transition-all ${isRecent ? 'opacity-60 bg-gray-50' : selectedGroups.has(g.url) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                            <input type="checkbox" checked={selectedGroups.has(g.url)} disabled={isRecent} readOnly className="mt-1" />
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm truncate">{g.name}</p>
                                <div className="flex gap-2 text-[10px] mt-1 text-gray-500">
                                    {g.members && <span className="text-blue-600">{g.members}</span>}
                                    {g.lastActive && <span>{g.lastActive}</span>}
                                </div>
                                {g.postedTime && <p className="text-[10px] text-orange-600 mt-0.5 font-medium">Lần cuối: {new Date(g.postedTime).toLocaleDateString()}</p>}
                            </div>
                        </div>
                      )
                   })}
                </div>
            ) : (
                <div className="space-y-2">
                   {isDiscovering && <div className="text-center p-4 text-blue-600 animate-pulse text-sm font-medium">Bốt đang "đi dạo" tìm nhóm mới...</div>}
                   {discoveredGroups.length === 0 && !isDiscovering ? (
                      <div className="text-center text-gray-400 mt-10 text-sm italic">Nhấn "Khám phá" để tìm nhóm mới.</div>
                   ) : discoveredGroups.map(g => (
                      <div key={g.url} className="p-3 rounded-lg border border-gray-200 bg-white flex flex-col gap-2 shadow-sm">
                         <div className="flex justify-between items-start gap-2">
                            <p className="font-bold text-sm text-gray-900 leading-tight">{g.name}</p>
                            {g.isJoined || !g.canJoin ? (
                               <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200 flex items-center gap-1">
                                  ✓ Đã tham gia
                               </span>
                            ) : (
                               <button 
                                  onClick={() => handleJoinGroup(g.url)}
                                  className="text-[10px] font-bold text-white bg-blue-600 px-3 py-1 rounded hover:bg-blue-700 transition-all active:scale-90"
                               >
                                  + THAM GIA
                               </button>
                            )}
                         </div>
                         <p className="text-[11px] text-gray-500">{g.info}</p>
                         <a href={g.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Xem trên Facebook</a>
                      </div>
                   ))}
                </div>
            )}
          </div>
        </section>

        {/* CỘT 2: TERMINAL */}
        <section className="col-span-5 flex flex-col bg-gray-900 rounded-xl shadow-lg border border-gray-800 overflow-hidden h-[85vh] font-mono text-sm">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center text-xs font-bold text-gray-400">
             <span>SYSTEM TERMINAL</span>
             <button onClick={() => setLogs([])} className="hover:text-white">CLEAR</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-gray-700">
             {logs.map((log, i) => (
                <div key={i} className="flex gap-2 leading-relaxed">
                   <span className="text-gray-600 shrink-0">{new Date().toLocaleTimeString('vi-VN', {hour12: false})}</span>
                   <span className={
                        log.type === 'error' ? 'text-red-400' : 
                        log.type === 'success' ? 'text-green-400' : 
                        log.type === 'delay' ? 'text-yellow-400' : 
                        log.type === 'progress' ? 'text-blue-400' : 
                        log.type === 'done' ? 'text-purple-400 font-bold' : 'text-gray-300'
                   }>
                      {typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}
                   </span>
                </div>
             ))}
             <div ref={logsEndRef} />
          </div>
        </section>

        {/* CỘT 3: THÀNH CÔNG */}
        <section className="col-span-3 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-[85vh]">
          <div className="bg-green-600 px-4 py-3 text-white font-bold text-sm tracking-wide">
             BÀI ĐÃ ĐĂNG ({successGroups.length})
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
             {successGroups.length === 0 ? (
                <div className="text-center text-gray-300 mt-20 text-sm italic">Danh sách trống.</div>
             ) : successGroups.map((url, i) => (
                <div key={url} className="p-3 bg-green-50 border border-green-100 rounded-lg flex items-center gap-3">
                   <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px]">✓</div>
                   <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-green-800 truncate">Succeed!</p>
                      <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-green-600 hover:underline">Mở bài đăng</a>
                   </div>
                </div>
             ))}
          </div>
        </section>

      </main>
    </div>
  )
}

export default App;
