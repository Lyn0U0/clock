# 旅遊行程規劃

在地圖上點選或搜尋景點、排出每日行程、查看景點間的交通時間，並和旅伴一起記帳、結算旅費。

純前端靜態網站（`index.html`、`styles.css`、`app.js`），可直接放在 GitHub Pages。

## Google Maps 金鑰

1. 到 [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) 建立 API 金鑰。
2. 啟用這三個 API：
   - **Maps JavaScript API**：地圖
   - **Routes API**：景點間的交通時間，以及地圖上的當日路線
   - **Places API (New)**：搜尋地點、點選地圖上的店家自動帶入名稱
3. 在金鑰的「應用程式限制」選「網站」，加入 `lyn0u0.github.io/*`。
4. 把金鑰填進 `app.js` 的 `GOOGLE_MAPS_API_KEY`。也可以先在網頁上貼上金鑰試用，只會存在那台瀏覽器。

## 詳細紀錄插入圖片（Imgur，選填）

詳細紀錄的「📷 插入圖片」會把照片上傳到 Imgur，備註裡只存圖片網址，不佔 Firestore 空間。

1. 到 <https://api.imgur.com/oauth2/addclient> 註冊應用程式，授權類型選「OAuth 2 authorization without a callback URL」。
2. 在網頁右上角「⚙ → 金鑰設定」的 **Imgur Client ID** 欄位貼上 Client ID（不是 Client Secret），按儲存。Client ID 只存在這台瀏覽器，每個要上傳圖片的人各自填。

注意：

- 上傳前會先壓縮成長邊 1600px 的 JPEG（GIF 保留原檔）。
- Imgur 的圖片拿到網址的人都看得到，請勿上傳票券、證件或訂房確認信。
- 在備註刪掉圖片、或上傳後按取消，會順便從 Imgur 刪除（只限同一台瀏覽器上傳的圖）。雲端行程 30 天到期時，Imgur 上的圖片**不會**自動刪除。
- 也可以直接貼任何圖片網址（結尾是 .jpg／.png／.gif／.webp），或用 `![說明](網址)`，預覽與匯出手冊都會顯示成圖片。

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

### 4. 設定 30 天自動刪除（TTL）

共享行程在雲端只保留 30 天。網站建立共享行程時，會在行程和每筆花費都寫入到期時間 `expireAt`；
要讓 Firestore 依這個欄位自動刪除，請建立兩條 TTL 規則：

1. Firebase 主控台 →「Firestore Database」→「TTL」分頁（或 Google Cloud Console 的 Firestore「存留時間」）。
2. 新增規則：集合群組 `trips`，時間戳記欄位 `expireAt`。
3. 再新增一條：集合群組 `expenses`，時間戳記欄位 `expireAt`。

到期後 Firestore 通常會在 24 小時內刪除資料。網站導覽列會顯示「⏳ 雲端保存剩餘 X 天」，剩 3 天內會變成紅色提醒。
旅程最後一天過後，網站會提醒下載保存：HTML 離線手帳、PDF 手冊或 JSON 備份（JSON 可從設定選單「匯入 JSON 備份」還原）。

在加上這個功能之前建立的共享行程，下次打開時會依建立時間補上 `expireAt`。

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
