'use strict';

/* ==========================================================================
 * 1. 設定
 * ========================================================================== */

// 填入你的 Google Maps API 金鑰（請在 Google Cloud 限制可使用的網站）
const GOOGLE_MAPS_API_KEY = '';
// Advanced Marker 需要 Map ID；DEMO_MAP_ID 可用於開發，正式上線請換成自己的 Map ID
const GOOGLE_MAP_ID = 'DEMO_MAP_ID';

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
  { value: 'WALK', label: '步行', gmaps: 'walking' }
];
const DEFAULT_MEMBERS = [{ id: 'member-me', name: '我' }];
const MIN_MEMBERS = 1;
// 每天的代表色（分頁、圖釘、卡片標頭），文字一律用黑色，所以都選明亮的顏色
const DAY_COLORS = ['#3B82F6', '#FB7185', '#FACC15', '#6EE7B7', '#FB923C', '#A78BFA', '#22D3EE', '#F9A8D4'];


/* ==========================================================================
 * 2. 狀態與儲存
 *
 * 所有資料只存在 state 裡，清單、分頁、地圖圖釘都由它產生：
 *   state = {
 *     days: [{ id, spots: [Spot] }],  // 陣列順序就是 Day 1、Day 2…
 *     activeDayId: dayId | OVERVIEW,
 *     travelMode: 'DRIVE' | 'TWO_WHEELER' | 'TRANSIT' | 'WALK',  // 路段沒有個別設定時的交通方式
 *     legModes: { 'fromSpotId->toSpotId': travelMode },       // 個別路段改用的交通方式
 *     members: [{ id, name }],                                // 旅伴，預設只有「我」
 *     expenses: [Expense]                                     // 記帳
 *   }
 *   Spot = { id, name, lat, lng, placeId, note }  // spots 陣列順序就是當天的參觀順序
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
  expandedNotes: new Set(), // 展開備註欄的 spotId
  flashSpotId: null,        // 下次重繪後要閃一下的卡片
  lastPickedDayId: null,    // 新增表單預設選取的天數
  expandedExpenses: new Set(), // 展開記帳區的卡片 ref
  focusExpenseId: null,     // 下次重繪後要聚焦金額欄的支出
  settleOpen: false,        // 結算面板是否開啟
  lastLiveRefs: new Set(),  // 上次重繪時存在的卡片 ref，用來判斷哪些卡片被刪掉
  renderOnBlur: false       // 打字中收到雲端更新時，等離開輸入框再重繪
};

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function createDay() {
  return { id: createId('day'), spots: [] };
}

function createSpot({ name, lat, lng, placeId }) {
  return { id: createId('spot'), name, lat, lng, placeId: placeId || null, note: '' };
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

// 補上舊資料沒有的欄位（旅伴、記帳）
function normalizeState(s) {
  if (!Array.isArray(s.members) || s.members.length < MIN_MEMBERS) s.members = DEFAULT_MEMBERS.map(m => ({ ...m }));
  if (!Array.isArray(s.expenses)) s.expenses = [];
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
      day.spots.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, placeId: s.placeId || null, note: '' });
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
  day.spots.forEach(s => ui.expandedNotes.delete(s.id));
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
  if (!state.legModes) return;
  const live = new Set(state.days.flatMap(day => getDayLegs(day).map(({ from, to }) => getPairKey(from, to))));
  Object.keys(state.legModes).forEach(key => {
    if (!live.has(key)) delete state.legModes[key];
  });
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
  ui.expandedNotes.delete(spotId);
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

// 打字時只更新資料並儲存，不整個重繪，避免輸入框失去焦點
function updateSpotNote(spotId, note) {
  const found = findSpot(spotId);
  if (!found) return;
  found.spot.note = note;
  saveState();
  updateMarkerTitle(found);
}

function toggleNoteEditor(spotId) {
  if (ui.expandedNotes.has(spotId)) ui.expandedNotes.delete(spotId);
  else ui.expandedNotes.add(spotId);
  render();
  if (ui.expandedNotes.has(spotId)) {
    document.querySelector(`.spot[data-spot-id="${spotId}"] textarea`)?.focus();
  }
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
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.description'
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
    description: route.description || ''
  };
}

// 計算畫面上所有還沒算過的 Leg（每次 render 後呼叫）
function refreshVisibleLegs() {
  if (!apiKey) return;
  getVisibleDays().forEach(day => {
    getDayLegs(day).forEach(({ from, to }) => {
      const mode = getLegMode(from, to).value;
      const key = getLegKey(from, to, mode);
      if (legCache.has(key)) return;
      legCache.set(key, { status: 'loading' });
      fetchLegRoute(from, to, mode).then(result => {
        legCache.set(key, result);
        updateLegViews();
      });
    });
  });
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
    const leg = legCache.get(getLegKey(from, to, getLegMode(from, to).value));
    if (leg?.status !== 'ok') return null;
    total += leg.durationSec;
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
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  DRIVE: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13h.01M16.5 13h.01"/></svg>',
  TWO_WHEELER: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M8.5 16.5h5l3-7h-4M15 6h2.5l1 3.5M5.5 16.5 9 10h4"/></svg>',
  TRANSIT: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 14h.01M15 14h.01M8 21l2-4M16 21l-2-4"/></svg>',
  WALK: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="1.5"/><path d="M10 21l2-6 3 3v3M9 12l2-5 4 3 3 1M11 7l-3 2-1 3"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h13V9H6a2 2 0 0 1-2-2zM16 14h.01"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function render() {
  renderSummary();
  renderMembers();
  renderSyncBar();
  renderTabs();
  renderDayList();
  renderSettleButton();
  renderSettlement();
  if (map) syncMarkers();
  flashPendingSpot();
  focusPendingExpense();
  refreshVisibleLegs();
  ui.lastLiveRefs = getLiveRefs();
}

function renderSummary() {
  document.getElementById('summary').innerHTML =
    `<strong>${state.days.length}</strong> 天・<strong>${countSpots()}</strong> 個景點`;
}

function renderTabs() {
  const tabs = [{ id: OVERVIEW, label: '全部', color: null, count: countSpots() }]
    .concat(state.days.map((d, i) => ({ id: d.id, label: getDayLabel(i), color: getDayColor(i), count: d.spots.length })));
  document.getElementById('tabs').innerHTML = tabs.map(t => `
      <button class="tab ${t.id === state.activeDayId ? 'active' : ''}" role="tab"
        aria-selected="${t.id === state.activeDayId}" data-action="select-day" data-day-id="${t.id}"
        ${t.color ? `style="--c:${t.color}"` : ''}>
        ${t.color ? '<span class="tab-dot"></span>' : ''}${t.label}<span class="tab-count">${t.count}</span>
      </button>`).join('');
  document.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
          <span class="day-count">${day.spots.length} 個景點</span>
          <span class="day-travel" data-day-id="${day.id}">${renderDayTravel(day)}</span>
          <button class="btn-text danger" data-action="remove-day" data-day-id="${day.id}"
            ${canRemoveDay ? '' : 'disabled title="至少要保留一天"'}>刪除此天</button>
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

function renderSpotCard(spot, index, total) {
  const expanded = ui.expandedNotes.has(spot.id);
  const hasNote = Boolean(spot.note.trim());
  const subline = hasNote && !expanded
    ? `<div class="spot-note-preview">${escapeHtml(spot.note.split('\n')[0])}</div>`
    : `<div class="spot-coord">${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}</div>`;
  return `
    <li class="spot" data-spot-id="${spot.id}">
      <div class="spot-main">
        <span class="drag-handle" title="拖曳調整順序">${ICONS.grip}</span>
        <span class="spot-index">${index + 1}</span>
        <button class="spot-info" data-action="focus-spot" title="在地圖上查看">
          <span class="spot-name">${escapeHtml(spot.name)}</span>
          ${subline}
        </button>
        <div class="spot-actions">
          <button class="icon-btn" data-action="move-up" title="上移" aria-label="上移" ${index === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button class="icon-btn" data-action="move-down" title="下移" aria-label="下移" ${index === total - 1 ? 'disabled' : ''}>${ICONS.down}</button>
          <button class="icon-btn ${hasNote ? 'has-note' : ''} ${expanded ? 'on' : ''}" data-action="toggle-note"
            title="備註" aria-label="備註" aria-expanded="${expanded}">${ICONS.note}</button>
          <button class="icon-btn danger" data-action="remove-spot" title="刪除" aria-label="刪除">${ICONS.trash}</button>
        </div>
      </div>
      ${expanded ? `
        <div class="spot-note">
          <textarea data-spot-id="${spot.id}" rows="3" maxlength="500"
            placeholder="門票預約時間、必吃美食、隨手筆記…">${escapeHtml(spot.note)}</textarea>
        </div>` : ''}
      ${renderExpenseArea(getSpotRef(spot), spot.name)}
    </li>`;
}

function renderDayTravel(day) {
  const sec = day.spots.length > 1 ? getDayTravelSec(day) : null;
  return sec === null ? '' : `交通 ${formatDuration(sec)}`;
}

// 兩個景點之間的路線卡片
function renderLegSlot(fromSpot, toSpot) {
  return `<li class="leg" data-from="${fromSpot.id}" data-to="${toSpot.id}">
      <div class="leg-card">
        <div class="leg-route">${renderLegContent(fromSpot, toSpot)}</div>
        ${renderExpenseArea(getLegRef(fromSpot, toSpot), `${fromSpot.name} → ${toSpot.name}`)}
      </div>
    </li>`;
}

function renderLegContent(fromSpot, toSpot) {
  const mode = getLegMode(fromSpot, toSpot);
  const leg = apiKey ? legCache.get(getLegKey(fromSpot, toSpot, mode.value)) : null;
  let body;
  if (!apiKey) {
    body = `<div class="leg-sub">設定 Google Maps 金鑰後顯示交通時間</div>`;
  } else if (!leg || leg.status === 'loading') {
    body = `<div class="leg-sub">計算${mode.label}時間…</div>`;
  } else if (leg.status === 'error') {
    body = `<div class="leg-sub error" title="${escapeHtml(leg.detail || '')}">${escapeHtml(leg.message)}
        <button class="leg-retry" data-action="retry-leg">重試</button></div>`;
  } else {
    const via = leg.description ? `・經 ${escapeHtml(leg.description)}` : '';
    body = `<div class="leg-time">${formatDuration(leg.durationSec)}</div>
      <div class="leg-sub">${mode.label}・${formatDistance(leg.distanceMeters)}${via}</div>`;
  }
  const modeButtons = TRAVEL_MODES.map(m => `
      <button class="leg-mode ${m.value === mode.value ? 'active' : ''}" data-action="set-leg-mode" data-mode="${m.value}"
        title="這段改用${m.label}" aria-label="${m.label}" aria-pressed="${m.value === mode.value}">${ICONS[m.value]}</button>`).join('');
  return `
    <div class="leg-head">
      <span class="leg-icon">${ICONS[mode.value]}</span>
      <div class="leg-body">${body}</div>
      <a class="leg-link" href="${escapeHtml(getGoogleMapsDirUrl(fromSpot, toSpot, mode))}" target="_blank" rel="noopener"
        title="在 Google 地圖查看這段路線">Google 地圖${ICONS.external}</a>
    </div>
    <div class="leg-modes" role="group" aria-label="這段的交通方式">${modeButtons}</div>`;
}

// 只更新交通欄位與每天的交通總時間，不動景點卡片
function updateLegViews() {
  dayListEl.querySelectorAll('.leg').forEach(el => {
    const from = findSpot(el.dataset.from)?.spot;
    const to = findSpot(el.dataset.to)?.spot;
    if (from && to) el.querySelector('.leg-route').innerHTML = renderLegContent(from, to);
  });
  dayListEl.querySelectorAll('.day-travel').forEach(el => {
    const day = getDay(el.dataset.dayId);
    if (day) el.textContent = renderDayTravel(day);
  });
}

/* ---------- 記帳區（景點卡與交通卡共用） ---------- */

// title：新增支出時預設帶入的項目名稱
function renderExpenseArea(ref, title) {
  const expanded = ui.expandedExpenses.has(ref);
  const items = getExpensesFor(ref);
  return `
    <div class="expenses ${expanded ? 'open' : ''}" data-ref="${escapeHtml(ref)}" data-title="${escapeHtml(title)}">
      <button class="expense-toggle ${items.some(x => x.amount > 0) ? 'has' : ''}" data-action="toggle-expenses"
        aria-expanded="${expanded}">${renderExpenseToggle(ref)}</button>
      ${expanded ? `
        <div class="expense-list">
          ${items.map(renderExpenseRow).join('')}
          <button class="btn-text expense-add" data-action="add-expense">+ 再記一筆</button>
        </div>` : ''}
    </div>`;
}

function renderExpenseToggle(ref) {
  const items = getExpensesFor(ref).filter(x => x.amount > 0);
  if (!items.length) return ui.expandedExpenses.has(ref) ? '收合記帳' : '+ 記錄花費';
  return `${ICONS.wallet}<span class="expense-total">${formatMoney(sumAmounts(items))}</span>`
    + `<span class="expense-meta">${items.length} 筆</span>`;
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
        <span class="expense-label">項目</span>
        <input class="expense-title" type="text" data-field="title" value="${escapeHtml(x.title)}"
          placeholder="支出項目" maxlength="40" aria-label="支出項目">
        <button class="icon-btn danger" data-action="remove-expense" title="刪除此筆支出" aria-label="刪除此筆支出">${ICONS.trash}</button>
      </div>
      <div class="expense-line">
        <span class="expense-label">金額</span>
        <label class="expense-amount">
          <span>NT$</span>
          <input type="number" data-field="amount" value="${x.amount > 0 ? x.amount : ''}" placeholder="0"
            min="0" step="1" inputmode="numeric" aria-label="金額">
        </label>
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
}

function renderSettleButton() {
  document.getElementById('settle-total').textContent = formatMoney(computeSettlement().total);
}

// 金額、付款人、名稱變動時呼叫：只更新金額相關的顯示，不動輸入框
function refreshMoneyViews() {
  renderSettleButton();
  document.querySelectorAll('.expenses[data-ref]').forEach(el => {
    const ref = el.dataset.ref;
    const toggle = el.querySelector('.expense-toggle');
    toggle.innerHTML = renderExpenseToggle(ref);
    toggle.classList.toggle('has', getExpensesFor(ref).some(x => x.amount > 0));
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
  const spotId = btn.closest('.spot')?.dataset.spotId;
  switch (btn.dataset.action) {
    case 'select-day':
      setActiveDay(btn.dataset.dayId);
      fitMapToSpots(getVisibleDays().flatMap(d => d.spots));
      break;
    case 'add-day': addDay(); break;
    case 'remove-day': removeDay(btn.dataset.dayId); break;
    case 'move-up': moveSpotBy(spotId, -1); break;
    case 'move-down': moveSpotBy(spotId, 1); break;
    case 'toggle-note': toggleNoteEditor(spotId); break;
    case 'remove-spot': removeSpot(spotId); break;
    case 'focus-spot': focusSpotOnMap(spotId); break;
    case 'set-leg-mode': {
      const leg = btn.closest('.leg');
      setLegMode(leg.dataset.from, leg.dataset.to, btn.dataset.mode);
      break;
    }
    case 'toggle-expenses':
    case 'add-expense': {
      const area = btn.closest('.expenses');
      if (btn.dataset.action === 'add-expense') addExpense(area.dataset.ref, area.dataset.title);
      else toggleExpenses(area.dataset.ref, area.dataset.title);
      break;
    }
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

dayListEl.addEventListener('input', e => {
  if (e.target.matches('textarea[data-spot-id]')) {
    updateSpotNote(e.target.dataset.spotId, e.target.value);
  } else if (e.target.matches('.expense [data-field]')) {
    updateExpense(e.target.closest('.expense').dataset.expenseId, e.target.dataset.field, e.target.value);
  }
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
  if (handle) handle.closest('.spot').draggable = true;
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

let map, infoWindow, AdvancedMarkerElement, Place, AutocompleteSuggestion, AutocompleteSessionToken;
const apiKey = getApiKey();
const markers = new Map(); // spotId -> AdvancedMarkerElement

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
  input.focus();
  input.select();
}

function hideSetup() {
  document.getElementById('setup').hidden = true;
}

document.getElementById('key-btn').addEventListener('click', () => {
  showSetup('', { cancelable: Boolean(map) });
});

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
  const { Map: GoogleMap, InfoWindow } = await google.maps.importLibrary('maps');
  ({ AdvancedMarkerElement } = await google.maps.importLibrary('marker'));
  try {
    ({ Place, AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places'));
  } catch {
    Place = null; // 沒有 Places API 也能正常打點，只是不能搜尋、不會自動帶入名稱
  }

  map = new GoogleMap(document.getElementById('map'), {
    center: DEFAULT_CENTER,
    zoom: 13,
    mapId: GOOGLE_MAP_ID,
    clickableIcons: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: 'greedy'
  });
  infoWindow = new InfoWindow();

  // 點擊地圖 → 在點擊處彈出新增表單
  map.addListener('click', e => {
    if (!e.latLng) return;
    if (e.placeId) e.stop(); // 點到店家/景點時，改用我們的表單取代 Google 預設資訊框
    openAddSpotForm(e.latLng, e.placeId);
  });

  setupPlaceSearch();
  render();
  fitMapToSpots(getVisibleDays().flatMap(d => d.spots));
}

// 新增表單預設選取：目前分頁的那天 → 上次選的那天 → Day 1
function getDefaultDayId() {
  if (state.activeDayId !== OVERVIEW && getDay(state.activeDayId)) return state.activeDayId;
  if (ui.lastPickedDayId && getDay(ui.lastPickedDayId)) return ui.lastPickedDayId;
  return state.days[0].id;
}

// name：已知地點名稱時（例如從搜尋選取）直接帶入
function openAddSpotForm(latLng, placeId, name) {
  const lat = latLng.lat();
  const lng = latLng.lng();
  const defaultDayId = getDefaultDayId();
  const form = document.createElement('form');
  form.className = 'add-form';
  form.innerHTML = `
    <h3>新增景點</h3>
    <div class="coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
    <label>景點名稱
      <input name="name" type="text" placeholder="例如：台北 101" maxlength="40" autocomplete="off">
    </label>
    <label>加入哪一天
      <select name="day">
        ${state.days.map((d, i) => `<option value="${d.id}" ${d.id === defaultDayId ? 'selected' : ''}>${getDayLabel(i)}（${d.spots.length} 個景點）</option>`).join('')}
      </select>
    </label>
    <button type="submit" class="btn-primary">加入行程</button>
  `;
  const input = form.elements.name;
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.classList.add('invalid');
      input.focus();
      return;
    }
    addSpot(form.elements.day.value, { name, lat, lng, placeId });
    infoWindow.close();
  });
  input.addEventListener('input', () => input.classList.remove('invalid'));

  infoWindow.setContent(form);
  infoWindow.setPosition(latLng);
  infoWindow.open({ map });
  google.maps.event.addListenerOnce(infoWindow, 'domready', () => input.focus());
  if (name) input.value = name;

  // 點到 Google 地圖上的地點時，自動帶入地點名稱
  if (placeId && Place && !name) {
    new Place({ id: placeId, requestedLanguage: 'zh-TW' })
      .fetchFields({ fields: ['displayName'] })
      .then(({ place }) => {
        if (!input.value && place.displayName) input.value = place.displayName;
      })
      .catch(() => {});
  }
}

/* ---------- 搜尋地點（Places API (New) Autocomplete） ----------
 * 輸入時列出建議地點；選取後地圖移到該處，並打開已填好名稱的新增表單。
 * 同一次搜尋（打字到選取）共用一個 session token，Google 會合併計費。
 */
const searchInput = document.getElementById('place-search');
const searchResults = document.getElementById('search-results');
const search = { token: null, timer: null, seq: 0, items: [], active: -1 };

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
    if (search.items.length) showSearchResults();
  });
  searchInput.addEventListener('blur', hideSearchResults);
  // 點選建議時不要讓輸入框先失焦（失焦會關閉清單）
  searchResults.addEventListener('pointerdown', e => e.preventDefault());
  searchResults.addEventListener('click', e => {
    const item = e.target.closest('[data-index]');
    if (item) selectSuggestion(Number(item.dataset.index));
  });
}

async function runPlaceSearch() {
  const text = searchInput.value.trim();
  const seq = ++search.seq; // 只採用最後一次輸入的結果
  if (!text) {
    search.items = [];
    hideSearchResults();
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
  openAddSpotForm(place.location, place.id, place.displayName || searchInput.value);
}

function createPinElement(dayIndex, spotIndex, dimmed) {
  const wrap = document.createElement('div');
  wrap.className = `pin-wrap${dimmed ? ' dimmed' : ''}`;
  wrap.innerHTML = `<div class="pin" style="--c:${getDayColor(dayIndex)}"><span>${dayIndex + 1}-${spotIndex + 1}</span></div>`;
  return wrap;
}

function getMarkerTitle({ dayIndex, spot }) {
  return `${getDayLabel(dayIndex)}・${spot.name}${spot.note.trim() ? `\n${spot.note.trim()}` : ''}`;
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
        marker = new AdvancedMarkerElement({ map, position: { lat: spot.lat, lng: spot.lng } });
        marker.addListener('gmp-click', () => onMarkerClick(spot.id));
        markers.set(spot.id, marker);
      }
      marker.content = createPinElement(dayIndex, index, dimmed);
      marker.title = getMarkerTitle({ dayIndex, spot });
      marker.zIndex = dimmed ? 1 : 10;
    });
  });
  for (const [id, marker] of markers) {
    if (!liveIds.has(id)) {
      marker.map = null;
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
  copiedTimer: null
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
    days: source.days,
    travelMode: source.travelMode || TRAVEL_MODES[0].value,
    legModes: source.legModes || {},
    members: source.members
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
    batch.set(sync.tripRef, { ...trip, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    sync.lastTripJson = tripJson;
    sync.baseTrip = JSON.parse(JSON.stringify(trip));
    writes++;
  }

  const expensesRef = sync.tripRef.collection('expenses');
  const current = new Map(state.expenses.map(x => [x.id, pickExpense(x)]));
  current.forEach((expense, id) => {
    const json = stableStringify(expense);
    if (sync.syncedExpenses.get(id) === json) return;
    batch.set(expensesRef.doc(id), expense);
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
  const remote = pickTripData(doc.data());
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
  const days = mergeIds(B.order, L.order, R.order).map(id => ({
    id,
    spots: mergeIds(B.lists[id] || [], L.lists[id] || [], R.lists[id] || [])
      .filter(spotId => spots[spotId] && !placed.has(spotId) && placed.add(spotId))
      .map(spotId => spots[spotId])
  }));
  const byId = list => Object.fromEntries(list.map(m => [m.id, m]));
  const members = mergeMap(byId(base.members), byId(local.members), byId(remote.members));
  return {
    days: days.length ? days : remote.days,
    travelMode: pick(base.travelMode, local.travelMode, remote.travelMode),
    legModes: mergeMap(base.legModes, local.legModes, remote.legModes),
    members: mergeIds(base.members.map(m => m.id), local.members.map(m => m.id), remote.members.map(m => m.id))
      .filter(id => members[id]).map(id => members[id])
  };
}

function onExpensesSnapshot(snap) {
  if (!sync.loaded.expenses) {
    // 第一次：以雲端為準，取代快取裡可能過期的花費
    state.expenses = snap.docs.map(d => pickExpense({ ...d.data(), id: d.id }));
    sync.syncedExpenses = new Map(state.expenses.map(x => [x.id, stableStringify(x)]));
    sync.loaded.expenses = true;
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
  if (active?.matches('input, textarea') && active.closest('.sidebar, .members')) {
    ui.renderOnBlur = true;
    refreshMoneyViews();
  } else {
    render();
  }
}

document.addEventListener('focusout', () => {
  if (!ui.renderOnBlur) return;
  setTimeout(() => {
    if (document.activeElement?.matches('input, textarea') && document.activeElement.closest('.sidebar, .members')) return;
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
async function startSharing() {
  if (!FIREBASE_CONFIG || sharedTripId) return;
  setSyncStatus('connecting', '正在建立共享行程…');
  try {
    const db = await initFirebase();
    const tripRef = db.collection('trips').doc();
    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    batch.set(tripRef, { ...pickTripData(state), createdAt: now, updatedAt: now });
    state.expenses.filter(x => x.amount > 0).forEach(x => batch.set(tripRef.collection('expenses').doc(x.id), pickExpense(x)));
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
 * 10. 啟動
 * ========================================================================== */

render();
if (sharedTripId) joinSharedTrip();
if (apiKey) {
  loadGoogleMaps(apiKey).then(initMap).catch(err => showSetup(err.message));
} else {
  showSetup();
}
