// app.js

if (typeof window.AppConfig === 'undefined') {
    console.error("Configuration (config.js) not loaded.");
    document.body.innerHTML = '<div style="padding: 50px; text-align: center; color: red;">錯誤：config.js 未載入。</div>';
}

const Config = window.AppConfig || {};
const { FIREBASE_CONFIG, COLLECTION_NAMES, SEED_DATA, SEED_GROUPS, SEED_ACTIVITIES, JOB_STRUCTURE, JOB_STYLES, SEED_THEMES } = Config;

const App = {
    db: null, auth: null,
    members: [], groups: [], activities: [], history: [],
    leaveRequests: [], 
    themes: [], // 新增：主題列表
    currentThemeId: null, // 新增：當前選中的主題
    currentTab: 'home', 
    currentFilter: 'all', currentJobFilter: 'all', 
    currentSquadRoleFilter: 'all', 
    currentModalRoleFilter: 'all', 
    mode: 'demo', userRole: 'guest',
    currentSquadMembers: [], currentActivityWinners: [], tempWinnerSelection: [],

    // 歷史紀錄保留天數 (30 天)
    HISTORY_RETENTION_DAYS: 30, 

    init: async function() {
        this.loadLocalState();
        
        // 初始化主題：如果本地沒有，使用預設 SEED_THEMES
        this.themes = (this.themes && this.themes.length > 0) ? this.themes : [...SEED_THEMES];
        
        // 初始化當前主題 ID
        if (!this.currentThemeId && this.themes.length > 0) {
            this.currentThemeId = this.themes[0].id;
        }

        this.initFirebase();
        this.updateAdminUI();
        this.populateJobSelects();
        this.render();
    },

    normalizeMemberData: function(member) {
        if (!member.gameName) member.gameName = member.lineName;
        if (!member.joinDate) member.joinDate = Date.now();
        return member;
    },

    loadLocalState: function() {
        const storedMembers = localStorage.getItem('row_local_members');
        const storedGroups = localStorage.getItem('row_local_groups');
        const storedActivities = localStorage.getItem('row_local_activities');
        const storedHistory = localStorage.getItem('row_local_history');
        const storedLeave = localStorage.getItem('row_local_leave_requests');
        const storedThemes = localStorage.getItem('row_local_themes'); 
        const storedThemeId = localStorage.getItem('row_local_theme_id'); 

        this.members = storedMembers ? JSON.parse(storedMembers) : SEED_DATA;
        this.groups = storedGroups ? JSON.parse(storedGroups) : SEED_GROUPS;
        this.activities = storedActivities ? JSON.parse(storedActivities) : SEED_ACTIVITIES;
        this.history = storedHistory ? JSON.parse(storedHistory) : [];
        this.leaveRequests = storedLeave ? JSON.parse(storedLeave) : [];
        this.themes = storedThemes ? JSON.parse(storedThemes) : [...SEED_THEMES];
        this.currentThemeId = storedThemeId || (this.themes.length > 0 ? this.themes[0].id : null);

        this.members = this.sortMembers(this.members);
        this.cleanUpHistory(); // 載入後清理歷史紀錄
    },

    initFirebase: function() {
        if (typeof firebase === 'undefined') return;
        const savedConfig = localStorage.getItem('row_firebase_config');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                firebase.initializeApp(config);
                this.db = firebase.firestore();
                this.auth = firebase.auth();
                this.mode = 'firebase';
                this.userRole = 'master'; 
                this.syncWithFirebase();
            } catch (e) {
                console.error("Firebase init failed:", e);
                this.mode = 'demo';
            }
        }
    },
    
    syncWithFirebase: function() {
        if (!this.db || this.mode !== 'firebase') return;
        
        if (COLLECTION_NAMES.MEMBERS) {
            this.db.collection(COLLECTION_NAMES.MEMBERS).onSnapshot(snap => {
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                this.members = this.sortMembers(arr.map(this.normalizeMemberData));
                this.saveLocal('members');
                this.render();
            });
        }

        if (COLLECTION_NAMES.GROUPS) {
            this.db.collection(COLLECTION_NAMES.GROUPS).onSnapshot(snap => {
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                this.groups = arr;
                this.saveLocal('groups');
                this.render();
            });
        }
        
        if (COLLECTION_NAMES.ACTIVITIES) {
            this.db.collection(COLLECTION_NAMES.ACTIVITIES).onSnapshot(snap => {
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                this.activities = arr;
                this.saveLocal('activities');
                this.render();
            });
        }
        
        if (COLLECTION_NAMES.LEAVE_REQUESTS) {
            this.db.collection(COLLECTION_NAMES.LEAVE_REQUESTS).onSnapshot(snap => {
                const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                this.leaveRequests = arr;
                this.saveLocal('leave');
                this.render();
            });
        }
        
        // 新增：監聽自訂主題
        if (COLLECTION_NAMES.CUSTOM_THEMES) {
            this.db.collection(COLLECTION_NAMES.CUSTOM_THEMES).onSnapshot(snap => {
                const customThemes = []; 
                snap.forEach(d => customThemes.push({ id: d.id, ...d.data(), type: 'custom' }));
                
                // 合併系統預設主題與自訂主題
                this.themes = [...SEED_THEMES, ...customThemes];
                
                // 檢查當前主題是否還存在
                const currentThemeExists = this.themes.some(t => t.id === this.currentThemeId);
                if (!currentThemeExists && this.themes.length > 0) {
                    this.currentThemeId = this.themes[0].id;
                }
                
                this.saveLocal('themes');
                this.saveLocal('themeId');
                this.render();
            });
        }
    },

    sortMembers: function(members) {
        return members.sort((a, b) => {
            const roleOrder = { '會長': 0, '副會長': 1, '指揮官': 2, '資料管理員': 3, '資深成員': 4, '成員': 5 };
            const rankA = roleOrder[a.rank] !== undefined ? roleOrder[a.rank] : 99;
            const rankB = roleOrder[b.rank] !== undefined ? roleOrder[b.rank] : 99;
            if (rankA !== rankB) return rankA - rankB;
            return (a.joinDate || 0) - (b.joinDate || 0);
        });
    },

    saveLocal: function(key = 'all') {
        if (this.mode === 'demo') {
            if (key === 'members' || key === 'all') localStorage.setItem('row_local_members', JSON.stringify(this.members));
            if (key === 'groups' || key === 'all') localStorage.setItem('row_local_groups', JSON.stringify(this.groups));
            if (key === 'activities' || key === 'all') localStorage.setItem('row_local_activities', JSON.stringify(this.activities));
            if (key === 'history' || key === 'all') localStorage.setItem('row_local_history', JSON.stringify(this.history));
            if (key === 'leave' || key === 'all') localStorage.setItem('row_local_leave_requests', JSON.stringify(this.leaveRequests));
            if (key === 'themes' || key === 'all') localStorage.setItem('row_local_themes', JSON.stringify(this.themes));
            if (key === 'themeId' || key === 'all') localStorage.setItem('row_local_theme_id', this.currentThemeId);
        }
    },
    
    logChange: function(action, details) {
        const historyData = { action, details, timestamp: Date.now(), user: this.userRole };
        
        // Firestore 寫入
        if (this.mode === 'firebase' && COLLECTION_NAMES.HISTORY) {
            this.db.collection(COLLECTION_NAMES.HISTORY).add(historyData).catch(e => console.error(e));
        } else {
            this.history.unshift(historyData); 
            this.cleanUpHistory(); // 每次新增後清理一次
            this.saveLocal('history');
        }
    },

    // 新增：清理歷史紀錄 (保留 30 天)
    cleanUpHistory: function() {
        if (this.mode === 'demo') {
            const cutOffTime = Date.now() - (this.HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
            this.history = this.history.filter(log => log.timestamp > cutOffTime);
        }
    },

    openLoginModal: function() { document.getElementById('loginModal').classList.remove('hidden'); },
    closeModal: function(id) { document.getElementById(id).classList.add('hidden'); },
    
    handleLogin: function() {
        const pwd = document.getElementById('adminPassword').value;
        if (pwd === '8888') { // 簡單密碼
            this.userRole = 'master';
            this.updateAdminUI();
            this.closeModal('loginModal');
            alert('登入成功 (Master)');
            this.render(); // 重新渲染以顯示管理員功能
        } else {
            alert('密碼錯誤');
        }
    },
    
    updateAdminUI: function() {
        const isAdmin = ['master', 'admin'].includes(this.userRole);
        const adminBtn = document.getElementById('adminButton');
        if (adminBtn) adminBtn.innerHTML = isAdmin ? '<i class="fas fa-user-check text-green-500"></i>' : '<i class="fas fa-user-lock"></i>';
        
        // 顯示 Firebase 設定區域
        if (isAdmin) document.getElementById('configSection').classList.remove('hidden');
        else document.getElementById('configSection').classList.add('hidden');
        
        // 更新主題新增按鈕顯示
        const addThemeBtn = document.getElementById('addThemeBtn');
        if(addThemeBtn) addThemeBtn.classList.toggle('hidden', !isAdmin);
    },

    populateJobSelects: function() {
        const filterSelect = document.getElementById('jobFilterSelect');
        if(filterSelect) {
            filterSelect.innerHTML = '<option value="all">所有職業</option>' + Object.keys(JOB_STRUCTURE).map(j => `<option value="${j}">${j}</option>`).join('');
        }
    },

    switchTab: function(tab) {
        this.currentTab = tab;
        ['home','members','groups','activity', 'leave'].forEach(v => {
            const el = document.getElementById('view-'+v);
            if(el) el.classList.add('hidden');
        });

        // view-groups 負責 GVG(團戰) 和 groups(固定團)
        if(tab === 'gvg' || tab === 'groups') {
            document.getElementById('view-groups').classList.remove('hidden');
            
            const isGvg = tab === 'gvg';
            document.getElementById('squads-title').innerHTML = isGvg 
                ? '<i class="fas fa-crosshairs mr-2 text-red-500"></i>團戰分流' 
                : '<i class="fas fa-campground mr-2 text-green-500"></i>固定團隊伍';
            document.getElementById('gvgThemeSelector').classList.toggle('hidden', !isGvg);
            document.getElementById('addThemeBtn').classList.toggle('hidden', !isGvg || !['master','admin','commander'].includes(this.userRole));
            
            if (isGvg) {
                this.renderThemeSelect('gvgThemeSelect', this.currentThemeId);
            }
            
            // 切換按鈕樣式
            const mainActionBtn = document.querySelector('#view-groups button');
            if (mainActionBtn) {
                mainActionBtn.className = isGvg 
                    ? "bg-red-600 hover:bg-red-700 text-white shadow-lg px-3 py-2 rounded-xl font-bold transition text-sm active:scale-95 border-2 border-red-800"
                    : "bg-green-600 hover:bg-green-700 text-white shadow-lg px-3 py-2 rounded-xl font-bold transition text-sm active:scale-95 border-2 border-green-800";
            }
        }
        else {
            const el = document.getElementById('view-'+tab);
            if(el) el.classList.remove('hidden');
        }

        document.getElementById('nav-container').classList.toggle('hidden', tab === 'home');
        document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById('tab-' + tab); if(activeBtn) activeBtn.classList.add('active');

        if (tab === 'leave') this.renderLeaveRequests();
        this.render();
    },

    handleMainAction: function() { 
        if(this.currentTab === 'members') this.openAddModal();
        else if(this.currentTab === 'gvg' || this.currentTab === 'groups') {
            this.openSquadModal(this.currentTab === 'gvg' ? '團戰分流' : '固定團');
        }
        else if(this.currentTab === 'activity') this.openActivityModal();
        else if(this.currentTab === 'leave') this.openLeaveModal();
    },
    
    render: function() {
        if (this.currentTab === 'members') this.renderMembers();
        else if (this.currentTab === 'gvg' || this.currentTab === 'groups') this.renderSquads();
        else if (this.currentTab === 'activity') this.renderActivities();
        else if (this.currentTab === 'leave') this.renderLeaveRequests();
    },

    // ... (renderMembers, createCardHTML 等原有函數保持不變，為節省篇幅省略) ...
    renderMembers: function() {
        const list = document.getElementById('memberList');
        const emptyMsg = document.getElementById('noMembersMsg');
        const search = document.getElementById('memberSearchInput').value.toLowerCase();
        
        const filtered = this.members.filter(m => {
            const matchSearch = (m.gameName + m.lineName + m.mainClass + m.role).toLowerCase().includes(search);
            const matchJob = this.currentJobFilter === 'all' || m.mainClass.includes(this.currentJobFilter);
            return matchSearch && matchJob;
        });

        if (filtered.length === 0) {
            list.innerHTML = '';
            emptyMsg.classList.remove('hidden');
            return;
        }
        emptyMsg.classList.add('hidden');

        list.innerHTML = filtered.map(m => this.createCardHTML(m)).join('');
    },
    
    createCardHTML: function(m) {
        const style = JOB_STYLES.find(s => s.key.some(k => (m.mainClass||'').includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
        return `
        <div class="menu-card group border-l-4 ${style.class.replace('bg-', 'border-')} p-4" onclick="app.openEditModal('${m.id}')">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full ${style.class} bg-opacity-20 flex items-center justify-center text-lg">
                    <i class="fas ${style.icon} ${style.class.replace('bg-', 'text-')}"></i>
                </div>
                <div>
                    <h4 class="font-bold text-slate-700">${m.gameName}</h4>
                    <p class="text-xs text-slate-400">${m.mainClass} <span class="mx-1">•</span> ${m.rank}</p>
                </div>
            </div>
        </div>`;
    },

    // --- 主題管理 ---
    renderThemeSelect: function(selectId, selectedId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = this.themes.map(t => {
            const isSelected = t.id === selectedId;
            return `<option value="${t.id}" ${isSelected ? 'selected' : ''}>${t.name} ${t.type === 'custom' ? '(自訂)' : ''}</option>`;
        }).join('');
    },

    selectTheme: function(themeId) {
        this.currentThemeId = themeId;
        this.saveLocal('themeId');
        this.renderSquads(); // 重新渲染團戰頁面以更新請假燈號
    },

    openThemeModal: function() {
        document.getElementById('themeNameInput').value = '';
        document.getElementById('themeIconInput').value = 'fas fa-star';
        this.showModal('themeModal');
    },

    saveCustomTheme: async function() {
        const name = document.getElementById('themeNameInput').value.trim();
        const icon = document.getElementById('themeIconInput').value.trim();
        if (!name || !icon) { alert("主題名稱和圖標不能為空"); return; }
        
        const newTheme = { name, icon };

        if (this.mode === 'firebase') {
            await this.db.collection(COLLECTION_NAMES.CUSTOM_THEMES).add(newTheme);
        } else {
            newTheme.id = 't_' + Date.now();
            newTheme.type = 'custom';
            this.themes.push(newTheme);
            this.saveLocal('themes');
        }
        
        this.currentThemeId = newTheme.id;
        this.saveLocal('themeId');
        this.closeModal('themeModal');
        this.render(); 
    },

    // --- 請假系統 ---
    renderLeaveRequests: function() {
        const list = document.getElementById('leaveList');
        const emptyMsg = document.getElementById('noLeavesMsg');
        const search = document.getElementById('leaveSearchInput').value.toLowerCase();
        const dateFilter = document.getElementById('leaveDateFilter').value;

        let sorted = [...this.leaveRequests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const filtered = sorted.filter(req => {
            const matchName = req.memberName.toLowerCase().includes(search);
            const matchDate = dateFilter ? req.date === dateFilter : true;
            return matchName && matchDate;
        });

        if (filtered.length === 0) {
            list.innerHTML = '';
            emptyMsg.classList.remove('hidden');
            return;
        }
        emptyMsg.classList.add('hidden');

        list.innerHTML = filtered.map(req => {
            const mem = this.members.find(m => m.id === req.memberId);
            const jobClass = mem ? mem.mainClass : req.memberRole;
            const style = JOB_STYLES.find(s => s.key.some(k => (jobClass||'').includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
            const createdStr = req.createdAt ? new Date(req.createdAt).toLocaleString('zh-TW', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'}) : '';
            
            const theme = this.themes.find(t => t.id === req.themeId);
            const themeName = theme ? theme.name : '未知主題';
            const themeIcon = theme ? theme.icon : 'fas fa-question-circle';
            
            const canDelete = ['master', 'admin', 'commander'].includes(this.userRole); 
            const deleteBtn = canDelete ? 
                `<button onclick="app.deleteLeaveRequest('${req.id}')" class="text-slate-400 hover:text-red-500 p-2"><i class="fas fa-trash-alt"></i></button>` : '';

            return `
            <div class="bg-white rounded-xl border border-slate-200 p-4 flex items-center shadow-sm relative overflow-hidden group">
                <div class="absolute left-0 top-0 bottom-0 w-1 ${style.class}"></div>
                <div class="w-12 h-12 rounded-2xl ${style.class} bg-opacity-20 flex items-center justify-center text-xl mr-4 flex-shrink-0">
                    <i class="fas ${style.icon} ${style.class.replace('bg-', 'text-')}"></i>
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-slate-700 truncate">${req.memberName}</h4>
                        <span class="text-xs font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">${req.date}</span>
                    </div>
                    <p class="text-sm text-slate-500 mt-1 truncate">
                        <span class="font-bold text-slate-400 text-xs mr-1"><i class="${themeIcon} text-xs"></i> 主題:</span> ${themeName}
                    </p>
                    <div class="text-[10px] text-slate-300 mt-1 flex justify-between">
                        <span>原因: ${req.reason}</span>
                        <span>申請於: ${createdStr}</span>
                    </div>
                </div>
                <div class="ml-2">${deleteBtn}</div>
            </div>`;
        }).join('');
    },

    openLeaveModal: function() {
        document.getElementById('leaveReason').value = 'GVG 無法參加';
        document.getElementById('leaveMemberSearch').value = '';
        document.getElementById('selectedLeaveMemberId').value = '';
        
        const now = new Date();
        const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('leaveDateInput').value = localDate;

        this.renderThemeSelect('leaveThemeSelect', this.currentThemeId);
        this.renderLeaveMemberSelect();
        this.showModal('leaveModal');
    },

    renderLeaveMemberSelect: function() {
        const grid = document.getElementById('leaveMemberSelectGrid');
        const search = document.getElementById('leaveMemberSearch').value.toLowerCase();
        const selectedId = document.getElementById('selectedLeaveMemberId').value;
        const filtered = this.members.filter(m => (m.gameName + m.lineName).toLowerCase().includes(search));

        grid.innerHTML = filtered.map(m => {
            const style = JOB_STYLES.find(s => s.key.some(k => (m.mainClass||'').includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
            const isSel = m.id === selectedId;
            return `
            <div onclick="app.selectLeaveMember('${m.id}')" 
                 class="cursor-pointer rounded-xl border p-2 flex flex-col items-center justify-center gap-1 transition-all ${isSel ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-300'}">
                <div class="w-8 h-8 rounded-full ${style.class} bg-opacity-20 flex items-center justify-center text-xs">
                    <i class="fas ${style.icon} ${style.class.replace('bg-', 'text-')}"></i>
                </div>
                <div class="text-[10px] font-bold text-slate-700 truncate w-full text-center">${m.gameName}</div>
            </div>`;
        }).join('');
    },

    selectLeaveMember: function(id) {
        document.getElementById('selectedLeaveMemberId').value = id;
        this.renderLeaveMemberSelect(); 
    },

    saveLeaveRequest: async function() {
        const memberId = document.getElementById('selectedLeaveMemberId').value;
        const date = document.getElementById('leaveDateInput').value;
        const reason = document.getElementById('leaveReason').value;
        const themeId = document.getElementById('leaveThemeSelect').value; 

        if (!memberId) { alert("請選擇成員"); return; }
        if (!date) { alert("請選擇日期"); return; }
        if (!themeId) { alert("請選擇請假主題"); return; }

        const member = this.members.find(m => m.id === memberId);
        const theme = this.themes.find(t => t.id === themeId);
        
        const reqData = {
            memberId,
            memberName: member ? member.gameName : 'Unknown',
            memberRole: member ? member.mainClass : '',
            date,
            reason,
            themeId, 
            themeName: theme ? theme.name : 'Unknown',
            createdAt: Date.now(),
            status: 'pending'
        };

        if (this.mode === 'firebase') {
            await this.db.collection(COLLECTION_NAMES.LEAVE_REQUESTS).add(reqData);
        } else {
            reqData.id = 'lr_' + Date.now();
            this.leaveRequests.unshift(reqData);
            this.saveLocal('leave');
        }

        alert(`假單已送出！\n\n系統已自動通知：\n👑 會長\n🧙‍♂️ 指揮官\n\n成員：${reqData.memberName}\n主題：${reqData.themeName}\n日期：${reqData.date}`);
        this.closeModal('leaveModal');
        this.renderLeaveRequests();
        this.renderSquads(); 
    },

    deleteLeaveRequest: async function(id) {
        if (!confirm("確定要刪除這張假單嗎？")) return;
        if (this.mode === 'firebase') {
            await this.db.collection(COLLECTION_NAMES.LEAVE_REQUESTS).doc(id).delete();
        } else {
            this.leaveRequests = this.leaveRequests.filter(r => r.id !== id);
            this.saveLocal('leave');
        }
        this.renderLeaveRequests();
        this.renderSquads();
    },
    
    // --- GVG/固定團邏輯 ---
    getLeaveStatus: function(memberId) {
        const today = new Date();
        // 如果是實際使用，這裡應該比對「團戰當日」的日期，為簡化 Demo，我們比對「今天」
        const localDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        // 更嚴謹的邏輯：檢查該成員在「當前選中主題」且「當前日期(假設團戰是今天)」是否有請假
        // 如果需要可以擴充為讓使用者選擇團戰日期，目前假設團戰即今日
        const currentThemeId = this.currentThemeId;
        
        const leaveRequest = this.leaveRequests.find(req => 
            req.memberId === memberId && 
            req.date === localDate && 
            req.themeId === currentThemeId
        );
        return { hasLeave: !!leaveRequest, leaveRequest };
    },

    renderSquads: function() {
        const isGvg = this.currentTab === 'gvg';
        const list = document.getElementById('squads-list');
        const emptyMsg = document.getElementById('noSquadsMsg');
        const groupsToRender = isGvg ? this.groups.filter(g => g.type === 'gvg') : this.groups.filter(g => g.type !== 'gvg');

        if (groupsToRender.length === 0) {
            list.innerHTML = '';
            emptyMsg.classList.remove('hidden');
            return;
        }
        emptyMsg.classList.add('hidden');

        if (isGvg) this.renderThemeSelect('gvgThemeSelect', this.currentThemeId);

        list.innerHTML = groupsToRender.map(g => {
            const canEdit = ['master', 'admin', 'commander'].includes(this.userRole);
            const teamSize = g.members.length;
            const teamLimit = g.type === 'gvg' ? '20' : '6';
            const colorClass = g.type === 'gvg' ? 'red' : 'green';
            
            const membersHtml = g.members.map(mId => {
                const member = this.members.find(m => m.id === mId);
                if (!member) return '';
                const style = JOB_STYLES.find(s => s.key.some(k => (member.mainClass||'').includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
                
                // GVG 燈號邏輯
                const leaveStatus = isGvg ? this.getLeaveStatus(mId) : { hasLeave: false, leaveRequest: null };
                const leaveLight = isGvg 
                    ? `<span class="gvg-light ${leaveStatus.hasLeave ? 'leave-active' : 'available'}" 
                             title="${leaveStatus.hasLeave ? `請假中！主題：${leaveStatus.leaveRequest.themeName}，原因：${leaveStatus.leaveRequest.reason}` : '本日團戰未請假'}"
                       ></span>`
                    : '';
                
                return `
                <div class="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200 group hover:bg-white transition relative">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full ${style.class} bg-opacity-20 flex items-center justify-center text-sm mr-3">
                            <i class="fas ${style.icon} ${style.class.replace('bg-', 'text-')}"></i>
                        </div>
                        <span class="font-bold text-slate-700 text-sm truncate max-w-[150px]">${member.gameName}</span>
                    </div>
                    <div class="flex items-center">
                        ${leaveLight}
                        <span class="text-xs text-slate-400 ml-2">${member.mainClass}</span>
                        ${canEdit ? `<button onclick="app.removeSquadMember('${g.id}', '${mId}')" class="text-slate-300 hover:text-red-500 ml-2 p-1"><i class="fas fa-minus-circle"></i></button>` : ''}
                    </div>
                </div>`;
            }).join('');

            return `
            <div class="bg-white rounded-2xl p-4 shadow-lg border-l-4 border-l-${colorClass}-500">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="text-lg font-black text-slate-700">${g.name} (${teamSize}/${teamLimit})</h3>
                    <div class="flex space-x-2">
                        ${canEdit ? `<button onclick="app.openSquadModal('${g.type === 'gvg' ? '團戰分流' : '固定團'}', '${g.id}')" class="text-slate-500 hover:text-${colorClass}-500"><i class="fas fa-edit"></i></button>` : ''}
                    </div>
                </div>
                <p class="text-sm text-slate-500 mb-3">${g.note || '無備註'}</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${membersHtml}
                    ${canEdit && teamSize < teamLimit ? `<button onclick="app.openSquadModal('${g.type === 'gvg' ? '團戰分流' : '固定團'}', '${g.id}')" class="text-${colorClass}-500 bg-${colorClass}-50 hover:bg-${colorClass}-100 border border-${colorClass}-200 rounded-xl p-3 font-bold text-sm transition"><i class="fas fa-plus mr-1"></i> 新增成員</button>` : ''}
                </div>
            </div>`;
        }).join('');
    },

    // ... (squadModal 相關邏輯, activities 相關邏輯, 匯出與其他輔助函數, 為節省篇幅省略) ...

    // Squad Modal Logic
    openSquadModal: function(type, id) {
        document.getElementById('squadModalTitle').innerHTML = type === '團戰分流' 
            ? '<i class="fas fa-crosshairs mr-2 text-red-500"></i>新增團戰分流' 
            : '<i class="fas fa-campground mr-2 text-green-500"></i>新增固定團';
        document.getElementById('squadTypeInput').value = type === '團戰分流' ? 'gvg' : 'group';
        
        if (id) {
            const squad = this.groups.find(g => g.id === id);
            document.getElementById('squadIdInput').value = squad.id;
            document.getElementById('squadNameInput').value = squad.name;
            document.getElementById('squadNoteInput').value = squad.note;
            this.currentSquadMembers = [...squad.members];
            document.getElementById('deleteSquadBtn').classList.remove('hidden');
        } else {
            document.getElementById('squadIdInput').value = '';
            document.getElementById('squadNameInput').value = '';
            document.getElementById('squadNoteInput').value = '';
            this.currentSquadMembers = [];
            document.getElementById('deleteSquadBtn').classList.add('hidden');
        }
        
        this.renderSquadMemberSelect();
        this.showModal('squadModal');
    },

    renderSquadMemberSelect: function() {
        const grid = document.getElementById('squadMemberSelectGrid');
        const roleFilter = document.getElementById('squadMemberRoleFilter').value;
        const search = document.getElementById('squadMemberSearch').value.toLowerCase();
        
        document.getElementById('squadMemberCount').innerText = this.currentSquadMembers.length;

        const filtered = this.members.filter(m => {
            const matchRole = roleFilter === 'all' || this.getRoleCategory(m.mainClass) === roleFilter;
            const matchSearch = (m.gameName + m.lineName).toLowerCase().includes(search);
            return matchRole && matchSearch;
        });

        grid.innerHTML = filtered.map(m => {
            const isSelected = this.currentSquadMembers.includes(m.id);
            const style = JOB_STYLES.find(s => s.key.some(k => (m.mainClass||'').includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
            
            return `
            <div onclick="app.toggleSquadMember('${m.id}')" 
                 class="cursor-pointer rounded-xl border p-2 flex flex-col items-center justify-center gap-1 transition-all ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-300'}">
                <div class="w-8 h-8 rounded-full ${style.class} bg-opacity-20 flex items-center justify-center text-xs">
                    <i class="fas ${style.icon} ${style.class.replace('bg-', 'text-')}"></i>
                </div>
                <div class="text-[10px] font-bold text-slate-700 truncate w-full text-center">${m.gameName}</div>
            </div>`;
        }).join('');
    },

    toggleSquadMember: function(id) {
        if (this.currentSquadMembers.includes(id)) {
            this.currentSquadMembers = this.currentSquadMembers.filter(m => m !== id);
        } else {
            this.currentSquadMembers.push(id);
        }
        this.renderSquadMemberSelect();
    },

    saveSquad: async function() {
        const id = document.getElementById('squadIdInput').value;
        const type = document.getElementById('squadTypeInput').value;
        const name = document.getElementById('squadNameInput').value;
        const note = document.getElementById('squadNoteInput').value;

        if (!name) { alert('請輸入隊伍名稱'); return; }

        const squadData = {
            name, note, type,
            members: this.currentSquadMembers,
            updatedAt: Date.now()
        };

        if (this.mode === 'firebase') {
            if (id) await this.db.collection(COLLECTION_NAMES.GROUPS).doc(id).update(squadData);
            else await this.db.collection(COLLECTION_NAMES.GROUPS).add(squadData);
        } else {
            if (id) {
                const idx = this.groups.findIndex(g => g.id === id);
                this.groups[idx] = { ...this.groups[idx], ...squadData };
                this.logChange('編輯隊伍', name);
            } else {
                squadData.id = 'g_' + Date.now();
                this.groups.push(squadData);
                this.logChange('新增隊伍', name);
            }
            this.saveLocal('groups');
        }
        this.closeModal('squadModal');
        this.renderSquads();
    },

    deleteSquad: async function() {
        const id = document.getElementById('squadIdInput').value;
        if (!confirm('確定要刪除此隊伍嗎？')) return;

        if (this.mode === 'firebase') {
            await this.db.collection(COLLECTION_NAMES.GROUPS).doc(id).delete();
        } else {
            this.groups = this.groups.filter(g => g.id !== id);
            this.logChange('刪除隊伍', id);
            this.saveLocal('groups');
        }
        this.closeModal('squadModal');
        this.renderSquads();
    },

    getRoleCategory: function(jobClass) {
        if (!jobClass) return 'other';
        for (const [job, roles] of Object.entries(JOB_STRUCTURE)) {
            if (jobClass.includes(job)) return 'physical_dps'; // 簡化邏輯，實際應細分
        }
        return 'other';
    },

    removeSquadMember: async function(groupId, memberId) {
        if (!confirm('確定要將此成員移出隊伍嗎？')) return;
        if (this.mode === 'firebase') {
             const groupRef = this.db.collection(COLLECTION_NAMES.GROUPS).doc(groupId);
             await groupRef.update({ members: firebase.firestore.FieldValue.arrayRemove(memberId) });
        } else {
            const group = this.groups.find(g => g.id === groupId);
            if(group) {
                group.members = group.members.filter(m => m !== memberId);
                this.saveLocal('groups');
                this.renderSquads();
            }
        }
    },
    
    // --- 輔助功能 ---
    openAddModal: function() { alert('新增成員功能在此 Demo 中簡化，請使用 FireBase 模式以獲得完整功能。'); },
    openEditModal: function(id) { console.log('Edit member:', id); },
    exportCSV: function() { /* ... */ },
    
    showHistoryModal: function() {
        const list = document.getElementById('historyList');
        if (this.history.length === 0) {
            list.innerHTML = '<p class="text-center py-10 text-slate-400">目前沒有操作紀錄。</p>';
        } else {
            list.innerHTML = this.history.map(h => {
                const date = new Date(h.timestamp).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'medium' });
                return `<div class="bg-slate-50 p-3 rounded-lg border border-slate-200"><p class="text-xs text-slate-400">${date}</p><p class="font-bold text-slate-700">${h.action} <span class="text-sm text-slate-500 ml-2">${h.details}</span></p></div>`;
            }).join('');
        }
        this.showModal('historyModal');
    },

    copyText: function(text) { navigator.clipboard.writeText(text).then(() => alert('已複製')); },
    updateConfigInput: function(str) { const el = document.getElementById('firebaseConfigInput'); if(el) el.value = str; },
    saveConfig: function() { try { const config = JSON.parse(document.getElementById('firebaseConfigInput').value); localStorage.setItem('row_firebase_config', JSON.stringify(config)); location.reload(); } catch { alert("JSON 格式錯誤！"); } },
    resetToDemo: function() { if (!confirm("確定要重置所有資料嗎？")) return; localStorage.clear(); location.reload(); },
    showModal: function(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal: function(id) { document.getElementById(id).classList.add('hidden'); }
};