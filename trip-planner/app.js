'use strict';

/* ==========================================================================
 * 1. 設定
 * ========================================================================== */

// 填入你的 Google Maps API 金鑰（請在 Google Cloud 限制可使用的網站）
const GOOGLE_MAPS_API_KEY = '';
// Advanced Marker 需要 Map ID；DEMO_MAP_ID 可用於開發，正式上線請換成自己的 Map ID
const GOOGLE_MAP_ID = 'DEMO_MAP_ID';

const KEY_STORAGE = 'trip-planner-gmaps-key';
const STATE_STORAGE = 'trip-planner-state-v2';
const LEGACY_SPOTS_STORAGE = 'trip-planner-spots'; // 舊版（固定 5 天）的資料
const DEFAULT_CENTER = { lat: 25.0375, lng: 121.5637 };
const OVERVIEW = 'all'; // 「全部」分頁：上下捲動檢視所有天數
const DAY_COLORS = ['#4f6ef7', '#12a594', '#f5a524', '#e5484d', '#8e4ec6', '#0091ff', '#d6409f', '#7c8a2e'];


/* ==========================================================================
 * 2. 狀態與儲存
 *
 * 所有資料只存在 state 裡，清單、分頁、地圖圖釘都由它產生：
 *   state = {
 *     days: [{ id, spots: [Spot] }],  // 陣列順序就是 Day 1、Day 2…
 *     activeDayId: dayId | OVERVIEW
 *   }
 *   Spot = { id, name, lat, lng, placeId, note }  // spots 陣列順序就是當天的參觀順序
 *
 * 「Day N」與圖釘編號都從陣列位置算出，因此增刪天數或調整順序後會自動重新編號。
 * ========================================================================== */

let state = loadState();

// 只影響畫面、不需要儲存的狀態
const ui = {
  expandedNotes: new Set(), // 展開備註欄的 spotId
  flashSpotId: null,        // 下次重繪後要閃一下的卡片
  lastPickedDayId: null     // 新增表單預設選取的天數
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

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_STORAGE));
    if (saved && Array.isArray(saved.days) && saved.days.length) return saved;
  } catch {
    // 讀取失敗就使用預設資料
  }
  return migrateLegacySpots() || { days: [createDay(), createDay(), createDay()], activeDayId: OVERVIEW };
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
    localStorage.setItem(STATE_STORAGE, JSON.stringify(state));
  } catch {
    // 無法儲存時（例如無痕模式）就只保留在記憶體中
  }
}

// 每個會改變資料的操作最後都呼叫 commit()：儲存 → 重繪清單與地圖
function commit() {
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
    const ok = confirm(`確定刪除 ${getDayLabel(index)}？\n這天的 ${day.spots.length} 個景點也會一併刪除，後面的天數會往前遞補。`);
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
  found.day.spots.splice(found.index, 1);
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
  const [spot] = day.spots.splice(index, 1);
  day.spots.splice(target, 0, spot);
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
 * 5. 交通卡片（擴充預留：Routes API）
 *
 * 同一天相鄰兩個景點之間是一段「交通 Leg」，在清單中以 renderLegSlot() 佔位。
 * Leg 以「出發景點 → 抵達景點」的 id 組成 key，因此調整順序後會自然對應到新的組合。
 *
 * 之後串接 Routes API 的步驟：
 *   1. 在 fetchLegRoute() 呼叫 Routes API（computeRoutes），回傳 { mode, durationText, distanceText }。
 *   2. 在 refreshDayLegs() 把結果存入 legCache，完成後呼叫 render()。
 *   3. 如需在地圖畫路線，在 syncMarkers() 旁新增 syncRoutes()。
 * ========================================================================== */

const legCache = new Map(); // legKey -> { mode, durationText, distanceText }

function getLegKey(fromSpot, toSpot) {
  return `${fromSpot.id}->${toSpot.id}`;
}

function getDayLegs(day) {
  return day.spots.slice(1).map((toSpot, i) => ({ from: day.spots[i], to: toSpot }));
}

// 尚未實作：MVP 階段不計算交通
async function fetchLegRoute(/* fromSpot, toSpot, mode */) {
  return null;
}

async function refreshDayLegs(day) {
  for (const { from, to } of getDayLegs(day)) {
    const key = getLegKey(from, to);
    if (legCache.has(key)) continue;
    const leg = await fetchLegRoute(from, to);
    if (leg) legCache.set(key, leg);
  }
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
  car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13h.01M16.5 13h.01"/></svg>'
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function render() {
  renderSummary();
  renderTabs();
  renderDayList();
  if (map) syncMarkers();
  flashPendingSpot();
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
    </li>`;
}

// 兩個景點之間的交通佔位；接上 Routes API 後會顯示 legCache 裡的結果
function renderLegSlot(fromSpot, toSpot) {
  const leg = legCache.get(getLegKey(fromSpot, toSpot));
  const text = leg ? `${escapeHtml(leg.durationText)}・${escapeHtml(leg.distanceText)}` : '交通資訊（即將推出）';
  return `
    <li class="leg" data-from="${fromSpot.id}" data-to="${toSpot.id}" aria-hidden="${leg ? 'false' : 'true'}">
      <span class="leg-icon">${ICONS.car}</span><span class="leg-text">${text}</span>
    </li>`;
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

document.querySelector('.sidebar').addEventListener('click', e => {
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
  }
});

dayListEl.addEventListener('input', e => {
  if (e.target.matches('textarea[data-spot-id]')) {
    updateSpotNote(e.target.dataset.spotId, e.target.value);
  }
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

let map, infoWindow, AdvancedMarkerElement, Place;
const markers = new Map(); // spotId -> AdvancedMarkerElement

function getApiKey() {
  if (GOOGLE_MAPS_API_KEY) return GOOGLE_MAPS_API_KEY;
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function showSetup(error) {
  document.getElementById('setup').hidden = false;
  const el = document.getElementById('setup-error');
  el.hidden = !error;
  el.textContent = error || '';
}

document.getElementById('setup-form').addEventListener('submit', e => {
  e.preventDefault();
  const key = document.getElementById('setup-key').value.trim();
  if (!key) return;
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    // 無法儲存時（例如無痕模式）只能改用程式碼裡的 GOOGLE_MAPS_API_KEY
  }
  location.reload();
});

// 金鑰無效或網站未授權時，Google 會呼叫這個函式
window.gm_authFailure = () => {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {}
  showSetup('金鑰無法使用：請確認金鑰正確、已啟用 Maps JavaScript API，且已允許此網站。');
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
    ({ Place } = await google.maps.importLibrary('places'));
  } catch {
    Place = null; // 沒有 Places API 也能正常打點，只是不會自動帶入名稱
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

  render();
  fitMapToSpots(getVisibleDays().flatMap(d => d.spots));
}

// 新增表單預設選取：目前分頁的那天 → 上次選的那天 → Day 1
function getDefaultDayId() {
  if (state.activeDayId !== OVERVIEW && getDay(state.activeDayId)) return state.activeDayId;
  if (ui.lastPickedDayId && getDay(ui.lastPickedDayId)) return ui.lastPickedDayId;
  return state.days[0].id;
}

function openAddSpotForm(latLng, placeId) {
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

  // 點到 Google 地圖上的地點時，自動帶入地點名稱
  if (placeId && Place) {
    new Place({ id: placeId, requestedLanguage: 'zh-TW' })
      .fetchFields({ fields: ['displayName'] })
      .then(({ place }) => {
        if (!input.value && place.displayName) input.value = place.displayName;
      })
      .catch(() => {});
  }
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
 * 9. 啟動
 * ========================================================================== */

render();
const apiKey = getApiKey();
if (apiKey) {
  loadGoogleMaps(apiKey).then(initMap).catch(err => showSetup(err.message));
} else {
  showSetup();
}
