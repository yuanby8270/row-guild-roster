// config.js

// 應用程式的靜態配置、集合名稱和初始資料。

// --- 全域應用程式設定 ---
const FIREBASE_CONFIG = {
    // 恢復 API Key (請確保這是您正確的 Key)
    apiKey: "AIzaSyCxVEcgftiu7qmHhgLV-XaLzf6naBhaf-k",
    authDomain: "ro123-aae1e.firebaseapp.com",
    projectId: "ro123-aae1e",
    storageBucket: "ro123-aae1e.firebasestorage.app",
    messagingSenderId: "401692984816",
    appId: "1:401692984816:web:711dacb2277b52fb7d0935",
    measurementId: "G-SVYZGQZB83"
};

const APP_ENV = 'production';
const APP_VERSION = '7.2-ThemeUpdate';

// --- Firebase / Firestore Configuration ---
const COLLECTION_NAMES = {
    MEMBERS: 'members',
    GROUPS: 'groups',
    ACTIVITIES: 'activities', 
    LEAVE_REQUESTS: 'leave_requests',
    CUSTOM_THEMES: 'custom_themes' // 新增：自訂主題集合
};

// --- Job / Role Configuration ---
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

// --- GVG Themes (預設團戰主題) ---
const SEED_THEMES = [
    { id: 't01', name: '週日團戰', icon: 'fa-shield-alt', type: 'system' },
    { id: 't02', name: '週二團戰', icon: 'fa-shield-alt', type: 'system' },
    { id: 't03', name: '巔峰決戰', icon: 'fa-trophy', type: 'system' },
    { id: 't04', name: '世界王', icon: 'fa-dragon', type: 'system' }
];

// --- Seed Data (初始資料) ---
const SEED_DATA = [
    { id: "m01", lineName: "poppy🐶", gameName: "YT清燉小羔羊", mainClass: "神官(讚美)", role: "輔助", rank: "會長", intro: "公會唯一清流 出淤泥而不染" },
    { id: "m02", lineName: "#Yuan", gameName: "沐沐", mainClass: "神官(讚美)", role: "輔助", rank: "資料管理員", intro: "" },
    { id: "m03", lineName: "Lam 🦄", gameName: "孤芳自賞", mainClass: "獵人(陷阱)", role: "輸出", rank: "成員", intro: "" },
    // ... (保留原始 SEED_DATA，為節省篇幅此處省略，實際檔案請包含完整資料)
    { id: "m73", lineName: "NICK", gameName: "狗是水鏡", mainClass: "流氓(輸出)", role: "輸出", rank: "成員", intro: "" }
];

const SEED_GROUPS = [];

const SEED_ACTIVITIES = [
    {
        id: "a01",
        name: "聖誕節造型大賽",
        note: "評選最佳聖誕裝扮的成員，可獲得隨機稀有卡片一張。",
        winners: [
            { memberId: "m01", claimed: true, claimedBy: "poppy🐶", claimedAt: 1700000000000 },
            { memberId: "m20", claimed: false, claimedBy: null, claimedAt: null }
        ]
    }
];

// 將所有配置變數掛載到全域物件
window.AppConfig = {
    FIREBASE_CONFIG,
    APP_ENV,
    COLLECTION_NAMES,
    JOB_STYLES,
    JOB_STRUCTURE,
    SEED_DATA,
    SEED_GROUPS,
    SEED_ACTIVITIES,
    SEED_THEMES,
    APP_VERSION
};