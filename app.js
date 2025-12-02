// app.js
// 公會名冊應用程式的所有核心邏輯。

import CONFIG, { FIREBASE_CONFIG, APP_ENV } from './config.js'; // Import FIREBASE_CONFIG and APP_ENV

// 解構配置
const { 
    COLLECTION_NAMES, 
    JOB_STYLES, 
    JOB_STRUCTURE, 
    SEED_DATA, 
    SEED_GROUPS, 
    SEED_ACTIVITIES,
    APP_VERSION 
} = CONFIG;

const App = {
    db: null, auth: null,
    collectionMembers: COLLECTION_NAMES.MEMBERS, 
    collectionGroups: COLLECTION_NAMES.GROUPS, 
    collectionActivities: COLLECTION_NAMES.ACTIVITIES, // NEW: 活動集合名稱
    
    members: [], groups: [], activities: [], // NEW: activities array
    history: [], 
    currentFilter: 'all', currentJobFilter: 'all', currentTab: 'home', mode: 'demo', currentSquadMembers: [],
    currentWinnerSelection: [], // NEW: 暫存得獎者選取名單
    userRole: 'guest', 

    init: async function() {
        const savedRole = localStorage.getItem('row_user_role');
        if (savedRole && ['admin', 'master', 'commander'].includes(savedRole)) {
            this.userRole = savedRole;
        }
        this.loadHistory(); 

        if (typeof firebase !== 'undefined') {
            let config = null;
            // 1. Check Canvas environment variable
            if (typeof __firebase_config !== 'undefined' && __firebase_config) {
                try { config = JSON.parse(__firebase_config); } catch(e) { console.error("Error parsing __firebase_config:", e); }
            }
            // 2. Check Local Storage
            if (!config) { 
                const stored = localStorage.getItem('row_firebase_config'); 
                if (stored) {
                    try { config = JSON.parse(stored); } catch(e) { console.error("Error parsing stored config:", e); }
                }
            }
            // 3. Check Hardcoded Config (NEW FALLBACK)
            if (!config && APP_ENV === 'production') {
                 config = FIREBASE_CONFIG;
                 console.log("Using hardcoded FIREBASE_CONFIG from config.js");
            }

            if (config) { this.initFirebase(config); } else { this.initDemoMode(); }
        } else { this.initDemoMode(); }
        
        this.setupJobFilters(); // Initialize job filter options
        this.updateAdminUI();
        this.switchTab('home'); 
    },
    
    // --- Setup & Initialization (rest remains the same) ---
    sortMembers: function(membersArray) {
        return membersArray.sort((a, b) => {
            const idA = a.id;
            const idB = b.id;
            const isSeedA = /^m\d{2}$/.test(idA);
            const isSeedB = /^m\d{2}$/.test(idB);
            
            if (isSeedA && isSeedB) {
                return idA.localeCompare(idB); 
            }
            if (isSeedA) return -1; 
            if (isSeedB) return 1;  
            
            return (a.gameName || '').localeCompare(b.gameName || '');
        });
    },

    initFirebase: async function(config) {
        try {
            if (!firebase.apps.length) firebase.initializeApp(config);
            this.auth = firebase.auth(); 
            this.db = firebase.firestore(); 
            this.mode = 'firebase';

            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await this.auth.signInWithCustomToken(__initial_auth_token); else await this.auth.signInAnonymously();
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app';
            const user = this.auth.currentUser;
            
            if (user) {
                const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');

                // Members Listener
                publicDataRef.collection(this.collectionMembers).onSnapshot(snap => { 
                    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); 
                    this.members = this.sortMembers(arr); 
                    if (arr.length === 0 && this.members.length === 0) this.seedFirebaseMembers(); else { this.render(); } 
                }, (error) => console.error("Firestore Members Snapshot Error:", error));

                // Groups Listener
                publicDataRef.collection(this.collectionGroups).onSnapshot(snap => { 
                    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); this.groups = arr; this.render(); 
                }, (error) => console.error("Firestore Groups Snapshot Error:", error));
                
                // Activities Listener (NEW)
                publicDataRef.collection(this.collectionActivities).onSnapshot(snap => { 
                    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); this.activities = arr; this.render(); 
                }, (error) => console.error("Firestore Activities Snapshot Error:", error));
            }
        } catch (e) { console.error("Firebase Init Failed", e); this.initDemoMode(); }
    },

    initDemoMode: function() {
        this.mode = 'demo';
        const storedMem = localStorage.getItem('row_local_members'); 
        const storedGrp = localStorage.getItem('row_local_groups');
        const storedAct = localStorage.getItem('row_local_activities'); // NEW: Local activities
        const currentVer = localStorage.getItem('row_data_ver');
        
        if (currentVer !== APP_VERSION) {
            this.members = JSON.parse(JSON.stringify(SEED_DATA));
            this.groups = JSON.parse(JSON.stringify(SEED_GROUPS));
            this.activities = JSON.parse(JSON.stringify(SEED_ACTIVITIES)); // Init new seed data
            
            localStorage.setItem('row_data_ver', APP_VERSION);
            this.saveLocal();
        } else {
            this.members = storedMem ? JSON.parse(storedMem) : JSON.parse(JSON.stringify(SEED_DATA));
            this.groups = storedGrp ? JSON.parse(storedGrp) : JSON.parse(JSON.stringify(SEED_GROUPS));
            this.activities = storedAct ? JSON.parse(storedAct) : JSON.parse(JSON.stringify(SEED_ACTIVITIES)); // Load or init activities
        }
        this.members = this.sortMembers(this.members); 
        this.render();
    },

    seedFirebaseMembers: async function() {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app';
        const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
        const batch = this.db.batch();
        SEED_DATA.forEach(item => { const ref = publicDataRef.collection(this.collectionMembers).doc(); batch.set(ref, item); });
        SEED_ACTIVITIES.forEach(item => { const ref = publicDataRef.collection(this.collectionActivities).doc(); batch.set(ref, item); }); // Seed activities
        await batch.commit();
    },

    saveLocal: function() {
        if (this.mode === 'demo') { 
            localStorage.setItem('row_local_members', JSON.stringify(this.members)); 
            localStorage.setItem('row_local_groups', JSON.stringify(this.groups)); 
            localStorage.setItem('row_local_activities', JSON.stringify(this.activities)); // NEW: Save activities
            localStorage.setItem('row_mod_history', JSON.stringify(this.history)); 
            this.render(); 
        }
    },
    
    // --- Authorization / UI ---
    loadHistory: function() {
        if (this.mode === 'demo') {
            const storedHistory = localStorage.getItem('row_mod_history');
            if (storedHistory) this.history = JSON.parse(storedHistory);
        }
    },
    logChange: function(action, details, targetId) {
        const log = {
            timestamp: Date.now(),
            user: this.userRole,
            action: action,
            details: details,
            targetId: targetId || 'N/A'
        };
        this.history.unshift(log); 
        if (this.mode === 'demo') {
            localStorage.setItem('row_mod_history', JSON.stringify(this.history));
        }
    },
    openLoginModal: function() {
        if(this.userRole !== 'guest') { 
            if(confirm("確定要登出嗎？")) { 
                this.userRole = 'guest'; 
                localStorage.removeItem('row_user_role'); 
                this.updateAdminUI(); 
            } 
        } else { 
            document.getElementById('loginForm').reset(); 
            this.showModal('loginModal'); 
        }
    },
    handleLogin: function() {
        const u = document.getElementById('loginUser').value; const p = document.getElementById('loginPass').value;
        if(p !== '123456') { /* Use a custom modal instead of alert */ console.error("密碼錯誤"); return; } 

        if(u === 'poppy') { 
            this.userRole = 'master';
            /* Use a custom modal instead of alert */ console.log("會長登入成功！"); 
        } else if (u === 'yuan') { 
            this.userRole = 'admin';
            /* Use a custom modal instead of alert */ console.log("資料管理員登入成功！"); 
        } else if (u === 'commander') {
            this.userRole = 'commander';
            /* Use a custom modal instead of alert */ console.log("指揮官登入成功！");
        } else { 
            /* Use a custom modal instead of alert */ console.error("帳號錯誤");
            return;
        }
        
        localStorage.setItem('row_user_role', this.userRole);
        this.closeModal('loginModal'); 
        this.updateAdminUI(); 
    },
    updateAdminUI: function() {
        const btn = document.getElementById('adminToggleBtn');
        const adminControls = document.getElementById('adminControls');
        const addActivityBtn = document.getElementById('addActivityBtn'); // NEW

        // Login Button Status
        if(this.userRole !== 'guest') {
            btn.classList.add('admin-mode-on', 'text-blue-600'); btn.classList.remove('text-slate-400');
            btn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
        } else {
            btn.classList.remove('admin-mode-on', 'text-blue-600'); btn.classList.add('text-slate-400');
            btn.innerHTML = '<i class="fas fa-user-shield"></i>';
        }

        // Global Admin Controls (Download/Config)
        if (['master', 'admin'].includes(this.userRole)) {
            if (adminControls) adminControls.classList.remove('hidden');
        } else {
            if (adminControls) adminControls.classList.add('hidden');
        }

        // Activity Page Add Button (Master Only)
        if (this.userRole === 'master') {
            addActivityBtn.classList.remove('hidden');
        } else {
            addActivityBtn.classList.add('hidden');
        }

        this.render();
    },
    showHistoryModal: function() {
        if (!['master', 'admin'].includes(this.userRole)) {
            console.error("權限不足：僅會長及管理員可查看修改紀錄。");
            return;
        }
        this.loadHistory(); 
        const list = document.getElementById('historyList');
        list.innerHTML = this.history.map(log => {
            const date = new Date(log.timestamp).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const color = log.action.includes('DELETE') || log.action.includes('解散') ? 'text-red-600' : log.action.includes('ADD') || log.action.includes('建立') ? 'text-green-600' : 'text-blue-600';
            return `
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div class="flex justify-between items-center text-xs text-slate-500 font-mono mb-1">
                        <span>${date}</span>
                        <span class="${color} font-bold">${log.action}</span>
                    </div>
                    <p class="text-sm text-slate-800">${log.details}</p>
                    <span class="text-[10px] text-slate-400">by ${log.user} (ID: ${log.targetId})</span>
                </div>`;
        }).join('') || '<p class="text-center text-slate-400 mt-4">尚無修改紀錄。</p>';
        this.showModal('historyModal');
    },

    // --- Tab / Main Action Handlers ---
    switchTab: function(tab) {
        this.currentTab = tab;
        document.getElementById('view-home').classList.toggle('hidden', tab !== 'home');
        document.getElementById('view-members').classList.toggle('hidden', tab !== 'members');
        document.getElementById('view-groups').classList.toggle('hidden', tab !== 'gvg' && tab !== 'groups');
        document.getElementById('view-activity').classList.toggle('hidden', tab !== 'activity'); // NEW: Activity Tab
        
        document.getElementById('nav-container').classList.toggle('hidden', tab === 'home');

        document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById('tab-' + tab);
        if(activeBtn) activeBtn.classList.add('active');

        if(tab === 'gvg') {
            document.getElementById('groupViewTitle').innerText = 'GVG 攻城戰分組';
            document.getElementById('squadModalTitle').innerText = 'GVG 分組管理';
        } else if(tab === 'groups') {
            document.getElementById('groupViewTitle').innerText = '固定團列表';
            document.getElementById('squadModalTitle').innerText = '固定團管理';
        } else if (tab === 'activity') { // NEW
             // Show master warning if not master
            const warning = document.getElementById('activityAdminWarning');
            if (this.userRole !== 'master') warning.classList.remove('hidden');
            else warning.classList.add('hidden');
        }

        this.render();
    },

    handleMainAction: function() { 
        if(this.currentTab === 'members') this.openAddModal(); 
        else if(this.currentTab === 'gvg') {
            if(['master', 'admin', 'commander'].includes(this.userRole)) this.openSquadModal(); 
            else console.error("權限不足：僅有管理人員可建立 GVG 分組");
        }
        else if(this.currentTab === 'groups') {
            if(['master', 'admin', 'commander'].includes(this.userRole)) this.openSquadModal();
            else console.error("權限不足：僅有管理人員可建立固定團");
        }
        else if(this.currentTab === 'activity') { // NEW: Handle activity creation
            if(this.userRole === 'master') this.openActivityModal();
            else console.error("權限不足：僅有會長可新增活動");
        }
    },

    render: function() {
        if (this.currentTab === 'members') this.renderMembers();
        else if (this.currentTab === 'gvg' || this.currentTab === 'groups') this.renderSquads();
        else if (this.currentTab === 'activity') this.renderActivities(); // NEW
    },
    
    // --- Member CRUD (Functions remain largely the same) ---
    saveMemberData: async function() {
        const id = document.getElementById('editId').value;
        let mainClass = "";
        const input = document.getElementById('subJobInput');
        const select = document.getElementById('subJobSelect');
        
        if (!input.classList.contains('hidden')) { 
            mainClass = input.value; 
        } else { 
            mainClass = select.value; 
        }
        
        if (!mainClass || mainClass === "" || mainClass === "先選職業" || mainClass === "選擇流派") mainClass = "待定";
        
        const member = { 
            lineName: document.getElementById('lineName').value, 
            gameName: document.getElementById('gameName').value, 
            mainClass: mainClass, 
            role: document.getElementById('role').value, 
            rank: document.getElementById('rank').value, 
            intro: document.getElementById('intro').value 
        };
        
        let action = '';
        if (id) { 
            await this.updateMember(id, member);
            action = '成員資料更新';
        } else { 
            await this.addMember(member); 
            action = '新增成員';
        }

        this.logChange(action, `${member.gameName} (${member.mainClass})`, id || member.gameName);
        this.closeModal('editModal');
    },

    addMember: async function(member) {
        if (this.mode === 'firebase') { 
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionMembers).add(member); 
        } 
        else { 
            member.id = 'm_' + Date.now(); 
            this.members.push(member); 
            this.members = this.sortMembers(this.members); 
            this.saveLocal(); 
        }
    },
    updateMember: async function(id, member) {
        if (this.mode === 'firebase') { 
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionMembers).doc(id).update(member); 
        } 
        else { 
            const idx = this.members.findIndex(d => d.id === id); 
            if (idx !== -1) { 
                this.members[idx] = { ...this.members[idx], ...member }; 
                this.members = this.sortMembers(this.members); 
                this.saveLocal(); 
            } 
        }
    },
    deleteMember: async function(id) {
        if (!confirm("確定要刪除這位成員嗎？")) return;
        const member = this.members.find(d => d.id === id);
        if (this.mode === 'firebase') { 
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionMembers).doc(id).delete(); 
        } 
        else { 
            this.members = this.members.filter(d => d.id !== id); 
            this.groups.forEach(g => { g.members = g.members.filter(mid => (typeof mid === 'string' ? mid : mid.id) !== id); }); 
            this.activities.forEach(a => { a.winners = a.winners.filter(w => w.memberId !== id); }); // Remove from all activities
            this.saveLocal(); 
        }
        this.logChange('成員刪除', `刪除成員: ${member ? member.gameName : 'Unknown'}`, id);
        this.closeModal('editModal');
    },
    renderMembers: function() {
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
    createCardHTML: function(item, idx) {
        const jobName = item.mainClass || '';
        const style = JOB_STYLES.find(s => s.key.some(k => jobName.includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };
        
        let rankBadge = '';
        if(item.rank === '會長') rankBadge = `<span class="rank-badge rank-master">會長</span>`;
        else if(item.rank === '指揮官') rankBadge = `<span class="rank-badge rank-commander">指揮官</span>`;
        else if(item.rank === '資料管理員') rankBadge = `<span class="rank-badge rank-admin">管理</span>`;

        const memberSquads = this.groups.filter(g => g.members.some(m => (typeof m === 'string' ? m : m.id) === item.id));
        const squadBadges = memberSquads.map(s => {
            const color = s.type === 'gvg' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100';
            return `<span class="${color} text-[10px] px-1.5 py-0.5 rounded border truncate inline-block max-w-[80px]">${s.name}</span>`;
        }).join('');
        
        const origIndex = SEED_DATA.findIndex(s => s.id === item.id);
        const displayNo = origIndex >= 0 ? `#${(origIndex + 1).toString().padStart(2, '0')}` : "•";

        const getRoleBadge = (r) => {
            if (r.includes('輸出')) return `<span class="tag tag-dps">${r}</span>`;
            else if (r.includes('坦')) return `<span class="tag tag-tank">${r}</span>`;
            else if (r.includes('輔助')) return `<span class="tag tag-sup">${r}</span>`;
            return ''; 
        }

        return `
            <div class="card cursor-pointer group relative" onclick="app.openEditModal('${item.id}')">
                <div class="member-no">${displayNo}</div>
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
    openAddModal: function() { 
        document.getElementById('memberForm').reset(); 
        document.getElementById('editId').value = ''; 
        document.getElementById('deleteBtnContainer').innerHTML = ''; 
        document.getElementById('baseJobSelect').value = "";
        this.updateSubJobSelect();
        document.getElementById('subJobSelectWrapper').classList.remove('hidden');
        document.getElementById('subJobInput').classList.add('hidden');
        app.showModal('editModal'); 
    },
    openEditModal: function(id) {
        const item = this.members.find(d => d.id === id); if (!item) return;
        document.getElementById('editId').value = item.id;
        document.getElementById('lineName').value = item.lineName; 
        document.getElementById('gameName').value = item.gameName;
        document.getElementById('role').value = item.role.split(/[ ,]/)[0]||'待定';
        document.getElementById('rank').value = item.rank || '成員';
        document.getElementById('intro').value = item.intro;
        
        const baseSelect = document.getElementById('baseJobSelect');
        const subSelect = document.getElementById('subJobSelect');
        const subInput = document.getElementById('subJobInput');
        const selectWrapper = document.getElementById('subJobSelectWrapper');
        const toggleBtn = document.getElementById('toggleJobBtn');

        baseSelect.innerHTML = '<option value="" disabled selected>選擇職業</option>';
        Object.keys(JOB_STRUCTURE).forEach(job => { 
            const opt = document.createElement('option'); 
            opt.value = job; 
            opt.innerText = job; 
            baseSelect.appendChild(opt); 
        });

        const fullJob = item.mainClass;
        const match = fullJob.match(/^([^(]+)\(([^)]+)\)$/);
        
        if (['master', 'admin'].includes(this.userRole)) { toggleBtn.classList.remove('hidden'); } else { toggleJobBtn.classList.add('hidden'); }
        
        subInput.classList.add('hidden'); 
        selectWrapper.classList.remove('hidden');

        if (match && JOB_STRUCTURE[match[1]]) {
            baseSelect.value = match[1];
            this.updateSubJobSelect();
            subSelect.value = fullJob;
        } else {
            if (['master', 'admin'].includes(this.userRole)) { 
                subInput.value = fullJob; 
                subInput.classList.remove('hidden'); 
                selectWrapper.classList.add('hidden'); 
            } else { 
                baseSelect.value = ""; 
                subSelect.innerHTML = '<option value="" disabled selected>選擇流派</option>'; 
                subSelect.disabled = true; 
            }
        }

        const rankSelect = document.getElementById('rank');
        const lockIcon = document.getElementById('rankLockIcon');
        if(this.userRole === 'master') {
            rankSelect.disabled = false;
            rankSelect.classList.remove('locked-field');
            lockIcon.className = "fas fa-unlock text-blue-500 text-xs ml-2";
        } else {
            rankSelect.disabled = true;
            rankSelect.classList.add('locked-field');
            lockIcon.className = "fas fa-lock text-slate-300 text-xs ml-2";
        }

        if (['master', 'admin'].includes(this.userRole)) {
             document.getElementById('deleteBtnContainer').innerHTML = `<button type="button" onclick="app.deleteMember('${item.id}')" class="text-red-500 text-sm hover:underline">刪除成員</button>`;
        } else {
             document.getElementById('deleteBtnContainer').innerHTML = '';
        }
        app.showModal('editModal');
    },
    updateSubJobSelect: function() {
        const baseJob = document.getElementById('baseJobSelect').value;
        const subSelect = document.getElementById('subJobSelect');
        subSelect.innerHTML = '<option value="" disabled selected>選擇流派</option>';
        if (JOB_STRUCTURE[baseJob]) {
            subSelect.disabled = false;
            JOB_STRUCTURE[baseJob].forEach(sub => { 
                const val = `${baseJob}(${sub})`; 
                const opt = document.createElement('option'); 
                opt.value = val; 
                opt.innerText = sub; 
                subSelect.appendChild(opt); 
            });
        } else { 
            subSelect.disabled = true; 
        }
    },

    toggleJobInputMode: function() {
        const input = document.getElementById('subJobInput');
        const selectWrapper = document.getElementById('subJobSelectWrapper');
        if (input.classList.contains('hidden')) { 
            input.classList.remove('hidden'); 
            selectWrapper.classList.add('hidden'); 
        } else { 
            input.classList.add('hidden'); 
            selectWrapper.classList.remove('hidden'); 
        }
    },
    setFilter: function(f) {
        this.currentFilter = f;
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.className = b.innerText.includes(f==='all'?'全部':f) || (f==='坦' && b.innerText.includes('坦克')) || (f==='待定' && b.innerText.includes('待定'))
            ? "px-4 py-1.5 rounded-full text-sm font-bold bg-slate-800 text-white transition whitespace-nowrap filter-btn active shadow-md" 
            : "px-4 py-1.5 rounded-full text-sm font-bold bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 transition whitespace-nowrap filter-btn";
        });
        this.renderMembers();
    },
    setJobFilter: function(j) { 
        this.currentJobFilter = j; 
        this.renderMembers(); 
    },
    exportCSV: function() {
        let csv = "\uFEFFLINE 暱稱,遊戲 ID,主職業,定位,公會職位,備註\n";
        this.members.forEach(m => csv += `"${m.lineName}","${m.gameName}","${m.mainClass}","${m.role}","${m.rank||'成員'}","${m.intro}"\n`);
        const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv); link.download = "ROW成員.csv";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },
    downloadSelf: function() {
        let html = document.documentElement.outerHTML;
        html = html.replace(/const SEED_DATA = \[[\s\S]*?\];/, `const SEED_DATA = ${JSON.stringify(this.members)};`);
        html = html.replace(/const SEED_GROUPS = \[[\s\S]*?\];/, `const SEED_GROUPS = ${JSON.stringify(this.groups)};`);
        html = html.replace(/const SEED_ACTIVITIES = \[[\s\S]*?\];/, `const SEED_ACTIVITIES = ${JSON.stringify(this.activities)};`); // Include activities
        const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([html], {type: "text/html"})); link.download = `ROW_Manager_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },
    saveConfig: function() {
        try { 
            localStorage.setItem('row_firebase_config', JSON.stringify(JSON.parse(document.getElementById('firebaseConfigInput').value))); 
            location.reload(); 
        } catch(e) { 
            console.error("JSON 格式錯誤", e);
        }
    },
    resetToDemo: function() { 
        localStorage.removeItem('row_firebase_config'); 
        localStorage.removeItem('row_local_members'); 
        localStorage.removeItem('row_local_groups'); 
        localStorage.removeItem('row_local_activities'); // Clear activities
        localStorage.removeItem('row_mod_history'); 
        location.reload(); 
    },
    // --- Squad CRUD (Functions remain largely the same) ---
    saveSquad: async function() {
        if (!['master', 'admin', 'commander'].includes(this.userRole)) {
            console.error("權限不足：僅有管理人員可建立/編輯分組"); return;
        }
        const type = this.currentTab === 'gvg' ? 'gvg' : 'misc';
        const id = document.getElementById('squadId').value;
        const name = document.getElementById('squadName').value;
        const note = document.getElementById('squadNote').value;
        
        const selectedMembers = [...this.currentSquadMembers];
        
        if(!name) { console.error("請輸入隊伍名稱"); return; }
        const squadData = { name, note, members: selectedMembers, type };
        
        let action = '';
        if (id) {
            if (this.mode === 'firebase') { 
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
                const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
                await publicDataRef.collection(this.collectionGroups).doc(id).update(squadData); 
            } 
            else { 
                const idx = this.groups.findIndex(g => g.id === id); 
                if(idx !== -1) { this.groups[idx] = { ...this.groups[idx], ...squadData }; this.saveLocal(); } 
            }
            action = '隊伍資料更新';
        } else {
            if (this.mode === 'firebase') { 
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
                const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
                await publicDataRef.collection(this.collectionGroups).add(squadData); 
            } 
            else { 
                squadData.id = 'g_' + Date.now(); 
                this.groups.push(squadData); this.saveLocal(); 
            }
            action = '建立新隊伍';
        }
        this.logChange(action, `隊伍: ${name} (成員數: ${selectedMembers.length})`, id || 'new');
        this.closeModal('squadModal');
    },
    deleteSquad: async function(id) {
        if (!['master', 'admin', 'commander'].includes(this.userRole)) {
            console.error("權限不足"); return;
        }

        if (!confirm("確定要解散這個隊伍嗎？")) return;
        const group = this.groups.find(g => g.id === id);
        if (this.mode === 'firebase') { 
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionGroups).doc(id).delete(); 
        } 
        else { 
            this.groups = this.groups.filter(g => g.id !== id); 
            this.saveLocal(); 
        }
        this.logChange('解散隊伍', `解散隊伍: ${group ? group.name : 'Unknown'}`, id);
        this.closeModal('squadModal');
    },
    renderSquads: function() {
        const type = this.currentTab === 'gvg' ? 'gvg' : 'misc';
        const warningMsg = document.getElementById('adminWarning');
        const search = document.getElementById('groupSearchInput').value.toLowerCase();
        
        let canEdit = true;
        if (type === 'gvg') {
            canEdit = ['master', 'admin', 'commander'].includes(this.userRole);
        }
        
        if(warningMsg) {
            if(!canEdit && type === 'gvg') warningMsg.classList.remove('hidden'); 
            else warningMsg.classList.add('hidden');
        }

        let visibleGroups = this.groups.filter(g => (g.type || 'gvg') === type);
        
        if (search) {
            visibleGroups = visibleGroups.filter(g => {
                if (g.name.toLowerCase().includes(search)) return true;
                const hasMember = g.members.some(m => {
                    const id = typeof m === 'string' ? m : m.id;
                    const mem = this.members.find(x => x.id === id);
                    return mem && (mem.gameName.toLowerCase().includes(search) || mem.mainClass.toLowerCase().includes(search));
                });
                return hasMember;
            });
        }

        const grid = document.getElementById('squadGrid');
        const emptyMsg = document.getElementById('noSquadsMsg');
        if (visibleGroups.length === 0) { grid.innerHTML = ''; emptyMsg.classList.remove('hidden'); return; }
        emptyMsg.classList.add('hidden');

        grid.innerHTML = visibleGroups.map(group => {
            const groupMembers = (group.members || []).map(m => {
                const id = typeof m === 'string' ? m : m.id;
                const status = typeof m === 'string' ? 'pending' : (m.status || 'pending');
                const mem = this.members.find(x => x.id === id);
                return mem ? { ...mem, status } : null;
            }).filter(x => x);

            const getRoleClass = (role) => {
                if (role.includes('輸出')) return 'role-badge-dps';
                if (role.includes('坦')) return 'role-badge-tank';
                if (role.includes('輔助')) return 'role-badge-sup';
                return 'role-badge-pending';
            };

            const getStatusIcon = (status) => {
                 const className = status === 'confirmed' ? 'status-confirmed' : 'status-pending';
                 const icon = status === 'confirmed' ? 'fa-check-circle' : 'fa-circle-xmark';
                 return `<i class="fas ${icon} ${className} transition"></i>`;
            };
            
            const list = groupMembers.map(m => `
                <div class="flex items-center justify-between text-sm py-2 border-b border-slate-200 last:border-0 hover:bg-slate-50 px-3 transition">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="${getRoleClass(m.role)} text-xs">${m.role}</span>
                        <span class="text-slate-800 font-bold truncate">${m.gameName}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-slate-500 font-mono">${m.mainClass.replace(/\(.*\)/, '')}</span>
                        ${type === 'gvg' ? 
                            `<div class="text-lg cursor-pointer hover:scale-110 transition" title="${m.status==='confirmed'?'已確認出席':'未確認出席'}" 
                                    onclick="event.stopPropagation(); app.toggleMemberStatus('${group.id}', '${m.id}')">
                                ${getStatusIcon(m.status)}
                            </div>` 
                        : ''}
                    </div>
                </div>`).join('');
                
            const headerClass = type === 'gvg' ? 'header squad-card-gvg-header' : 'bg-blue-50 p-4 border-b border-blue-100';
            const cardClass = type === 'gvg' ? 'squad-card-gvg' : 'bg-white rounded-xl shadow-sm border border-blue-100';

            const editBtn = canEdit ? `<button onclick="app.openSquadModal('${group.id}')" class="text-slate-400 hover:text-blue-600 p-1"><i class="fas fa-cog"></i></button>` : '';
            const copyBtn = `<button onclick="app.copySquadList('${group.id}')" class="text-slate-400 hover:text-green-600 p-1 ml-2" title="複製隊伍"><i class="fas fa-copy"></i></button>`;

            const confirmedCount = groupMembers.filter(m => m.status === 'confirmed').length;
            const statusText = type === 'gvg' 
                ? `<div class="font-bold text-sm ${confirmedCount === 5 ? 'text-green-600' : 'text-red-500'}">戰鬥成員: ${confirmedCount}/5</div>`
                : `<div class="text-[10px] text-slate-400">成員: ${groupMembers.length}</div>`;

            return `
                <div class="${cardClass} flex flex-col h-full overflow-hidden">
                    <div class="${headerClass} p-4 flex justify-between items-center rounded-t-[7px]">
                        <div><h3 class="text-xl font-bold">${group.name}</h3><p class="text-xs mt-1 italic opacity-80">${group.note||''}</p></div>
                        <div class="flex items-center">${copyBtn}${editBtn}</div>
                    </div>
                    <div class="flex-grow p-1 overflow-y-auto max-h-80">${list.length?list:'<p class="text-sm text-slate-400 text-center py-4">無戰鬥編組</p>'}</div>
                    <div class="bg-white p-3 border-t border-slate-100 flex justify-end items-center shrink-0">
                        ${statusText}
                    </div>
                </div>`;
        }).join('');
    },
    copyText: function(el, text) { 
        navigator.clipboard.writeText(text).then(() => { 
            el.classList.add('copied'); 
            setTimeout(() => el.classList.remove('copied'), 1500); 
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            // Fallback for environments where clipboard API is restricted
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                el.classList.add('copied'); 
                setTimeout(() => el.classList.remove('copied'), 1500);
            } catch (err) {
                console.error('Fallback copy failed: ', err);
            } finally {
                document.body.removeChild(textarea);
            }
        }); 
    },
    copySquadList: function(groupId) {
        let gid = groupId || document.getElementById('squadId').value;
        if(!gid) return;
        const group = this.groups.find(g => g.id === gid); if(!group) return;
        let text = `【${group.name}】 `;
        const memberNames = (group.members || []).map(m => { 
            const id = typeof m === 'string' ? m : m.id; 
            const mem = this.members.find(x => x.id === id); 
            return mem ? `${mem.gameName}` : 'Unknown'; 
        });
        text += memberNames.join(', ');
        // Re-use copyText logic for unified clipboard handling
        this.copyText({ classList: { add: () => {}, remove: () => {} } }, text); 
        console.log("已複製隊伍名單！");
    },
    toggleMemberStatus: function(groupId, memberId) {
        if (!['master', 'admin', 'commander'].includes(this.userRole)) {
            console.error("權限不足：僅有管理人員可修改 GVG 狀態"); return;
        }
        const group = this.groups.find(g => g.id === groupId); 
        if(!group) return;

        const memberIndex = group.members.findIndex(m => (typeof m === 'string' ? m : m.id) === memberId);
        if (memberIndex === -1) return;
        
        let memberData = group.members[memberIndex];
        
        if (typeof memberData === 'string') memberData = { id: memberData, status: 'confirmed' };
        else memberData.status = memberData.status === 'confirmed' ? 'pending' : 'confirmed';
        
        group.members[memberIndex] = memberData;
        const squadData = { ...group };
        
        if (this.mode === 'firebase') { 
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app';
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            publicDataRef.collection(this.collectionGroups).doc(groupId).update(squadData); 
        } else { 
            this.saveLocal(); 
        }
        this.renderSquads(); 
    },
    openSquadModal: function(id) {
        const type = this.currentTab === 'gvg' ? 'gvg' : 'misc';
        if(type === 'gvg' && !['master', 'admin', 'commander'].includes(this.userRole)) return; 

        document.getElementById('squadId').value = id || ''; document.getElementById('memberSearch').value = '';
        if(id) {
            const g = this.groups.find(g => g.id === id);
            document.getElementById('squadName').value = g.name; document.getElementById('squadNote').value = g.note;
            document.getElementById('deleteSquadBtnContainer').innerHTML = `<button type="button" onclick="app.deleteSquad('${id}')" class="text-red-500 text-sm hover:underline">解散</button>`;
            this.currentSquadMembers = JSON.parse(JSON.stringify(g.members));
        } else {
            document.getElementById('squadName').value = ''; document.getElementById('squadNote').value = '';
            document.getElementById('deleteSquadBtnContainer').innerHTML = '';
            this.currentSquadMembers = [];
        }
        this.renderSquadMemberSelect();
        app.showModal('squadModal');
    },
    toggleSquadMember: function(id) {
        const index = this.currentSquadMembers.findIndex(m => (typeof m === 'string' ? m : m.id) === id);
        if (index > -1) { 
            this.currentSquadMembers.splice(index, 1); 
        } else { 
            if (this.currentSquadMembers.length >= 5) return; 
            this.currentSquadMembers.push({ id: id, status: 'pending' }); 
        }
        this.renderSquadMemberSelect();
    },
    renderSquadMemberSelect: function() {
        const currentSquadId = document.getElementById('squadId').value;
        const currentSquadType = this.currentTab === 'gvg' ? 'gvg' : 'misc';
        const search = document.getElementById('memberSearch').value.toLowerCase();
        
        const occupiedIds = this.groups
            .filter(g => g.id !== currentSquadId && (g.type || 'gvg') === currentSquadType)
            .flatMap(g => g.members)
            .map(m => typeof m === 'string' ? m : m.id)
            .filter((value, index, self) => self.indexOf(value) === index); 

        let availableMembers = this.members.filter(m => !occupiedIds.includes(m.id));

        const filtered = availableMembers.filter(m => (m.gameName + m.lineName + m.mainClass).toLowerCase().includes(search));
        
        const isSelected = (mid) => this.currentSquadMembers.some(sm => (typeof sm === 'string' ? sm : sm.id) === mid);

        filtered.sort((a,b) => (isSelected(a.id) === isSelected(b.id)) ? 0 : isSelected(a.id) ? -1 : 1);
        
        const count = this.currentSquadMembers.length;
        const isFull = count >= 5;
        document.getElementById('selectedCount').innerText = `${count}/5`;
        document.getElementById('selectedCount').className = isFull ? "text-red-500 font-bold" : "text-blue-500 font-bold";

        document.getElementById('squadMemberSelect').innerHTML = filtered.map(m => {
            const checked = isSelected(m.id);
            const isDisabled = !checked && isFull;
            
            const jobName = m.mainClass || '';
            const style = JOB_STYLES.find(s => s.key.some(k => jobName.includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };

            return `
            <label class="flex items-center space-x-2 p-2 rounded border border-blue-100 transition select-none ${isDisabled ? 'opacity-50 bg-slate-50' : 'hover:bg-blue-50 bg-white cursor-pointer'}">
                <input type="checkbox" value="${m.id}" class="rounded text-blue-500 focus:ring-blue-400" ${checked?'checked':''} ${isDisabled?'disabled':''} onchange="app.toggleSquadMember('${m.id}')">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${style.class.replace('bg-', 'text-')} bg-opacity-20">
                    <i class="fas ${style.icon}"></i>
                </div>
                <div class="min-w-0 flex-grow"><div class="text-xs font-bold text-slate-700 truncate">${m.gameName} <span class="text-slate-500 font-normal text-[10px]">${m.mainClass}</span></div></div>
                <span class="text-xs ${m.role.includes('輸出')?'text-red-500':m.role.includes('輔助')?'text-green-500':m.role.includes('坦')?'text-blue-500':'text-slate-400'}">${m.role.substring(0, 1)}</span>
            </label>`;
        }).join('');
    },
    // --- Utility Modals ---
    showModal: function(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal: function(id) { document.getElementById(id).classList.add('hidden'); },

    // --- NEW: Activity Management Functions (Master Only) ---

    // Render the list of activities
    renderActivities: function() {
        const listContainer = document.getElementById('activityList');
        const emptyMsg = document.getElementById('noActivitiesMsg');

        if (this.activities.length === 0) { 
            listContainer.innerHTML = '';
            if (this.userRole === 'master') emptyMsg.classList.remove('hidden'); 
            return; 
        }
        emptyMsg.classList.add('hidden');

        listContainer.innerHTML = this.activities.map(act => {
            const totalWinners = act.winners ? act.winners.length : 0;
            const claimedCount = act.winners ? act.winners.filter(w => w.claimed).length : 0;
            const statusColor = claimedCount === totalWinners && totalWinners > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';

            return `
                <div class="activity-card p-4 cursor-pointer" onclick="app.openActivityModal('${act.id}')">
                    <div class="activity-header rounded-t-lg p-2 mb-2">
                        <h4 class="font-black text-lg truncate">${act.name}</h4>
                    </div>
                    <p class="text-xs text-slate-600 mb-3">${act.note || '無獎勵說明'}</p>
                    <div class="flex justify-between items-center text-sm font-bold ${statusColor} p-2 rounded-lg">
                        <div class="flex items-center">
                            <i class="fas fa-list-check mr-2"></i>
                            <span>得獎者: ${totalWinners} 位</span>
                        </div>
                        <span class="text-xs font-bold">已領取: ${claimedCount}/${totalWinners}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Open/Populate Activity Modal
    openActivityModal: function(id) {
        if (this.userRole !== 'master') {
            console.error("權限不足：僅有會長可操作活動管理");
            return;
        }

        const modalTitle = document.getElementById('activityModalTitle');
        const deleteBtnContainer = document.getElementById('deleteActivityBtnContainer');
        
        if (id) {
            const act = this.activities.find(a => a.id === id);
            if (!act) return;
            document.getElementById('activityId').value = id;
            document.getElementById('activityName').value = act.name;
            document.getElementById('activityNote').value = act.note;
            modalTitle.innerText = '編輯活動';
            deleteBtnContainer.innerHTML = `<button type="button" onclick="app.deleteActivity('${id}')" class="text-red-500 text-sm hover:underline">刪除活動</button>`;
        } else {
            document.getElementById('activityId').value = '';
            document.getElementById('activityName').value = '';
            document.getElementById('activityNote').value = '';
            modalTitle.innerText = '新增活動';
            deleteBtnContainer.innerHTML = '';
        }

        this.renderWinnerList(id);
        this.showModal('activityModal');
    },

    // Save Activity Data
    saveActivity: async function() {
        if (this.userRole !== 'master') { console.error("權限不足"); return; }
        const id = document.getElementById('activityId').value;
        const name = document.getElementById('activityName').value;
        const note = document.getElementById('activityNote').value;
        
        if (!name) { console.error("請輸入活動主題"); return; }

        let currentActivity = this.activities.find(a => a.id === id);
        if (!currentActivity) {
            // New activity
            currentActivity = { id: 'a_' + Date.now(), name, note, winners: [] };
        } else {
            // Update activity info (winners array is managed by renderWinnerList/confirmWinnerSelection)
            currentActivity.name = name;
            currentActivity.note = note;
        }
        
        let action = '';
        if (id) {
            // Update existing
            if (this.mode === 'firebase') { 
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
                const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
                await publicDataRef.collection(this.collectionActivities).doc(id).update(currentActivity); 
            } 
            else { 
                const idx = this.activities.findIndex(a => a.id === id);
                if(idx !== -1) this.activities[idx] = currentActivity;
                this.saveLocal(); 
            }
            action = '活動更新';
        } else {
            // Add new
            if (this.mode === 'firebase') { 
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
                const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
                await publicDataRef.collection(this.collectionActivities).add(currentActivity); 
            } 
            else { 
                this.activities.push(currentActivity); 
                this.saveLocal(); 
            }
            action = '新增活動';
        }

        this.logChange(action, `活動: ${name}`, id || 'new');
        this.closeModal('activityModal');
    },

    // Delete Activity
    deleteActivity: async function(id) {
        if (this.userRole !== 'master') { console.error("權限不足"); return; }
        if (!confirm("確定要刪除此活動及其得獎名單嗎？")) return;

        const activity = this.activities.find(a => a.id === id);
        
        if (this.mode === 'firebase') { 
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionActivities).doc(id).delete(); 
        } 
        else { 
            this.activities = this.activities.filter(a => a.id !== id); 
            this.saveLocal(); 
        }
        
        this.logChange('刪除活動', `刪除活動: ${activity ? activity.name : 'Unknown'}`, id);
        this.closeModal('activityModal');
    },

    // Render the winner list inside the activity modal
    renderWinnerList: function(activityId) {
        const container = document.getElementById('winnerListContainer');
        const act = this.activities.find(a => a.id === activityId);
        
        if (!act || !act.winners || act.winners.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-400 py-6 text-sm">點擊「選取得獎者」按鈕新增得獎者。</p>';
            document.getElementById('winnerCount').innerText = '0';
            return;
        }

        document.getElementById('winnerCount').innerText = act.winners.length;
        
        container.innerHTML = act.winners.map(winner => {
            const member = this.members.find(m => m.id === winner.memberId);
            if (!member) return '';
            
            const isClaimed = winner.claimed;
            const claimedClass = isClaimed ? 'claimed' : 'unclaimed';
            const claimedText = isClaimed ? `已領獎 (by ${winner.claimedBy})` : '未領取';
            const claimedTime = isClaimed ? new Date(winner.claimedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            
            // Toggle button is only visible to master
            const toggleButton = this.userRole === 'master' 
                ? `<button onclick="app.toggleRewardClaimed('${activityId}', '${winner.memberId}', ${isClaimed})" class="text-xs font-bold py-1 px-2 rounded transition active:scale-95 ${isClaimed ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}">
                    ${isClaimed ? '標記為未領' : '標記為已領'}
                   </button>`
                : '';

            return `
                <div class="winner-list-item flex justify-between items-center bg-white">
                    <div class="flex items-center min-w-0">
                        <span class="claimed-light ${claimedClass}"></span>
                        <div class="min-w-0">
                            <div class="font-bold text-slate-800 truncate">${member.gameName}</div>
                            <div class="text-xs text-slate-500 font-mono">${member.mainClass || '未知職業'}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        <div class="text-xs font-bold ${isClaimed ? 'text-green-600' : 'text-red-500'}">${claimedText}</div>
                        <div class="text-[10px] text-slate-400">${claimedTime}</div>
                        ${toggleButton}
                    </div>
                </div>
            `;
        }).join('');
    },

    // Toggle Claimed Status (Master Only)
    toggleRewardClaimed: async function(activityId, memberId, isCurrentlyClaimed) {
        if (this.userRole !== 'master') { console.error("權限不足"); return; }
        
        const act = this.activities.find(a => a.id === activityId);
        if (!act) return;

        const winnerIndex = act.winners.findIndex(w => w.memberId === memberId);
        if (winnerIndex === -1) return;
        
        act.winners[winnerIndex].claimed = !isCurrentlyClaimed;
        act.winners[winnerIndex].claimedBy = !isCurrentlyClaimed ? this.userRole : null;
        act.winners[winnerIndex].claimedAt = !isCurrentlyClaimed ? Date.now() : null;

        const member = this.members.find(m => m.id === memberId);
        this.logChange('獎勵領取狀態更新', `${act.name}: ${member.gameName} 標記為 ${!isCurrentlyClaimed ? '已領取' : '未領取'}`, activityId);

        if (this.mode === 'firebase') {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionActivities).doc(activityId).update({ winners: act.winners });
        } else {
            this.saveLocal();
        }

        this.renderWinnerList(activityId);
        this.renderActivities(); // Update main activity list status
    },
    
    // Open Winner Selection Modal
    openWinnerSelectionModal: function() {
        if (this.userRole !== 'master') { console.error("權限不足"); return; }
        const activityId = document.getElementById('activityId').value;
        const act = this.activities.find(a => a.id === activityId);

        // Populate currentWinnerSelection with existing winners to allow editing
        this.currentWinnerSelection = act ? act.winners.map(w => w.memberId) : [];
        document.getElementById('winnerSearchInput').value = '';
        this.renderWinnerMemberSelect();
        
        this.showModal('winnerSelectionModal');
    },

    // Render Member list for selection
    renderWinnerMemberSelect: function() {
        const container = document.getElementById('winnerMemberSelect');
        const search = document.getElementById('winnerSearchInput').value.toLowerCase();
        
        let filteredMembers = this.members.filter(m => 
            (m.gameName + m.lineName + m.mainClass).toLowerCase().includes(search)
        );
        
        // Sort by selected first
        filteredMembers.sort((a,b) => (this.currentWinnerSelection.includes(a.id) === this.currentWinnerSelection.includes(b.id)) ? 0 : this.currentWinnerSelection.includes(a.id) ? -1 : 1);

        container.innerHTML = filteredMembers.map(m => {
            const checked = this.currentWinnerSelection.includes(m.id);
            
            const jobName = m.mainClass || '';
            const style = JOB_STYLES.find(s => s.key.some(k => jobName.includes(k))) || { class: 'bg-job-default', icon: 'fa-user' };

            return `
            <label class="flex items-center space-x-2 p-2 rounded border border-blue-100 transition select-none hover:bg-blue-50 bg-white cursor-pointer">
                <input type="checkbox" value="${m.id}" class="rounded text-red-500 focus:ring-red-400" ${checked?'checked':''} onchange="app.toggleWinnerSelection('${m.id}')">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${style.class.replace('bg-', 'text-')} bg-opacity-20">
                    <i class="fas ${style.icon}"></i>
                </div>
                <div class="min-w-0 flex-grow"><div class="text-xs font-bold text-slate-700 truncate">${m.gameName} <span class="text-slate-500 font-normal text-[10px]">${m.mainClass}</span></div></div>
            </label>`;
        }).join('');
    },
    
    // Toggle member in the temporary selection list
    toggleWinnerSelection: function(memberId) {
        const index = this.currentWinnerSelection.indexOf(memberId);
        if (index > -1) {
            this.currentWinnerSelection.splice(index, 1);
        } else {
            this.currentWinnerSelection.push(memberId);
        }
        this.renderWinnerMemberSelect();
    },

    // Simple Lucky Draw (Master only)
    performLuckyDraw: function() {
        if (this.userRole !== 'master') { console.error("權限不足"); return; }
        
        // Use all members if none are currently selected, otherwise use selected pool
        const pool = this.currentWinnerSelection.length > 0 ? 
            this.currentWinnerSelection : 
            this.members.map(m => m.id);

        if (pool.length === 0) {
            console.error("沒有可供抽選的成員。");
            return;
        }

        const randomIndex = Math.floor(Math.random() * pool.length);
        const winnerId = pool[randomIndex];
        
        // Clear current selection and select only the winner
        this.currentWinnerSelection = [winnerId]; 
        
        const winner = this.members.find(m => m.id === winnerId);
        console.log(`恭喜！隨機選取的得獎者是：${winner.gameName}`);
        
        this.renderWinnerMemberSelect();
    },

    // Confirm selection and update activity object
    confirmWinnerSelection: async function() {
        if (this.userRole !== 'master') { console.error("權限不足"); return; }
        
        const activityId = document.getElementById('activityId').value;
        if (!activityId) { console.error("請先儲存活動主題"); return; }

        const act = this.activities.find(a => a.id === activityId);
        if (!act) return;

        // Map selected IDs to winner objects, preserving existing claimed status if possible
        const newWinners = this.currentWinnerSelection.map(memberId => {
            const existingWinner = act.winners ? act.winners.find(w => w.memberId === memberId) : null;
            return existingWinner || { memberId: memberId, claimed: false, claimedBy: null, claimedAt: null };
        });

        // Ensure members not selected anymore are removed
        act.winners = newWinners;
        
        this.logChange('得獎者名單更新', `${act.name} 得獎者更新為 ${newWinners.length} 位`, activityId);

        if (this.mode === 'firebase') {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'row-guild-app'; 
            const publicDataRef = this.db.collection('artifacts').doc(appId).collection('public').doc('data');
            await publicDataRef.collection(this.collectionActivities).doc(activityId).update({ winners: act.winners });
        } else {
            this.saveLocal();
        }

        this.closeModal('winnerSelectionModal');
        this.renderWinnerList(activityId); // Re-render the list in the detail modal
    }
};

window.app = App; 
window.onload = () => App.init();