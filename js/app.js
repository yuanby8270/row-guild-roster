// js/app.js

// ** 1. Tailwind Configuration **
// (這部分保持不變，為節省空間省略...)
tailwind.config = { /* ...略... */ };

// ** 2. 常量與初始數據 **
const DATA_VERSION = "7.3"; 
// (JOB_STYLES 和 JOB_STRUCTURE 保持不變，為節省空間省略...)
const JOB_STYLES = [
    { key: ['騎士'], class: 'bg-job-knight', icon: 'fa-shield-alt' }, { key: ['十字軍'], class: 'bg-job-crusader', icon: 'fa-cross' }, { key: ['鐵匠', '商人'], class: 'bg-job-blacksmith', icon: 'fa-hammer' },
    { key: ['獵人', '弓箭手'], class: 'bg-job-hunter', icon: 'fa-crosshairs' }, { key: ['詩人'], class: 'bg-job-bard', icon: 'fa-music' }, { key: ['煉金'], class: 'bg-job-alchemist', icon: 'fa-flask' },
    { key: ['神官', '服事', '牧師'], class: 'bg-job-priest', icon: 'fa-plus' }, { key: ['武僧'], class: 'bg-job-monk', icon: 'fa-fist-raised' }, { key: ['巫師', '法師'], class: 'bg-job-wizard', icon: 'fa-hat-wizard' },
    { key: ['賢者'], class: 'bg-job-sage', icon: 'fa-book' }, { key: ['槍手'], class: 'bg-job-gunslinger', icon: 'fa-bullseye' }, { key: ['舞孃'], class: 'bg-job-dancer', icon: 'fa-star' },
    { key: ['刺客', '盜賊'], class: 'bg-job-assassin', icon: 'fa-skull' }, { key: ['流氓'], class: 'bg-job-rogue', icon: 'fa-mask' }
];

const JOB_STRUCTURE = {
    "騎士": ["龍", "敏爆", "其他"], "十字軍": ["坦", "輸出", "其他"], "鐵匠": ["戰鐵", "鍛造", "其他"], "煉金": ["一般", "其他"],
    "獵人": ["鳥", "陷阱", "AD", "其他"], "詩人": ["輔助", "輸出", "其他"], "舞孃": ["輔助", "輸出", "其他"],
    "神官": ["讚美", "驅魔", "暴牧", "其他"], "武僧": ["連技", "阿修", "其他"], "巫師": ["隕石", "冰雷", "其他"],
    "賢者": ["輔助", "法系", "其他"], "刺客": ["敏爆", "毒", "雙刀", "其他"], "流氓": ["脫裝", "輸出", "弓", "其他"],
    "槍手": ["一般", "其他"], "初心者": ["超級初心者", "其他"]
};

// 用於 Demo 模式的備用資料 (當 Firebase 連線失敗時使用)
const SEED_DATA = [
    { lineName: "poppy🐶", gameName: "YT清燉小羔羊", mainClass: "神官(讚美)", role: "輔助", rank: "會長", intro: "公會唯一清流" }
    // ... 可以保留原本的長長名單作為備用 ...
];
const SEED_GROUPS = [];

// App 主要邏輯
const App = {
    db: null, auth: null, 
    collectionMembers: 'members', 
    collectionGroups: 'groups', 
    collectionActivities: 'activities',
    
    members: [], groups: [], activities: [], history: [], 
    currentFilter: 'all', currentJobFilter: 'all', currentTab: 'home', mode: 'demo', currentSquadMembers: [],
    userRole: 'guest', 

    init: async function() {
        // 1. 恢復登入狀態
        const savedRole = localStorage.getItem('row_user_role');
        if (savedRole && ['admin', 'master', 'commander'].includes(savedRole)) this.userRole = savedRole;
        
        // 2. 嘗試連線 Firebase (優先使用 config.js 的全域變數)
        if (typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined') {
            console.log("Found Firebase Config via config.js, connecting...");
            this.initFirebase(FIREBASE_CONFIG);
        } else {
            console.warn("No Firebase Config found, fallback to Demo mode.");
            this.initDemoMode();
        }
        
        this.setupListeners(); 
        this.updateAdminUI(); 
        this.switchTab('home'); 
    },
    
    sortMembers: function(membersArray) {
        return membersArray.sort((a, b) => {
            const getTime = (m) => {
                if (m.createdAt === null) return Date.now(); 
                if (typeof m.createdAt === 'object') {
                    if (typeof m.createdAt.toMillis === 'function') return m.createdAt.toMillis();
                    if (m.createdAt.seconds !== undefined) return m.createdAt.seconds * 1000 + (m.createdAt.nanoseconds || 0) / 1000000;
                }
                return new Date(m.createdAt).getTime() || 0; 
            };

            const timeA = getTime(a); const timeB = getTime(b);
            if (timeA !== timeB) return timeA - timeB;
            return (a.gameName || '').localeCompare(b.gameName || '');
        });
    },

    initFirebase: async function(config) {
        try {
            if (!firebase.apps.length) firebase.initializeApp(config);
            this.auth = firebase.auth(); this.db = firebase.firestore(); this.mode = 'firebase';
            
            // 匿名登入 (繞過基本權限檢查，但主要依賴 Firestore Rules)
            await this.auth.signInAnonymously();

            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app';
            const publicData = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            
            // 監聽成員資料
            publicData.collection(this.collectionMembers).onSnapshot(snap => { 
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); 
                this.members = this.sortMembers(arr); 
                // 如果第一次載入且資料庫全空，則寫入種子資料 (可選)
                if (snap.size === 0 && this.userRole === 'master') { 
                    console.log("Empty DB detected, seeding...");
                    // this.seedFirebaseMembers(); // 暫時註解掉避免意外寫入，會長可手動觸發
                }
                this.render(); 
            }, err => {
                console.error("Firestore Error:", err);
                alert("連線資料庫失敗，請檢查網路或 Firestore 權限設定。將切換至本機模式。");
                this.initDemoMode();
            });

            // 監聽隊伍資料
            publicData.collection(this.collectionGroups).onSnapshot(snap => { 
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); 
                this.groups = arr; this.render(); 
            });

            // 監聽活動資料
            publicData.collection(this.collectionActivities).orderBy('createdAt', 'desc').onSnapshot(snap => {
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                this.activities = arr; this.renderActivities();
            });

        } catch (e) { 
            console.error("Firebase Init Failed", e); 
            this.initDemoMode(); 
        }
    },

    initDemoMode: function() {
        this.mode = 'demo';
        console.log("Running in Demo Mode");
        // 如果 LocalStorage 沒資料，就用 SEED_DATA
        this.members = JSON.parse(localStorage.getItem('row_local_members') || JSON.stringify(SEED_DATA));
        this.groups = JSON.parse(localStorage.getItem('row_local_groups') || "[]");
        this.activities = JSON.parse(localStorage.getItem('row_local_activities') || "[]");
        this.members = this.sortMembers(this.members); 
        this.render();
    },

    // 其他函式保持不變，直接從原本的 app.js 複製貼上即可
    // 包含: seedFirebaseMembers, saveLocal, loadHistory, logChange...
    // ...
    // 請確保以下的 handleLogin 邏輯保留：

    openLoginModal: function() {
        if(this.userRole !== 'guest') { 
            if(confirm("確定要登出嗎？")) { this.userRole = 'guest'; localStorage.removeItem('row_user_role'); this.updateAdminUI(); } 
        } else { document.getElementById('loginForm').reset(); this.showModal('loginModal'); }
    },
    handleLogin: function() {
        const u = document.getElementById('loginUser').value; const p = document.getElementById('loginPass').value;
        // 注意：這是純前端的簡易驗證，在公開代碼中並不安全，僅防君子
        if(p !== '123456') { alert("密碼錯誤"); return; }
        if(u === 'poppy') this.userRole = 'master'; else if (u === 'yuan') this.userRole = 'admin'; else if (u === 'commander') this.userRole = 'commander'; else { alert("帳號錯誤"); return; }
        localStorage.setItem('row_user_role', this.userRole);
        this.closeModal('loginModal'); this.updateAdminUI(); alert("登入成功！");
    },
    
    // (將原本 app.js 剩餘的所有函式全部複製貼在這裡，不需要做修改)
    // updateAdminUI, switchTab, handleMainAction, saveMemberData, etc...
    // ...
    // ...

    // 為節省篇幅，此處省略中間未修改的邏輯，請務必補上
    
    // 結尾
    updateAdminUI: function() {
        const btn = document.getElementById('adminToggleBtn'); const adminControls = document.getElementById('adminControls');
        if(this.userRole !== 'guest') { btn.classList.add('admin-mode-on', 'text-blue-600'); btn.innerHTML = '<i class="fas fa-sign-out-alt"></i>'; document.getElementById('adminControls').classList.remove('hidden'); } 
        else { btn.classList.remove('admin-mode-on', 'text-blue-600'); btn.innerHTML = '<i class="fas fa-user-shield"></i>'; document.getElementById('adminControls').classList.add('hidden'); }
        
        const masterHint = document.getElementById('masterHint');
        if(masterHint && this.currentTab === 'activities') masterHint.classList.toggle('hidden', this.userRole !== 'master');

        const mainBtn = document.getElementById('mainActionBtn');
        if (this.currentTab === 'activities') {
            mainBtn.classList.toggle('hidden', this.userRole !== 'master');
            mainBtn.innerHTML = '<i class="fas fa-plus"></i>';
        } else if (this.currentTab === 'gvg' || this.currentTab === 'groups') {
            mainBtn.classList.toggle('hidden', !['master', 'admin', 'commander'].includes(this.userRole));
            mainBtn.innerHTML = '<i class="fas fa-plus"></i>';
        } else {
            mainBtn.classList.remove('hidden');
            mainBtn.innerHTML = '<i class="fas fa-plus"></i>';
        }
        this.render();
    },
    
    // ... (記得把所有原本的函式都放進來) ...
    // 這裡只是示範架構，請將原本 app.js 的所有 helper function 都複製進來
    // sortMembers, seedFirebaseMembers, saveLocal, loadHistory, logChange, showHistoryModal, 
    // switchTab, handleMainAction, saveMemberData, addMember, updateMember, deleteMember,
    // saveSquad, deleteSquad, toggleMemberStatus, render, renderMembers, createCardHTML,
    // renderSquads, copyText, copySquadList, openAddModal, openEditModal, updateBaseJobSelect,
    // updateSubJobSelect, toggleJobInputMode, openSquadModal, toggleSquadMember, renderSquadMemberSelect,
    // showModal, closeModal, setupListeners, setFilter, setJobFilter, exportCSV, downloadSelf,
    // saveConfig (這個可以刪除或留空), resetToDemo (修改成清除 localStorage 即可),
    // renderActivities, openActivityEditModal, editActivity, saveActivity, deleteActivity,
    // renderWinnerListEdit, openClaimModal, renderClaimList, toggleClaim

    // 重新定義 resetToDemo 以符合新架構
    resetToDemo: function() { 
        if(confirm("這將清除本機快取，重新載入頁面。")) {
            localStorage.removeItem('row_local_members'); 
            localStorage.removeItem('row_local_groups'); 
            localStorage.removeItem('row_mod_history'); 
            location.reload(); 
        }
    },
    
    // 剩下的 Helper functions...
    showModal: function(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal: function(id) { document.getElementById(id).classList.add('hidden'); },
    setupListeners: function() {},
    setFilter: function(f) { this.currentFilter = f; this.renderMembers(); },
    setJobFilter: function(j) { this.currentJobFilter = j; this.renderMembers(); },
    exportCSV: function() {
        let csv = "\uFEFFLINE 暱稱,遊戲 ID,主職業,定位,公會職位,備註\n";
        this.members.forEach(m => csv += `"${m.lineName}","${m.gameName}","${m.mainClass}","${m.role}","${m.rank||'成員'}","${m.intro}"\n`);
        const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv); link.download = "ROW成員.csv";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },
    downloadSelf: function() { alert("請使用瀏覽器的「另存新檔」功能備份。"); },
    
    // 請務必補齊 renderMembers, createCardHTML, renderSquads 等所有渲染邏輯
    // ... (為確保程式碼能運作，建議直接使用你原始檔案的後半段，只需修改 init 即可)
    renderMembers: function() {
        // (與原版相同)
        const grid = document.getElementById('memberGrid');
        const searchVal = document.getElementById('searchInput').value.toLowerCase();
        let filtered = this.members.filter(item => {
            const matchText = (item.lineName + item.gameName + item.mainClass + item.role + (item.intro||"")).toLowerCase().includes(searchVal);
            const matchRole = this.currentFilter === 'all' || item.role.includes(this.currentFilter) || (this.currentFilter === '坦' && item.mainClass.includes('坦'));
            const matchJob = this.currentJobFilter === 'all' || (item.mainClass||"").startsWith(this.currentJobFilter);
            return matchText && matchRole && matchJob;
        });
        document.getElementById('memberCount').innerText = `Total: ${filtered.length}`;
        document.getElementById('stat-dps').innerText = this.members.filter(d => d.role.includes('輸出')).length;
        document.getElementById('stat-sup').innerText = this.members.filter(d => d.role.includes('輔助')).length;
        document.getElementById('stat-tank').innerText = this.members.filter(d => d.role.includes('坦')).length;
        grid.innerHTML = filtered.map((item, idx) => this.createCardHTML(item, idx)).join('');
    },
    
    // (這裡需要把 createCardHTML 完整貼上，我先幫你補上關鍵部分)
    createCardHTML: function(item, idx) {
         // (與原版完全相同，請直接複製)
         const jobName = item.mainClass || '';
         const style = JOB_STYLES.find(s => s.key.some(k => jobName.includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
         // ... (省略中間 HTML 生成代碼) ...
         let rankBadge = '';
         if(item.rank === '會長') rankBadge = `<span class="rank-badge rank-master">會長</span>`;
         else if(item.rank === '指揮官') rankBadge = `<span class="rank-badge rank-commander">指揮官</span>`;
         else if(item.rank === '資料管理員') rankBadge = `<span class="rank-badge rank-admin">管理</span>`;
         
         const memberSquads = this.groups.filter(g => g.members.some(m => (typeof m === 'string' ? m : m.id) === item.id));
         const squadBadges = memberSquads.map(s => {
             const color = s.type === 'gvg' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100';
             return `<span class="${color} text-[10px] px-1.5 rounded border truncate inline-block max-w-[80px]">${s.name}</span>`;
         }).join('');
         
         const displayNo = `#${(idx + 1).toString().padStart(2, '0')}`;
         const getRoleBadge = (r) => {
             if (r.includes('輸出')) return `<span class="tag tag-dps">${r}</span>`;
             else if (r.includes('坦')) return `<span class="tag tag-tank">${r}</span>`;
             else if (r.includes('輔助')) return `<span class="tag tag-sup">${r}</span>`;
             return ''; 
         }

         return `
             <div class="card cursor-pointer group relative" onclick="app.openEditModal('${item.id}')">
                 <div class="member-no text-xs font-cute font-bold">${displayNo}</div>
                 <div class="job-stripe ${style.class}"></div>
                 <div class="job-icon-area ${style.class} bg-opacity-20">
                     <i class="fas ${style.icon} ${style.class.replace('bg-', 'text-')} opacity-80 group-hover:scale-110 transition"></i>
                 </div>
                 <div class="flex-grow p-2.5 flex flex-col justify-between min-w-0">
                     <div>
                         <div class="flex justify-between items-start pr-6">
                             <div class="flex items-center gap-1 min-w-0">
                                 ${rankBadge}
                                 <h3 class="font-bold text-slate-700 text-base truncate">${item.gameName || '未命名'}</h3>
                             </div>
                             ${getRoleBadge(item.role)}
                         </div>
                         <div class="text-xs font-bold text-slate-400 mt-0.5">${item.mainClass || '未定'}</div>
                     </div>
                     <div class="flex justify-between items-end mt-1">
                         <div class="flex flex-col gap-1 w-full mr-1">
                                <div class="flex items-center text-[10px] text-slate-400 font-mono bg-white border border-slate-100 rounded px-1.5 py-0.5 w-fit hover:bg-slate-50 copy-tooltip" 
                                     onclick="event.stopPropagation(); app.copyText(this, '${item.lineName}')">
                                     <i class="fab fa-line mr-1 text-green-500"></i> ${item.lineName}
                                    </div>
                                    <div class="flex gap-1 overflow-hidden h-4">${squadBadges}</div>
                         </div>
                         ${item.intro ? `<i class="fas fa-info-circle text-blue-200 hover:text-blue-500" title="${item.intro}"></i>` : ''}
                     </div>
                 </div>
             </div>
         `;
    },
    
    // (請繼續補上 renderSquads, copyText 等所有 UI 相關函式)
    // 這些函式跟 Firebase 無關，直接使用原版即可
    copyText: function(el, text) { navigator.clipboard.writeText(text).then(() => { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1500); }); },
    
    // 為了讓程式能跑，我這裡必須加上這行：
    // ... 假設所有其他 Helper functions 都在這裡 ...
};

// ** 重要：補齊遺漏的 Helper Functions (從你原本的代碼搬過來) **
// 為了確保你複製貼上能用，請務必把原檔 app.js 中，從 `renderSquads: function()...` 到最後 `toggleClaim` 的所有函式都保留在 App 物件中。
// 並且將 `saveConfig` 刪除，改為我上面寫的 `resetToDemo`。

window.app = App; window.onload = () => App.init();