import { useState, useEffect, useRef } from 'react'

function App() {
  const [groups, setGroups] = useState([]);
  const [discoveredGroups, setDiscoveredGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [autoJoin, setAutoJoin] = useState(true);
  const [successGroups, setSuccessGroups] = useState([]);
  const [activeTab, setActiveTab] = useState('my-groups'); // 'my-groups' hoặc 'discover'
  const [postContent, setPostContent] = useState('');
  const [imageFolderPath, setImageFolderPath] = useState('');
  const logsEndRef = useRef(null);

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    fetchGroups();
    const cleanup = setupSSE();
    return cleanup;
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
            const index = prev.findIndex(g => g.url === data.group.url);
            if (index !== -1) {
              const next = [...prev];
              next[index] = data.group;
              return next;
            }
            return [...prev, data.group];
          });
        } else if (data.type === 'group_discovered') {
          setDiscoveredGroups(prev => {
            if (prev.find(g => g.url === data.group.url)) return prev;
            return [...prev, data.group];
          });
        }
        
        if (data.type === 'success' && data.groupUrl) {
          setSuccessGroups(prev => [...new Set([...prev, data.groupUrl])]);
          setGroups(prev => prev.filter(g => g.url !== data.groupUrl));
        }

        if (data.type === 'done') {
          if (data.source === 'posting') setIsPosting(false);
          if (data.source === 'discovery') setIsDiscovering(false);
        }
        
        // Gắn nhãn cho log dựa trên source
        let logMessage = data.message;
        if (data.source === 'posting') logMessage = `[POST] ${logMessage}`;
        else if (data.source === 'discovery') logMessage = `[DISC] ${logMessage}`;
        else if (data.source === 'scanning') logMessage = `[SCAN] ${logMessage}`;
        
        setLogs((prev) => [...prev, { ...data, message: logMessage }]);
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
        body: JSON.stringify({ keyword, autoJoin })
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
      await fetch(`${API_BASE}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          groups: groupList,
          postContent,
          imageFolderPath
        })
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
        <div className="flex flex-col gap-2">
            <div className="flex gap-3 justify-end">
                <button 
                    onClick={triggerFetchMyGroups}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 transition-all font-medium text-sm flex items-center gap-2"
                >
                    👥 Quét nhóm của tôi
                </button>
                <div className="flex items-center gap-2 mr-2">
                    <input 
                        type="checkbox" 
                        id="auto-join" 
                        checked={autoJoin} 
                        onChange={(e) => setAutoJoin(e.target.checked)} 
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="auto-join" className="text-xs font-bold text-gray-600 cursor-pointer select-none">TỰ ĐỘNG GIA NHẬP</label>
                </div>
                <button 
                    onClick={triggerDiscoverGroups}
                    className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg shadow-sm hover:bg-blue-100 transition-all font-medium text-sm flex items-center gap-2"
                >
                    🔍 Khám phá nhóm mới
                </button>
            </div>
            <div className="flex gap-3 justify-end items-center">
                <button 
                    onClick={handleStartPosting}
                    disabled={isPosting || selectedGroups.size === 0}
                    className={`px-8 py-2 rounded-lg shadow-md font-bold text-white transition-all ${
                    isPosting || selectedGroups.size === 0 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg active:scale-95'
                    }`}
                >
                    {isPosting ? '⏳ ĐANG ĐĂNG BÀI...' : '🚀 BẮT ĐẦU ĐĂNG'}
                </button>
            </div>
        </div>
      </header>

      {/* CẤU HÌNH BÀI VIẾT */}
      <section className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-12 gap-6">
        <div className="col-span-8 flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nội dung bài viết (Dùng file nội dung nếu để trống)</label>
            <textarea 
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Nhập nội dung bài viết tại đây..."
                className="w-full h-24 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
            />
        </div>
        <div className="col-span-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Thư mục hình ảnh</label>
                <input 
                    type="text"
                    value={imageFolderPath}
                    onChange={(e) => setImageFolderPath(e.target.value)}
                    placeholder="Ví dụ: C:\Users\Admin\Desktop\HinhAnh"
                    className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
            </div>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                    💡 <strong>Tips:</strong> Bốt sẽ tự động lấy tất cả các ảnh (.jpg, .png...) trong thư mục này để đăng kèm bài viết.
                </p>
            </div>
        </div>
      </section>

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
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-sm truncate pr-2">{g.name}</p>
                                    <a 
                                        href={g.url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-blue-500 hover:underline text-[10px] shrink-0 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-100"
                                    >
                                        🌐 XEM
                                    </a>
                                </div>
                                <div className="flex gap-2 text-[10px] mt-1 text-gray-500">
                                    {g.members && <span className="text-blue-600 font-semibold">👥 {g.members}</span>}
                                    {g.lastPostStatus && (
                                        <span className={`font-medium ${g.lastPostStatus === 'Không có bài viết' ? 'text-red-500' : 'text-green-600'}`}>
                                            📝 {g.lastPostStatus}
                                        </span>
                                    )}
                                </div>
                                {g.lastPost && <p className="text-[10px] text-orange-600 mt-0.5 font-medium italic">Gần nhất: {g.lastPost}</p>}
                                {g.postedTime && !g.lastPost && <p className="text-[10px] text-orange-600 mt-0.5 font-medium italic">Vừa đăng: {new Date(g.postedTime).toLocaleDateString()}</p>}
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
          <div className="bg-green-600 px-4 py-3 text-white font-bold text-sm tracking-wide flex justify-between items-center">
             <span>BÀI ĐÃ ĐĂNG ({successGroups.length})</span>
             {successGroups.length > 0 && (
               <button 
                 onClick={() => setSuccessGroups([])}
                 className="text-[10px] bg-green-700 hover:bg-green-800 px-2 py-1 rounded transition-colors"
               >
                 XÓA DANH SÁCH
               </button>
             )}
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
