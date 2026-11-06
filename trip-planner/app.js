'use strict';

/* ==========================================================================
 * 1. 設定
 * ========================================================================== */

// 填入你的 Google Maps API 金鑰（請在 Google Cloud 限制可使用的網站）
const GOOGLE_MAPS_API_KEY = '';
// 預設地圖配色（新野獸派復古調）；地圖右上角可切換回 Google 原本的樣式。
// 注意：styles 不能和 mapId 同時使用，所以行程圖釘用 OverlayView 自己畫（見 createHtmlMarkerClass）。
const NEO_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#FAF6EE' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#FAF6EE' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BAE6FD' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D1FAE5' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D4D4D8' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#1E293B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] }
];
const MAP_STYLE_STORAGE = 'trip-planner-map-style'; // 'neo' | 'plain'，只存在這台裝置

// 雲端同步（Firebase Firestore）：到 Firebase 主控台 → 專案設定 → 一般 → 你的應用程式，
// 複製 firebaseConfig 物件貼在這裡（設定步驟見 README.md）。保持 null 則只存在這台裝置。
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBMr9FNlmaQ7D_lhYg_8RvQxBxrGSJxaic',
  authDomain: 'trip-planner-1096b.firebaseapp.com',
  projectId: 'trip-planner-1096b',
  storageBucket: 'trip-planner-1096b.firebasestorage.app',
  messagingSenderId: '324731243248',
  appId: '1:324731243248:web:d19ebc281226de45c39035'
};
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

const KEY_STORAGE = 'trip-planner-gmaps-key';
const IMGUR_KEY_STORAGE = 'trip-planner-imgur-client-id';     // 詳細紀錄插入圖片用（選填，只存在這台瀏覽器）
const IMGUR_UPLOADS_STORAGE = 'trip-planner-imgur-uploads';   // 這台瀏覽器上傳過的圖片：網址 → deletehash（刪圖用）
const STATE_STORAGE = 'trip-planner-state-v2';
const LEGACY_SPOTS_STORAGE = 'trip-planner-spots'; // 舊版（固定 5 天）的資料
const DEFAULT_CENTER = { lat: 25.0375, lng: 121.5637 };
const OVERVIEW = 'all'; // 「全部」分頁：上下捲動檢視所有天數
const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
// 交通方式：value 是 Routes API 的 travelMode，gmaps 是開啟 Google 地圖路線時用的參數
const TRAVEL_MODES = [
  { value: 'DRIVE', label: '開車', gmaps: 'driving' },
  { value: 'TWO_WHEELER', label: '機車', gmaps: 'two-wheeler' },
  { value: 'TRANSIT', label: '大眾運輸', gmaps: 'transit' },
  { value: 'WALK', label: '步行', gmaps: 'walking' },
  { value: 'BICYCLE', label: '自行車', gmaps: 'bicycling' },
  { value: 'CUSTOM', label: '自訂', gmaps: 'transit' } // 渡輪、包車、飛機等：不呼叫 Routes API，時間手動填
];
const CURRENCIES = ['TWD', 'JPY', 'USD', 'KRW', 'EUR', 'HKD', 'CNY', 'THB'];
const CURRENCY_SYMBOLS = { TWD: 'NT$', JPY: '¥', USD: 'US$', KRW: '₩', EUR: '€', HKD: 'HK$', CNY: '¥', THB: '฿' };
const DEFAULT_MEMBERS = [{ id: 'member-me', name: '我' }];
const MIN_MEMBERS = 1;
const CLOUD_RETENTION_DAYS = 30; // 共享行程在雲端保留的天數（Firestore TTL 依 expireAt 刪除）
// 景點圖示：value 空字串代表顯示當天的順序編號。
// value 沿用早期版本的 Emoji 當作代號（已存的行程、共享行程與備份都相容），畫面上改畫下方的 2D 貼紙 SVG。
const SPOT_ICONS = [
  { value: '', label: '編號' },
  { value: '🏠', label: '住宿／起點' },
  { value: '🍜', label: '小吃美食' },
  { value: '🥩', label: '餐廳' },
  { value: '☕', label: '咖啡甜點' },
  { value: '📷', label: '景點拍照' },
  { value: '🏞️', label: '自然風景' },
  { value: '🛍️', label: '購物採買' },
  { value: '🚉', label: '交通／車站' }
];

// 2D 扁平復古貼紙圖示（32×32，粗黑外框、高飽和配色）；外框色與線寬由 renderSpotIcon 的 <g> 統一設定
const SPOT_ICON_ART = {
  '🏠': `<rect x="8" y="14" width="16" height="13" fill="#FDE047"/>
    <path d="M4.5 15.5 16 5l11.5 10.5z" fill="#F43F5E"/>
    <rect x="10.5" y="17.5" width="4" height="4" fill="#BAE6FD"/>
    <path d="M17.5 27v-7.5h4V27" fill="#FB923C"/>`,
  '🍜': `<path d="M8.5 11.5 25 4.5M10.5 13.5 27 8" stroke-width="2.4"/>
    <path d="M8 15.5c1.5-2.5 2.5 2.5 4 0s2.5 2.5 4 0 2.5 2.5 4 0 2.5 2.5 4 0"/>
    <path d="M4.5 15.5h23c0 6.5-5 11.5-11.5 11.5S4.5 22 4.5 15.5z" fill="#FDE047"/>
    <path d="M7 20h18" stroke="#F43F5E" stroke-width="2.2"/>`,
  '🥩': `<path d="M23 21.5l3.5 3.5" stroke-width="5.5"/>
    <path d="M23 21.5l3.5 3.5" stroke="#FFF7ED" stroke-width="2.4"/>
    <circle cx="27.3" cy="26.2" r="2.3" fill="#FFF7ED"/>
    <path d="M4.5 13.5c0-5.5 7-8.5 13-7 7 1.8 8.5 9.5 4.8 14.2-4 5-11.5 5-15 .8C5.5 19.5 4.5 16.5 4.5 13.5z" fill="#FDA4AF"/>
    <path d="M8 14c0-3.6 4.8-5.6 9.2-4.4 4.6 1.3 5.4 6.6 2.8 9.6-2.8 3.1-8.6 2.8-10.6-.3C8.6 17.5 8 15.8 8 14z" fill="#E11D48"/>
    <path d="M11.5 13.5c1.8-1.6 4.8-1.4 6.5.6" stroke="#FDA4AF" stroke-width="1.8"/>`,
  '☕': `<path d="M11 3.5c-1.6 2 1.6 3 0 5M15 3.5c-1.6 2 1.6 3 0 5M19 3.5c-1.6 2 1.6 3 0 5"/>
    <ellipse cx="15" cy="26.5" rx="11.5" ry="2.5" fill="#86EFAC"/>
    <path d="M22 14.5h2a3.2 3.2 0 0 1 0 6.4h-2.6"/>
    <path d="M6.5 11.5h16v8c0 3.6-3 5.8-8 5.8s-8-2.2-8-5.8z" fill="#FB923C"/>
    <path d="M7 15.5h15" stroke="#FFFFFF" stroke-width="2"/>`,
  '📷': `<rect x="7" y="4" width="18" height="24" rx="3" fill="#A1A1AA"/>
    <path d="M7 10h18" />
    <circle cx="16" cy="14.5" r="3.4" fill="#3F3F46"/>
    <circle cx="16" cy="22.2" r="4" fill="#3F3F46"/>
    <circle cx="15" cy="21.2" r="1.2" fill="#BAE6FD" stroke="none"/>
    <circle cx="15.2" cy="13.8" r="1" fill="#BAE6FD" stroke="none"/>
    <rect x="9.5" y="6" width="3" height="2" rx=".5" fill="#FDE047" stroke-width="1.4"/>`,
  '🏞️': `<rect x="3.5" y="5.5" width="25" height="21" rx="2" fill="#BAE6FD"/>
    <circle cx="22.5" cy="11" r="3" fill="#FDE047"/>
    <path d="M3.5 21.5 11 11.5l5.5 7 3.5-4 8.5 8.5v3.5h-25z" fill="#86EFAC"/>
    <path d="M12.5 26.5c1.5-2.5 5-2 4.5-5" stroke="#3B82F6" stroke-width="2.6"/>
    <rect x="3.5" y="5.5" width="25" height="21" rx="2"/>`,
  '🛍️': `<path d="M17 10.5V8.5a3.5 3.5 0 0 1 7 0v2"/>
    <path d="M14 10.5h13l-1.2 16.5H14.8z" fill="#86EFAC"/>
    <path d="M7.5 14v-2.5a3.5 3.5 0 0 1 7 0V14"/>
    <path d="M4.5 14h13l-1 14h-11z" fill="#FDA4AF"/>`,
  '🚉': `<path d="M13 4.5V2.5h6v2"/>
    <path d="M10.5 24.5 7 29M21.5 24.5 25 29M8.5 27.5h15"/>
    <rect x="6.5" y="4.5" width="19" height="20" rx="5" fill="#3B82F6"/>
    <rect x="9.5" y="8" width="13" height="7" rx="1.5" fill="#BAE6FD"/>
    <circle cx="11.5" cy="19.5" r="1.8" fill="#FDE047"/>
    <circle cx="20.5" cy="19.5" r="1.8" fill="#FDE047"/>
    <path d="M14.5 19.5h3"/>`
};

// 景點圖示：有自訂類別時畫 SVG 貼紙，否則顯示 fallback（通常是順序編號）
function renderSpotIcon(value, fallback) {
  const art = SPOT_ICON_ART[value];
  if (!art) return String(fallback);
  return `<svg class="spot-icon-art" viewBox="0 0 32 32" aria-hidden="true">`
    + `<g fill="none" stroke="#18181B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${art}</g></svg>`;
}
// 每天的代表色（分頁、圖釘、卡片標頭），文字一律用黑色，所以都選明亮的顏色
const DAY_COLORS = ['#3B82F6', '#FB7185', '#FACC15', '#6EE7B7', '#FB923C', '#A78BFA', '#22D3EE', '#F9A8D4'];


/* ==========================================================================
 * 2. 狀態與儲存
 *
 * 所有資料只存在 state 裡，清單、分頁、地圖圖釘都由它產生：
 *   state = {
 *     days: [{ id, spots: [Spot], note, detailedNotes }],  // 陣列順序就是 Day 1、Day 2…；note／detailedNotes 是當天的備註
 *     tripName: '',                       // 旅程名稱，空白時顯示「旅遊行程規劃」
 *     startDate: 'YYYY-MM-DD' | '',       // 出發日期；設定後每天會標上日期
 *     activeDayId: dayId | OVERVIEW,
 *     travelMode: 'DRIVE' | 'TWO_WHEELER' | 'TRANSIT' | 'WALK',  // 路段沒有個別設定時的交通方式
 *     legModes: { 'fromSpotId->toSpotId': travelMode },       // 個別路段改用的交通方式（即 transportMode）
 *     legDetails: { 'fromSpotId->toSpotId': LegDetail },      // 路段的自訂資訊
 *     members: [{ id, name }],                                // 旅伴，預設只有「我」
 *     expenses: [Expense],                                    // 記帳
 *     todos: [{ id, text, done }]                             // 整趟旅程的待辦清單（筆記本）
 *   }
 *   Spot = { id, name, lat, lng, placeId, icon, note, detailedNotes }
 *     spots 陣列順序就是當天的參觀順序；icon 為類別代號，空字串顯示編號
 *     note：簡短備註（單行，顯示在卡片上）；detailedNotes：詳細紀錄（多行，在備註視窗編輯）
 *     time：'HH:MM' 或空字串（幾點到）；reserved：true 表示是預約時間，需準時抵達
 *     tentative：true 表示景點尚未確認（還在考慮），卡片與圖釘標記「待確認」
 *   LegDetail = {
 *     transitNote,        // 車次、月台、轉乘指引、預約代碼
 *     customDuration,     // 手動覆寫的交通時間（分鐘）；null 表示用 Google Maps 預估
 *     noTime,             // true＝不填時間：不顯示時間、不計入當天交通總時間
 *     unconfirmed,        // true＝交通尚未確認（還沒訂票／還沒決定），路線卡標記「待確認」
 *     cost, currency,     // 交通花費與幣別（預設 TWD）
 *     paidBy,             // 付款人（memberId）
 *     addToSettlement,    // 是否列入旅費結算（只有 TWD 可以）
 *     expenseId           // 加入結算時對應的 Expense id（掛在 'leg:<pair>' 上）
 *   }
 *   Expense = {
 *     id, title, amount, paidBy: memberId,
 *     ref: 'spot:<spotId>' | 'leg:<fromSpotId>-><toSpotId>',  // 掛在哪張卡片上
 *     split: 'shared' | 'personal'                             // 全員均分 / 個人自付（不列入清帳）
 *   }
 *
 * 「Day N」與圖釘編號都從陣列位置算出，因此增刪天數或調整順序後會自動重新編號。
 *
 * 共享行程（網址是 #trip-<id>）時，除了 activeDayId 以外的資料都會同步到雲端，見「9. 雲端同步」。
 * ========================================================================== */

const sharedTripId = getTripIdFromHash();
let state = loadState();

// 只影響畫面、不需要儲存的狀態
const ui = {
  flashSpotId: null,        // 下次重繪後要閃一下的卡片
  lastPickedDayId: null,    // 新增表單預設選取的天數
  expandedExpenses: new Set(), // 展開記帳區的卡片 ref
  focusExpenseId: null,     // 下次重繪後要聚焦金額欄的支出
  settleOpen: false,        // 結算面板是否開啟
  lastLiveRefs: new Set(),  // 上次重繪時存在的卡片 ref，用來判斷哪些卡片被刪掉
  spotMenuId: null,         // 開著「⋯」操作選單的景點
  legModesKey: null,        // 開著交通方式切換的路段（fromId->toId）
  swipeSpotId: null,        // 手機上向左滑開操作按鈕的景點
  iconPickerSpotId: null,   // 開著圖示選單的景點
  legDetailsKey: null,      // 展開大眾運輸轉乘細節的路段（fromId->toId）
  renderOnBlur: false       // 打字中收到雲端更新時，等離開輸入框再重繪
};

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function createDay() {
  return { id: createId('day'), spots: [], note: '', detailedNotes: '' };
}

function createSpot({ name, lat, lng, placeId }) {
  return { id: createId('spot'), name, lat, lng, placeId: placeId || null, icon: '', note: '', detailedNotes: '', time: '', reserved: false, tentative: false };
}

// 個人行程與每個共享行程各自有一份本機資料（共享行程的是雲端資料的快取）
function getStorageKey() {
  return sharedTripId ? `${STATE_STORAGE}:trip-${sharedTripId}` : STATE_STORAGE;
}

function getTripIdFromHash() {
  const match = location.hash.match(/^#trip-([A-Za-z0-9]{10,40})$/);
  return match ? match[1] : null;
}

function loadState() {
  if (sharedTripId) return loadSharedCache();
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_STORAGE));
    if (saved && Array.isArray(saved.days) && saved.days.length) return normalizeState(saved);
  } catch {
    // 讀取失敗就使用預設資料
  }
  return normalizeState(migrateLegacySpots() || { days: [createDay(), createDay(), createDay()], activeDayId: OVERVIEW });
}

// 共享行程先顯示上次的快取，等雲端資料到了再取代
function loadSharedCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey()));
    if (saved && Array.isArray(saved.days) && saved.days.length) return normalizeState(saved);
  } catch {
    // 沒有快取就顯示空白行程
  }
  return normalizeState({ days: [createDay()], activeDayId: OVERVIEW });
}

// 早期版本的 note 是多行筆記：第一行留作簡短備註，其餘移到詳細紀錄
function normalizeSpotNotes(spot) {
  if (typeof spot.time !== 'string' || !/^\d{2}:\d{2}$/.test(spot.time)) spot.time = '';
  spot.reserved = Boolean(spot.reserved && spot.time);
  spot.tentative = Boolean(spot.tentative);
  if (typeof spot.note !== 'string') spot.note = '';
  if (typeof spot.detailedNotes !== 'string') {
    const [first, ...rest] = spot.note.split('\n');
    spot.note = first.trim();
    spot.detailedNotes = rest.join('\n').trim();
  }
}

// 補上舊資料沒有的欄位（旅伴、記帳）
function normalizeState(s) {
  if (!Array.isArray(s.members) || s.members.length < MIN_MEMBERS) s.members = DEFAULT_MEMBERS.map(m => ({ ...m }));
  if (!Array.isArray(s.expenses)) s.expenses = [];
  if (!Array.isArray(s.todos)) s.todos = [];
  if (!s.legDetails || typeof s.legDetails !== 'object') s.legDetails = {};
  if (!s.legModes || typeof s.legModes !== 'object') s.legModes = {}; // 新行程一開始沒有，沒補的話交通視窗儲存會出錯
  s.todos = s.todos.filter(t => t && typeof t.text === 'string').map(t => ({ id: t.id || createId('todo'), text: t.text, done: Boolean(t.done) }));
  if (typeof s.tripName !== 'string') s.tripName = '';
  s.days.forEach(day => {
    if (typeof day.note !== 'string') day.note = '';
    if (typeof day.detailedNotes !== 'string') day.detailedNotes = '';
  });
  s.days.forEach(day => day.spots.forEach(spot => {
    if (!SPOT_ICONS.some(i => i.value === spot.icon)) spot.icon = '';
    normalizeSpotNotes(spot);
  }));
  if (typeof s.startDate !== 'string') s.startDate = '';
  return s;
}

// 舊版資料是 [{ id, name, day: 1~5, lat, lng }]，轉成新的 days 結構
function migrateLegacySpots() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SPOTS_STORAGE));
    if (!Array.isArray(legacy) || !legacy.length) return null;
    const dayCount = Math.max(3, ...legacy.map(s => Number(s.day) || 1));
    const days = Array.from({ length: dayCount }, createDay);
    legacy.forEach(s => {
      const day = days[(Number(s.day) || 1) - 1];
      day.spots.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, placeId: s.placeId || null, note: '', detailedNotes: '' });
    });
    return { days, activeDayId: OVERVIEW };
  } catch {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
  } catch {
    // 無法儲存時（例如無痕模式）就只保留在記憶體中
  }
  queueCloudSave();
}

// 每個會改變資料的操作最後都呼叫 commit()：儲存 → 重繪清單與地圖
function commit() {
  pruneLegModes();
  pruneExpenses();
  saveState();
  render();
}


/* ==========================================================================
 * 3. 查詢函式（只讀，不改資料）
 * ========================================================================== */

function getDay(dayId) {
  return state.days.find(d => d.id === dayId) || null;
}

function getDayIndex(dayId) {
  return state.days.findIndex(d => d.id === dayId);
}

const DEFAULT_TRIP_NAME = '旅遊行程規劃';
const WEEKDAYS = '日一二三四五六';

// 出發日期加上天數；沒設定出發日期時回傳 null
function getDayDate(dayIndex) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.startDate || '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dayIndex);
}

function toISODate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDayDate(date, withWeekday = true) {
  const text = `${date.getMonth() + 1}/${date.getDate()}`;
  return withWeekday ? `${text}（${WEEKDAYS[date.getDay()]}）` : text;
}

// 例如「11/3（一）」；沒設定出發日期時是空字串
function getDayDateText(dayIndex, withWeekday = true) {
  const date = getDayDate(dayIndex);
  return date ? formatDayDate(date, withWeekday) : '';
}

function getDayLabel(dayIndex) {
  return `Day ${dayIndex + 1}`;
}

function getDayColor(dayIndex) {
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
}

function findSpot(spotId) {
  for (let dayIndex = 0; dayIndex < state.days.length; dayIndex++) {
    const day = state.days[dayIndex];
    const index = day.spots.findIndex(s => s.id === spotId);
    if (index !== -1) return { day, dayIndex, spot: day.spots[index], index };
  }
  return null;
}

function getVisibleDays() {
  if (state.activeDayId === OVERVIEW) return state.days;
  const day = getDay(state.activeDayId);
  return day ? [day] : state.days;
}

function getTravelMode() {
  return TRAVEL_MODES.find(m => m.value === state.travelMode) || TRAVEL_MODES[0];
}

function getPairKey(fromSpot, toSpot) {
  return `${fromSpot.id}->${toSpot.id}`;
}

// 這段路的交通方式：有個別設定就用它，否則用預設
function getLegMode(fromSpot, toSpot) {
  const value = state.legModes?.[getPairKey(fromSpot, toSpot)];
  return TRAVEL_MODES.find(m => m.value === value) || getTravelMode();
}

function getSpotRef(spot) {
  return `spot:${spot.id}`;
}

function getLegRef(fromSpot, toSpot) {
  return `leg:${getPairKey(fromSpot, toSpot)}`;
}

// 目前畫面上存在的所有卡片（景點與相鄰路段）
function getLiveRefs() {
  const refs = new Set();
  state.days.forEach(day => {
    day.spots.forEach(spot => refs.add(getSpotRef(spot)));
    getDayLegs(day).forEach(({ from, to }) => refs.add(getLegRef(from, to)));
  });
  return refs;
}

function getExpensesFor(ref) {
  return state.expenses.filter(x => x.ref === ref);
}

function getMember(memberId) {
  return state.members.find(m => m.id === memberId) || null;
}

function getMemberName(member) {
  return member?.name.trim() || '未命名';
}

function getSharedLabel() {
  const count = state.members.length;
  if (count === 1) return '均分';
  return count === 2 ? '雙人均分' : `${count} 人均分`;
}

function countSpots() {
  return state.days.reduce((sum, d) => sum + d.spots.length, 0);
}


/* ==========================================================================
 * 4. 操作（所有資料變動都集中在這裡）
 * ========================================================================== */

function addDay() {
  const day = createDay();
  state.days.push(day);
  state.activeDayId = day.id;
  ui.lastPickedDayId = day.id;
  commit();
}

function removeDay(dayId) {
  const index = getDayIndex(dayId);
  if (index === -1 || state.days.length <= 1) return;
  const day = state.days[index];
  if (day.spots.length) {
    const dayRefs = new Set(day.spots.map(getSpotRef).concat(getDayLegs(day).map(({ from, to }) => getLegRef(from, to))));
    const lost = state.expenses.filter(x => dayRefs.has(x.ref) && x.amount > 0);
    const expenseNote = lost.length ? `\n這天記錄的 ${lost.length} 筆花費（${formatMoney(sumAmounts(lost))}）也會一併刪除。` : '';
    const ok = confirm(`確定刪除 ${getDayLabel(index)}？\n這天的 ${day.spots.length} 個景點也會一併刪除，後面的天數會往前遞補。${expenseNote}`);
    if (!ok) return;
  }
  state.days.splice(index, 1);
  if (state.activeDayId === dayId) {
    state.activeDayId = (state.days[index] || state.days[index - 1]).id;
  }
  commit();
}

function setActiveDay(dayId) {
  if (dayId !== OVERVIEW && !getDay(dayId)) return;
  state.activeDayId = dayId;
  commit();
}

// 選回程日：依出發日到回程日的天數增加或減少行程天數（從最後一天開始減）
function setTripEnd(value) {
  const start = getDayDate(0);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!start || !match) return render();
  const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const count = Math.round((end - start) / 86400000) + 1;
  if (count < 1 || count > 60) return render(); // 早於出發日或超過 60 天就還原
  if (count > state.days.length) {
    while (state.days.length < count) state.days.push(createDay());
  } else if (count < state.days.length) {
    const removed = state.days.slice(count);
    const spotCount = removed.reduce((sum, d) => sum + d.spots.length, 0);
    if (spotCount) {
      const labels = `${getDayLabel(count)}${removed.length > 1 ? ` – ${getDayLabel(state.days.length - 1)}` : ''}`;
      const ok = confirm(`縮短行程會刪除 ${labels}，以及這幾天的 ${spotCount} 個景點和相關花費，確定嗎？`);
      if (!ok) return render();
    }
    state.days = state.days.slice(0, count);
    if (!getDay(state.activeDayId)) state.activeDayId = OVERVIEW;
  }
  commit();
}

function setLegMode(fromId, toId, mode) {
  const from = findSpot(fromId)?.spot;
  const to = findSpot(toId)?.spot;
  if (!from || !to || !TRAVEL_MODES.some(m => m.value === mode)) return;
  state.legModes = state.legModes || {};
  const key = getPairKey(from, to);
  if (mode === getTravelMode().value) delete state.legModes[key];
  else state.legModes[key] = mode;
  commit();
}

// 景點刪除或換順序後，不再相鄰的路段設定就沒有用了
function pruneLegModes() {
  const live = new Set(state.days.flatMap(day => getDayLegs(day).map(({ from, to }) => getPairKey(from, to))));
  [state.legModes, state.legDetails].forEach(map => {
    if (!map) return;
    Object.keys(map).forEach(key => {
      if (!live.has(key)) delete map[key];
    });
  });
}

function getLegDetail(fromSpot, toSpot) {
  return state.legDetails?.[getPairKey(fromSpot, toSpot)] || null;
}

// 路段實際採用的秒數：手動覆寫優先，否則用 Routes API 的預估；都沒有時為 null
function getLegDurationSec(fromSpot, toSpot) {
  const detail = getLegDetail(fromSpot, toSpot);
  if (detail?.noTime) return null;
  if (detail?.customDuration > 0) return detail.customDuration * 60;
  const leg = legCache.get(getLegKey(fromSpot, toSpot, getLegMode(fromSpot, toSpot).value));
  return leg?.status === 'ok' ? leg.durationSec : null;
}

// 路段的費用：加入結算時以記帳那筆為準（在記帳面板改了金額也會同步顯示）
function getLegCost(detail) {
  if (!detail) return null;
  const linked = detail.expenseId && state.expenses.find(x => x.id === detail.expenseId);
  if (linked) return { amount: linked.amount, currency: 'TWD', inSettlement: true };
  return detail.cost > 0 ? { amount: detail.cost, currency: detail.currency || 'TWD', inSettlement: false } : null;
}

function formatCurrency(amount, currency) {
  return `${CURRENCY_SYMBOLS[currency] || currency + ' '}${Math.round(amount).toLocaleString('en-US')}`;
}

// 交通編輯視窗按「儲存」：寫入路段資訊、交通方式，並與記帳同步
function saveLegDetail(fromId, toId, input) {
  const from = findSpot(fromId)?.spot;
  const to = findSpot(toId)?.spot;
  if (!from || !to) return;
  const key = getPairKey(from, to);
  const ref = getLegRef(from, to);
  const prev = state.legDetails[key] || {};
  const detail = {
    transitNote: input.transitNote.trim(),
    customDuration: !input.noTime && input.customDuration > 0 ? Math.round(input.customDuration) : null,
    noTime: Boolean(input.noTime),
    unconfirmed: Boolean(input.unconfirmed),
    cost: input.cost > 0 ? input.cost : null,
    currency: input.currency || 'TWD',
    paidBy: getMember(input.paidBy) ? input.paidBy : state.members[0].id,
    addToSettlement: Boolean(input.addToSettlement && input.cost > 0 && input.currency === 'TWD'),
    expenseId: prev.expenseId || null
  };
  // 加入結算：建立或更新掛在這段路上的那筆花費；取消勾選或清掉金額就移除
  const linked = detail.expenseId && state.expenses.find(x => x.id === detail.expenseId);
  if (detail.addToSettlement) {
    const title = detail.transitNote.split('\n')[0].slice(0, 40) || `${from.name} → ${to.name}`;
    if (linked) Object.assign(linked, { amount: detail.cost, paidBy: detail.paidBy, title: linked.title || title });
    else {
      const expense = { id: createId('expense'), ref, title, amount: detail.cost, paidBy: detail.paidBy, split: 'shared' };
      state.expenses.push(expense);
      detail.expenseId = expense.id;
    }
  } else if (linked) {
    state.expenses = state.expenses.filter(x => x.id !== linked.id);
    detail.expenseId = null;
  } else {
    detail.expenseId = null;
  }
  const empty = !detail.transitNote && !detail.customDuration && !detail.noTime && !detail.unconfirmed && !detail.cost && !detail.expenseId;
  if (empty) delete state.legDetails[key];
  else state.legDetails[key] = detail;
  if (TRAVEL_MODES.some(m => m.value === input.mode)) {
    if (input.mode === getTravelMode().value) delete state.legModes[key];
    else state.legModes[key] = input.mode;
  }
  commit();
}

// 景點或路段卡片消失後，掛在上面的花費一併移除
// 只刪除「上次畫面上還在、這次不見了」的卡片的花費；
// 共享行程中別人新增的花費可能比它的景點早一步同步到，不能因為暫時找不到卡片就刪掉
function pruneExpenses() {
  const live = getLiveRefs();
  const gone = new Set([...ui.lastLiveRefs].filter(ref => !live.has(ref)));
  if (gone.size) state.expenses = state.expenses.filter(x => !gone.has(x.ref));
}

// 先試做會改變景點的操作；若會讓已記錄的花費失去所屬卡片，先請使用者確認，取消就還原
function applyWithExpenseGuard(mutate, actionText) {
  const snapshot = state.days.map(d => d.spots.slice());
  const before = getLiveRefs();
  mutate();
  const live = getLiveRefs();
  const lost = state.expenses.filter(x => before.has(x.ref) && !live.has(x.ref) && x.amount > 0);
  if (lost.length && !confirm(`${actionText}會一併刪除 ${lost.length} 筆花費（${formatMoney(sumAmounts(lost))}），確定嗎？`)) {
    state.days.forEach((d, i) => { d.spots = snapshot[i]; });
    return false;
  }
  return true;
}

// ---------- 旅伴 ----------
function addMember() {
  const member = { id: createId('member'), name: `旅伴 ${state.members.length + 1}` };
  state.members.push(member);
  commit();
  const input = document.querySelector(`.member-name[data-member-id="${member.id}"]`);
  input?.focus();
  input?.select();
}

function renameMember(memberId, name) {
  const member = getMember(memberId);
  if (!member) return;
  member.name = name;
  saveState();
  refreshMoneyViews();
}

function removeMember(memberId) {
  const member = getMember(memberId);
  if (!member || state.members.length <= MIN_MEMBERS) return;
  const paid = state.expenses.filter(x => x.paidBy === memberId);
  if (paid.length) {
    alert(`「${getMemberName(member)}」還有 ${paid.length} 筆付款紀錄，請先把付款人改成其他人再移除。`);
    return;
  }
  state.members = state.members.filter(m => m.id !== memberId);
  commit();
}

// ---------- 記帳 ----------
function addExpense(ref, title) {
  const expense = { id: createId('expense'), ref, title, amount: 0, paidBy: state.members[0].id, split: 'shared' };
  state.expenses.push(expense);
  ui.expandedExpenses.add(ref);
  ui.focusExpenseId = expense.id;
  commit();
}

// 收合時順手清掉沒填金額的空白支出
function toggleExpenses(ref, title) {
  if (ui.expandedExpenses.has(ref)) {
    ui.expandedExpenses.delete(ref);
    state.expenses = state.expenses.filter(x => x.ref !== ref || x.amount > 0);
    commit();
  } else if (!getExpensesFor(ref).length) {
    addExpense(ref, title);
  } else {
    ui.expandedExpenses.add(ref);
    render();
  }
}

// 輸入時只更新資料與金額顯示，不整個重繪，避免輸入框失去焦點
function updateExpense(expenseId, field, value) {
  const expense = state.expenses.find(x => x.id === expenseId);
  if (!expense) return;
  if (field === 'amount') expense.amount = Math.max(0, Number(value) || 0);
  else if (field === 'title') expense.title = value;
  else if (field === 'paidBy' && getMember(value)) expense.paidBy = value;
  else if (field === 'split' && (value === 'shared' || value === 'personal')) expense.split = value;
  saveState();
  refreshMoneyViews();
}

function removeExpense(expenseId) {
  state.expenses = state.expenses.filter(x => x.id !== expenseId);
  commit();
}

function setSettleOpen(open) {
  ui.settleOpen = open;
  renderSettlement();
  if (open) document.getElementById('settle-close').focus();
}

function addSpot(dayId, spotInput) {
  const day = getDay(dayId);
  if (!day) return;
  const spot = createSpot(spotInput);
  day.spots.push(spot);
  ui.lastPickedDayId = dayId;
  ui.flashSpotId = spot.id;
  if (state.activeDayId !== OVERVIEW) state.activeDayId = dayId; // 切到剛加入的那天，讓使用者看到新卡片
  commit();
}

function removeSpot(spotId) {
  const found = findSpot(spotId);
  if (!found) return;
  const ok = applyWithExpenseGuard(() => found.day.spots.splice(found.index, 1), `刪除「${found.spot.name}」`);
  if (!ok) return;
  commit();
}

// 把景點移到同一天的 toIndex（以「移除後」的陣列位置計算）
function moveSpot(spotId, toIndex) {
  const found = findSpot(spotId);
  if (!found) return;
  const { day, index } = found;
  const target = Math.max(0, Math.min(toIndex, day.spots.length - 1));
  if (target === index) return;
  const ok = applyWithExpenseGuard(() => {
    const [spot] = day.spots.splice(index, 1);
    day.spots.splice(target, 0, spot);
  }, '這樣調整順序（原本相鄰的路段會消失）');
  if (!ok) return;
  ui.flashSpotId = spotId;
  commit();
}

function moveSpotBy(spotId, offset) {
  const found = findSpot(spotId);
  if (found) moveSpot(spotId, found.index + offset);
}

function setSpotIcon(spotId, icon) {
  const found = findSpot(spotId);
  if (!found || !SPOT_ICONS.some(i => i.value === icon)) return;
  found.spot.icon = icon;
  ui.iconPickerSpotId = null;
  commit(); // 卡片、下一站卡片、地圖圖釘一起更新
}

// 備註視窗按「儲存」：寫回景點、重繪清單與圖釘，並照常存到本機（共享行程同步到雲端）
function saveSpotNotes(spotId, note, detailedNotes, time = '', reserved = false, tentative = false) {
  const found = findSpot(spotId);
  if (!found) return false;
  found.spot.note = note.trim();
  found.spot.detailedNotes = detailedNotes.replace(/\s+$/, '');
  found.spot.time = /^\d{2}:\d{2}$/.test(time) ? time : '';
  found.spot.reserved = Boolean(reserved && found.spot.time);
  found.spot.tentative = Boolean(tentative);
  ui.flashSpotId = spotId;
  commit();
  return true;
}


/* ==========================================================================
 * 5. 交通時間（Routes API）
 *
 * 同一天相鄰兩個景點之間是一段「交通 Leg」，用 Routes API 的 computeRoutes 計算時間與距離。
 * 每段路可以有自己的交通方式（state.legModes），沒設定時用預設交通方式。
 * Leg 以「出發景點 → 抵達景點 + 交通方式」組成 key，調整順序或切換交通方式後
 * 只會計算還沒算過的組合。結果回來時只更新該段交通欄位，不整個重繪，
 * 避免打斷正在輸入的備註或拖曳。
 * ========================================================================== */

// legKey -> { status: 'loading' | 'ok' | 'error', durationSec, distanceMeters, description, message }
const legCache = new Map();

function getLegKey(fromSpot, toSpot, mode) {
  return `${getPairKey(fromSpot, toSpot)}@${mode}`;
}

function getDayLegs(day) {
  return day.spots.slice(1).map((toSpot, i) => ({ from: day.spots[i], to: toSpot }));
}

function toWaypoint(spot) {
  return spot.placeId
    ? { placeId: spot.placeId }
    : { location: { latLng: { latitude: spot.lat, longitude: spot.lng } } };
}

// 把 Google API 的錯誤轉成看得懂、知道怎麼修的說明（Routes API 與 Places API 共用）
function explainGoogleApiError(apiName, text) {
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(text)) {
    return `這把金鑰所屬的 Google Cloud 專案還沒啟用 ${apiName}`;
  }
  if (/REFERER|REFERRER/i.test(text)) {
    return `金鑰的「網站限制」不允許這個網址，請加入 ${location.host}/*`;
  }
  if (/API_KEY_SERVICE_BLOCKED|are blocked/i.test(text)) {
    return `金鑰的「API 限制」沒有勾選 ${apiName}`;
  }
  if (/BILLING/i.test(text)) {
    return 'Google Cloud 專案還沒啟用帳單（Maps 平台必須綁定帳單）';
  }
  if (/API_KEY_INVALID|API key not valid|API_KEY_EXPIRED/i.test(text)) {
    return 'API 金鑰無效或已過期，請重新確認金鑰';
  }
  if (/RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return `${apiName} 已超過用量上限，請稍後再試`;
  }
  return `${apiName} 呼叫失敗：${text.trim().slice(0, 120)}`;
}

async function fetchLegRoute(fromSpot, toSpot, mode) {
  const body = {
    origin: toWaypoint(fromSpot),
    destination: toWaypoint(toSpot),
    travelMode: mode,
    languageCode: 'zh-TW',
    units: 'METRIC'
  };
  // 開車、機車依即時路況計算；大眾運輸與步行不支援這個選項
  if (mode === 'DRIVE' || mode === 'TWO_WHEELER') body.routingPreference = 'TRAFFIC_AWARE';

  let res;
  try {
    res = await fetch(ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.description,routes.polyline.encodedPolyline'
          + (mode === 'TRANSIT' ? ',routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.transitDetails' : '')
      },
      body: JSON.stringify(body)
    });
  } catch {
    return { status: 'error', message: '連線失敗' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error?.details?.find(d => d.reason)?.reason || '';
    const detail = data.error?.message || `HTTP ${res.status}`;
    console.warn('Routes API:', res.status, reason, detail);
    return { status: 'error', message: explainGoogleApiError('Routes API', `${reason} ${detail}`), detail };
  }
  const route = data.routes?.[0];
  if (!route) return { status: 'error', message: '找不到這種交通方式的路線' };
  return {
    status: 'ok',
    durationSec: parseInt(route.duration, 10) || 0,
    distanceMeters: route.distanceMeters || 0,
    description: route.description || '',
    polyline: route.polyline?.encodedPolyline || '', // 畫當日路線用
    transitSteps: mode === 'TRANSIT' ? parseTransitSteps(route.legs?.flatMap(l => l.steps || []) || []) : []
  };
}

const MODE_TAG_EMOJI = { DRIVE: '🚗', TWO_WHEELER: '🛵', TRANSIT: '🚄', WALK: '🚶', BICYCLE: '🚲', CUSTOM: '🎫' };

const VEHICLE_LABELS = {
  BUS: '公車', INTERCITY_BUS: '客運', TROLLEYBUS: '公車', SHARE_TAXI: '共乘',
  SUBWAY: '捷運', METRO_RAIL: '捷運', MONORAIL: '單軌', TRAM: '輕軌',
  HIGH_SPEED_TRAIN: '高鐵', HEAVY_RAIL: '火車', RAIL: '火車', COMMUTER_TRAIN: '火車', LONG_DISTANCE_TRAIN: '火車',
  FERRY: '渡輪', CABLE_CAR: '纜車', GONDOLA_LIFT: '纜車', FUNICULAR: '纜車'
};

// 把 Routes API 的步驟整理成轉乘時間軸：連續的步行合併成一段，搭乘段取出運具、路線、站名與站數
function parseTransitSteps(steps) {
  const out = [];
  steps.forEach(step => {
    const sec = parseInt(step.staticDuration, 10) || 0;
    const meters = step.distanceMeters || 0;
    const td = step.transitDetails;
    if (step.travelMode === 'TRANSIT' && td) {
      const line = td.transitLine || {};
      out.push({
        type: 'ride',
        vehicle: line.vehicle?.name?.text || VEHICLE_LABELS[line.vehicle?.type] || '大眾運輸',
        line: line.nameShort || line.name || '',
        trip: td.tripShortText || '',
        headsign: td.headsign || '',
        color: line.color || '',
        textColor: line.textColor || '',
        from: td.stopDetails?.departureStop?.name || '',
        to: td.stopDetails?.arrivalStop?.name || '',
        departTime: td.localizedValues?.departureTime?.time?.text || '',
        stops: td.stopCount || 0,
        sec
      });
      return;
    }
    const last = out[out.length - 1];
    if (last?.type === 'walk') {
      last.sec += sec;
      last.meters += meters;
    } else {
      out.push({ type: 'walk', sec, meters });
    }
  });
  return out.filter(s => s.type === 'ride' || s.sec >= 30 || s.meters >= 20); // 拿掉幾乎為零的步行
}

function renderTransitSteps(steps) {
  return `<ol class="transit-steps" aria-label="轉乘步驟">${steps.map(step => {
    if (step.type === 'walk') {
      return `<li class="ts ts-walk"><span class="ts-dot">${ICONS.WALK}</span>
        <span class="ts-main">步行 ${formatDuration(step.sec)}<span class="ts-sub">（${formatDistance(step.meters)}）</span></span></li>`;
    }
    const badgeStyle = step.color ? ` style="background:${escapeHtml(step.color)};color:${escapeHtml(step.textColor || '#FFFFFF')}"` : '';
    const meta = [step.departTime && `${escapeHtml(step.departTime)} 上車`, step.stops && `${step.stops} 站`, formatDuration(step.sec)].filter(Boolean).join('・');
    return `<li class="ts ts-ride"><span class="ts-dot">${ICONS.TRANSIT}</span>
      <div class="ts-main">
        <div class="ts-head">
          <span class="ts-vehicle">${escapeHtml(step.vehicle)}</span>
          ${step.line ? `<span class="ts-line"${badgeStyle}>${escapeHtml(step.line)}</span>` : ''}
          ${step.trip ? `<span class="ts-sub">車次 ${escapeHtml(step.trip)}</span>` : ''}
          ${step.headsign ? `<span class="ts-sub">往 ${escapeHtml(step.headsign)}</span>` : ''}
        </div>
        <div class="ts-stops">${escapeHtml(step.from)}<span class="ts-arrow" aria-label="到">➔</span>${escapeHtml(step.to)}</div>
        <div class="ts-sub">${meta}</div>
      </div></li>`;
  }).join('')}</ol>`;
}

// 計算畫面上所有還沒算過的 Leg（每次 render 後呼叫）
function refreshVisibleLegs() {
  if (!apiKey) return;
  getVisibleDays().forEach(day => getDayLegs(day).forEach(({ from, to }) => requestLeg(from, to)));
}

// 取得一段路的交通資料；已算過或正在算就沿用，回傳 Promise 方便匯出時等全部算完
function requestLeg(from, to, mode = getLegMode(from, to).value) {
  const key = getLegKey(from, to, mode);
  const cached = legCache.get(key);
  if (cached) return cached.promise || Promise.resolve(cached);
  if (mode === 'CUSTOM') { // 自訂交通不查 Routes API
    const result = { status: 'custom' };
    legCache.set(key, result);
    return Promise.resolve(result);
  }
  const promise = fetchLegRoute(from, to, mode).then(result => {
    legCache.set(key, result);
    updateLegViews();
    return result;
  });
  legCache.set(key, { status: 'loading', promise });
  return promise;
}

// 匯出前把所有天數的路段都算完（最多等 20 秒，網路不通也不會卡住）
function ensureAllLegs() {
  if (!apiKey) return Promise.resolve();
  const all = Promise.all(state.days.flatMap(day => getDayLegs(day).map(({ from, to }) => requestLeg(from, to))));
  return Promise.race([all, new Promise(resolve => setTimeout(resolve, 20000))]);
}

function retryLeg(fromId, toId) {
  const from = findSpot(fromId)?.spot;
  const to = findSpot(toId)?.spot;
  if (!from || !to) return;
  legCache.delete(getLegKey(from, to, getLegMode(from, to).value));
  refreshVisibleLegs();
  updateLegViews();
}

// 一天的交通總時間；還有路段在計算或失敗時回傳 null
function getDayTravelSec(day) {
  let total = 0;
  for (const { from, to } of getDayLegs(day)) {
    const sec = getLegDurationSec(from, to);
    if (sec === null) {
      // 選了「不填時間」或自訂交通沒填時間就不計入
      if (getLegDetail(from, to)?.noTime || getLegMode(from, to).value === 'CUSTOM') continue;
      return null;
    }
    total += sec;
  }
  return total;
}

function formatDuration(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} 分鐘`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
}

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
}

function getGoogleMapsDirUrl(fromSpot, toSpot, mode) {
  const params = new URLSearchParams({
    api: '1',
    origin: `${fromSpot.lat},${fromSpot.lng}`,
    destination: `${toSpot.lat},${toSpot.lng}`,
    travelmode: mode.gmaps
  });
  if (fromSpot.placeId) params.set('origin_place_id', fromSpot.placeId);
  if (toSpot.placeId) params.set('destination_place_id', toSpot.placeId);
  return `https://www.google.com/maps/dir/?${params}`;
}


/* ==========================================================================
 * 5b. 旅費結算（純計算）
 *
 * 公費（split: 'shared'）由所有旅伴平均分攤；個人自付只計入總支出，不列入清帳。
 * 每人淨額 = 代墊的公費 − 應負擔的公費；正數代表要收錢，負數代表要付錢。
 * ========================================================================== */

function sumAmounts(expenses) {
  return expenses.reduce((sum, x) => sum + (x.amount > 0 ? x.amount : 0), 0);
}

function formatMoney(value) {
  return `NT$ ${Math.round(value).toLocaleString('en-US')}`;
}

function computeSettlement() {
  const valid = state.expenses.filter(x => x.amount > 0);
  const shared = valid.filter(x => x.split === 'shared');
  const sharedTotal = sumAmounts(shared);
  const share = state.members.length ? sharedTotal / state.members.length : 0;
  const rows = state.members.map(member => {
    const mine = valid.filter(x => x.paidBy === member.id);
    const paid = sumAmounts(mine.filter(x => x.split === 'shared'));
    return { member, paid, share, net: paid - share, personal: sumAmounts(mine.filter(x => x.split === 'personal')) };
  });
  return {
    total: sumAmounts(valid),
    sharedTotal,
    personalTotal: sumAmounts(valid.filter(x => x.split === 'personal')),
    spotTotal: sumAmounts(valid.filter(x => x.ref.startsWith('spot:'))),
    legTotal: sumAmounts(valid.filter(x => x.ref.startsWith('leg:'))),
    count: valid.length,
    rows,
    transfers: computeTransfers(rows)
  };
}

// 欠錢的人依序轉給要收錢的人，轉帳筆數最多為（人數 − 1）
function computeTransfers(rows) {
  const debtors = rows.filter(r => r.net < -0.5).map(r => ({ member: r.member, left: -r.net })).sort((a, b) => b.left - a.left);
  const creditors = rows.filter(r => r.net > 0.5).map(r => ({ member: r.member, left: r.net })).sort((a, b) => b.left - a.left);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (Math.round(amount) > 0) transfers.push({ from: debtors[i].member, to: creditors[j].member, amount: Math.round(amount) });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left < 0.5) i++;
    if (creditors[j].left < 0.5) j++;
  }
  return transfers;
}


/* ==========================================================================
 * 6. 畫面：側邊欄
 * ========================================================================== */

const ICONS = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  memo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  DRIVE: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13h.01M16.5 13h.01"/></svg>',
  TWO_WHEELER: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M8.5 16.5h5l3-7h-4M15 6h2.5l1 3.5M5.5 16.5 9 10h4"/></svg>',
  TRANSIT: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 14h.01M15 14h.01M8 21l2-4M16 21l-2-4"/></svg>',
  WALK: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="1.5"/><path d="M10 21l2-6 3 3v3M9 12l2-5 4 3 3 1M11 7l-3 2-1 3"/></svg>',
  BICYCLE: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9h6l3.5 7.5M9 9l3.5 7.5L15 9M8 6h3"/></svg>',
  CUSTOM: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16h18l-2.5 4h-13zM6 16V9h9l3 7M9 9V5h4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h13V9H6a2 2 0 0 1-2-2zM16 14h.01"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function render() {
  renderTripHeader();
  renderCloudTtl();
  renderTripEnded();
  renderSummary();
  renderMembers();
  renderSyncBar();
  renderTabs();
  updateTabsFade();
  renderDayList();
  renderSettleButton();
  renderSettlement();
  renderTodos();
  renderNextStop();
  layoutSheet(false);
  if (map) {
    syncMarkers();
    scheduleDayRoute();
  }
  flashPendingSpot();
  focusPendingExpense();
  refreshVisibleLegs();
  ui.lastLiveRefs = getLiveRefs();
}

function renderSummary() {
  const range = state.startDate
    ? `・${getDayDateText(0, false)} – ${getDayDateText(state.days.length - 1, false)}`
    : '';
  document.getElementById('summary').innerHTML =
    `<strong>${state.days.length}</strong> 天・<strong>${countSpots()}</strong> 個景點${range}`;
}

// 頂部的旅程名稱與出發日期；正在編輯的欄位不覆蓋，避免打斷輸入
function renderTripHeader() {
  const nameInput = document.getElementById('trip-name');
  const dateInput = document.getElementById('trip-start');
  if (document.activeElement !== nameInput) nameInput.value = state.tripName;
  if (document.activeElement !== dateInput) dateInput.value = state.startDate;
  // 回程日 = 出發日 + 天數 − 1；沒設出發日時不能選
  const endInput = document.getElementById('trip-end');
  endInput.disabled = !state.startDate;
  endInput.min = state.startDate;
  if (document.activeElement !== endInput) endInput.value = state.startDate ? toISODate(getDayDate(state.days.length - 1)) : '';
  document.title = state.tripName.trim() || DEFAULT_TRIP_NAME;
  renderCountdown();
}

// 出發倒數：出發前顯示剩幾天，旅途中顯示第幾天，結束後顯示已結束
function renderCountdown() {
  const el = document.getElementById('countdown');
  const start = getDayDate(0);
  el.hidden = !start;
  if (!start) return;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((start - today) / 86400000);
  let text;
  let tone;
  if (diff > 0) {
    text = `倒數 <strong>${diff}</strong> 天出發`;
    tone = 'upcoming';
  } else if (diff === 0) {
    text = '今天出發！';
    tone = 'today';
  } else if (-diff < state.days.length) {
    text = `旅行中・第 <strong>${-diff + 1}</strong> 天`;
    tone = 'today';
  } else {
    text = '旅程已結束';
    tone = 'past';
  }
  el.className = `countdown ${tone}`;
  el.innerHTML = text;
}

function renderTabs() {
  const tabs = [{ id: OVERVIEW, label: '全部', color: null, count: countSpots() }]
    .concat(state.days.map((d, i) => ({ id: d.id, label: getDayLabel(i), date: getDayDateText(i, false), color: getDayColor(i), count: d.spots.length })));
  document.getElementById('tabs').innerHTML = tabs.map(t => `
      <button class="tab ${t.id === state.activeDayId ? 'active' : ''}" role="tab"
        aria-selected="${t.id === state.activeDayId}" data-action="select-day" data-day-id="${t.id}"
        ${t.color ? `style="--c:${t.color}"` : ''}>
        ${t.color ? '<span class="tab-dot"></span>' : ''}${t.label}${t.date ? `<span class="tab-date">${t.date}</span>` : ''}<span class="tab-count">${t.count}</span>
      </button>`).join('');
  document.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// 分頁超出寬度時，在有更多內容的那一側顯示漸層遮罩與捲動箭頭
function updateTabsFade() {
  const tabs = document.getElementById('tabs');
  const bar = tabs.closest('.tabs-scroll');
  const left = tabs.scrollLeft > 4;
  const right = tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 4;
  bar.classList.toggle('fade-left', left);
  bar.classList.toggle('fade-right', right);
}

function scrollTabs(direction) {
  const tabs = document.getElementById('tabs');
  tabs.scrollBy({ left: direction * tabs.clientWidth * 0.7, behavior: 'smooth' });
}

function renderDayList() {
  const canRemoveDay = state.days.length > 1;
  document.getElementById('day-list').innerHTML = getVisibleDays().map(day => {
    const dayIndex = getDayIndex(day.id);
    const label = getDayLabel(dayIndex);
    return `
      <section class="day" data-day-id="${day.id}" style="--c:${getDayColor(dayIndex)}">
        <header class="day-head">
          <span class="day-dot"></span>
          <h2 class="day-title">${label}</h2>
          ${getDayDateText(dayIndex) ? `<span class="day-date">${getDayDateText(dayIndex)}</span>` : ''}
          <span class="day-badges">
            <span class="day-count">${day.spots.length} 個景點</span>
            <span class="day-travel" data-day-id="${day.id}">${renderDayTravel(day)}</span>
          </span>
          <button class="icon-btn danger day-remove" data-action="remove-day" data-day-id="${day.id}"
            ${canRemoveDay ? `title="刪除 ${label}" aria-label="刪除 ${label}"` : 'disabled title="至少要保留一天" aria-label="至少要保留一天"'}>${ICONS.trash}</button>
          <div class="day-note">${renderNoteChip(day, label, '當天備註')}</div>
        </header>
        ${day.spots.length
          ? `<ol class="spot-list" data-day-id="${day.id}">${renderDaySpots(day)}</ol>`
          : `<p class="day-empty">點擊地圖，把景點加入 ${label}</p>`}
      </section>`;
  }).join('');
}

// 卡片與交通佔位交錯排列：景點 → 交通 → 景點 → 交通 → 景點
function renderDaySpots(day) {
  return day.spots.map((spot, i) => {
    const card = renderSpotCard(spot, i, day.spots.length);
    const next = day.spots[i + 1];
    return next ? card + renderLegSlot(spot, next) : card;
  }).join('');
}

// 備註標籤（景點卡與 Day 標題共用）：有備註顯示單行摘要（只有詳細紀錄時顯示其第一行），沒有則是低調的「+ 備註」
function renderNoteChip(target, name = target.name, emptyLabel = '備註') {
  const summary = target.note.trim() || target.detailedNotes.trim().split('\n')[0];
  const hasDetail = Boolean(target.detailedNotes.trim());
  if (!summary) {
    return `<button class="note-chip empty" data-action="open-note" aria-label="為 ${escapeHtml(name)} 新增備註">${ICONS.memo}${emptyLabel}</button>`;
  }
  return `<button class="note-chip" data-action="open-note" title="${escapeHtml(summary)}" aria-label="編輯 ${escapeHtml(name)} 的備註：${escapeHtml(summary)}">
      ${ICONS.memo}<span class="note-chip-text">${escapeHtml(summary)}</span>${hasDetail ? '<span class="note-chip-more" aria-hidden="true">詳細</span>' : ''}
    </button>`;
}

function renderSpotCard(spot, index, total) {
  const hasNote = Boolean(spot.note.trim() || spot.detailedNotes.trim());
  const menuOpen = ui.spotMenuId === spot.id;
  const ref = getSpotRef(spot);
  return `
    <li class="spot ${menuOpen ? 'menu-open' : ''} ${ui.swipeSpotId === spot.id ? 'swiped' : ''}" data-spot-id="${spot.id}">
      <div class="spot-row">
      <div class="swipe-actions" aria-hidden="${ui.swipeSpotId !== spot.id}">
        <button data-action="open-spot-edit" tabindex="-1">${ICONS.more}更多</button>
        <button class="danger" data-action="remove-spot" tabindex="-1">${ICONS.trash}刪除</button>
      </div>
      <div class="spot-main">
        <span class="drag-handle" title="拖曳調整順序">${ICONS.grip}</span>
        <button class="spot-index ${spot.icon ? 'has-icon' : ''}" data-action="toggle-icon-picker" aria-haspopup="menu"
          aria-expanded="${ui.iconPickerSpotId === spot.id}" title="更換圖示" aria-label="第 ${index + 1} 站，更換圖示">${renderSpotIcon(spot.icon, index + 1)}</button>
        <div class="spot-text">
          <button class="spot-info" data-action="focus-spot" title="在地圖上查看">
            <span class="spot-name">${escapeHtml(spot.name)}</span>
          </button>
          <div class="spot-chips">
            ${spot.tentative ? `<button class="time-chip tentative" data-action="edit-spot-time"
              title="景點尚未確認（點一下修改）" aria-label="景點尚未確認，點一下修改">？待確認</button>` : ''}
            ${spot.time ? `<button class="time-chip ${spot.reserved ? 'reserved' : ''}" data-action="edit-spot-time"
              title="${spot.reserved ? '預約時間，需準時抵達' : '預計抵達時間'}（點一下修改）"
              aria-label="${spot.reserved ? '預約' : '預計'} ${spot.time}，點一下修改">${ICONS.clock}${spot.reserved ? '預約 ' : ''}${spot.time}</button>` : ''}
            ${renderNoteChip(spot)}
          </div>
        </div>
        ${renderExpenseBadge(ref, spot.name)}
        <button class="icon-btn spot-more ${menuOpen ? 'on' : ''}" data-action="toggle-spot-menu"
          title="更多操作" aria-label="${escapeHtml(spot.name)} 的更多操作" aria-haspopup="menu" aria-expanded="${menuOpen}">${ICONS.more}</button>
      </div>
      </div>
        ${ui.iconPickerSpotId === spot.id ? `
          <div class="menu icon-picker" role="menu" aria-labelledby="icon-picker-title-${spot.id}">
            <p class="ip-title" id="icon-picker-title-${spot.id}">景點類別</p>
            <div class="ip-grid">
              ${SPOT_ICONS.map(i => `
                <button class="ip-card ${i.value ? '' : 'ip-number'}" role="menuitemradio" aria-checked="${spot.icon === i.value}"
                  data-action="set-spot-icon" data-icon="${i.value}">
                  <span class="ip-art">${renderSpotIcon(i.value, index + 1)}</span><span class="ip-label">${i.label}</span>
                </button>`).join('')}
            </div>
          </div>` : ''}
        ${menuOpen ? `
          <div class="menu spot-menu" role="menu">
            <button role="menuitem" data-action="open-note">${ICONS.note}${hasNote ? '編輯備註' : '新增備註'}</button>
            <button role="menuitem" data-action="edit-spot-time">${ICONS.clock}${spot.time ? '修改時間' : '設定時間'}</button>
            <button role="menuitem" data-action="repeat-spot">${ICONS.copy}這天再去一次（加到最後）</button>
            <button role="menuitem" data-action="copy-spot">${ICONS.copy}複製到其他天…</button>
            <button role="menuitem" data-action="move-up" ${index === 0 ? 'disabled' : ''}>${ICONS.up}往前移</button>
            <button role="menuitem" data-action="move-down" ${index === total - 1 ? 'disabled' : ''}>${ICONS.down}往後移</button>
            <button role="menuitem" class="danger" data-action="remove-spot">${ICONS.trash}刪除景點</button>
          </div>` : ''}
      ${renderExpensePanel(ref, spot.name)}
    </li>`;
}

function renderDayTravel(day) {
  const sec = day.spots.length > 1 ? getDayTravelSec(day) : null;
  return sec === null ? '' : `交通 ${formatDuration(sec)}`;
}

// 兩個景點之間的路線卡片
function renderLegSlot(fromSpot, toSpot) {
  const ref = getLegRef(fromSpot, toSpot);
  return `<li class="leg" data-from="${fromSpot.id}" data-to="${toSpot.id}">
      <div class="leg-node">${renderLegContent(fromSpot, toSpot)}</div>
      ${renderExpensePanel(ref, `${fromSpot.name} → ${toSpot.name}`)}
    </li>`;
}

function renderLegContent(fromSpot, toSpot) {
  const mode = getLegMode(fromSpot, toSpot);
  const key = getPairKey(fromSpot, toSpot);
  const modesOpen = ui.legModesKey === key;
  const detail = getLegDetail(fromSpot, toSpot);
  const custom = !detail?.noTime && detail?.customDuration > 0 ? detail.customDuration * 60 : null;
  const isCustomMode = mode.value === 'CUSTOM';
  const noTime = Boolean(detail?.noTime) || (isCustomMode && !custom);
  const leg = apiKey && !isCustomMode ? legCache.get(getLegKey(fromSpot, toSpot, mode.value)) : null;
  const hasDetails = mode.value === 'TRANSIT' && leg?.status === 'ok' && leg.transitSteps?.length > 0;
  const detailsOpen = hasDetails && ui.legDetailsKey === key;
  const detailsBtn = hasDetails
    ? `<button class="icon-btn leg-details-btn ${detailsOpen ? 'on' : ''}" data-action="toggle-leg-details" aria-expanded="${detailsOpen}"
        title="${detailsOpen ? '收合' : '展開'}轉乘細節" aria-label="${detailsOpen ? '收合' : '展開'}轉乘細節">${detailsOpen ? '▲' : '▼'}</button>`
    : '';
  // 時間：手動覆寫優先且醒目，Google 預估改成劃線灰字
  const apiText = leg?.status === 'ok' ? formatDuration(leg.durationSec) : '';
  const distText = leg?.status === 'ok' ? `<span class="leg-dist">${formatDistance(leg.distanceMeters)}</span>` : '';
  let timeHtml;
  if (custom) {
    // 手動時間時省略距離，讓劃線的 Google 預估放得下
    timeHtml = `<strong class="leg-custom-time" title="手動設定的時間">${formatDuration(custom)}</strong>${apiText ? `<s class="leg-api-time" title="Google Maps 預估">${apiText}</s>` : ''}`;
  } else if (noTime) {
    // 不填時間：只顯示交通方式與距離
    timeHtml = `<span class="leg-notime">${escapeHtml(mode.label)}</span>${distText}`;
  } else if (leg?.status === 'ok') {
    timeHtml = `<strong>${apiText}</strong>${distText}`;
  }
  let info;
  if (timeHtml) {
    const title = escapeHtml(`${mode.label}${noTime ? '，不填時間' : ''}${custom ? `，手動設定 ${formatDuration(custom)}` : ''}${apiText && !noTime ? `，Google 預估 ${apiText}` : ''}${leg?.description ? `，經 ${leg.description}` : ''}`);
    info = hasDetails
      ? `<button class="leg-info as-btn" data-action="toggle-leg-details" aria-expanded="${detailsOpen}" title="${title}">${timeHtml}</button>`
      : `<span class="leg-info" title="${title}">${timeHtml}</span>`;
  } else if (!apiKey) {
    info = `<span class="leg-info muted">設定地圖金鑰後顯示交通時間</span>`;
  } else if (!leg || leg.status === 'loading') {
    info = `<span class="leg-info muted">計算中…</span>`;
  } else {
    info = `<span class="leg-info error" title="${escapeHtml(leg.detail || leg.message)}">${escapeHtml(leg.message)}</span>
      <button class="link-btn" data-action="retry-leg">重試</button>`;
  }
  const modeButtons = TRAVEL_MODES.map(m => `
      <button class="seg-btn ${m.value === mode.value ? 'active' : ''}" data-action="set-leg-mode" data-mode="${m.value}"
        aria-pressed="${m.value === mode.value}" title="${m.label}" aria-label="${m.label}">${ICONS[m.value]}<span>${m.label}</span></button>`).join('');
  const dirUrl = escapeHtml(getGoogleMapsDirUrl(fromSpot, toSpot, mode));
  const pillText = timeHtml || `<span class="leg-dist">${isCustomMode ? '自訂交通' : !apiKey ? '路線' : leg?.status === 'error' ? '查看路線' : '計算中…'}</span>`;
  const editBtn = `<button class="icon-btn leg-edit-btn" data-action="edit-leg" title="編輯交通（車次、票價、時間）"
      aria-label="編輯 ${escapeHtml(fromSpot.name)} 到 ${escapeHtml(toSpot.name)} 的交通">${ICONS.edit}</button>`;
  // 自訂資訊標籤：車次／備註、票價（已加入結算的票價由記帳標籤顯示，不重複）
  const cost = getLegCost(detail);
  const notePill = detail?.transitNote
    ? `<button class="leg-tag" data-action="edit-leg" title="${escapeHtml(detail.transitNote)}">${MODE_TAG_EMOJI[mode.value] || '🎫'} <span>${escapeHtml(detail.transitNote.split('\n')[0])}</span></button>` : '';
  const costPill = cost && !cost.inSettlement
    ? `<button class="leg-tag cost" data-action="edit-leg" title="票價（未列入結算）">${formatCurrency(cost.amount, cost.currency)}</button>` : '';
  // 有自訂資訊時記帳標籤移到第二行，第一行才放得下手動時間與劃線的 Google 預估
  const badge = renderExpenseBadge(getLegRef(fromSpot, toSpot), `${fromSpot.name} → ${toSpot.name}`);
  const pendingPill = detail?.unconfirmed
    ? `<button class="leg-tag pending" data-action="edit-leg" title="交通尚未確認（還沒訂票或還沒決定）">？待確認</button>` : '';
  const tagsRow = Boolean(pendingPill || notePill || costPill || custom);
  const tags = tagsRow ? `<div class="leg-tags">${pendingPill}${notePill}${costPill}<span class="leg-tags-badge">${badge}</span></div>` : '';
  return `
    <div class="leg-mobile">
      <a class="leg-pill" href="${dirUrl}" target="_blank" rel="noopener" aria-label="用 Google 地圖導航：${mode.label}">
        ${ICONS[mode.value]}${pillText}${ICONS.external}
      </a>
      ${detailsBtn}
      ${renderExpenseBadge(getLegRef(fromSpot, toSpot), `${fromSpot.name} → ${toSpot.name}`)}
      ${editBtn}
    </div>
    <div class="leg-row">
      <button class="leg-mode-btn ${modesOpen ? 'on' : ''}" data-action="toggle-leg-modes" aria-expanded="${modesOpen}"
        title="交通方式：${mode.label}（點一下切換）" aria-label="交通方式：${mode.label}，點一下切換">${ICONS[mode.value]}</button>
      ${info}
      ${detailsBtn}
      ${tagsRow ? '' : badge}
      ${editBtn}
      <a class="icon-btn leg-link" href="${dirUrl}" target="_blank" rel="noopener"
        title="在 Google 地圖查看路線" aria-label="在 Google 地圖查看路線">${ICONS.external}</a>
    </div>
    ${tags}
    ${modesOpen ? `<div class="segmented leg-modes" role="group" aria-label="這段的交通方式">${modeButtons}</div>` : ''}
    ${detailsOpen ? renderTransitSteps(leg.transitSteps) : ''}`;
}

// 只更新交通欄位與每天的交通總時間，不動景點卡片
function updateLegViews() {
  dayListEl.querySelectorAll('.leg').forEach(el => {
    const from = findSpot(el.dataset.from)?.spot;
    const to = findSpot(el.dataset.to)?.spot;
    if (from && to) el.querySelector('.leg-node').innerHTML = renderLegContent(from, to);
  });
  dayListEl.querySelectorAll('.day-travel').forEach(el => {
    const day = getDay(el.dataset.dayId);
    if (day) el.textContent = renderDayTravel(day);
  });
  scheduleDayRoute(); // 當日路線是用各路段的路線畫的，路段算好後要重畫
}

/* ---------- 記帳區（景點卡與交通卡共用） ---------- */

// 卡片上的記帳小標籤：沒記帳顯示「+ 記帳」，有記帳顯示「已記 NT$ 150」；點一下開合記帳面板
// title：新增支出時預設帶入的項目名稱
function renderExpenseBadge(ref, title) {
  const expanded = ui.expandedExpenses.has(ref);
  const has = getExpensesFor(ref).some(x => x.amount > 0);
  return `<button class="expense-badge ${has ? 'has' : ''} ${expanded ? 'on' : ''}" data-action="toggle-expenses"
      data-ref="${escapeHtml(ref)}" data-title="${escapeHtml(title)}" aria-expanded="${expanded}">${renderExpenseBadgeText(ref)}</button>`;
}

function renderExpenseBadgeText(ref) {
  const items = getExpensesFor(ref).filter(x => x.amount > 0);
  if (!items.length) return ui.expandedExpenses.has(ref) ? '收合' : '+ 記帳';
  const count = items.length > 1 ? `<span class="expense-meta">${items.length} 筆</span>` : '';
  return `已記 <strong>${formatMoney(sumAmounts(items))}</strong>${count}`;
}

function renderExpensePanel(ref, title) {
  if (!ui.expandedExpenses.has(ref)) return '';
  return `
    <div class="expense-panel" data-ref="${escapeHtml(ref)}" data-title="${escapeHtml(title)}">
      ${getExpensesFor(ref).map(renderExpenseRow).join('')}
      <div class="expense-panel-foot">
        <button class="link-btn" data-action="add-expense">+ 再記一筆</button>
        <button class="link-btn" data-action="toggle-expenses" data-ref="${escapeHtml(ref)}" data-title="${escapeHtml(title)}">完成</button>
      </div>
    </div>`;
}

function renderExpenseRow(x) {
  const payers = state.members.map(m => `
      <label class="pill"><input type="radio" name="payer-${x.id}" value="${m.id}" data-field="paidBy"
        ${m.id === x.paidBy ? 'checked' : ''}><span>${escapeHtml(getMemberName(m))}</span></label>`).join('');
  const splits = [['shared', getSharedLabel()], ['personal', '個人自付']].map(([value, label]) => `
      <label class="pill"><input type="radio" name="split-${x.id}" value="${value}" data-field="split"
        ${x.split === value ? 'checked' : ''}><span>${label}</span></label>`).join('');
  return `
    <div class="expense" data-expense-id="${x.id}">
      <div class="expense-line">
        <input class="field expense-title" type="text" data-field="title" value="${escapeHtml(x.title)}"
          placeholder="支出項目" maxlength="40" aria-label="支出項目">
        <label class="field expense-amount">
          <span>NT$</span>
          <input type="number" data-field="amount" value="${x.amount > 0 ? x.amount : ''}" placeholder="0"
            min="0" step="1" inputmode="numeric" aria-label="金額">
        </label>
        <button class="icon-btn danger" data-action="remove-expense" title="刪除此筆支出" aria-label="刪除此筆支出">${ICONS.trash}</button>
      </div>
      <div class="expense-line expense-options">
        <span class="expense-label">付款</span><div class="pills">${payers}</div>
      </div>
      <div class="expense-line expense-options">
        <span class="expense-label">分攤</span><div class="pills">${splits}</div>
      </div>
    </div>`;
}

function focusPendingExpense() {
  if (!ui.focusExpenseId) return;
  document.querySelector(`.expense[data-expense-id="${ui.focusExpenseId}"] input[data-field="amount"]`)?.focus();
  ui.focusExpenseId = null;
}

/* ---------- 旅伴與結算 ---------- */

function renderMembers() {
  const canRemove = state.members.length > MIN_MEMBERS;
  document.getElementById('members').innerHTML = `
    <span class="members-label">旅伴</span>
    ${state.members.map(m => `
      <span class="member">
        <input class="member-name" data-member-id="${m.id}" value="${escapeHtml(m.name)}" maxlength="10"
          size="${Math.max(2, [...m.name].length + 1)}" aria-label="旅伴名稱">
        ${canRemove ? `<button class="member-remove" data-action="remove-member" data-member-id="${m.id}"
          title="移除 ${escapeHtml(getMemberName(m))}" aria-label="移除 ${escapeHtml(getMemberName(m))}">${ICONS.close}</button>` : ''}
      </span>`).join('')}
    <button class="member-add" data-action="add-member" title="新增旅伴">+ 旅伴</button>`;
  // 手機導覽列的旅伴頭像（最多顯示 3 個）
  const shown = state.members.slice(0, 3);
  const more = state.members.length - shown.length;
  document.getElementById('avatar-btn').innerHTML = shown.map((m, i) =>
    `<span class="avatar" style="--c:${DAY_COLORS[(i + 1) % DAY_COLORS.length]}">${escapeHtml([...getMemberName(m)][0])}</span>`).join('')
    + (more > 0 ? `<span class="avatar more">+${more}</span>` : '');
}

function renderSettleButton() {
  document.getElementById('settle-total').textContent = formatMoney(computeSettlement().total);
}

// 金額、付款人、名稱變動時呼叫：只更新金額相關的顯示，不動輸入框
function refreshMoneyViews() {
  renderSettleButton();
  document.querySelectorAll('.expense-badge[data-ref]').forEach(el => {
    const ref = el.dataset.ref;
    el.innerHTML = renderExpenseBadgeText(ref);
    el.classList.toggle('has', getExpensesFor(ref).some(x => x.amount > 0));
  });
  renderSettlement();
}

function renderSettlement() {
  const drawer = document.getElementById('settle-drawer');
  document.getElementById('settle-backdrop').hidden = !ui.settleOpen;
  drawer.hidden = !ui.settleOpen;
  if (!ui.settleOpen) return;

  const r = computeSettlement();
  let verdict;
  if (!r.count) {
    verdict = `<p class="verdict-empty">還沒有記錄花費。在景點或交通卡片下方按「+ 記錄花費」開始記帳。</p>`;
  } else if (!r.transfers.length) {
    verdict = state.members.length === 1
      ? `<p class="verdict-main">目前只有一位旅伴，不需要轉帳</p><p class="verdict-sub">按上方的「+ 旅伴」加入同行的人，就能分攤公費</p>`
      : `<p class="verdict-main">帳目已經平衡，不需要轉帳</p>`;
  } else {
    verdict = r.transfers.map(t => `
      <p class="verdict-main">
        <strong>${escapeHtml(getMemberName(t.from))}</strong> 需轉帳給 <strong>${escapeHtml(getMemberName(t.to))}</strong>
        <span class="verdict-amount">${formatMoney(t.amount)}</span>
      </p>`).join('') + `<p class="verdict-sub">完成${r.transfers.length > 1 ? '以上轉帳' : '這筆轉帳'}即可結清</p>`;
  }

  const spotPct = r.total ? Math.round(r.spotTotal / r.total * 100) : 0;
  const legPct = r.total ? 100 - spotPct : 0;
  const rows = r.rows.map(row => {
    const sign = row.net > 0.5 ? 'plus' : row.net < -0.5 ? 'minus' : '';
    const netText = sign === 'plus' ? `應收 ${formatMoney(row.net)}` : sign === 'minus' ? `應付 ${formatMoney(-row.net)}` : '已結清';
    return `
      <tr>
        <th scope="row">${escapeHtml(getMemberName(row.member))}</th>
        <td>${formatMoney(row.paid)}</td>
        <td>${formatMoney(row.share)}</td>
        <td class="net ${sign}">${netText}</td>
        <td class="muted">${formatMoney(row.personal)}</td>
      </tr>`;
  }).join('');

  document.getElementById('settle-body').innerHTML = `
    <section class="verdict">
      <div class="settle-eyebrow">結算建議</div>
      ${verdict}
    </section>

    <section class="settle-section">
      <h3>總支出總覽</h3>
      <div class="settle-total">${formatMoney(r.total)}</div>
      <div class="settle-split">
        <span>${getSharedLabel()}公費 <strong>${formatMoney(r.sharedTotal)}</strong></span>
        <span>個人自付 <strong>${formatMoney(r.personalTotal)}</strong></span>
      </div>
      <div class="ratio-bar" role="img" aria-label="景點 ${spotPct}%、交通 ${legPct}%">
        <span class="ratio-spot" style="width:${spotPct}%"></span><span class="ratio-leg" style="width:${legPct}%"></span>
      </div>
      <div class="ratio-legend">
        <span><i class="dot dot-spot"></i>景點 ${formatMoney(r.spotTotal)}・${spotPct}%</span>
        <span><i class="dot dot-leg"></i>交通 ${formatMoney(r.legTotal)}・${legPct}%</span>
      </div>
    </section>

    <section class="settle-section">
      <h3>對帳明細</h3>
      <div class="table-wrap">
        <table class="settle-table">
          <thead><tr><th scope="col">旅伴</th><th scope="col">代墊公費</th><th scope="col">應負擔</th><th scope="col">淨額</th><th scope="col">個人自付</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="settle-note">公費由 ${state.members.length} 人平均分攤，每人 ${formatMoney(r.rows[0]?.share || 0)}。個人自付只計入總支出，不列入清帳。</p>
    </section>`;
}

function flashPendingSpot() {
  if (!ui.flashSpotId) return;
  flashSpotCard(ui.flashSpotId);
  ui.flashSpotId = null;
}

function flashSpotCard(spotId) {
  const el = document.querySelector(`.spot[data-spot-id="${spotId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  el.classList.remove('flash');
  void el.offsetWidth; // 重新觸發動畫
  el.classList.add('flash');
}


/* ==========================================================================
 * 7. 側邊欄事件
 * ========================================================================== */

const dayListEl = document.getElementById('day-list');

// 側邊欄與頂部導覽列（旅伴、結算按鈕）共用同一套 data-action 點擊處理
function onActionClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  // 備註標籤在卡片裡：只開備註視窗，不要再觸發卡片或文件層級的其他點擊處理（地圖聚焦、收合選單等）
  if (['open-note', 'edit-leg', 'edit-spot-time'].includes(btn.dataset.action)) e.stopPropagation();
  const spotId = btn.closest('.spot')?.dataset.spotId;
  const fromSpotMenu = Boolean(btn.closest('.spot-menu'));
  if (fromSpotMenu) ui.spotMenuId = null; // 選了選單項目就收起選單
  handleAction(btn, spotId);
  // 操作被取消（例如確認視窗按了取消）時畫面沒有重繪，選單仍在，這裡補一次重繪收起選單
  if (fromSpotMenu && document.querySelector('.spot-menu')) render();
}

function handleAction(btn, spotId) {
  switch (btn.dataset.action) {
    case 'select-day':
      setActiveDay(btn.dataset.dayId);
      fitMapToSpots(getVisibleDays().flatMap(d => d.spots));
      if (sheet.snap === 'peek') setSheetSnap('half');
      break;
    case 'open-spot-edit':
      ui.swipeSpotId = null;
      ui.spotMenuId = spotId;
      render();
      break;
    case 'toggle-mobile-panel': toggleMobilePanel(); break;
    case 'toggle-todos': setTodosOpen(document.getElementById('todo-panel').hidden); break;
    case 'open-export': closeNavMenu(); toggleMobilePanel(false); setExportOpen(true); break;
    case 'import-json': closeNavMenu(); importInput.click(); break;
    case 'toggle-icon-picker':
      ui.spotMenuId = null;
      ui.iconPickerSpotId = ui.iconPickerSpotId === spotId ? null : spotId;
      render();
      document.querySelector('.icon-picker [aria-checked="true"]')?.focus();
      break;
    case 'set-spot-icon': setSpotIcon(spotId, btn.dataset.icon); break;
    case 'toggle-leg-details': {
      const leg = btn.closest('.leg');
      const key = `${leg.dataset.from}->${leg.dataset.to}`;
      ui.legDetailsKey = ui.legDetailsKey === key ? null : key;
      updateLegViews();
      break;
    }
    case 'add-day': addDay(); break;
    case 'remove-day': removeDay(btn.dataset.dayId); break;
    case 'move-up': moveSpotBy(spotId, -1); break;
    case 'move-down': moveSpotBy(spotId, 1); break;
    case 'open-note': {
      const dayEl = btn.closest('.day-note') && btn.closest('.day');
      if (dayEl) openDayNoteModal(dayEl.dataset.dayId);
      else openNoteModal(spotId);
      break;
    }
    case 'copy-spot': openCopyModal(spotId); break;
    case 'repeat-spot': repeatSpotInDay(spotId); break;
    case 'edit-spot-time': openNoteModal(spotId, 'time'); break;
    case 'edit-leg': {
      const leg = btn.closest('.leg');
      openLegModal(leg.dataset.from, leg.dataset.to);
      break;
    }
    case 'remove-spot': removeSpot(spotId); break;
    case 'focus-spot':
      focusSpotOnMap(spotId);
      if (sheet.snap === 'full') setSheetSnap('half'); // 讓地圖露出來
      break;
    case 'set-leg-mode': {
      const leg = btn.closest('.leg');
      ui.legModesKey = null;
      setLegMode(leg.dataset.from, leg.dataset.to, btn.dataset.mode);
      break;
    }
    case 'toggle-expenses': toggleExpenses(btn.dataset.ref, btn.dataset.title); break;
    case 'add-expense': {
      const panel = btn.closest('.expense-panel');
      addExpense(panel.dataset.ref, panel.dataset.title);
      break;
    }
    case 'toggle-spot-menu':
      ui.spotMenuId = ui.spotMenuId === spotId ? null : spotId;
      render();
      document.querySelector('.spot-menu [role="menuitem"]:not(:disabled)')?.focus();
      break;
    case 'toggle-leg-modes': {
      const leg = btn.closest('.leg');
      const key = `${leg.dataset.from}->${leg.dataset.to}`;
      ui.legModesKey = ui.legModesKey === key ? null : key;
      updateLegViews();
      break;
    }
    case 'tabs-prev': scrollTabs(-1); break;
    case 'tabs-next': scrollTabs(1); break;
    case 'open-key-settings': closeNavMenu(); showSetup('', { cancelable: Boolean(map) }); break;
    case 'toggle-nav-menu': toggleNavMenu(); break;
    case 'remove-expense': removeExpense(btn.closest('.expense').dataset.expenseId); break;
    case 'add-member': addMember(); break;
    case 'remove-member': removeMember(btn.dataset.memberId); break;
    case 'open-settle': setSettleOpen(true); break;
    case 'start-sharing': startSharing(); break;
    case 'copy-link': copyShareLink(btn); break;
    case 'leave-trip': leaveSharedTrip(); break;
    case 'retry-leg': {
      const leg = btn.closest('.leg');
      retryLeg(leg.dataset.from, leg.dataset.to);
      break;
    }
  }
}

document.querySelector('.sidebar').addEventListener('click', onActionClick);
document.querySelector('.topbar').addEventListener('click', onActionClick);
document.getElementById('tabs').addEventListener('scroll', updateTabsFade, { passive: true });
window.addEventListener('resize', updateTabsFade);

// 點選單以外的地方或按 Esc：收起景點操作選單、導覽列設定選單
document.addEventListener('click', e => {
  if (ui.spotMenuId && !e.target.closest('.spot-menu, [data-action="toggle-spot-menu"], [data-action="open-spot-edit"]')) {
    ui.spotMenuId = null;
    render();
  }
  if (ui.iconPickerSpotId && !e.target.closest('.icon-picker, [data-action="toggle-icon-picker"]')) {
    ui.iconPickerSpotId = null;
    render();
  }
  if (!e.target.closest('#nav-menu, [data-action="toggle-nav-menu"]')) closeNavMenu();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (ui.iconPickerSpotId) {
    const id = ui.iconPickerSpotId;
    ui.iconPickerSpotId = null;
    render();
    document.querySelector(`.spot[data-spot-id="${id}"] .spot-index`)?.focus();
  }
  if (ui.spotMenuId) {
    const id = ui.spotMenuId;
    ui.spotMenuId = null;
    render();
    document.querySelector(`.spot[data-spot-id="${id}"] .spot-more`)?.focus();
  }
  closeNavMenu();
  if (addCard.el && !addCard.el.hidden) closeAddCard();
});

// ---------- 導覽列設定選單（地圖金鑰等） ----------
function toggleNavMenu() {
  const menu = document.getElementById('nav-menu');
  const open = menu.hidden;
  menu.hidden = !open;
  document.getElementById('nav-menu-btn').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('[role="menuitem"]')?.focus();
}

function closeNavMenu() {
  const menu = document.getElementById('nav-menu');
  if (menu.hidden || isMobile()) return; // 手機上設定選單直接攤開在旅伴面板裡
  menu.hidden = true;
  document.getElementById('nav-menu-btn').setAttribute('aria-expanded', 'false');
}

dayListEl.addEventListener('input', e => {
  if (e.target.matches('.expense [data-field]')) {
    updateExpense(e.target.closest('.expense').dataset.expenseId, e.target.dataset.field, e.target.value);
  }
});

// ---------- 旅程名稱與出發日期 ----------
const tripNameInput = document.getElementById('trip-name');
tripNameInput.addEventListener('input', () => {
  state.tripName = tripNameInput.value;
  document.title = state.tripName.trim() || DEFAULT_TRIP_NAME;
  saveState();
});
tripNameInput.addEventListener('change', () => {
  state.tripName = tripNameInput.value.trim();
  commit();
});
tripNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') tripNameInput.blur();
});
document.getElementById('trip-end').addEventListener('change', e => {
  setTripEnd(e.target.value);
  // 不論套用或取消，欄位都顯示實際的回程日（重繪時不會覆蓋正在編輯的欄位）
  e.target.value = state.startDate ? toISODate(getDayDate(state.days.length - 1)) : '';
});
document.getElementById('trip-start').addEventListener('change', e => {
  state.startDate = e.target.value;
  commit();
});

// ---------- 旅伴名稱 ----------
const membersEl = document.getElementById('members');
membersEl.addEventListener('input', e => {
  if (!e.target.matches('.member-name')) return;
  e.target.size = Math.max(2, [...e.target.value].length + 1);
  renameMember(e.target.dataset.memberId, e.target.value);
});
// 名稱改完（失焦或按 Enter）才重繪，更新卡片上的付款人選項
membersEl.addEventListener('change', e => {
  if (e.target.matches('.member-name')) commit();
});
membersEl.addEventListener('keydown', e => {
  if (e.target.matches('.member-name') && e.key === 'Enter') e.target.blur();
});

// ---------- 結算面板 ----------
document.getElementById('settle-close').addEventListener('click', () => setSettleOpen(false));
document.getElementById('settle-backdrop').addEventListener('click', () => setSettleOpen(false));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.settleOpen) setSettleOpen(false);
});

// ---------- 拖曳排序（同一天內） ----------
// 只有按住把手時卡片才可拖曳，避免影響備註欄的文字選取
const drag = { spotId: null, dayId: null, toIndex: null };

dayListEl.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.drag-handle');
  if (handle && !isMobile()) handle.closest('.spot').draggable = true; // 手機用自己的觸控拖曳
});

dayListEl.addEventListener('dragstart', e => {
  const card = e.target.closest('.spot');
  if (!card) return;
  drag.spotId = card.dataset.spotId;
  drag.dayId = card.closest('.spot-list').dataset.dayId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', drag.spotId);
  requestAnimationFrame(() => card.classList.add('dragging'));
});

dayListEl.addEventListener('dragover', e => {
  const list = e.target.closest('.spot-list');
  if (!drag.spotId || !list || list.dataset.dayId !== drag.dayId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  showDropIndicator(list, getDropIndex(list, e.clientY));
});

dayListEl.addEventListener('drop', e => {
  if (!drag.spotId || drag.toIndex === null) return;
  e.preventDefault();
  const { spotId, toIndex } = drag;
  endDrag(); // 重繪後原本的卡片會被移除，收不到 dragend，所以先清掉拖曳狀態
  moveSpot(spotId, toIndex);
});

dayListEl.addEventListener('dragend', endDrag);

// 依滑鼠位置算出放下後的位置（以拿掉被拖曳卡片後的陣列計算，與 moveSpot 一致）
function getDropIndex(list, clientY) {
  const cards = [...list.querySelectorAll('.spot:not(.dragging)')];
  const index = cards.findIndex(card => {
    const rect = card.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  return index === -1 ? cards.length : index;
}

function showDropIndicator(list, toIndex) {
  drag.toIndex = toIndex;
  list.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  const cards = [...list.querySelectorAll('.spot:not(.dragging)')];
  if (!cards.length) return;
  if (toIndex < cards.length) cards[toIndex].classList.add('drop-before');
  else cards[cards.length - 1].classList.add('drop-after');
}

function endDrag() {
  dayListEl.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after'));
  dayListEl.querySelectorAll('.spot[draggable="true"]').forEach(el => { el.draggable = false; });
  drag.spotId = drag.dayId = drag.toIndex = null;
}


/* ==========================================================================
 * 8. 地圖（Google Maps）
 * ========================================================================== */

let map, HtmlMarker, Place, AutocompleteSuggestion, AutocompleteSessionToken;
const apiKey = getApiKey();
const markers = new Map(); // spotId -> HtmlMarker

// 這台瀏覽器填過的金鑰優先，方便自行更換；沒填過才用程式碼裡的 GOOGLE_MAPS_API_KEY
function getStoredApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function getApiKey() {
  return getStoredApiKey() || GOOGLE_MAPS_API_KEY;
}

// cancelable：地圖已正常載入、只是想查看或更換金鑰時，可以取消回到地圖
function showSetup(error, { cancelable = false } = {}) {
  document.getElementById('setup').hidden = false;
  const el = document.getElementById('setup-error');
  el.hidden = !error;
  el.textContent = error || '';
  const input = document.getElementById('setup-key');
  input.value = getApiKey();
  document.getElementById('setup-clear').hidden = !getStoredApiKey();
  document.getElementById('setup-cancel').hidden = !cancelable;
  document.getElementById('imgur-key').value = getImgurClientId();
  document.getElementById('imgur-clear').hidden = !getImgurClientId();
  document.getElementById('imgur-status').hidden = true;
  input.focus();
  input.select();
}

function hideSetup() {
  document.getElementById('setup').hidden = true;
}

document.getElementById('setup-cancel').addEventListener('click', hideSetup);

document.getElementById('setup').addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('setup-cancel').hidden) hideSetup();
});

document.getElementById('setup-clear').addEventListener('click', () => {
  if (!confirm('清除這台瀏覽器儲存的 Google Maps 金鑰？清除後需要重新填寫。')) return;
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {}
  location.reload();
});

document.getElementById('setup-form').addEventListener('submit', e => {
  e.preventDefault();
  const key = document.getElementById('setup-key').value.trim();
  if (!key) return;
  if (key === getApiKey() && map) {
    hideSetup(); // 沒有改金鑰
    return;
  }
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    alert('這個瀏覽器無法儲存金鑰（可能是無痕模式），請把金鑰填進 app.js 的 GOOGLE_MAPS_API_KEY。');
    return;
  }
  location.reload(); // Google Maps 載入後無法更換金鑰，需重新載入頁面
});

// Imgur Client ID：存在這台瀏覽器，不用重新載入
document.getElementById('imgur-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('imgur-key').value.trim();
  const status = document.getElementById('imgur-status');
  if (!id) return;
  try {
    localStorage.setItem(IMGUR_KEY_STORAGE, id);
  } catch {
    status.textContent = '這個瀏覽器無法儲存（可能是無痕模式）';
    status.hidden = false;
    return;
  }
  status.textContent = '已儲存，詳細紀錄可以插入圖片了';
  status.hidden = false;
  document.getElementById('imgur-clear').hidden = false;
});

document.getElementById('imgur-clear').addEventListener('click', () => {
  if (!confirm('清除這台瀏覽器的 Imgur Client ID？已插入的圖片不受影響。')) return;
  try { localStorage.removeItem(IMGUR_KEY_STORAGE); } catch {}
  document.getElementById('imgur-key').value = '';
  document.getElementById('imgur-clear').hidden = true;
  const status = document.getElementById('imgur-status');
  status.textContent = '已清除';
  status.hidden = false;
});

// 金鑰無效或網站未授權時，Google 會呼叫這個函式；保留金鑰讓使用者直接修正
window.gm_authFailure = () => {
  showSetup('這把金鑰無法使用：請確認金鑰沒有打錯、已啟用 Maps JavaScript API，且「網站限制」允許此網址。');
};

function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    window.__initGoogleMaps = resolve;
    const script = document.createElement('script');
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', language: 'zh-TW', callback: '__initGoogleMaps' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error('Google Maps 無法載入，請檢查網路連線。'));
    document.head.append(script);
  });
}

async function initMap() {
  const { Map: GoogleMap, OverlayView } = await google.maps.importLibrary('maps');
  HtmlMarker = createHtmlMarkerClass(OverlayView);
  try {
    ({ Place, AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places'));
  } catch {
    Place = null; // 沒有 Places API 也能正常打點，只是不能搜尋、不會自動帶入名稱
  }

  map = new GoogleMap(document.getElementById('map'), {
    center: DEFAULT_CENTER,
    zoom: 13,
    styles: isNeoMapStyle() ? NEO_MAP_STYLE : null,
    clickableIcons: true,
    disableDefaultUI: true, // 縮放與全螢幕改用自訂的控制項（右下角）
    gestureHandling: 'greedy'
  });

  // 點擊地圖 → 在點擊處彈出新增表單
  map.addListener('click', e => {
    if (!e.latLng) return;
    if (e.placeId) e.stop(); // 點到店家/景點時，改用我們的表單取代 Google 預設資訊框
    openAddSpotForm(e.latLng, e.placeId);
  });

  setupPlaceSearch();
  renderStyleButton();
  await initDayRoute();
  document.getElementById('map-controls').hidden = false;
  render();
  fitMapToSpots(getVisibleDays().flatMap(d => d.spots));
}

// ---------- 地圖配色切換 ----------
function isNeoMapStyle() {
  try {
    return localStorage.getItem(MAP_STYLE_STORAGE) !== 'plain';
  } catch {
    return true;
  }
}

function setNeoMapStyle(on) {
  try {
    localStorage.setItem(MAP_STYLE_STORAGE, on ? 'neo' : 'plain');
  } catch {}
  map?.setOptions({ styles: on ? NEO_MAP_STYLE : null });
  renderStyleButton();
}

function renderStyleButton() {
  const btn = document.getElementById('style-btn');
  const on = isNeoMapStyle();
  btn.hidden = !map;
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? '目前是復古配色，點一下改回 Google 原本的地圖樣式' : '目前是 Google 原本的地圖，點一下改用復古配色';
  btn.innerHTML = `<span class="swatch" aria-hidden="true"><i style="background:#FAF6EE"></i><i style="background:#BAE6FD"></i><i style="background:#D1FAE5"></i></span>`
    + `<span>${on ? '復古配色' : '原始地圖'}</span>`;
}

document.getElementById('style-btn').addEventListener('click', () => setNeoMapStyle(!isNeoMapStyle()));

// 用 OverlayView 畫的 HTML 圖釘，介面與 AdvancedMarkerElement 相近（content、title、zIndex、gmp-click），
// 但不需要 mapId，因此可以和 styles 自訂配色一起使用
function createHtmlMarkerClass(OverlayView) {
  return class HtmlMarker extends OverlayView {
    constructor({ map: targetMap, position }) {
      super();
      this.position = position;
      this.listeners = [];
      this.el = document.createElement('div');
      this.el.className = 'html-marker';
      this.el.addEventListener('click', e => {
        e.stopPropagation();
        this.listeners.forEach(fn => fn());
      });
      OverlayView.preventMapHitsAndGesturesFrom(this.el); // 點圖釘不會觸發地圖的新增表單
      this.setMap(targetMap);
    }
    addListener(name, fn) {
      if (name === 'gmp-click') this.listeners.push(fn);
    }
    onAdd() {
      this.getPanes().overlayMouseTarget.append(this.el);
    }
    draw() {
      const latLng = google.maps.LatLng ? new google.maps.LatLng(this.position) : this.position;
      const point = this.getProjection().fromLatLngToDivPixel(latLng);
      if (!point) return;
      this.el.style.left = `${point.x}px`;
      this.el.style.top = `${point.y}px`;
    }
    onRemove() {
      this.el.remove();
    }
    set content(node) { this.el.replaceChildren(node); }
    set title(text) { this.el.title = text; }
    getEl() { return this.el; }
    set zIndex(z) { this.el.style.zIndex = z; }
  };
}

// 新增表單預設選取：目前分頁的那天 → 上次選的那天 → Day 1
function getDefaultDayId() {
  if (state.activeDayId !== OVERVIEW && getDay(state.activeDayId)) return state.activeDayId;
  if (ui.lastPickedDayId && getDay(ui.lastPickedDayId)) return ui.lastPickedDayId;
  return state.days[0].id;
}

// name：已知地點名稱時（例如從搜尋選取）直接帶入
function openAddSpotForm(latLng, placeId, name) {
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  addCard.draft = { lat, lng, placeId: placeId || null };
  const { el } = addCard;
  const input = el.elements.name;
  input.value = name || '';
  input.classList.remove('invalid');
  document.getElementById('add-card-where').textContent = name ? '從搜尋結果加入' : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // 天數選單：顯示日期與景點數，左側色點跟著選到的那天
  const select = el.elements.day;
  const defaultDayId = getDefaultDayId();
  select.innerHTML = state.days.map((d, i) => `<option value="${d.id}" ${d.id === defaultDayId ? 'selected' : ''}>
      ${getDayLabel(i)}${getDayDateText(i) ? `・${getDayDateText(i)}` : ''}（${d.spots.length} 個景點）</option>`).join('');
  updateAddCardSwatch();

  // 地圖上用虛線圓圈標出要加入的位置
  if (!addCard.marker) {
    const pin = document.createElement('div');
    pin.className = 'draft-pin';
    addCard.marker = new HtmlMarker({ map, position: { lat, lng } });
    addCard.marker.content = pin;
    addCard.marker.zIndex = 50;
  } else {
    addCard.marker.position = { lat, lng };
    addCard.marker.setMap(map);
  }
  addCard.marker.draw?.();

  el.hidden = false;
  document.body.classList.add('adding'); // 手機上行程抽屜先滑下去，讓底部的新增卡片單手好操作
  setSheetSnap('peek');
  input.focus();
  keepDraftVisible();

  // 點到 Google 地圖上的地點時，自動帶入地點名稱
  if (placeId && Place && !name) {
    const draft = addCard.draft;
    new Place({ id: placeId, requestedLanguage: 'zh-TW' })
      .fetchFields({ fields: ['displayName'] })
      .then(({ place }) => {
        if (addCard.draft === draft && !input.value && place.displayName) input.value = place.displayName;
      })
      .catch(() => {});
  }
}

// 新增卡片固定在地圖下方；點的位置被卡片擋住時，把地圖往上推
function keepDraftVisible() {
  requestAnimationFrame(() => {
    const pin = addCard.marker?.el?.firstElementChild?.getBoundingClientRect();
    const card = addCard.el.getBoundingClientRect();
    if (!pin || !card.height) return;
    const overlap = pin.bottom + 24 - card.top;
    if (overlap > 0 && pin.left < card.right && pin.right > card.left) map.panBy(0, overlap);
  });
}

function updateAddCardSwatch() {
  const index = getDayIndex(addCard.el.elements.day.value);
  addCard.el.querySelector('.day-swatch').style.background = getDayColor(Math.max(0, index));
}

function closeAddCard() {
  addCard.el.hidden = true;
  document.body.classList.remove('adding');
  addCard.draft = null;
  addCard.marker?.setMap(null);
}

const addCard = { el: document.getElementById('add-card'), draft: null, marker: null };

addCard.el.addEventListener('submit', e => {
  e.preventDefault();
  const input = addCard.el.elements.name;
  const name = input.value.trim();
  if (!name || !addCard.draft) {
    input.classList.add('invalid');
    input.focus();
    return;
  }
  const { lat, lng, placeId } = addCard.draft;
  closeAddCard();
  addSpot(addCard.el.elements.day.value, { name, lat, lng, placeId });
});
addCard.el.elements.name.addEventListener('input', e => e.target.classList.remove('invalid'));
addCard.el.elements.day.addEventListener('change', updateAddCardSwatch);
document.getElementById('add-card-close').addEventListener('click', closeAddCard);

// ---------- 地圖控制項（縮放、全螢幕） ----------
document.getElementById('map-controls').addEventListener('click', e => {
  const btn = e.target.closest('[data-map]');
  if (!btn || !map) return;
  if (btn.dataset.map === 'zoom-in') map.setZoom(map.getZoom() + 1);
  if (btn.dataset.map === 'zoom-out') map.setZoom(map.getZoom() - 1);
  if (btn.dataset.map === 'fullscreen') {
    const wrap = document.querySelector('.map-wrap');
    const request = document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.();
    Promise.resolve(request).catch(() => {}); // 有些內嵌環境不允許全螢幕
  }
});
document.addEventListener('fullscreenchange', () => {
  document.querySelector('[data-map="fullscreen"]').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
});

/* ---------- 搜尋地點（Places API (New) Autocomplete） ----------
 * 輸入時列出建議地點；選取後地圖移到該處，並打開已填好名稱的新增表單。
 * 同一次搜尋（打字到選取）共用一個 session token，Google 會合併計費。
 */
const searchInput = document.getElementById('place-search');
const searchResults = document.getElementById('search-results');
const search = { token: null, timer: null, seq: 0, items: [], active: -1 };
const RECENT_SEARCH_STORAGE = 'trip-planner-recent-places';
const POPULAR_QUERIES = ['台北 101', '故宮', '西門町', '士林夜市', '九份', '陽明山'];

function loadRecentPlaces() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_SEARCH_STORAGE));
    return Array.isArray(list) ? list.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberPlace(place) {
  const list = [place, ...loadRecentPlaces().filter(p => p.id !== place.id)].slice(0, 5);
  try {
    localStorage.setItem(RECENT_SEARCH_STORAGE, JSON.stringify(list));
  } catch {}
}

// 搜尋框是空的時：顯示最近搜尋與熱門景點
function renderSearchHome() {
  const recent = loadRecentPlaces();
  search.items = [];
  search.active = -1;
  searchResults.innerHTML = `
    ${recent.length ? `<li class="search-section" role="presentation">最近搜尋</li>
      ${recent.map((p, i) => `
        <li class="search-item" data-recent="${i}" role="option" aria-selected="false">
          <span class="search-main">${escapeHtml(p.name)}</span>
          <span class="search-secondary">${escapeHtml(p.area || '')}</span>
        </li>`).join('')}` : ''}
    <li class="search-section" role="presentation">熱門景點</li>
    <li class="search-chips" role="presentation">
      ${POPULAR_QUERIES.map(q => `<button type="button" class="chip" data-query="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}
    </li>`;
  showSearchResults();
}

function setupPlaceSearch() {
  if (!AutocompleteSuggestion) {
    searchInput.placeholder = '搜尋需啟用 Places API (New)，仍可直接點擊地圖';
    return;
  }
  searchInput.disabled = false;
  searchInput.addEventListener('input', () => {
    clearTimeout(search.timer);
    search.timer = setTimeout(runPlaceSearch, 250);
  });
  searchInput.addEventListener('keydown', onSearchKeydown);
  searchInput.addEventListener('focus', () => {
    openMobileSearch();
    if (!searchInput.value.trim()) renderSearchHome();
    else if (search.items.length) showSearchResults();
  });
  searchInput.addEventListener('blur', () => {
    if (!isMobile()) hideSearchResults(); // 手機全螢幕搜尋：按「取消」或選了地點才關閉
  });
  // 點選建議時不要讓輸入框先失焦（失焦會關閉清單）
  searchResults.addEventListener('pointerdown', e => e.preventDefault());
  searchResults.addEventListener('click', e => {
    const item = e.target.closest('[data-index]');
    if (item) selectSuggestion(Number(item.dataset.index));
    const recent = e.target.closest('[data-recent]');
    if (recent) selectRecentPlace(loadRecentPlaces()[Number(recent.dataset.recent)]);
    const chip = e.target.closest('[data-query]');
    if (chip) {
      searchInput.value = chip.dataset.query;
      runPlaceSearch();
    }
  });
}

async function runPlaceSearch() {
  const text = searchInput.value.trim();
  const seq = ++search.seq; // 只採用最後一次輸入的結果
  if (!text) {
    renderSearchHome();
    return;
  }
  search.token = search.token || new AutocompleteSessionToken();
  try {
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text,
      sessionToken: search.token,
      locationBias: map.getBounds() || map.getCenter(), // 優先顯示目前地圖範圍附近的地點
      language: 'zh-TW'
    });
    if (seq !== search.seq) return;
    search.items = suggestions.map(s => s.placePrediction).filter(Boolean);
    search.active = search.items.length ? 0 : -1;
    renderSearchResults(search.items.length ? '' : '找不到符合的地點');
  } catch (err) {
    if (seq !== search.seq) return;
    console.warn('Places autocomplete:', err);
    search.items = [];
    renderSearchResults(`搜尋失敗：${explainGoogleApiError('Places API (New)', String(err?.message || err))}`);
  }
}

function renderSearchResults(message) {
  searchResults.innerHTML = message
    ? `<li class="search-empty">${escapeHtml(message)}</li>`
    : search.items.map((p, i) => `
        <li class="search-item ${i === search.active ? 'active' : ''}" id="search-item-${i}" data-index="${i}"
          role="option" aria-selected="${i === search.active}">
          <span class="search-main">${escapeHtml(p.mainText?.text || p.text.text)}</span>
          <span class="search-secondary">${escapeHtml(p.secondaryText?.text || '')}</span>
        </li>`).join('');
  searchInput.setAttribute('aria-activedescendant', search.active >= 0 ? `search-item-${search.active}` : '');
  showSearchResults();
}

function showSearchResults() {
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

function hideSearchResults() {
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
}

function onSearchKeydown(e) {
  const count = search.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!count) return;
    e.preventDefault();
    search.active = (search.active + (e.key === 'ArrowDown' ? 1 : -1) + count) % count;
    renderSearchResults('');
    document.getElementById(`search-item-${search.active}`)?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (search.active >= 0 && !searchResults.hidden) selectSuggestion(search.active);
  } else if (e.key === 'Escape') {
    hideSearchResults();
  }
}

async function selectSuggestion(index) {
  const prediction = search.items[index];
  if (!prediction) return;
  closeMobileSearch();
  hideSearchResults();
  searchInput.value = prediction.mainText?.text || prediction.text.text;
  searchInput.blur();
  const place = prediction.toPlace();
  search.token = null; // 取得地點資訊後這次搜尋就結束，下次輸入用新的 token
  try {
    await place.fetchFields({ fields: ['displayName', 'location', 'viewport'] });
  } catch (err) {
    console.warn('Places fetchFields:', err);
    renderSearchResults(`無法取得地點資訊：${explainGoogleApiError('Places API (New)', String(err?.message || err))}`);
    return;
  }
  if (!place.location) return;
  if (place.viewport) {
    map.fitBounds(place.viewport);
  } else {
    map.panTo(place.location);
    map.setZoom(16);
  }
  const name = place.displayName || searchInput.value;
  rememberPlace({
    id: place.id,
    name,
    area: prediction.secondaryText?.text || '',
    lat: place.location.lat(),
    lng: place.location.lng()
  });
  openAddSpotForm(place.location, place.id, name);
}

// 最近搜尋過的地點已存有座標，不用再呼叫 Places API
function selectRecentPlace(place) {
  if (!place) return;
  closeMobileSearch();
  hideSearchResults();
  searchInput.value = place.name;
  searchInput.blur();
  map.panTo({ lat: place.lat, lng: place.lng });
  if (map.getZoom() < 15) map.setZoom(16);
  rememberPlace(place);
  openAddSpotForm({ lat: place.lat, lng: place.lng }, place.id, place.name);
}

// 有自訂圖示時圖釘顯示圖示，否則顯示「天數-順序」
function createPinElement(dayIndex, spotIndex, dimmed, icon, tentative) {
  const wrap = document.createElement('div');
  wrap.className = `pin-wrap${dimmed ? ' dimmed' : ''}`;
  wrap.innerHTML = `<div class="pin ${icon && SPOT_ICON_ART[icon] ? 'has-art' : ''}${tentative ? ' tentative' : ''}" style="--c:${getDayColor(dayIndex)}"><span class="${icon ? 'pin-art' : ''}">${renderSpotIcon(icon, `${dayIndex + 1}-${spotIndex + 1}`)}</span>${tentative ? '<b class="pin-q" aria-hidden="true">?</b>' : ''}</div>`;
  return wrap;
}

function getMarkerTitle({ dayIndex, spot }) {
  const time = spot.time ? `${spot.reserved ? '預約 ' : ''}${spot.time} ` : '';
  return `${getDayLabel(dayIndex)}・${time}${spot.name}${spot.tentative ? '（待確認）' : ''}${spot.note.trim() ? `\n${spot.note.trim()}` : ''}`; // 圖釘提示只放時間與簡短備註
}

function updateMarkerTitle(found) {
  const marker = markers.get(found.spot.id);
  if (marker) marker.title = getMarkerTitle(found);
}

// 讓地圖圖釘與 state 完全一致：刪除多餘的、補上缺少的、更新編號/顏色
function syncMarkers() {
  const liveIds = new Set();
  state.days.forEach((day, dayIndex) => {
    const dimmed = state.activeDayId !== OVERVIEW && state.activeDayId !== day.id;
    day.spots.forEach((spot, index) => {
      liveIds.add(spot.id);
      let marker = markers.get(spot.id);
      if (!marker) {
        marker = new HtmlMarker({ map, position: { lat: spot.lat, lng: spot.lng } });
        marker.addListener('gmp-click', () => onMarkerClick(spot.id));
        markers.set(spot.id, marker);
      }
      marker.content = createPinElement(dayIndex, index, dimmed, spot.icon, spot.tentative);
      marker.title = getMarkerTitle({ dayIndex, spot });
      marker.zIndex = dimmed ? 1 : 10;
    });
  });
  for (const [id, marker] of markers) {
    if (!liveIds.has(id)) {
      marker.setMap(null);
      markers.delete(id);
    }
  }
}

function onMarkerClick(spotId) {
  const found = findSpot(spotId);
  if (!found) return;
  if (state.activeDayId !== OVERVIEW && state.activeDayId !== found.day.id) {
    state.activeDayId = found.day.id;
    commit();
  }
  flashSpotCard(spotId);
}

function focusSpotOnMap(spotId) {
  const found = findSpot(spotId);
  if (!found || !map) return;
  map.panTo({ lat: found.spot.lat, lng: found.spot.lng });
  if (map.getZoom() < 15) map.setZoom(15);
}

function fitMapToSpots(spots) {
  if (!map || !spots.length) return;
  if (spots.length === 1) {
    map.panTo({ lat: spots[0].lat, lng: spots[0].lng });
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  spots.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
  map.fitBounds(bounds, 60);
}


/* ==========================================================================
 * 8b. 當日路線（Routes API 各路段路線）
 *
 * 選了某一天時，把當天相鄰景點之間的路線依序畫在地圖上（「全部」分頁不畫）。
 * 路線來自算交通時間時呼叫的 Routes API（computeRoutes 一併取得 encodedPolyline），
 * 所以不需要額外的 API，也會照每段交通卡片設定的交通方式來畫；步行路段用虛線。
 * 新增、刪除、排序、切換天數、路段算好時都會經過 scheduleDayRoute()，0.3 秒防抖後重畫，
 * 內容沒變就不重畫。
 * ========================================================================== */

const ROUTE_VISIBLE_STORAGE = 'trip-planner-route-visible'; // 只存在這台裝置
const dayRoute = { lines: [], timer: null, drawnKey: '', encoding: null, Polyline: null };

async function initDayRoute() {
  try {
    ({ encoding: dayRoute.encoding } = await google.maps.importLibrary('geometry'));
    dayRoute.Polyline = google.maps.Polyline || (await google.maps.importLibrary('maps')).Polyline;
  } catch {
    return; // 載入不到繪製元件就不畫路線，其餘功能照常
  }
  const btn = document.getElementById('route-toggle');
  btn.hidden = false;
  renderRouteToggle();
  btn.addEventListener('click', () => {
    try {
      localStorage.setItem(ROUTE_VISIBLE_STORAGE, isRouteVisible() ? 'off' : 'on');
    } catch {}
    renderRouteToggle();
    scheduleDayRoute(0);
  });
}

function isRouteVisible() {
  try {
    return localStorage.getItem(ROUTE_VISIBLE_STORAGE) !== 'off';
  } catch {
    return true;
  }
}

function renderRouteToggle() {
  const btn = document.getElementById('route-toggle');
  const on = isRouteVisible();
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? '隱藏地圖上的當日路線' : '在地圖上顯示當日路線';
  btn.querySelector('span').textContent = on ? '路線' : '路線已隱藏';
}

function scheduleDayRoute(delay = 300) {
  if (!map || !dayRoute.encoding) return;
  clearTimeout(dayRoute.timer);
  dayRoute.timer = setTimeout(drawDayRoute, delay);
}

function setRouteStatus(text) {
  const el = document.getElementById('route-status');
  el.hidden = !text;
  el.textContent = text || '';
}

function clearDayRoute() {
  dayRoute.lines.forEach(line => line.setMap(null));
  dayRoute.lines = [];
}

function drawDayRoute() {
  const day = state.activeDayId === OVERVIEW ? null : getDay(state.activeDayId);
  const legs = day && isRouteVisible() ? getDayLegs(day).map(({ from, to }) => {
    const mode = getLegMode(from, to).value;
    return { mode, leg: legCache.get(getLegKey(from, to, mode)) };
  }) : [];
  const key = legs.length
    ? `${day.id}|${getDayIndex(day.id)}|${legs.map(({ mode, leg }) => `${mode}:${leg?.status}:${leg?.polyline?.length || 0}`).join('>')}`
    : '';
  if (key === dayRoute.drawnKey) return;
  dayRoute.drawnKey = key;
  clearDayRoute();

  if (!legs.length) {
    const hint = isRouteVisible() && !day && state.days.some(d => d.spots.length >= 2) ? '選一天，地圖會畫出當天的路線' : '';
    setRouteStatus(hint);
    return;
  }

  const color = getDayColor(getDayIndex(day.id));
  let failed = 0;
  legs.forEach(({ mode, leg }) => {
    if (leg?.status === 'error') failed++;
    if (!leg?.polyline) return;
    const path = dayRoute.encoding.decodePath(leg.polyline);
    if (mode === 'WALK') {
      // 步行：虛線
      dayRoute.lines.push(new dayRoute.Polyline({
        map, path, clickable: false, zIndex: 2, strokeOpacity: 0,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }]
      }));
      return;
    }
    // 黑色描邊（新粗獷風格），再疊上當天的顏色
    dayRoute.lines.push(new dayRoute.Polyline({ map, path, clickable: false, zIndex: 1, strokeColor: '#18181B', strokeOpacity: 1, strokeWeight: 9 }));
    dayRoute.lines.push(new dayRoute.Polyline({ map, path, clickable: false, zIndex: 2, strokeColor: color, strokeOpacity: 1, strokeWeight: 5 }));
  });
  const pending = legs.some(({ leg }) => !leg || leg.status === 'loading');
  setRouteStatus(failed ? `有 ${failed} 段找不到路線，其餘路段已畫出` : pending ? '路線計算中…' : '');
}


/* ==========================================================================
 * 8d. 景點備註視窗
 *
 * 卡片上的備註標籤（或「⋯」選單的編輯備註）打開這個視窗：
 *   簡短備註（單行，同步顯示在卡片上）＋ 詳細紀錄（多行，支援簡易 Markdown：- 清單、**粗體**、網址自動變連結）。
 * 「儲存」寫回景點並重繪；「取消」、Esc、點背景都不儲存。Cmd/Ctrl + Enter 快速儲存。
 * ========================================================================== */

const noteModal = {
  el: document.getElementById('note-modal'),
  backdrop: document.getElementById('note-backdrop'),
  spotId: null,
  dayId: null,
  returnFocus: null
};

// 詳細紀錄的簡易 Markdown：先跳脫 HTML，再處理清單、粗體與網址，不會執行任何使用者輸入的 HTML
const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp)(\?[^\s]*)?$/i;

function renderNoteImage(url, alt = '') {
  return `<a class="note-img" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${alt || '圖片'}" loading="lazy" referrerpolicy="no-referrer"></a>`;
}

// 詳細紀錄裡的圖片網址：![說明](網址) 或直接貼的圖片網址（.jpg／.png／.gif／.webp）
function getNoteImageUrls(text) {
  return [...(text || '').matchAll(/https?:\/\/[^\s)<]+/g)].map(m => m[0]).filter(url => IMAGE_URL_RE.test(url));
}

function renderNoteText(text) {
  const inline = line => {
    const tokens = [];
    const keep = html => `\u0000${tokens.push(html) - 1}\u0000`;
    return escapeHtml(line)
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt, url) => keep(renderNoteImage(url, alt)))
      .replace(/https?:\/\/[^\s<\u0000]+/g, url => keep(IMAGE_URL_RE.test(url) ? renderNoteImage(url)
        : `<a href="${url}" target="_blank" rel="noopener">${url}</a>`))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[i]);
  };
  const blocks = [];
  let list = null;
  text.trim().split('\n').forEach(raw => {
    const line = raw.trim();
    const item = line.match(/^[-*・]\s+(.*)$/);
    if (item) {
      if (!list) blocks.push(list = []);
      list.push(`<li>${inline(item[1])}</li>`);
      return;
    }
    list = null;
    if (line) blocks.push(`<p>${inline(line)}</p>`);
  });
  return blocks.map(b => (Array.isArray(b) ? `<ul>${b.join('')}</ul>` : b)).join('');
}

// focus：'time' 時直接把游標放在時間欄（「⋯」選單的設定時間）
function openNoteModal(spotId, focus) {
  const found = findSpot(spotId);
  if (!found) return;
  const { spot, dayIndex, index } = found;
  noteModal.spotId = spotId;
  noteModal.dayId = null;
  document.getElementById('note-map-link').hidden = false;
  document.getElementById('note-sep').hidden = false;
  document.getElementById('note-short').placeholder = '例如：需先出示 QR Code、推薦布丁';
  noteModal.returnFocus = document.activeElement;
  const date = getDayDateText(dayIndex);
  document.getElementById('note-title').textContent = spot.name;
  document.getElementById('note-where').textContent = `${getDayLabel(dayIndex)}${date ? `・${date}` : ''}・第 ${index + 1} 站`;
  document.getElementById('note-map-link').href = spot.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}&query_place_id=${encodeURIComponent(spot.placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  const icon = document.getElementById('note-icon');
  icon.innerHTML = renderSpotIcon(spot.icon, index + 1);
  icon.style.setProperty('--c', getDayColor(dayIndex));
  const short = document.getElementById('note-short');
  const detail = document.getElementById('note-detail');
  short.value = spot.note;
  detail.value = spot.detailedNotes;
  startNoteImages(spot.detailedNotes);
  updateNoteCounter();
  setNotePreview(false);
  ui.spotMenuId = null;
  noteModal.el.hidden = false;
  noteModal.backdrop.hidden = false;
  document.getElementById('note-time-row').hidden = false;
  document.getElementById('note-time').value = spot.time;
  document.getElementById('note-reserved').checked = spot.reserved;
  document.getElementById('note-tentative').checked = spot.tentative;
  updateNoteTimeState();
  if (focus === 'time') {
    document.getElementById('note-time').focus();
  } else {
    short.focus();
    short.setSelectionRange(short.value.length, short.value.length);
  }
}

function closeNoteModal() {
  if (noteModal.el.hidden) return;
  if (!noteModal.imagesSettled) settleNoteImages(noteModal.originalDetail); // 取消：這次上傳但沒存的圖片刪掉
  noteModal.el.hidden = true;
  noteModal.backdrop.hidden = true;
  noteModal.spotId = null;
  // 回到原本的備註標籤（重繪後元素會換新，所以依景點重新找）
  const back = noteModal.returnFocus?.isConnected ? noteModal.returnFocus : null;
  (back || document.querySelector('.note-chip'))?.focus?.();
}

// Day 標題的備註：沿用同一個視窗，存到 day.note／day.detailedNotes
function openDayNoteModal(dayId) {
  const day = getDay(dayId);
  if (!day) return;
  const dayIndex = getDayIndex(dayId);
  noteModal.spotId = null;
  noteModal.dayId = dayId;
  noteModal.returnFocus = document.activeElement;
  const date = getDayDateText(dayIndex);
  document.getElementById('note-title').textContent = `${getDayLabel(dayIndex)}${date ? ` ${date}` : ''}`;
  document.getElementById('note-where').textContent = `${day.spots.length} 個景點${renderDayTravel(day) ? `・${renderDayTravel(day)}` : ''}`;
  document.getElementById('note-map-link').hidden = true;
  document.getElementById('note-sep').hidden = true;
  document.getElementById('note-time-row').hidden = true; // 時間只屬於景點
  const icon = document.getElementById('note-icon');
  icon.textContent = dayIndex + 1;
  icon.style.setProperty('--c', getDayColor(dayIndex));
  const short = document.getElementById('note-short');
  short.placeholder = '例如：早上 8 點集合、今天要早睡';
  short.value = day.note;
  document.getElementById('note-detail').value = day.detailedNotes;
  startNoteImages(day.detailedNotes);
  updateNoteCounter();
  setNotePreview(false);
  noteModal.el.hidden = false;
  noteModal.backdrop.hidden = false;
  short.focus();
}

function submitNoteModal() {
  settleNoteImages(document.getElementById('note-detail').value);
  if (noteModal.dayId) {
    const day = getDay(noteModal.dayId);
    const dayId = noteModal.dayId;
    if (day) {
      day.note = document.getElementById('note-short').value.trim();
      day.detailedNotes = document.getElementById('note-detail').value.replace(/\s+$/, '');
      commit();
    }
    noteModal.returnFocus = null;
    noteModal.dayId = null;
    closeNoteModal();
    document.querySelector(`.day[data-day-id="${dayId}"] .day-note .note-chip`)?.focus();
    return;
  }
  const spotId = noteModal.spotId;
  if (!spotId) return;
  const ok = saveSpotNotes(spotId, document.getElementById('note-short').value, document.getElementById('note-detail').value,
    document.getElementById('note-time').value, document.getElementById('note-reserved').checked,
    document.getElementById('note-tentative').checked);
  noteModal.returnFocus = null;
  closeNoteModal();
  if (ok) document.querySelector(`.spot[data-spot-id="${spotId}"] .note-chip`)?.focus();
}

// 沒填時間時「預約時間」不能勾
function updateNoteTimeState() {
  const time = document.getElementById('note-time');
  const reserved = document.getElementById('note-reserved');
  reserved.disabled = !time.value;
  if (!time.value) reserved.checked = false;
  document.getElementById('note-time-clear').hidden = !time.value;
}

function updateNoteCounter() {
  const short = document.getElementById('note-short');
  document.getElementById('note-count').textContent = `${[...short.value].length}/${short.maxLength}`;
}

/* ---------- 詳細紀錄插入圖片（Imgur） ----------
 * 圖片傳到 Imgur，備註裡只存網址（資料庫幾乎沒負擔）。上傳前先壓縮到長邊 1600px。
 * Imgur 回傳的 deletehash 存在這台瀏覽器：備註裡刪掉圖片、或上傳後沒儲存，就順便把 Imgur 上的圖刪掉。
 * 注意：Imgur 的圖片拿到網址的人都看得到，雲端行程 30 天到期時也不會自動刪除。 */
function getImgurClientId() {
  try { return localStorage.getItem(IMGUR_KEY_STORAGE) || ''; } catch { return ''; }
}

function readImgurUploads() {
  try { return JSON.parse(localStorage.getItem(IMGUR_UPLOADS_STORAGE)) || {}; } catch { return {}; }
}

function writeImgurUploads(map) {
  try { localStorage.setItem(IMGUR_UPLOADS_STORAGE, JSON.stringify(map)); } catch {}
}

function startNoteImages(text) {
  noteModal.originalDetail = text || '';
  noteModal.uploaded = [];
  noteModal.imagesSettled = false;
  setNoteImageStatus('');
}

// 視窗關閉時：原本有的、這次上傳的圖片，最後不在備註裡的就從 Imgur 刪掉（只刪這台瀏覽器上傳的）
function settleNoteImages(finalText) {
  noteModal.imagesSettled = true;
  const keep = new Set(getNoteImageUrls(finalText));
  const uploads = readImgurUploads();
  const gone = [...new Set([...getNoteImageUrls(noteModal.originalDetail), ...(noteModal.uploaded || [])])]
    .filter(url => !keep.has(url) && uploads[url]);
  gone.forEach(deleteImgurImage);
}

function deleteImgurImage(url) {
  const uploads = readImgurUploads();
  const hash = uploads[url];
  const clientId = getImgurClientId();
  if (!hash) return;
  delete uploads[url];
  writeImgurUploads(uploads);
  if (!clientId) return;
  fetch(`https://api.imgur.com/3/image/${encodeURIComponent(hash)}`, { method: 'DELETE', headers: { Authorization: `Client-ID ${clientId}` } })
    .catch(err => console.warn('Imgur delete:', err));
}

function setNoteImageStatus(text, isError = false) {
  const el = document.getElementById('note-img-status');
  el.hidden = !text;
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// 長邊縮到 1600px、轉成 JPEG；GIF 保留動畫不壓縮
async function compressImage(file) {
  if (file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('無法讀取這張圖片'));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; // 透明 PNG 轉 JPEG 時底色用白色
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadToImgur(blob, clientId) {
  const body = new FormData();
  body.append('image', blob);
  body.append('type', 'file');
  let res;
  try {
    res = await fetch('https://api.imgur.com/3/image', { method: 'POST', headers: { Authorization: `Client-ID ${clientId}` }, body });
  } catch {
    throw new Error('連不上 Imgur，請檢查網路連線');
  }
  const json = await res.json().catch(() => null);
  if (res.ok && json?.data?.link) return { link: json.data.link, deletehash: json.data.deletehash };
  if (res.status === 429) throw new Error('Imgur 上傳額度暫時用完了，請稍後再試');
  if (res.status === 401 || res.status === 403) throw new Error('Imgur Client ID 無效，請到「⚙ → 金鑰設定」檢查');
  const msg = json?.data?.error?.message || json?.data?.error;
  throw new Error(`Imgur 上傳失敗${typeof msg === 'string' ? `：${msg}` : `（${res.status}）`}`);
}

// 在游標位置插入一行文字（前後各自換行）
function insertNoteLine(textarea, line) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const text = `${before && !before.endsWith('\n') ? '\n' : ''}${line}${after.startsWith('\n') || !after ? '' : '\n'}`;
  textarea.setRangeText(text, start, end, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function insertNoteImages(files) {
  const clientId = getImgurClientId();
  if (!clientId) {
    setNoteImageStatus('還沒設定 Imgur Client ID：請先到「⚙ → 金鑰設定」填寫（關閉這個視窗前記得先儲存備註）', true);
    return;
  }
  const detail = document.getElementById('note-detail');
  setNotePreview(false);
  const btn = document.getElementById('note-img-btn');
  btn.disabled = true;
  let done = 0;
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      setNoteImageStatus(`上傳中…（${done + 1}/${files.length}）`);
      const { link, deletehash } = await uploadToImgur(await compressImage(file), clientId);
      if (deletehash) writeImgurUploads({ ...readImgurUploads(), [link]: deletehash });
      if (noteModal.el.hidden || noteModal.imagesSettled) { // 上傳途中視窗已經關掉：這張用不到了
        deleteImgurImage(link);
        continue;
      }
      noteModal.uploaded.push(link);
      insertNoteLine(detail, `![](${link})`);
      done++;
    }
    setNoteImageStatus(done ? `已插入 ${done} 張圖片，按「儲存」保存。圖片在 Imgur 上拿到網址的人都看得到。` : '');
  } catch (err) {
    setNoteImageStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('note-img-btn').addEventListener('click', () => document.getElementById('note-img-file').click());
document.getElementById('note-img-file').addEventListener('change', e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) insertNoteImages(files);
});

function setNotePreview(on) {
  const detail = document.getElementById('note-detail');
  const preview = document.getElementById('note-preview');
  document.getElementById('note-preview-toggle').setAttribute('aria-pressed', String(on));
  document.getElementById('note-preview-toggle').textContent = on ? '繼續編輯' : '預覽';
  detail.hidden = on;
  preview.hidden = !on;
  if (on) preview.innerHTML = renderNoteText(detail.value) || '<p class="note-preview-empty">還沒有詳細紀錄</p>';
}

noteModal.el.addEventListener('submit', e => {
  e.preventDefault();
  submitNoteModal();
});
noteModal.el.addEventListener('click', e => {
  if (e.target.closest('[data-action="close-note"]')) closeNoteModal();
  if (e.target.closest('#note-preview-toggle')) setNotePreview(document.getElementById('note-detail').hidden === false);
});
noteModal.backdrop.addEventListener('click', closeNoteModal);
document.getElementById('note-short').addEventListener('input', updateNoteCounter);
document.getElementById('note-time').addEventListener('input', updateNoteTimeState);
document.getElementById('note-time-clear').addEventListener('click', () => {
  document.getElementById('note-time').value = '';
  updateNoteTimeState();
  document.getElementById('note-time').focus();
});
noteModal.el.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.stopPropagation(); // 只關備註視窗，不要連帶關掉其他選單
    closeNoteModal();
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submitNoteModal();
  } else if (e.key === 'Enter' && e.target.id === 'note-short') {
    e.preventDefault(); // 單行備註按 Enter 跳到詳細紀錄，避免誤送出
    document.getElementById('note-detail').focus();
  }
});


/* ==========================================================================
 * 8g. 複製景點到其他天（例如每天都從同一間飯店出發、回到飯店）
 *
 * 複製出來的是獨立景點（新的 id）：名稱、座標、Place ID、類別、備註沿用，記帳各天分開。
 * 位置可選當天第一站、最後一站或頭尾都加；那個位置已經是同一地點時不重複加入。
 * ========================================================================== */

const copyModal = { el: document.getElementById('copy-modal'), spotId: null, returnFocus: null };

function isSamePlace(a, b) {
  if (a.placeId && b.placeId) return a.placeId === b.placeId;
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;
}

function copySpotToDays(spotId, dayIds, position) {
  const found = findSpot(spotId);
  if (!found) return 0;
  const src = found.spot;
  const make = () => ({ ...createSpot(src), icon: src.icon, note: src.note, detailedNotes: src.detailedNotes });
  let added = 0;
  dayIds.forEach(dayId => {
    const day = getDay(dayId);
    if (!day) return;
    if ((position === 'start' || position === 'both') && !(day.spots[0] && isSamePlace(day.spots[0], src))) {
      day.spots.unshift(make());
      added++;
    }
    const last = day.spots[day.spots.length - 1];
    if ((position === 'end' || position === 'both') && !(last && isSamePlace(last, src) && (position === 'end' || day.spots.length > 1))) {
      day.spots.push(make());
      added++;
    }
  });
  if (added) commit();
  return added;
}

// 同一天再去一次（例如來回同一個公車站）：複製一份加到當天最後，之後可拖曳到想要的位置
function repeatSpotInDay(spotId) {
  const found = findSpot(spotId);
  if (!found) return;
  const src = found.spot;
  const spot = { ...createSpot(src), icon: src.icon, note: src.note, detailedNotes: src.detailedNotes };
  found.day.spots.push(spot);
  ui.flashSpotId = spot.id;
  commit();
  requestAnimationFrame(() => document.querySelector(`.spot[data-spot-id="${spot.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function openCopyModal(spotId) {
  const found = findSpot(spotId);
  if (!found) return;
  copyModal.spotId = spotId;
  copyModal.returnFocus = document.activeElement;
  const form = copyModal.el;
  document.getElementById('copy-title').textContent = `複製「${found.spot.name}」到其他天`;
  form.querySelector('.copy-days').innerHTML = state.days.map((d, i) => `
      <label class="copy-day" style="--c:${getDayColor(i)}">
        <input type="checkbox" name="day" value="${d.id}" ${d.id === found.day.id ? '' : 'checked'}>
        <span class="tab-dot"></span><span>${getDayLabel(i)}${getDayDateText(i) ? ` <small>${getDayDateText(i)}</small>` : ''}</span>
        ${d.id === found.day.id ? '<small class="copy-here">（目前這天）</small>' : ''}
      </label>`).join('');
  // 住宿預設頭尾都加：早上從飯店出發、晚上回到飯店
  form.elements.position.value = found.spot.icon === '🏠' ? 'both' : 'end';
  document.getElementById('copy-status').textContent = '';
  form.hidden = false;
  document.getElementById('copy-backdrop').hidden = false;
  form.querySelector('input[name="day"]:checked, input[name="day"]')?.focus();
}

function closeCopyModal() {
  if (copyModal.el.hidden) return;
  copyModal.el.hidden = true;
  document.getElementById('copy-backdrop').hidden = true;
  if (copyModal.returnFocus?.isConnected) copyModal.returnFocus.focus();
}

copyModal.el.addEventListener('submit', e => {
  e.preventDefault();
  const form = copyModal.el;
  const dayIds = [...form.querySelectorAll('input[name="day"]:checked')].map(i => i.value);
  if (!dayIds.length) {
    document.getElementById('copy-status').textContent = '請至少選一天';
    return;
  }
  const added = copySpotToDays(copyModal.spotId, dayIds, form.elements.position.value);
  copyModal.returnFocus = null;
  closeCopyModal();
  if (!added) alert('選的那幾天在這個位置已經有這個地點了，沒有重複加入。');
});
copyModal.el.addEventListener('click', e => {
  if (e.target.closest('[data-action="close-copy"]')) closeCopyModal();
  const all = e.target.closest('[data-action="copy-all"]');
  if (all) {
    const boxes = [...copyModal.el.querySelectorAll('input[name="day"]')];
    const on = boxes.some(b => !b.checked);
    boxes.forEach(b => { b.checked = on; });
  }
});
document.getElementById('copy-backdrop').addEventListener('click', closeCopyModal);
copyModal.el.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeCopyModal();
  }
});


/* ==========================================================================
 * 8f. 交通詳情與備註視窗
 *
 * 交通連接列的鉛筆（或車次／票價標籤）打開這個視窗，編輯：交通方式、車次備註、費用（可加入結算）、
 * 時間模式（Google 預估或手動分鐘）。「重設回 API 預設值」把交通方式與時間恢復預設，車次與費用保留。
 * ========================================================================== */

const legModal = { el: document.getElementById('leg-modal'), from: null, to: null, returnFocus: null };

function openLegModal(fromId, toId) {
  const from = findSpot(fromId)?.spot;
  const found = findSpot(toId);
  if (!from || !found) return;
  const to = found.spot;
  legModal.from = fromId;
  legModal.to = toId;
  document.getElementById('leg-reset-status').hidden = true;
  legModal.returnFocus = document.activeElement;
  const detail = getLegDetail(from, to) || {};
  const form = legModal.el;
  document.getElementById('leg-modal-route').innerHTML = `${escapeHtml(from.name)}<span aria-label="到"> ➔ </span>${escapeHtml(to.name)}`;
  document.getElementById('leg-modal-day').textContent = `${getDayLabel(found.dayIndex)}${getDayDateText(found.dayIndex) ? `・${getDayDateText(found.dayIndex)}` : ''}`;
  form.querySelector('.leg-mode-options').innerHTML = TRAVEL_MODES.map(m => `
      <label class="pill"><input type="radio" name="mode" value="${m.value}" ${getLegMode(from, to).value === m.value ? 'checked' : ''}>
        <span>${ICONS[m.value]}${m.label}</span></label>`).join('');
  form.elements.transitNote.value = detail.transitNote || '';
  const cost = getLegCost(detail);
  form.elements.cost.value = cost ? cost.amount : '';
  form.elements.currency.value = cost?.currency || detail.currency || 'TWD';
  form.elements.paidBy.innerHTML = state.members.map(m => `<option value="${m.id}">${escapeHtml(getMemberName(m))}</option>`).join('');
  form.elements.paidBy.value = getMember(detail.paidBy) ? detail.paidBy : state.members[0].id;
  form.elements.addToSettlement.checked = Boolean(cost?.inSettlement || detail.addToSettlement);
  form.elements.timeMode.value = detail.noTime ? 'none' : detail.customDuration > 0 ? 'manual'
    : getLegMode(from, to).value === 'CUSTOM' ? 'none' : 'api';
  form.elements.customDuration.value = detail.customDuration || '';
  form.elements.unconfirmed.checked = Boolean(detail.unconfirmed);
  updateLegModalState();
  form.hidden = false;
  document.getElementById('leg-backdrop').hidden = false;
  form.elements.transitNote.focus();
}

// 依目前選擇更新：Google 預估文字、自訂交通必須手動時間、非台幣不能加入結算
function updateLegModalState() {
  const form = legModal.el;
  const from = findSpot(legModal.from)?.spot;
  const to = findSpot(legModal.to)?.spot;
  if (!from || !to) return;
  const mode = form.elements.mode.value;
  let leg = mode === 'CUSTOM' ? null : legCache.get(getLegKey(from, to, mode));
  // 視窗裡換了交通方式（或按了重設）就先查這個方式的預估，不用等儲存
  if (mode !== 'CUSTOM' && !leg && apiKey) {
    requestLeg(from, to, mode).then(() => {
      if (!form.hidden && legModal.from === from.id && legModal.to === to.id) updateLegModalState();
    });
    leg = legCache.get(getLegKey(from, to, mode));
  }
  const apiRadio = form.querySelector('input[name="timeMode"][value="api"]');
  apiRadio.disabled = mode === 'CUSTOM';
  if (apiRadio.disabled && form.elements.timeMode.value === 'api') form.elements.timeMode.value = 'none';
  document.getElementById('leg-api-estimate').textContent = mode === 'CUSTOM'
    ? '自訂交通沒有預估時間'
    : leg?.status === 'ok' ? `（${formatDuration(leg.durationSec)}・${formatDistance(leg.distanceMeters)}）`
      : leg?.status === 'loading' ? '（計算中…）'
      : leg?.status === 'error' ? `（${leg.message}）` : '（尚未取得）';
  form.elements.customDuration.disabled = form.elements.timeMode.value !== 'manual';
  const twd = form.elements.currency.value === 'TWD';
  const hasCost = Number(form.elements.cost.value) > 0;
  form.elements.addToSettlement.disabled = !twd || !hasCost;
  if (!twd) form.elements.addToSettlement.checked = false;
  form.elements.paidBy.disabled = !form.elements.addToSettlement.checked;
  document.getElementById('leg-settle-hint').textContent = !twd
    ? '旅費結算以新台幣計算，其他幣別只會記錄在這段交通上'
    : !hasCost ? '填寫金額後可以加入旅費結算' : form.elements.addToSettlement.checked ? `會以「${getSharedLabel()}」列入旅費結算，之後可在記帳標籤調整` : '';
}

function closeLegModal() {
  if (legModal.el.hidden) return;
  legModal.el.hidden = true;
  document.getElementById('leg-backdrop').hidden = true;
  if (legModal.returnFocus?.isConnected) legModal.returnFocus.focus();
}

function submitLegModal() {
  const form = legModal.el;
  const manual = form.elements.timeMode.value === 'manual';
  saveLegDetail(legModal.from, legModal.to, {
    noTime: form.elements.timeMode.value === 'none',
    unconfirmed: form.elements.unconfirmed.checked,
    mode: form.elements.mode.value,
    transitNote: form.elements.transitNote.value,
    customDuration: manual ? Number(form.elements.customDuration.value) : null,
    cost: Number(form.elements.cost.value) || 0,
    currency: form.elements.currency.value,
    paidBy: form.elements.paidBy.value,
    addToSettlement: form.elements.addToSettlement.checked
  });
  legModal.returnFocus = null;
  closeLegModal();
}

// 重設：交通方式回到預設、時間改回 Google 預估（只改表單，按「儲存」才套用）；車次備註、費用、待確認保留
function resetLegModal() {
  const form = legModal.el;
  form.elements.mode.value = getTravelMode().value;
  form.elements.timeMode.value = form.elements.mode.value === 'CUSTOM' ? 'none' : 'api';
  form.elements.customDuration.value = '';
  form.elements.customDuration.classList.remove('invalid');
  updateLegModalState();
  const status = document.getElementById('leg-reset-status');
  status.textContent = '已改回預設，按「儲存」套用';
  status.hidden = false;
  form.querySelector('button[type="submit"]').focus();
}

legModal.el.addEventListener('submit', e => {
  e.preventDefault();
  if (legModal.el.elements.timeMode.value === 'manual' && !(Number(legModal.el.elements.customDuration.value) > 0)) {
    legModal.el.elements.customDuration.focus();
    legModal.el.elements.customDuration.classList.add('invalid');
    return;
  }
  submitLegModal();
});
legModal.el.addEventListener('input', e => {
  if (e.target.name === 'customDuration') e.target.classList.remove('invalid');
  document.getElementById('leg-reset-status').hidden = true;
  updateLegModalState();
});
legModal.el.addEventListener('click', e => {
  if (e.target.closest('[data-action="close-leg"]')) closeLegModal();
  if (e.target.closest('[data-action="reset-leg"]')) resetLegModal();
});
document.getElementById('leg-backdrop').addEventListener('click', closeLegModal);
legModal.el.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeLegModal();
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    legModal.el.requestSubmit();
  }
});


/* ==========================================================================
 * 8e. 待辦清單（導覽列的筆記本）
 *
 * 整趟旅程共用一份待辦：出發前要訂的票、要帶的東西等。存在 state.todos，
 * 跟著本機儲存、雲端同步、JSON 匯出匯入與旅行手帳。
 * ========================================================================== */

const NOTEBOOK_ART = `<rect x="7.5" y="3.5" width="18" height="25" rx="2" fill="#FDE047"/>
    <path d="M11.5 3.5v25"/>
    <path d="M14.5 10.5h7.5M14.5 15h7.5M14.5 19.5h5"/>
    <path d="M4.5 8.5h4.5M4.5 13.5h4.5M4.5 18.5h4.5M4.5 23.5h4.5" stroke-width="2.4"/>
    <path d="M19 23.5l1.8 1.8 3.4-3.6" stroke="#E11D48" stroke-width="2.2"/>`;

function addTodo(text) {
  const value = text.trim();
  if (!value) return;
  state.todos.push({ id: createId('todo'), text: value, done: false });
  commit();
}

function toggleTodo(id) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  commit();
}

function removeTodo(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  commit();
}

function clearDoneTodos() {
  state.todos = state.todos.filter(t => !t.done);
  commit();
}

// 只重繪清單與數字，不動輸入框（避免打字中被打斷）
function renderTodos() {
  const left = state.todos.filter(t => !t.done).length;
  const count = document.getElementById('todo-count');
  count.hidden = left === 0;
  count.textContent = left;
  document.getElementById('todo-btn').setAttribute('aria-label', `待辦清單，還有 ${left} 項未完成`);
  document.getElementById('todo-progress').textContent = state.todos.length ? `${state.todos.length - left}/${state.todos.length} 完成` : '';
  document.getElementById('todo-clear').hidden = !state.todos.some(t => t.done);
  document.getElementById('todo-list').innerHTML = state.todos.length
    ? state.todos.map(t => `
        <li class="todo-item ${t.done ? 'done' : ''}" data-todo-id="${t.id}">
          <label class="todo-check">
            <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="${escapeHtml(t.text)}">
            <span class="todo-box" aria-hidden="true"></span>
            <span class="todo-text">${escapeHtml(t.text)}</span>
          </label>
          <button class="icon-btn todo-remove" data-todo-remove aria-label="刪除「${escapeHtml(t.text)}」" title="刪除">${ICONS.close}</button>
        </li>`).join('')
    : '<li class="todo-empty">還沒有待辦事項。訂票、換匯、要帶的東西，都可以記在這裡。</li>';
}

function setTodosOpen(open) {
  const panel = document.getElementById('todo-panel');
  panel.hidden = !open;
  document.getElementById('todo-btn').setAttribute('aria-expanded', String(open));
  document.getElementById('todo-backdrop').hidden = !(open && isMobile());
  if (open) {
    toggleMobilePanel(false);
    document.getElementById('todo-input').focus();
  }
}

document.getElementById('todo-btn').innerHTML = `<svg class="spot-icon-art" viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="#18181B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${NOTEBOOK_ART}</g></svg>`
  + '<span class="todo-count" id="todo-count" hidden></span>';
document.getElementById('todo-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('todo-input');
  addTodo(input.value);
  input.value = '';
  input.focus();
});
document.getElementById('todo-list').addEventListener('change', e => {
  const item = e.target.closest('[data-todo-id]');
  if (item && e.target.matches('input[type="checkbox"]')) toggleTodo(item.dataset.todoId);
});
document.getElementById('todo-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-todo-remove]');
  if (btn) removeTodo(btn.closest('[data-todo-id]').dataset.todoId);
});
document.getElementById('todo-clear').addEventListener('click', clearDoneTodos);
document.getElementById('todo-close').addEventListener('click', () => setTodosOpen(false));
document.getElementById('todo-backdrop').addEventListener('click', () => setTodosOpen(false));
// 點面板以外或按 Esc 收起
document.addEventListener('click', e => {
  if (!document.getElementById('todo-panel').hidden && !e.target.closest('.todo-wrap')) setTodosOpen(false);
});
// Esc 收起（焦點不在面板裡時也有效，例如按了「清除已完成」之後）
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.getElementById('todo-panel').hidden) return;
  setTodosOpen(false);
  document.getElementById('todo-btn').focus();
});


/* ==========================================================================
 * 8c. 手機版（寬度 ≤ 760px）
 *
 *   - 地圖滿版，行程放在底部抽屜：peek（天數分頁＋下一站）、half（50%）、full（90%）三段停靠。
 *     拖曳把手、天數列或下一站卡片可以上下拖；快速甩動會往甩的方向跳一段，否則停在最近的一段。
 *   - 導覽列變成地圖上方的浮動卡片；旅伴與設定收進頭像按鈕的面板，出發日移到抽屜裡。
 *   - 搜尋框點下去變成全螢幕搜尋。
 *   - 景點卡向左滑露出「編輯」「刪除」；交通縮成可直接開 Google 地圖導航的小標籤。
 * ========================================================================== */

const mobileQuery = window.matchMedia('(max-width: 760px)');
const sidebarEl = document.querySelector('.sidebar');
const sheet = { snap: 'peek', drag: null, suppressClick: false };
const SHEET_ORDER = ['peek', 'half', 'full'];

function isMobile() {
  return mobileQuery.matches;
}

function getSheetHeights() {
  const vh = window.innerHeight;
  const grab = ['sheet-handle', 'next-stop'].map(id => document.getElementById(id))
    .concat(sidebarEl.querySelector('.tabs-bar'))
    .reduce((sum, el) => sum + (el && !el.hidden ? el.offsetHeight : 0), 0);
  const peek = Math.min(Math.max(Math.round(vh * 0.15), grab + 6), Math.round(vh * 0.4));
  return { peek, half: Math.max(Math.round(vh * 0.5), peek + 80), full: Math.round(vh * 0.9) };
}

// 依停靠點設定抽屜高度；地圖控制項跟著抽屜高度移動（--sheet-visible）
function layoutSheet(animate = true, height) {
  if (!isMobile()) {
    sidebarEl.style.height = '';
    document.documentElement.style.removeProperty('--sheet-visible');
    return;
  }
  const visible = height ?? getSheetHeights()[sheet.snap];
  sidebarEl.classList.toggle('sheet-animate', animate);
  sidebarEl.style.height = `${visible}px`;
  sidebarEl.dataset.snap = sheet.snap;
  document.documentElement.style.setProperty('--sheet-visible', `${visible}px`);
  const handle = document.getElementById('sheet-handle');
  handle.setAttribute('aria-expanded', String(sheet.snap !== 'peek'));
  handle.setAttribute('aria-label', sheet.snap === 'full' ? '收合行程' : '展開行程');
}

function setSheetSnap(snap) {
  if (!isMobile() || sheet.snap === snap) return;
  sheet.snap = snap;
  layoutSheet(true);
}

// 點把手：peek → half → full → peek
document.getElementById('sheet-handle').addEventListener('click', () => {
  if (sheet.suppressClick) return;
  setSheetSnap(SHEET_ORDER[(SHEET_ORDER.indexOf(sheet.snap) + 1) % SHEET_ORDER.length]);
});

// 拖曳手勢：先判斷是上下拖，才接管指標，左右滑仍交給天數分頁捲動
sidebarEl.addEventListener('pointerdown', e => {
  if (!isMobile() || !e.target.closest('.sheet-handle, .tabs-bar, .next-stop')) return;
  sheet.drag = { x: e.clientX, y: e.clientY, startHeight: sidebarEl.offsetHeight, started: false, id: e.pointerId, samples: [] };
});
// 移動與放開掛在 window：手指移出抽屜範圍時仍收得到
window.addEventListener('pointermove', e => {
  const d = sheet.drag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.x;
  const dy = e.clientY - d.y;
  if (!d.started) {
    if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) return;
    d.started = true;
    sidebarEl.setPointerCapture(e.pointerId);
  }
  const { peek, full } = getSheetHeights();
  const height = Math.min(full, Math.max(peek, d.startHeight - dy));
  d.samples.push({ t: e.timeStamp, h: height });
  if (d.samples.length > 5) d.samples.shift();
  layoutSheet(false, height);
});
const endSheetDrag = e => {
  const d = sheet.drag;
  sheet.drag = null;
  if (!d?.started || e.pointerId !== d.id) return;
  const heights = getSheetHeights();
  const current = sidebarEl.offsetHeight;
  const first = d.samples[0];
  const last = d.samples[d.samples.length - 1];
  const velocity = first && last && last.t > first.t ? (last.h - first.h) / (last.t - first.t) : 0; // px/ms，往上為正
  const nearest = SHEET_ORDER.reduce((best, snap) => (Math.abs(heights[snap] - current) < Math.abs(heights[best] - current) ? snap : best));
  if (velocity > 0.5) sheet.snap = SHEET_ORDER.find(snap => heights[snap] > current + 10) || 'full'; // 往上甩：下一段
  else if (velocity < -0.5) sheet.snap = [...SHEET_ORDER].reverse().find(snap => heights[snap] < current - 10) || 'peek'; // 往下甩
  else sheet.snap = nearest;
  layoutSheet(true);
  // 拖曳結束時手指下方的分頁或卡片不要被當成點擊
  sheet.suppressClick = true;
  setTimeout(() => { sheet.suppressClick = false; }, 250);
};
window.addEventListener('pointerup', endSheetDrag);
window.addEventListener('pointercancel', endSheetDrag);
sidebarEl.addEventListener('click', e => {
  if (sheet.suppressClick) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);
window.addEventListener('resize', () => layoutSheet(false));

// ---------- 下一站摘要卡（peek 狀態下也看得到） ----------
// 旅途中顯示今天那天，其餘顯示目前分頁那天；「全部」時取第一個有景點的那天
function getNextStopDay() {
  if (state.activeDayId !== OVERVIEW && getDay(state.activeDayId)) return getDay(state.activeDayId);
  const start = getDayDate(0);
  if (start) {
    const now = new Date();
    const index = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000);
    if (state.days[index]?.spots.length) return state.days[index];
  }
  return state.days.find(d => d.spots.length) || state.days[0];
}

function renderNextStop() {
  const el = document.getElementById('next-stop');
  const day = getNextStopDay();
  const dayIndex = getDayIndex(day.id);
  el.hidden = false;
  el.style.setProperty('--c', getDayColor(dayIndex));
  if (!day.spots.length) {
    el.dataset.spotId = '';
    el.innerHTML = `<span class="next-label">${getDayLabel(dayIndex)}</span><span class="next-name muted">點地圖或搜尋，加入第一個景點</span>`;
    return;
  }
  const spot = day.spots[0];
  const travel = renderDayTravel(day);
  el.dataset.spotId = spot.id;
  el.innerHTML = `
    <span class="spot-index ${spot.icon ? 'has-icon' : ''}">${renderSpotIcon(spot.icon, 1)}</span>
    <span class="next-text">
      <span class="next-label">下一站・${getDayLabel(dayIndex)}${getDayDateText(dayIndex) ? ` ${getDayDateText(dayIndex)}` : ''}</span>
      <span class="next-name">${spot.time ? `${spot.time} ` : ''}${escapeHtml(spot.name)}</span>
    </span>
    <span class="next-meta">${day.spots.length} 站${travel ? `<br>${travel}` : ''}</span>`;
}

document.getElementById('next-stop').addEventListener('click', e => {
  const spotId = e.currentTarget.dataset.spotId;
  if (spotId) focusSpotOnMap(spotId);
  setSheetSnap('half');
});

// ---------- 景點卡向左滑：露出「更多」「刪除」 ----------
const SWIPE_WIDTH = 152;
let swipe = null;

function setSwipedSpot(spotId) {
  ui.swipeSpotId = spotId;
  dayListEl.querySelectorAll('.spot').forEach(el => {
    const on = el.dataset.spotId === spotId;
    el.classList.toggle('swiped', on);
    el.querySelector('.swipe-actions')?.setAttribute('aria-hidden', String(!on));
    const main = el.querySelector('.spot-main');
    if (main) main.style.transform = '';
  });
}

dayListEl.addEventListener('pointerdown', e => {
  const row = e.target.closest('.spot-row');
  if (!isMobile() || !row || e.target.closest('.swipe-actions')) return;
  const spotId = row.closest('.spot').dataset.spotId;
  swipe = { x: e.clientX, y: e.clientY, spotId, main: row.querySelector('.spot-main'), base: ui.swipeSpotId === spotId ? -SWIPE_WIDTH : 0, started: false, id: e.pointerId };
});
window.addEventListener('pointermove', e => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (!swipe.started) {
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    swipe.started = true;
    swipe.main.setPointerCapture(e.pointerId);
    if (ui.swipeSpotId && ui.swipeSpotId !== swipe.spotId) setSwipedSpot(null);
    swipe.main.classList.add('dragging-x');
  }
  const x = Math.min(0, Math.max(-SWIPE_WIDTH - 24, swipe.base + dx));
  swipe.main.style.transform = `translateX(${x}px)`;
});
const endSwipe = e => {
  const s = swipe;
  swipe = null;
  if (!s?.started || e.pointerId !== s.id) return;
  s.main.classList.remove('dragging-x');
  const x = s.base + (e.clientX - s.x);
  setSwipedSpot(x < -SWIPE_WIDTH / 2 ? s.spotId : null);
  sheet.suppressClick = true; // 滑完不要觸發卡片點擊
  setTimeout(() => { sheet.suppressClick = false; }, 250);
};
window.addEventListener('pointerup', endSwipe);
window.addEventListener('pointercancel', endSwipe);

// ---------- 手機：長按景點卡拖曳，調整同一天的順序 ----------
// 按住約 0.4 秒卡片浮起（震動提示），上下拖到想要的位置放開；拖曳中暫時收起路段，只看景點順序。
// 用 touch 事件追蹤手指（可以 preventDefault 擋住捲動），滑鼠／觸控筆則用 pointer 事件。
const LONG_PRESS_MS = 400;
let reorder = null;

function findScrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

function cancelReorderPress() {
  if (reorder && !reorder.active) {
    clearTimeout(reorder.timer);
    reorder = null;
  }
}

dayListEl.addEventListener('pointerdown', e => {
  const row = e.target.closest('.spot-row');
  if (!isMobile() || !row || e.target.closest('.swipe-actions') || reorder) return;
  const li = row.closest('.spot');
  if (ui.swipeSpotId === li.dataset.spotId) return; // 已經滑開的卡片不拖
  if (li.closest('.spot-list').querySelectorAll(':scope > .spot').length < 2) return;
  reorder = { spotId: li.dataset.spotId, li, x: e.clientX, y: e.clientY, pointerY: e.clientY, pointerId: e.pointerId, active: false };
  const handle = e.target.closest('.drag-handle');
  if (handle) {
    // 左邊的 ⠿ 把手：按下就直接拖（touch-action: none，不會被捲動搶走）
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch {}
    startReorder();
    return;
  }
  reorder.timer = setTimeout(() => startReorder(), LONG_PRESS_MS);
});

function startReorder() {
  const r = reorder;
  if (!r || swipe?.started) { reorder = null; return; }
  swipe = null; // 長按成立後就不是左滑
  r.active = true;
  r.list = r.li.closest('.spot-list');
  r.scroller = findScrollParent(r.list);
  const grabTop = r.li.getBoundingClientRect().top;
  r.list.classList.add('reordering'); // 收起路段，卡片排在一起
  r.li.classList.add('lifted');
  navigator.vibrate?.(15);
  const scrollerTop = () => (r.scroller === document.scrollingElement ? 0 : r.scroller.getBoundingClientRect().top);
  r.toContent = clientY => clientY - scrollerTop() + r.scroller.scrollTop;
  r.items = [...r.list.querySelectorAll(':scope > .spot')].map(el => {
    const rect = el.getBoundingClientRect();
    return { el, top: r.toContent(rect.top), height: rect.height };
  });
  r.from = r.items.findIndex(it => it.el === r.li);
  r.to = r.from;
  const me = r.items[r.from];
  // 手指抓在卡片的哪裡：收起路段後版面會位移，讓卡片維持在手指下
  r.grab = r.toContent(r.y) - r.toContent(grabTop);
  const next = r.items[1];
  r.step = me.height + (next ? Math.max(0, next.top - (r.items[0].top + r.items[0].height)) : 8);
  updateReorder();
  const loop = () => {
    if (reorder !== r || !r.active) return;
    // 手指靠近捲動區上下緣時自動捲動
    const box = r.scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : r.scroller.getBoundingClientRect();
    const edge = 56;
    if (r.pointerY < box.top + edge) r.scroller.scrollTop -= 8;
    else if (r.pointerY > box.bottom - edge) r.scroller.scrollTop += 8;
    updateReorder();
    r.raf = requestAnimationFrame(loop);
  };
  r.raf = requestAnimationFrame(loop);
}

function updateReorder() {
  const r = reorder;
  const me = r.items[r.from];
  // 卡片只在這一天的範圍內移動
  const minTop = r.items[0].top;
  const maxTop = Math.max(...r.items.map(it => it.top + it.height)) - me.height;
  const top = Math.min(maxTop, Math.max(minTop, r.toContent(r.pointerY) - r.grab));
  me.el.style.transform = `translateY(${top - me.top}px)`;
  const center = top + me.height / 2;
  let to = 0;
  r.items.forEach((it, i) => { if (i !== r.from && it.top + it.height / 2 < center) to++; });
  if (top >= maxTop - 1) to = r.items.length - 1; // 拖到底／頂（卡片高度不同時中心點可能過不了最後一張）
  if (top <= minTop + 1) to = 0;
  r.to = to;
  r.items.forEach((it, i) => {
    if (i === r.from) return;
    let shift = 0;
    if (r.from < i && i <= to) shift = -r.step;
    else if (to <= i && i < r.from) shift = r.step;
    it.el.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}

function finishReorder(commitMove) {
  const r = reorder;
  if (!r) return;
  clearTimeout(r.timer);
  reorder = null;
  if (!r.active) return;
  cancelAnimationFrame(r.raf);
  sheet.suppressClick = true; // 放開手指產生的點擊不要觸發卡片
  setTimeout(() => { sheet.suppressClick = false; }, 300);
  r.items.forEach(it => { it.el.style.transform = ''; });
  r.li.classList.remove('lifted');
  r.list.classList.remove('reordering');
  if (commitMove && r.to !== r.from) moveSpot(r.spotId, r.to);
}

window.addEventListener('pointermove', e => {
  if (!reorder || e.pointerId !== reorder.pointerId) return;
  if (!reorder.active) {
    if (Math.hypot(e.clientX - reorder.x, e.clientY - reorder.y) > 12) cancelReorderPress(); // 手指移動了：是捲動或左滑
    return;
  }
  reorder.pointerY = e.clientY;
});
window.addEventListener('touchmove', e => {
  if (!reorder?.active) return;
  e.preventDefault(); // 拖曳中不要捲動底部面板
  reorder.pointerY = e.touches[0].clientY;
}, { passive: false });
window.addEventListener('pointerup', e => { if (reorder && e.pointerId === reorder.pointerId) finishReorder(true); });
window.addEventListener('pointercancel', e => {
  // 觸控拖曳中瀏覽器可能送出 pointercancel，交給 touchend 收尾
  if (reorder && e.pointerId === reorder.pointerId && !reorder.active) cancelReorderPress();
});
window.addEventListener('touchend', () => { if (reorder?.active) finishReorder(true); });
window.addEventListener('touchcancel', () => { if (reorder?.active) finishReorder(false); });
// 長按不要跳出系統選單
dayListEl.addEventListener('contextmenu', e => {
  if (isMobile() && e.target.closest('.spot-row')) e.preventDefault();
});
// 點其他地方收回滑開的卡片
document.addEventListener('click', e => {
  if (sheet.suppressClick) return; // 剛滑完放開手指產生的點擊
  if (ui.swipeSpotId && !e.target.closest('.spot.swiped .swipe-actions')) setSwipedSpot(null);
}, true);

// ---------- 浮動導覽列：旅伴與設定面板、全螢幕搜尋 ----------
function toggleMobilePanel(force) {
  const panel = document.getElementById('mobile-panel');
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  document.getElementById('avatar-btn').setAttribute('aria-expanded', String(open));
}

document.addEventListener('click', e => {
  if (!document.getElementById('mobile-panel').hidden && !e.target.closest('#mobile-panel, #avatar-btn')) toggleMobilePanel(false);
});

function openMobileSearch() {
  if (!isMobile()) return;
  document.querySelector('.topbar').classList.add('search-open');
  toggleMobilePanel(false);
}

function closeMobileSearch() {
  document.querySelector('.topbar').classList.remove('search-open');
}

document.getElementById('search-cancel').addEventListener('click', () => {
  closeMobileSearch();
  hideSearchResults();
  searchInput.blur();
});

// 手機與桌面版的版面差異：把旅伴、設定、出發日搬到對應的位置
function placeForViewport() {
  const mobile = isMobile();
  const panel = document.getElementById('mobile-panel');
  const members = document.getElementById('members');
  const navWrap = document.querySelector('.nav-menu-wrap');
  const tripSub = document.querySelector('.trip-sub');
  // 手機導覽列較窄，搜尋提示改短（Places 不能用時保留原本的說明）
  if (!searchInput.dataset.placeholder) searchInput.dataset.placeholder = searchInput.placeholder;
  if (searchInput.placeholder === searchInput.dataset.placeholder || searchInput.placeholder === '搜尋') {
    searchInput.placeholder = mobile ? '搜尋' : searchInput.dataset.placeholder;
  }
  // 搜尋框：桌面版浮在地圖左上角，手機版放在浮動導覽列中間
  const searchBox = document.querySelector('.search');
  if (mobile) document.querySelector('.brand').after(searchBox);
  else document.querySelector('.map-wrap').prepend(searchBox);
  const saveTools = document.getElementById('save-tools');
  if (mobile) {
    panel.prepend(saveTools);
    panel.append(members, navWrap);
    document.querySelector('.sidebar-header').prepend(tripSub);
    document.getElementById('nav-menu').hidden = false;
  } else {
    const right = document.querySelector('.topbar-right');
    right.prepend(members);
    right.prepend(saveTools);
    right.append(navWrap);
    document.querySelector('.trip-meta').append(tripSub);
    document.getElementById('nav-menu').hidden = true;
    toggleMobilePanel(false);
    closeMobileSearch();
    setSwipedSpot(null);
  }
  layoutSheet(false);
}
mobileQuery.addEventListener('change', placeForViewport);


/* ==========================================================================
 * 9. 雲端同步（Firebase Firestore）
 *
 * 共享行程的網址是 #trip-<id>，拿到連結的人都能一起編輯。雲端資料：
 *   trips/{tripId}                    行程本體：days、travelMode、legModes、members
 *   trips/{tripId}/expenses/{id}      每筆花費一份文件，多人同時記帳不會互相覆蓋
 *
 * 寫入：saveState() → queueCloudSave() 等 0.4 秒沒有新變動再一次批次寫入，只寫有變的部分。
 * 讀取：onSnapshot 即時收到別人的變動；正在打字時先不重繪，離開輸入框再更新畫面。
 * 合併：行程本體是同一份文件，收到別人的版本時用 mergeTrip() 和本機尚未上傳的修改逐項合併，
 *       只有兩人同時改到同一個景點／旅伴時，才以本機為準。
 * ========================================================================== */

const sync = {
  db: null,
  tripRef: null,
  status: sharedTripId ? 'connecting' : 'local', // local | connecting | synced | saving | offline | error
  message: '',
  timer: null,
  loaded: { trip: false, expenses: false }, // 兩邊都收到第一次資料後才開始上傳
  lastTripJson: '',
  baseTrip: null,            // 上次和雲端一致的行程本體，合併時用來判斷哪邊有修改
  syncedExpenses: new Map(), // expenseId -> 雲端目前內容（stableStringify）
  copiedTimer: null,
  expireAt: null,            // 雲端資料到期日（Date）
  needsExpiryBackfill: false // 舊的共享行程沒有 expireAt，載入後補上
};

function isSyncReady() {
  return Boolean(sync.tripRef && sync.loaded.trip && sync.loaded.expenses);
}

// 物件 key 排序後再轉字串，避免 Firestore 回傳的欄位順序不同被誤判成有變動
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function pickTripData(source) {
  return {
    tripName: source.tripName || '',
    startDate: source.startDate || '',
    days: source.days,
    travelMode: source.travelMode || TRAVEL_MODES[0].value,
    legModes: source.legModes || {},
    legDetails: source.legDetails || {},
    members: source.members,
    todos: source.todos || []
  };
}

function pickExpense(x) {
  return { id: x.id, ref: x.ref, title: x.title || '', amount: Number(x.amount) || 0, paidBy: x.paidBy, split: x.split };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`無法載入 ${src}`));
    document.head.append(script);
  });
}

async function initFirebase() {
  if (sync.db) return sync.db;
  await loadScript(`${FIREBASE_SDK}/firebase-app-compat.js`);
  await loadScript(`${FIREBASE_SDK}/firebase-firestore-compat.js`);
  const app = firebase.initializeApp(FIREBASE_CONFIG);
  sync.db = firebase.firestore(app);
  sync.db.settings({ ignoreUndefinedProperties: true });
  return sync.db;
}

function setSyncStatus(status, message = '') {
  sync.status = status;
  sync.message = message;
  renderSyncBar();
}

// ---------- 寫入 ----------
function queueCloudSave() {
  if (!isSyncReady()) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(flushCloudSave, 400);
  if (sync.status !== 'offline') setSyncStatus('saving');
}

async function flushCloudSave() {
  sync.timer = null;
  const batch = sync.db.batch();
  let writes = 0;

  const trip = pickTripData(state);
  const tripJson = stableStringify(trip);
  if (tripJson !== sync.lastTripJson) {
    // mergeFields：這些欄位整個覆寫，其他欄位（createdAt、expireAt）保留。
    // 不能用 merge: true——它會逐層合併 map，legModes／legDetails 刪掉的項目在雲端不會消失，
    // 下次同步又被合併回來（例如「重設回 API 預設值」後又變回自訂交通）
    const fields = { ...trip, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    batch.set(sync.tripRef, fields, { mergeFields: Object.keys(fields) });
    sync.lastTripJson = tripJson;
    sync.baseTrip = JSON.parse(JSON.stringify(trip));
    writes++;
  }

  const expensesRef = sync.tripRef.collection('expenses');
  const current = new Map(state.expenses.map(x => [x.id, pickExpense(x)]));
  current.forEach((expense, id) => {
    const json = stableStringify(expense);
    if (sync.syncedExpenses.get(id) === json) return;
    batch.set(expensesRef.doc(id), withExpiry(expense));
    sync.syncedExpenses.set(id, json);
    writes++;
  });
  [...sync.syncedExpenses.keys()].forEach(id => {
    if (current.has(id)) return;
    batch.delete(expensesRef.doc(id));
    sync.syncedExpenses.delete(id);
    writes++;
  });

  if (!writes) {
    if (sync.status === 'saving') setSyncStatus('synced');
    return;
  }
  try {
    await batch.commit(); // 離線時會等恢復連線、寫入雲端後才完成
    if (!sync.timer && sync.status !== 'error') setSyncStatus('synced');
  } catch (err) {
    console.warn('Firestore write:', err);
    setSyncStatus('error', '儲存到雲端失敗，請檢查 Firestore 安全規則或網路連線');
  }
}

// ---------- 讀取 ----------
async function joinSharedTrip() {
  if (!FIREBASE_CONFIG) {
    setSyncStatus('error', '這是共享行程連結，但網站還沒設定雲端同步（FIREBASE_CONFIG）');
    return;
  }
  try {
    await initFirebase();
  } catch (err) {
    setSyncStatus('error', '無法載入雲端同步元件，請檢查網路連線');
    return;
  }
  sync.tripRef = sync.db.collection('trips').doc(sharedTripId);
  sync.tripRef.onSnapshot(onTripSnapshot, onSyncError);
  sync.tripRef.collection('expenses').onSnapshot(onExpensesSnapshot, onSyncError);
}

function onSyncError(err) {
  console.warn('Firestore listen:', err);
  setSyncStatus('error', err.code === 'permission-denied'
    ? '沒有權限讀取這個行程，請檢查 Firestore 安全規則'
    : '和雲端的連線中斷，請重新整理頁面');
}

function onTripSnapshot(doc) {
  if (!doc.exists) {
    setSyncStatus('error', '找不到這個共享行程，請確認連結是否完整');
    return;
  }
  if (doc.metadata.hasPendingWrites) return; // 自己剛寫入的變動，畫面早就是最新的
  const data = doc.data();
  const expireAt = data.expireAt?.toDate?.();
  if (expireAt) {
    sync.expireAt = expireAt;
  } else if (!sync.expireAt) {
    // 舊的共享行程：以建立時間起算 30 天，並補寫 expireAt 讓 TTL 生效
    sync.expireAt = addDaysToDate(data.createdAt?.toDate?.() || new Date(), CLOUD_RETENTION_DAYS);
    sync.needsExpiryBackfill = true;
  }
  const remote = pickTripData(data);
  if (!Array.isArray(remote.days) || !remote.days.length || !Array.isArray(remote.members)) return;
  const remoteJson = stableStringify(remote);
  // 第一次載入以雲端為準；之後和本機還沒上傳的修改合併
  const next = sync.loaded.trip ? mergeTrip(sync.baseTrip, pickTripData(state), remote) : remote;
  Object.assign(state, JSON.parse(JSON.stringify(next)));
  normalizeState(state);
  sync.baseTrip = JSON.parse(remoteJson);
  sync.lastTripJson = remoteJson;
  sync.loaded.trip = true;
  if (stableStringify(pickTripData(state)) !== remoteJson) queueCloudSave(); // 本機有雲端還沒有的修改
  applyRemoteChange();
}

// 三方合併：base 是上次和雲端一致的版本。每個景點、旅伴、路段設定各自比較，
// 只有一邊改過就取那一邊；兩邊都改過以本機為準。清單順序也一樣，並保留另一邊新增或刪除的項目。
function mergeTrip(base, local, remote) {
  const same = (a, b) => stableStringify(a) === stableStringify(b);
  const pick = (b, l, r) => (same(l, b) ? r : l);
  const mergeIds = (b, l, r) => {
    if (same(l, b)) return r.slice();
    if (same(r, b)) return l.slice();
    const inBase = new Set(b);
    const inLocal = new Set(l);
    const inRemote = new Set(r);
    const out = l.filter(id => !(inBase.has(id) && !inRemote.has(id))); // 拿掉對方刪除的
    r.forEach(id => { if (!inBase.has(id) && !inLocal.has(id)) out.push(id); }); // 加上對方新增的
    return out;
  };
  const mergeMap = (b = {}, l = {}, r = {}) => {
    const out = {};
    new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]).forEach(key => {
      const value = pick(b[key], l[key], r[key]);
      if (value !== undefined) out[key] = value;
    });
    return out;
  };
  const flatten = trip => {
    const spots = {};
    const lists = {};
    trip.days.forEach(day => {
      lists[day.id] = day.spots.map(s => s.id);
      day.spots.forEach(s => { spots[s.id] = s; });
    });
    return { order: trip.days.map(d => d.id), lists, spots };
  };
  if (!base) return remote;
  const B = flatten(base);
  const L = flatten(local);
  const R = flatten(remote);
  const spots = mergeMap(B.spots, L.spots, R.spots);
  const placed = new Set();
  // 每天的備註各自比較
  const metaOf = trip => Object.fromEntries(trip.days.map(d => [d.id, { note: d.note || '', detailedNotes: d.detailedNotes || '' }]));
  const dayMeta = mergeMap(metaOf(base), metaOf(local), metaOf(remote));
  const days = mergeIds(B.order, L.order, R.order).map(id => ({
    id,
    note: dayMeta[id]?.note || '',
    detailedNotes: dayMeta[id]?.detailedNotes || '',
    spots: mergeIds(B.lists[id] || [], L.lists[id] || [], R.lists[id] || [])
      .filter(spotId => spots[spotId] && !placed.has(spotId) && placed.add(spotId))
      .map(spotId => spots[spotId])
  }));
  const byId = list => Object.fromEntries(list.map(m => [m.id, m]));
  const members = mergeMap(byId(base.members), byId(local.members), byId(remote.members));
  return {
    tripName: pick(base.tripName, local.tripName, remote.tripName),
    startDate: pick(base.startDate, local.startDate, remote.startDate),
    days: days.length ? days : remote.days,
    travelMode: pick(base.travelMode, local.travelMode, remote.travelMode),
    legModes: mergeMap(base.legModes, local.legModes, remote.legModes),
    legDetails: mergeMap(base.legDetails, local.legDetails, remote.legDetails),
    members: mergeIds(base.members.map(m => m.id), local.members.map(m => m.id), remote.members.map(m => m.id))
      .filter(id => members[id]).map(id => members[id]),
    // 待辦：每一項各自比較，兩人同時新增不同項目都會保留
    todos: (() => {
      const [b, l, r] = [base.todos || [], local.todos || [], remote.todos || []];
      const items = mergeMap(byId(b), byId(l), byId(r));
      return mergeIds(b.map(t => t.id), l.map(t => t.id), r.map(t => t.id)).filter(id => items[id]).map(id => items[id]);
    })()
  };
}

function onExpensesSnapshot(snap) {
  if (!sync.loaded.expenses) {
    // 第一次：以雲端為準，取代快取裡可能過期的花費
    state.expenses = snap.docs.map(d => pickExpense({ ...d.data(), id: d.id }));
    sync.syncedExpenses = new Map(state.expenses.map(x => [x.id, stableStringify(x)]));
    sync.loaded.expenses = true;
    if (sync.needsExpiryBackfill) backfillExpiry(snap.docs.map(d => d.ref));
    applyRemoteChange();
    return;
  }
  let changed = false;
  snap.docChanges().forEach(change => {
    if (change.doc.metadata.hasPendingWrites) return;
    const id = change.doc.id;
    const local = state.expenses.find(x => x.id === id);
    // 這筆正在本機編輯、還沒上傳，先不要被雲端的舊內容蓋掉
    if (local && sync.timer && stableStringify(pickExpense(local)) !== sync.syncedExpenses.get(id)) return;
    if (change.type === 'removed') {
      state.expenses = state.expenses.filter(x => x.id !== id);
      sync.syncedExpenses.delete(id);
    } else {
      const expense = pickExpense({ ...change.doc.data(), id });
      if (local) Object.assign(local, expense);
      else state.expenses.push(expense);
      sync.syncedExpenses.set(id, stableStringify(expense));
    }
    changed = true;
  });
  if (changed) applyRemoteChange();
}

function applyRemoteChange() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
  } catch {}
  if (isSyncReady() && sync.status === 'connecting') setSyncStatus(navigator.onLine ? 'synced' : 'offline');
  // 正在打字時整個重繪會讓輸入框失去焦點：先只更新金額，離開輸入框後再重繪
  const active = document.activeElement;
  if (active?.matches('input, textarea') && active.closest('.sidebar, .members, .trip-meta')) {
    ui.renderOnBlur = true;
    refreshMoneyViews();
  } else {
    render();
  }
}

document.addEventListener('focusout', () => {
  if (!ui.renderOnBlur) return;
  setTimeout(() => {
    if (document.activeElement?.matches('input, textarea') && document.activeElement.closest('.sidebar, .members, .trip-meta')) return;
    ui.renderOnBlur = false;
    render();
  }, 0);
});

window.addEventListener('offline', () => {
  if (sharedTripId && sync.status !== 'error') setSyncStatus('offline');
});
window.addEventListener('online', () => {
  if (sharedTripId && sync.status === 'offline') setSyncStatus(sync.timer ? 'saving' : 'synced');
});

// 換到另一個行程連結時重新載入
window.addEventListener('hashchange', () => {
  if (getTripIdFromHash() !== sharedTripId) location.reload();
});

// ---------- 建立 / 離開共享行程 ----------
function addDaysToDate(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

// 寫進雲端的資料都帶上 expireAt，Firestore TTL 到期會自動刪除
function withExpiry(data) {
  return sync.expireAt ? { ...data, expireAt: firebase.firestore.Timestamp.fromDate(sync.expireAt) } : data;
}

function backfillExpiry(expenseRefs) {
  sync.needsExpiryBackfill = false;
  const batch = sync.db.batch();
  const expireAt = firebase.firestore.Timestamp.fromDate(sync.expireAt);
  batch.set(sync.tripRef, { expireAt }, { merge: true });
  expenseRefs.forEach(ref => batch.set(ref, { expireAt }, { merge: true }));
  batch.commit().catch(err => console.warn('Firestore expiry backfill:', err));
}

// 雲端保存剩餘天數；不是共享行程時回傳 null
function getCloudDaysLeft() {
  if (!sharedTripId || !sync.expireAt) return null;
  return Math.max(0, Math.ceil((sync.expireAt - Date.now()) / 86400000));
}

async function startSharing() {
  if (!FIREBASE_CONFIG || sharedTripId) return;
  setSyncStatus('connecting', '正在建立共享行程…');
  try {
    const db = await initFirebase();
    const tripRef = db.collection('trips').doc();
    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    sync.expireAt = addDaysToDate(new Date(), CLOUD_RETENTION_DAYS);
    batch.set(tripRef, withExpiry({ ...pickTripData(state), createdAt: now, updatedAt: now }));
    state.expenses.filter(x => x.amount > 0).forEach(x => batch.set(tripRef.collection('expenses').doc(x.id), withExpiry(pickExpense(x))));
    await batch.commit();
    // 目前的個人行程複製一份成為共享行程，個人行程保持原樣
    localStorage.setItem(`${STATE_STORAGE}:trip-${tripRef.id}`, JSON.stringify(state));
    location.hash = `trip-${tripRef.id}`;
  } catch (err) {
    console.warn('Firestore create:', err);
    setSyncStatus('local');
    alert('建立共享行程失敗，請確認 Firestore 已建立並設定好安全規則。');
  }
}

function leaveSharedTrip() {
  const ok = confirm('回到只存在這台裝置的個人行程？\n共享行程不會被刪除，之後用原本的連結就能再打開。');
  if (!ok) return;
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}

async function copyShareLink(btn) {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = '已複製';
    clearTimeout(sync.copiedTimer);
    sync.copiedTimer = setTimeout(renderSyncBar, 2000);
  } catch {
    prompt('複製這個連結，傳給一起旅行的人：', url);
  }
}

function renderSyncBar() {
  const el = document.getElementById('sync-bar');
  // 同步狀態收在設定選單裡；共享行程時在齒輪上加一個狀態點，出問題時一眼看得到
  const indicator = document.getElementById('sync-indicator');
  indicator.hidden = !sharedTripId;
  indicator.className = `sync-indicator ${sync.status}`;
  renderCloudTtl(); // 雲端到期日在第一次載入後才知道
  document.getElementById('avatar-btn').dataset.sync = sharedTripId ? sync.status : ''; // 手機版顯示在旅伴頭像上
  if (!sharedTripId) {
    el.className = 'sync-bar local';
    el.innerHTML = FIREBASE_CONFIG
      ? `<span class="sync-text">${sync.status === 'connecting' ? escapeHtml(sync.message) : '行程只存在這台裝置'}</span>
         <button class="sync-btn primary" data-action="start-sharing" ${sync.status === 'connecting' ? 'disabled' : ''}>建立共享連結</button>`
      : `<span class="sync-text">行程只存在這台裝置</span>
         <a class="sync-btn" href="https://github.com/Lyn0U0/clock/blob/claude/amazing-hopper-a3rihm/trip-planner/README.md#雲端同步"
           target="_blank" rel="noopener" title="管理者在 app.js 設定 Firebase 後即可共享">如何開啟雲端同步</a>`;
    return;
  }
  const texts = {
    connecting: '正在載入共享行程…',
    synced: '已同步・拿到連結的人都能一起編輯',
    saving: '儲存中…',
    offline: '離線中，恢復連線後會自動同步',
    error: sync.message
  };
  el.className = `sync-bar shared ${sync.status}`;
  el.innerHTML = `
    <span class="sync-dot" aria-hidden="true"></span>
    <span class="sync-text" role="status">${escapeHtml(texts[sync.status] || '')}</span>
    <button class="sync-btn primary" data-action="copy-link">複製連結</button>
    <button class="sync-btn" data-action="leave-trip">離開</button>`;
}


/* ==========================================================================
 * 9b. 雲端保存期限與下載保存
 *
 *   - 共享行程的雲端資料保留 30 天：導覽列顯示「⏳ 雲端保存剩餘 X 天」，剩 3 天內改成珊瑚紅提醒。
 *   - 旅程最後一天過後，頂端出現提醒卡片，引導下載保存（可以關掉，每趟旅程只問一次）。
 *   - 「💾 結束並下載旅程」：HTML 離線手帳、PDF（列印成 A4）、JSON 原始資料（可再匯入）。
 *     三種格式都用 buildHandbook() 產生同一份內容：每日行程、圖示與備註、交通與轉乘、記帳與結算。
 * ========================================================================== */

const MODE_EMOJI = { DRIVE: '🚗', TWO_WHEELER: '🛵', TRANSIT: '🚆', WALK: '🚶', BICYCLE: '🚲', CUSTOM: '🎫' };
const ENDED_DISMISS_STORAGE = 'trip-planner-ended-dismissed';

function renderCloudTtl() {
  const el = document.getElementById('cloud-ttl');
  const days = getCloudDaysLeft();
  el.hidden = days === null;
  if (days === null) return;
  el.classList.toggle('urgent', days <= 3);
  el.textContent = days > 0 ? `⏳ 雲端保存剩餘 ${days} 天` : '⏳ 雲端資料今天到期';
  el.title = `共享行程會在 ${sync.expireAt?.toLocaleDateString('zh-TW') || ''} 從雲端刪除，請在那之前下載保存`;
}

function getTripEndDate() {
  return state.startDate ? getDayDate(state.days.length - 1) : null;
}

function isTripEnded() {
  const end = getTripEndDate();
  if (!end) return false;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()) > end;
}

function getTripKey() {
  return sharedTripId ? `trip-${sharedTripId}` : `local-${state.startDate}`;
}

function isEndedDismissed() {
  try {
    return JSON.parse(localStorage.getItem(ENDED_DISMISS_STORAGE) || '[]').includes(getTripKey());
  } catch {
    return false;
  }
}

function dismissTripEnded() {
  try {
    const list = JSON.parse(localStorage.getItem(ENDED_DISMISS_STORAGE) || '[]');
    localStorage.setItem(ENDED_DISMISS_STORAGE, JSON.stringify([...new Set([...list, getTripKey()])].slice(-50)));
  } catch {}
  renderTripEnded(true);
}

function renderTripEnded(forceHide = false) {
  const el = document.getElementById('trip-ended');
  const show = !forceHide && isTripEnded() && !isEndedDismissed();
  el.hidden = !show;
  if (!show) return;
  const days = getCloudDaysLeft();
  const name = state.tripName.trim() || DEFAULT_TRIP_NAME;
  el.innerHTML = `
    <span class="trip-ended-emoji" aria-hidden="true">🎒</span>
    <div class="trip-ended-text">
      <strong>「${escapeHtml(name)}」已經結束了，辛苦了！</strong>
      <span>${days !== null ? `雲端資料會在 ${days} 天後刪除，` : ''}把 ${state.days.length} 天的行程與記帳下載保存，留作紀念吧。</span>
    </div>
    <button class="btn-primary" data-action="open-export">💾 下載保存</button>
    <button class="icon-btn" data-action="dismiss-ended" aria-label="關閉提醒" title="關閉提醒">${ICONS.close}</button>`;
}

// ---------- 匯出內容 ----------
function getLegExport(from, to) {
  const mode = getLegMode(from, to);
  const leg = legCache.get(getLegKey(from, to, mode.value));
  const ok = leg?.status === 'ok';
  return {
    from: from.id,
    to: to.id,
    mode: mode.value,
    modeLabel: mode.label,
    durationSec: ok ? leg.durationSec : null,
    distanceMeters: ok ? leg.distanceMeters : null,
    description: ok ? leg.description : '',
    transitSteps: ok ? leg.transitSteps || [] : [],
    // 自訂資訊（transportMode 即 mode）
    customDuration: getLegDetail(from, to)?.noTime ? null : getLegDetail(from, to)?.customDuration || null,
    noTime: Boolean(getLegDetail(from, to)?.noTime),
    unconfirmed: Boolean(getLegDetail(from, to)?.unconfirmed),
    transitNote: getLegDetail(from, to)?.transitNote || '',
    cost: getLegCost(getLegDetail(from, to))?.amount ?? null,
    currency: getLegCost(getLegDetail(from, to))?.currency || null,
    paidBy: getLegDetail(from, to)?.paidBy || null,
    inSettlement: Boolean(getLegCost(getLegDetail(from, to))?.inSettlement)
  };
}

function getMemberNameById(id) {
  return getMemberName(getMember(id));
}

function buildExportData() {
  const legs = state.days.flatMap(day => getDayLegs(day).map(({ from, to }) => getLegExport(from, to)));
  const r = computeSettlement();
  return {
    format: 'trip-planner-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    trip: {
      tripName: state.tripName,
      startDate: state.startDate,
      days: state.days,
      members: state.members,
      travelMode: state.travelMode,
      legModes: state.legModes || {},
      legDetails: state.legDetails || {},
      expenses: state.expenses.filter(x => x.amount > 0),
      todos: state.todos
    },
    legs,
    settlement: {
      total: r.total,
      sharedTotal: r.sharedTotal,
      personalTotal: r.personalTotal,
      members: r.rows.map(row => ({ name: getMemberName(row.member), paid: row.paid, share: row.share, net: row.net, personal: row.personal })),
      transfers: r.transfers.map(t => ({ from: getMemberName(t.from), to: getMemberName(t.to), amount: t.amount }))
    }
  };
}

function renderHandbookExpenses(ref) {
  const items = getExpensesFor(ref).filter(x => x.amount > 0);
  if (!items.length) return '';
  return `<ul class="hb-expenses">${items.map(x => `
      <li><span>${escapeHtml(x.title || '花費')}</span><span class="hb-who">${escapeHtml(getMemberNameById(x.paidBy))} 付・${x.split === 'shared' ? getSharedLabel() : '個人自付'}</span><strong>${formatMoney(x.amount)}</strong></li>`).join('')}</ul>`;
}

function renderHandbookLeg(from, to, print) {
  const leg = getLegExport(from, to);
  const apiTime = leg.durationSec !== null ? `${formatDuration(leg.durationSec)}・${formatDistance(leg.distanceMeters)}` : '';
  const time = leg.noTime
    ? `${escapeHtml(leg.modeLabel)}${leg.distanceMeters ? `・${formatDistance(leg.distanceMeters)}` : ''}（不計時間）`
    : leg.customDuration
    ? `${formatDuration(leg.customDuration * 60)}（手動）${apiTime ? `<small class="hb-api">Google 預估 ${apiTime}</small>` : ''}`
    : apiTime || '交通時間未計算';
  const extra = [leg.unconfirmed && `<span class="hb-tag hb-pending">？待確認</span>`, leg.transitNote && `<span class="hb-tag">${escapeHtml(leg.transitNote).replace(/\n/g, '<br>')}</span>`,
    leg.cost && !leg.inSettlement && `<span class="hb-tag">票價 ${formatCurrency(leg.cost, leg.currency)}</span>`].filter(Boolean).join('');
  const steps = leg.transitSteps.length ? `
      <details class="hb-transit" ${print ? 'open' : ''}>
        <summary>轉乘細節</summary>
        <ol>${leg.transitSteps.map(step => step.type === 'walk'
          ? `<li class="hb-walk">🚶 步行 ${formatDuration(step.sec)}（${formatDistance(step.meters)}）</li>`
          : `<li class="hb-ride"><span class="hb-line">${escapeHtml(step.vehicle)} ${escapeHtml(step.line)}${step.trip ? ` 車次 ${escapeHtml(step.trip)}` : ''}</span>
              ${escapeHtml(step.from)} ➔ ${escapeHtml(step.to)}<small>${[step.departTime && `${escapeHtml(step.departTime)} 上車`, step.stops && `${step.stops} 站`, formatDuration(step.sec)].filter(Boolean).join('・')}</small></li>`).join('')}
        </ol>
      </details>` : '';
  return `<li class="hb-leg"><span class="hb-leg-mode">${MODE_EMOJI[leg.mode] || '🚌'} ${leg.modeLabel}</span><span class="hb-leg-time">${time}</span>${extra ? `<div class="hb-tags">${extra}</div>` : ''}${steps}
      ${renderHandbookExpenses(getLegRef(from, to))}</li>`;
}

// 產生旅行手帳（HTML 離線檔與 PDF 共用）；print 為 true 時轉乘細節全部展開
function buildHandbook({ print = false } = {}) {
  const r = computeSettlement();
  const name = state.tripName.trim() || DEFAULT_TRIP_NAME;
  const range = state.startDate ? `${getDayDateText(0)} – ${getDayDateText(state.days.length - 1)}` : '未設定日期';
  const members = state.members.map(getMemberName).join('、');
  const days = state.days.map((day, i) => {
    const date = getDayDateText(i);
    const travel = renderDayTravel(day);
    const items = day.spots.map((spot, j) => {
      const next = day.spots[j + 1];
      const card = `<li class="hb-spot">
          <span class="hb-icon" style="background:${spot.icon ? '#FFFFFF' : getDayColor(i)}">${renderSpotIcon(spot.icon, j + 1)}</span>
          <div class="hb-spot-body">
            <h3>${spot.time ? `<span class="hb-time ${spot.reserved ? 'reserved' : ''}">${spot.reserved ? '預約 ' : ''}${spot.time}</span>` : ''}${escapeHtml(spot.name)}${spot.tentative ? '<span class="hb-tag hb-pending">？待確認</span>' : ''}</h3>
            ${spot.note.trim() ? `<p class="hb-note">${escapeHtml(spot.note.trim())}</p>` : ''}
            ${spot.detailedNotes.trim() ? `<div class="hb-detail">${renderNoteText(spot.detailedNotes)}</div>` : ''}
            ${renderHandbookExpenses(getSpotRef(spot))}
          </div>
        </li>`;
      return next ? card + renderHandbookLeg(spot, next, print) : card;
    }).join('');
    return `<section class="hb-day" id="day-${i + 1}" style="--c:${getDayColor(i)}">
        <h2><span class="hb-dot"></span>${getDayLabel(i)}${date ? `<small>${date}</small>` : ''}</h2>
        <p class="hb-day-sum">${day.spots.length} 個景點${travel ? `・${travel}` : ''}</p>
        ${day.note.trim() ? `<p class="hb-note hb-day-note">${escapeHtml(day.note.trim())}</p>` : ''}
        ${day.detailedNotes.trim() ? `<div class="hb-detail hb-day-note">${renderNoteText(day.detailedNotes)}</div>` : ''}
        ${day.spots.length ? `<ol class="hb-timeline">${items}</ol>` : '<p class="hb-empty">這天沒有安排景點</p>'}
      </section>`;
  }).join('');
  const verdict = !r.count
    ? '沒有記錄花費'
    : r.transfers.length
      ? r.transfers.map(t => `<p><strong>${escapeHtml(getMemberName(t.from))}</strong> 需轉帳給 <strong>${escapeHtml(getMemberName(t.to))}</strong> <span class="hb-amount">${formatMoney(t.amount)}</span></p>`).join('')
      : `<p>${state.members.length === 1 ? '只有一位旅伴，不需要轉帳' : '帳目已平衡，不需要轉帳'}</p>`;
  const rows = r.rows.map(row => `<tr><th>${escapeHtml(getMemberName(row.member))}</th><td>${formatMoney(row.paid)}</td><td>${formatMoney(row.share)}</td>
      <td class="${row.net > 0.5 ? 'plus' : row.net < -0.5 ? 'minus' : ''}">${row.net > 0.5 ? `應收 ${formatMoney(row.net)}` : row.net < -0.5 ? `應付 ${formatMoney(-row.net)}` : '已結清'}</td><td>${formatMoney(row.personal)}</td></tr>`).join('');
  const toc = state.days.map((d, i) => `<a href="#day-${i + 1}">${getDayLabel(i)}${getDayDateText(i, false) ? ` ${getDayDateText(i, false)}` : ''}</a>`).join('');
  return `
    <header class="hb-cover">
      <p class="hb-eyebrow">旅行手帳</p>
      <h1>${escapeHtml(name)}</h1>
      <p class="hb-meta">${range}・${state.days.length} 天・${countSpots()} 個景點</p>
      <p class="hb-meta">旅伴：${escapeHtml(members)}</p>
      <nav class="hb-toc">${toc}<a href="#settle">旅費結算</a></nav>
    </header>
    ${days}
    ${state.todos.length ? `<section class="hb-settle hb-todos" id="todos">
      <h2>📒 待辦清單</h2>
      <ul>${state.todos.map(t => `<li class="${t.done ? 'done' : ''}"><span aria-hidden="true">${t.done ? '☑' : '☐'}</span>${escapeHtml(t.text)}</li>`).join('')}</ul>
    </section>` : ''}
    <section class="hb-settle" id="settle">
      <h2>💰 旅費結算</h2>
      <div class="hb-verdict"><p class="hb-eyebrow">結算建議</p>${verdict}</div>
      <p class="hb-total">全程總支出 <strong>${formatMoney(r.total)}</strong></p>
      <p class="hb-meta">${getSharedLabel()}公費 ${formatMoney(r.sharedTotal)}・個人自付 ${formatMoney(r.personalTotal)}・景點 ${formatMoney(r.spotTotal)}・交通 ${formatMoney(r.legTotal)}</p>
      <table class="hb-table"><thead><tr><th>旅伴</th><th>代墊公費</th><th>應負擔</th><th>淨額</th><th>個人自付</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
    <footer class="hb-foot">由旅遊行程規劃匯出・${new Date().toLocaleString('zh-TW')}</footer>`;
}

const HANDBOOK_CSS = `
.hb { --ink:#18181B; --muted:#6F685F; --edge:#D8D0C0; --paper:#FFFFFF; --bg:#FAF6EE; --yellow:#FDE047; --yellow-soft:#FEF9C3;
  font-family:"Noto Sans TC",system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); line-height:1.6; }
.hb * { box-sizing:border-box; }
.hb-page { max-width:760px; margin:0 auto; padding:32px 20px 56px; display:flex; flex-direction:column; gap:20px; }
.hb h1 { margin:4px 0 6px; font-size:30px; font-weight:900; text-wrap:balance; }
.hb h2 { display:flex; align-items:baseline; gap:10px; margin:0; font-size:20px; font-weight:900; }
.hb h2 small { font-size:14px; font-weight:700; color:var(--muted); }
.hb h3 { margin:0; font-size:15px; font-weight:900; }
.hb-eyebrow { display:inline-block; margin:0; padding:2px 10px; border-radius:999px; background:var(--ink); color:var(--paper); font-size:12px; font-weight:900; letter-spacing:.08em; }
.hb-meta { margin:2px 0 0; font-size:13px; color:var(--muted); font-weight:500; }
.hb-cover, .hb-day, .hb-settle { padding:20px; border:2px solid var(--ink); border-radius:16px; background:var(--paper); }
.hb-cover { background:var(--yellow-soft); box-shadow:4px 4px 0 var(--ink); }
.hb-toc { display:flex; flex-wrap:wrap; gap:6px; margin-top:14px; }
.hb-toc a { padding:3px 12px; border:1.5px solid var(--ink); border-radius:999px; background:var(--paper); color:var(--ink); font-size:12px; font-weight:700; text-decoration:none; }
.hb-dot { width:12px; height:12px; border-radius:50%; background:var(--c); box-shadow:0 0 0 1.5px var(--ink); flex-shrink:0; align-self:center; }
.hb-day-sum { margin:2px 0 12px 22px; font-size:12px; color:var(--muted); font-weight:700; }
.hb-timeline { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.hb-spot { display:flex; gap:12px; padding:10px 12px; border:1.5px solid var(--edge); border-radius:12px; break-inside:avoid; }
.hb-icon svg { width:24px; height:24px; }
.hb-icon { flex-shrink:0; display:grid; place-items:center; width:30px; height:30px; border-radius:50%; box-shadow:inset 0 0 0 1.5px var(--ink); font-size:14px; font-weight:900; }
.hb-spot-body { flex:1; min-width:0; }
.hb-note { margin:4px 0 0; padding:6px 10px; border-radius:8px; background:var(--yellow-soft); font-size:13px; font-weight:700; }
.hb-detail img { display:block; max-width:100%; max-height:320px; margin:6px 0; border:1.5px solid var(--ink); border-radius:8px; }
.hb-detail .note-img { display:inline-block; }
.hb-detail { margin:6px 0 0; padding:8px 10px; border:1.5px dashed var(--edge); border-radius:8px; font-size:12.5px; }
.hb-day-note { margin:0 0 10px 22px; }
.hb-time { display:inline-block; margin-right:8px; padding:0 8px; border:1.5px solid var(--ink); border-radius:999px; font-size:12px; font-variant-numeric:tabular-nums; }
.hb-time.reserved { background:#FFE4E6; color:#E11D48; border-color:#E11D48; }
.hb-detail p { margin:0 0 4px; } .hb-detail ul { margin:0 0 4px; padding-left:18px; } .hb-detail a { color:#2563EB; word-break:break-all; }
.hb-leg { margin-left:26px; padding:8px 0 8px 18px; border-left:2px dashed #A8A090; font-size:13px; break-inside:avoid; }
.hb-leg-mode { font-weight:700; margin-right:8px; }
.hb-leg-time { font-weight:900; }
.hb-api { margin-left:6px; font-weight:500; color:var(--muted); text-decoration:line-through; }
.hb-tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.hb-pending { background:#FFEDD5; color:#9A3412; border-color:#EA580C; border-style:dashed; margin-left:6px; vertical-align:middle; }
.hb-tag { padding:1px 8px; border:1.5px solid var(--ink); border-radius:999px; background:var(--yellow-soft); font-size:12px; font-weight:700; }
.hb-transit { margin-top:6px; }
.hb-transit summary { cursor:pointer; font-size:12px; font-weight:700; color:var(--muted); }
.hb-transit ol { list-style:none; margin:6px 0 0; padding:8px 10px; border:1.5px solid var(--ink); border-radius:10px; background:var(--paper); display:flex; flex-direction:column; gap:6px; }
.hb-ride { font-weight:900; }
.hb-ride small { display:block; font-size:11px; font-weight:500; color:var(--muted); }
.hb-line { display:inline-block; margin-right:6px; padding:0 8px; border:1.5px solid var(--ink); border-radius:999px; background:var(--yellow-soft); font-size:12px; }
.hb-walk { color:var(--muted); font-weight:500; }
.hb-expenses { list-style:none; margin:6px 0 0; padding:0; font-size:12px; }
.hb-expenses li { display:flex; gap:8px; align-items:baseline; padding:2px 0; border-top:1px dashed var(--edge); }
.hb-expenses li span:first-child { flex:1; }
.hb-who { color:var(--muted); }
.hb-empty { margin:0; color:var(--muted); font-size:13px; }
.hb-verdict { margin:12px 0; padding:14px 16px; border:2px solid var(--ink); border-radius:12px; background:var(--yellow-soft); }
.hb-verdict p { margin:6px 0 0; font-size:16px; font-weight:700; }
.hb-amount { display:inline-block; margin-left:6px; padding:0 10px; border:2px solid var(--ink); border-radius:10px; background:var(--yellow); font-weight:900; }
.hb-total { margin:0; font-size:15px; }
.hb-total strong { font-size:22px; font-weight:900; }
.hb-table { width:100%; margin-top:12px; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums; }
.hb-table th, .hb-table td { padding:7px 6px; text-align:right; border-bottom:1px solid var(--edge); white-space:nowrap; }
.hb-table th:first-child { text-align:left; }
.hb-table thead th { font-size:11px; color:var(--muted); }
.hb-table .plus { color:#15803D; font-weight:900; }
.hb-table .minus { color:#E11D48; font-weight:900; }
.hb-todos ul { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:4px; font-size:14px; }
.hb-todos li { display:flex; gap:8px; } .hb-todos li.done { color:var(--muted); text-decoration:line-through; }
.hb-foot { text-align:center; font-size:11px; color:var(--muted); }
@media (max-width:520px) { .hb-page { padding:16px 12px 40px; } .hb-cover, .hb-day, .hb-settle { padding:14px; } .hb-table { display:block; overflow-x:auto; } }
@media print {
  .hb { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .hb-page { max-width:none; padding:0; gap:12px; }
  .hb-cover, .hb-day, .hb-settle { box-shadow:none; border-width:1.5px; padding:14px 16px; }
  .hb-toc { display:none; }
  .hb-day { break-inside:auto; }
  .hb-settle { break-inside:avoid; }
}`;

// ---------- 下載 ----------
function getExportFileName(ext) {
  const name = (state.tripName.trim() || DEFAULT_TRIP_NAME).replace(/[\\/:*?"<>|]+/g, '');
  return `${name}${state.startDate ? `-${state.startDate}` : ''}.${ext}`;
}

function downloadFile(content, fileName, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function buildOfflineHtml() {
  const name = escapeHtml(state.tripName.trim() || DEFAULT_TRIP_NAME);
  // 原始資料一併嵌入，日後可以從這個檔案取回 JSON
  const data = JSON.stringify(buildExportData()).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name}・旅行手帳</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>html,body{margin:0;}${HANDBOOK_CSS}</style>
</head>
<body class="hb">
<main class="hb-page">${buildHandbook()}</main>
<script type="application/json" id="trip-data">${data}</script>
</body>
</html>`;
}

function setExportStatus(text) {
  const el = document.getElementById('export-status');
  el.hidden = !text;
  el.textContent = text || '';
}

async function runExport(kind) {
  const buttons = document.querySelectorAll('[data-export]');
  buttons.forEach(b => { b.disabled = true; });
  setExportStatus('整理交通與轉乘資料中…');
  try {
    await ensureAllLegs();
    if (kind === 'html') {
      await downloadFile(buildOfflineHtml(), getExportFileName('html'), 'text/html;charset=utf-8');
      setExportStatus('已下載 HTML 離線手帳，用瀏覽器打開就能離線閱讀');
    } else if (kind === 'json') {
      await downloadFile(JSON.stringify(buildExportData(), null, 2), getExportFileName('json'), 'application/json');
      setExportStatus('已下載 JSON 備份，之後可以從設定選單「匯入 JSON 備份」還原');
    } else if (kind === 'pdf') {
      printHandbook();
      setExportStatus('已開啟列印視窗：目的地選「另存為 PDF」，紙張 A4 直式');
    }
  } catch (err) {
    setExportStatus(err?.code === 'declined' ? '已取消下載' : '下載失敗，請再試一次');
  } finally {
    buttons.forEach(b => { b.disabled = false; });
  }
}

// PDF：把手帳放進 #print-root，列印時只印這一塊（見 styles.css 的 @media print）
function printHandbook() {
  if (!document.getElementById('handbook-style')) {
    const style = document.createElement('style');
    style.id = 'handbook-style';
    style.textContent = HANDBOOK_CSS;
    document.head.append(style);
  }
  const root = document.getElementById('print-root');
  root.innerHTML = `<main class="hb hb-page">${buildHandbook({ print: true })}</main>`;
  document.title = `${state.tripName.trim() || DEFAULT_TRIP_NAME}・旅行手帳`; // 存成 PDF 時的預設檔名
  window.addEventListener('afterprint', () => {
    root.innerHTML = '';
    document.title = state.tripName.trim() || DEFAULT_TRIP_NAME;
  }, { once: true });
  window.print();
}

function setExportOpen(open) {
  document.getElementById('export-modal').hidden = !open;
  document.getElementById('export-backdrop').hidden = !open;
  setExportStatus('');
  if (open) {
    const ended = isTripEnded();
    document.getElementById('export-lead').textContent = ended
      ? '旅程結束了！選一種方式把整趟旅程保存到自己的裝置。'
      : '隨時都可以下載目前的行程與記帳，選一種格式：';
    document.querySelector('#export-modal [data-export="html"]').focus();
  }
}

document.getElementById('export-modal').addEventListener('click', e => {
  const option = e.target.closest('[data-export]');
  if (option) runExport(option.dataset.export);
  if (e.target.closest('[data-action="close-export"]')) setExportOpen(false);
});
document.getElementById('export-backdrop').addEventListener('click', () => setExportOpen(false));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('export-modal').hidden) setExportOpen(false);
});
document.getElementById('trip-ended').addEventListener('click', e => {
  if (e.target.closest('[data-action="open-export"]')) setExportOpen(true);
  if (e.target.closest('[data-action="dismiss-ended"]')) dismissTripEnded();
});

// ---------- 匯入 JSON 備份 ----------
const importInput = document.getElementById('import-file');
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert('這個檔案不是有效的 JSON。');
    return;
  }
  const trip = data?.format === 'trip-planner-backup' ? data.trip : null;
  if (!trip || !Array.isArray(trip.days) || !trip.days.length) {
    alert('這不是旅遊行程規劃匯出的 JSON 備份。');
    return;
  }
  const where = sharedTripId ? '共享行程（所有旅伴都會看到）' : '目前的行程';
  if (!confirm(`用「${trip.tripName || DEFAULT_TRIP_NAME}」的備份取代${where}？\n目前的景點與記帳會被覆蓋。`)) return;
  state = normalizeState({
    tripName: trip.tripName || '',
    startDate: trip.startDate || '',
    days: trip.days,
    members: trip.members,
    travelMode: trip.travelMode,
    legModes: trip.legModes || {},
    legDetails: trip.legDetails || {},
    expenses: Array.isArray(trip.expenses) ? trip.expenses : [],
    todos: Array.isArray(trip.todos) ? trip.todos : [],
    activeDayId: OVERVIEW
  });
  ui.lastLiveRefs = new Set(); // 不要把舊行程的卡片當成被刪除而清掉花費
  commit();
  fitMapToSpots(state.days.flatMap(d => d.spots));
});


/* ==========================================================================
 * 10. 啟動
 * ========================================================================== */

placeForViewport();
render();
if (sharedTripId) joinSharedTrip();
if (apiKey) {
  loadGoogleMaps(apiKey).then(initMap).catch(err => showSetup(err.message));
} else {
  showSetup();
}
