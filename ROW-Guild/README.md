\# 🏰 RO:W 公會名冊 (Guild Roster) | 躺著不想動



這是一個專為 RO (Ragnarok Online) 公會設計的輕量級 Web 應用程式。

無需後端伺服器，直接託管於 \*\*GitHub Pages\*\*，並結合 \*\*Firebase\*\* 實現即時資料同步。成員只需打開網頁即可查看最新名單、GVG 分組與公會活動。



!\[Project Demo](https://img.shields.io/badge/Demo-Online-green) !\[License](https://img.shields.io/badge/License-MIT-blue)



\## ✨ 特色功能



\* \*\*📱 行動裝置優先\*\*：響應式設計，手機查看名單、分組超方便。

\* \*\*☁️ 雲端即時同步\*\*：使用 Firebase Firestore，一人修改，全員同步更新。

\* \*\*🛡️ GVG 分組管理\*\*：拖曳或勾選式管理攻城戰隊伍，即時顯示職業配置 (DPS/輔助/坦)。

\* \*\*🎁 公會活動系統\*\*：舉辦抽獎、簽到或發放獎勵，即時追蹤領取進度。

\* \*\*🔍 強大篩選功能\*\*：支援關鍵字搜尋、職業篩選、定位篩選（輸出/輔助/坦）。

\* \*\*🔐 權限分級\*\*：

&nbsp;   \* \*\*訪客\*\*：僅供瀏覽。

&nbsp;   \* \*\*管理員/會長\*\*：可編輯成員、管理分組、發布活動。

\* \*\*🎨 RO 風格 UI\*\*：包含波利動畫、雲朵背景與經典職業配色。



\## 📂 專案結構



```text

ro-guild-roster/

├── index.html        # 主程式介面

├── README.md         # 專案說明文件

├── css/

│   └── styles.css    # 自定義樣式 (職業配色、動畫)

└── js/

&nbsp;   ├── config.js     # Firebase 連線設定 (需自行建立)

&nbsp;   └── app.js        # 核心邏輯程式

