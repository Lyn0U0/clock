# 旅遊行程規劃

在地圖上點選或搜尋景點、排出每日行程、查看景點間的交通時間，並和旅伴一起記帳、結算旅費。

純前端靜態網站（`index.html`、`styles.css`、`app.js`），可直接放在 GitHub Pages。

## Google Maps 金鑰

1. 到 [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) 建立 API 金鑰。
2. 啟用這三個 API：
   - **Maps JavaScript API**：地圖
   - **Routes API**：景點間的交通時間
   - **Places API (New)**：搜尋地點、點選地圖上的店家自動帶入名稱
3. 在金鑰的「應用程式限制」選「網站」，加入 `lyn0u0.github.io/*`。
4. 把金鑰填進 `app.js` 的 `GOOGLE_MAPS_API_KEY`。也可以先在網頁上貼上金鑰試用，只會存在那台瀏覽器。

## 雲端同步

沒有設定時，行程與記帳只存在各自的瀏覽器裡。設定 Firebase 後，側邊欄會出現「建立共享連結」，拿到連結的人都能一起編輯行程和記帳，變動會即時同步。

### 1. 建立 Firebase 專案與 Firestore

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 新增專案（不需要 Google Analytics）。
2. 左側選單「建構 → Firestore Database」→「建立資料庫」，位置選 `asia-east1`（台灣），以**正式版模式**建立。
3. 到「專案設定（齒輪）→ 一般 → 你的應用程式」，按 `</>` 新增網頁應用程式，複製畫面上的 `firebaseConfig`。

### 2. 設定安全規則

在 Firestore 的「規則」分頁貼上下面的規則並發布：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      // 知道行程 id（共享連結）才能讀寫；不能列出所有行程，也不能刪除整個行程
      allow get, create, update: if true;
      allow list, delete: if false;

      match /expenses/{expenseId} {
        allow read, delete: if true;
        allow create, update: if request.resource.data.amount is number
                              && request.resource.data.amount >= 0
                              && request.resource.data.title.size() <= 40;
      }
    }
  }
}
```

這套規則的權限就是「拿到連結的人都能編輯」，和 Google 文件的「知道連結的使用者」相同。行程 id 是 20 個隨機字元，別人猜不到，但連結本身請只傳給一起旅行的人。

### 3. 填入設定

把 `firebaseConfig` 貼進 `app.js` 的 `FIREBASE_CONFIG`：

```js
const FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '…',
  appId: '…'
};
```

`firebaseConfig` 本來就會公開在網頁上，放進公開的 repo 沒有關係，資料安全靠的是上面的安全規則。

### 使用方式

- 按「建立共享連結」：目前的行程會複製一份到雲端，網址變成 `…/trip-planner/#trip-<id>`。原本的個人行程不會變動。
- 按「複製連結」傳給旅伴。打開同一個連結的人都在同一份行程上。
- 按「離開」回到個人行程；共享行程仍保留在雲端，用連結可以再打開。
- 離線時仍可繼續編輯，恢復連線後會自動上傳。

### 同步規則

- 每筆花費是獨立的一份雲端資料，多人同時記不同的帳不會互相覆蓋。
- 行程本體（天數、景點、順序、旅伴）是同一份資料。兩個人在同一秒調整行程時，後存的會蓋掉先存的。
- 「目前選的分頁」只存在各自的裝置，不會同步。

Firebase 免費方案（Spark）每天有 5 萬次讀取、2 萬次寫入，一般旅行使用不會超過。
