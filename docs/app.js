// ---- Supabase init ----
if (SUPABASE_URL === 'PASTE_YOUR_SUPABASE_URL_HERE') {
  document.body.innerHTML =
    '<div style="font-family:sans-serif;padding:3rem;text-align:center;color:#64748b">' +
    '<h2 style="color:#1e293b">Setup required</h2>' +
    '<p>Open <code>config.js</code> and paste your Supabase URL and anon key.</p>' +
    '</div>';
  throw new Error('Supabase not configured');
}
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- State ----
const state = {
  habits:    [],
  logs:      new Set(),
  prevLogs:  new Set(),
  remarks:   {},
  year:      new Date().getFullYear(),
  month:     new Date().getMonth() + 1,
  prevYear:  null,
  prevMonth: null,
};

// ---- Category color palette ----
const PALETTE = [
  { row: '#eff6ff', done: '#3b82f6', doneHover: '#2563eb', hover: '#bfdbfe', header: '#dbeafe', label: '#1e40af' },
  { row: '#f0fdf4', done: '#22c55e', doneHover: '#16a34a', hover: '#bbf7d0', header: '#dcfce7', label: '#15803d' },
  { row: '#fdf4ff', done: '#a855f7', doneHover: '#9333ea', hover: '#e9d5ff', header: '#fae8ff', label: '#7e22ce' },
  { row: '#fff7ed', done: '#f97316', doneHover: '#ea580c', hover: '#fed7aa', header: '#ffedd5', label: '#c2410c' },
  { row: '#fdf2f8', done: '#ec4899', doneHover: '#db2777', hover: '#fbcfe8', header: '#fce7f3', label: '#9d174d' },
  { row: '#f0fdfa', done: '#14b8a6', doneHover: '#0d9488', hover: '#99f6e4', header: '#ccfbf1', label: '#0f766e' },
  { row: '#fefce8', done: '#ca8a04', doneHover: '#a16207', hover: '#fef08a', header: '#fef9c3', label: '#854d0e' },
  { row: '#fef2f2', done: '#ef4444', doneHover: '#dc2626', hover: '#fecaca', header: '#fee2e2', label: '#991b1b' },
];

function categoryColor(name) {
  if (!name) return null;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ---- Data loading ----
async function loadHabits() {
  const { data, error } = await db.from('habits').select('*').order('sort_order').order('id');
  if (error) { console.error('loadHabits:', error); return; }
  state.habits = data || [];
}

async function loadMonth() {
  let prevYear = state.year, prevMonth = state.month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  state.prevYear = prevYear;
  state.prevMonth = prevMonth;

  const start  = fmtDate(state.year, state.month, 1);
  const end    = fmtDate(state.year, state.month, 31);
  const pStart = fmtDate(prevYear, prevMonth, 1);
  const pEnd   = fmtDate(prevYear, prevMonth, 31);

  const [logsRes, remarksRes, prevLogsRes] = await Promise.all([
    db.from('logs').select('habit_id, date').gte('date', start).lte('date', end),
    db.from('remarks').select('date, remark').gte('date', start).lte('date', end),
    db.from('logs').select('habit_id, date').gte('date', pStart).lte('date', pEnd),
  ]);

  state.logs = new Set((logsRes.data || []).map(l => `${l.habit_id}-${l.date}`));
  state.remarks = {};
  (remarksRes.data || []).forEach(r => { state.remarks[r.date] = r.remark; });
  state.prevLogs = new Set((prevLogsRes.data || []).map(l => `${l.habit_id}-${l.date}`));
}

// ---- Helpers ----
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function fmtDate(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

// ---- Stats helpers ----
function countableDays(year, month) {
  const today = new Date();
  const isFuture = new Date(year, month - 1, 1) > today;
  if (isFuture) return 0;
  const isCur = today.getFullYear() === year && today.getMonth() + 1 === month;
  return isCur ? today.getDate() : daysInMonth(year, month);
}

function calcOverallStats(logsSet, habits, year, month) {
  const days   = countableDays(year, month);
  const active = habits.filter(h => h.active);
  if (!active.length || !days) return null;
  let done = 0;
  for (let d = 1; d <= days; d++) {
    const date = fmtDate(year, month, d);
    active.forEach(h => { if (logsSet.has(`${h.id}-${date}`)) done++; });
  }
  const total = active.length * days;
  return { done, total, pct: Math.round(done / total * 100) };
}

function calcHabitPct(habitId, logsSet, year, month) {
  const days = countableDays(year, month);
  if (!days) return null;
  let done = 0;
  for (let d = 1; d <= days; d++) {
    if (logsSet.has(`${habitId}-${fmtDate(year, month, d)}`)) done++;
  }
  return { done, total: days, pct: Math.round(done / days * 100) };
}

// ---- Render stats bar ----
function renderStatsBar() {
  const { habits, logs, prevLogs, year, month, prevYear, prevMonth } = state;
  const bar = document.getElementById('stats-bar');
  bar.innerHTML = '';

  const cur  = calcOverallStats(logs, habits, year, month);
  const prev = calcOverallStats(prevLogs, habits, prevYear, prevMonth);

  if (!cur) return;

  const days = countableDays(year, month);
  const curCard = document.createElement('div');
  curCard.className = 'stat-card';
  curCard.innerHTML =
    `<span class="stat-label">${MONTH_NAMES[month - 1]} ${year} · Completion</span>` +
    `<span class="stat-value">${cur.pct}%</span>` +
    `<span class="stat-sub">${cur.done} / ${cur.total} habit-days (${days}d tracked)</span>`;
  bar.appendChild(curCard);

  if (prev && prev.total > 0) {
    const delta = cur.pct - prev.pct;
    const sign  = delta >= 0 ? '+' : '';
    const cls   = delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat';
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const prevCard = document.createElement('div');
    prevCard.className = 'stat-card';
    prevCard.innerHTML =
      `<span class="stat-label">vs ${MONTH_NAMES[prevMonth - 1]} ${prevYear}</span>` +
      `<span class="stat-value ${cls}">${arrow} ${sign}${delta}%</span>` +
      `<span class="stat-sub">last month was ${prev.pct}%</span>`;
    bar.appendChild(prevCard);
  }
}

// ---- Render heatmap ----
function renderHeatmap() {
  const { year, month, habits, logs, remarks } = state;
  const days      = daysInMonth(year, month);
  const today     = new Date();
  const isCurMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay  = today.getDate();

  document.getElementById('month-display').textContent = `${MONTH_NAMES[month - 1]} ${year}`;
  renderStatsBar();

  const activeHabits = habits.filter(h => h.active);
  const table = document.getElementById('heatmap-table');
  table.innerHTML = '';

  // -- THEAD --
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'habit-name-cell corner';
  corner.textContent = 'Habit';
  headerRow.appendChild(corner);

  for (let d = 1; d <= days; d++) {
    const date = fmtDate(year, month, d);
    const dow  = new Date(year, month - 1, d).getDay();
    const isToday = isCurMonth && d === todayDay;

    const th = document.createElement('th');
    th.className = 'day-header';
    if (isToday) th.classList.add('today');
    if (dow === 0 || dow === 6) th.classList.add('weekend');
    th.innerHTML =
      `<span class="day-num">${d}</span>` +
      `<span class="day-abbr">${DAY_ABBR[dow]}</span>` +
      (remarks[date] ? '<span class="remark-dot"></span>' : '<span style="display:block;height:6px"></span>');
    th.addEventListener('click', () => openDayModal(date));
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // -- TBODY --
  const tbody = document.createElement('tbody');

  if (activeHabits.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = days + 1;
    td.className = 'empty-state';
    td.textContent = 'No habits yet. Click "Manage Habits" to add some.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    const seenCats = new Set();
    const orderedCats = [];
    for (const h of activeHabits) {
      const cat = h.category || '';
      if (!seenCats.has(cat)) { seenCats.add(cat); orderedCats.push(cat); }
    }

    orderedCats.forEach(cat => {
      const color = categoryColor(cat);
      const catHabits = activeHabits.filter(h => (h.category || '') === cat);

      if (cat) {
        const catTr = document.createElement('tr');
        catTr.className = 'category-header-row';
        const catNameTd = document.createElement('td');
        catNameTd.className = 'habit-name-cell category-header-name';
        catNameTd.textContent = cat;
        if (color) { catNameTd.style.background = color.header; catNameTd.style.color = color.label; }
        catTr.appendChild(catNameTd);
        const catSpanTd = document.createElement('td');
        catSpanTd.colSpan = days;
        catSpanTd.className = 'category-header-span';
        if (color) catSpanTd.style.background = color.header;
        catTr.appendChild(catSpanTd);
        tbody.appendChild(catTr);
      }

      catHabits.forEach(habit => {
        const tr = document.createElement('tr');
        if (color) {
          tr.style.setProperty('--cell-done',       color.done);
          tr.style.setProperty('--cell-done-hover', color.doneHover);
          tr.style.setProperty('--cell-hover',      color.hover);
          tr.style.setProperty('--cell-row',        color.row);
        }

        const nameTd = document.createElement('td');
        nameTd.className = 'habit-name-cell';
        if (color) nameTd.style.background = color.row;
        const habitStats = calcHabitPct(habit.id, logs, year, month);
        const pctBadge   = habitStats ? `<span class="habit-pct">${habitStats.pct}%</span>` : '';
        nameTd.innerHTML = `<span class="habit-name-text" title="${habit.name}">${habit.name}</span>${pctBadge}`;
        tr.appendChild(nameTd);

        for (let d = 1; d <= days; d++) {
          const date    = fmtDate(year, month, d);
          const dow     = new Date(year, month - 1, d).getDay();
          const isToday = isCurMonth && d === todayDay;
          const done    = logs.has(`${habit.id}-${date}`);

          const td = document.createElement('td');
          td.className = 'log-cell';
          if (done)    td.classList.add('done');
          if (isToday) td.classList.add('today');
          if (dow === 0 || dow === 6) td.classList.add('weekend');
          td.addEventListener('click', () => toggleLog(habit.id, date, td));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    });
  }

  // Notes row
  const notesTr = document.createElement('tr');
  notesTr.className = 'notes-row';
  const notesLabel = document.createElement('td');
  notesLabel.className = 'habit-name-cell notes-label';
  notesLabel.textContent = 'Notes';
  notesTr.appendChild(notesLabel);
  for (let d = 1; d <= days; d++) {
    const date    = fmtDate(year, month, d);
    const dow     = new Date(year, month - 1, d).getDay();
    const isToday = isCurMonth && d === todayDay;
    const td = document.createElement('td');
    td.className = 'note-cell';
    if (remarks[date]) { td.classList.add('has-note'); td.title = remarks[date]; }
    if (isToday) td.classList.add('today');
    if (dow === 0 || dow === 6) td.classList.add('weekend');
    td.addEventListener('click', () => openDayModal(date));
    notesTr.appendChild(td);
  }
  tbody.appendChild(notesTr);
  table.appendChild(tbody);
}

// ---- Toggle log ----
async function toggleLog(habitId, date, cell) {
  const key = `${habitId}-${date}`;
  const { data: existing } = await db
    .from('logs').select('id').eq('habit_id', habitId).eq('date', date).maybeSingle();

  if (existing) {
    await db.from('logs').delete().eq('id', existing.id);
    state.logs.delete(key);
    cell.classList.remove('done');
  } else {
    await db.from('logs').insert({ habit_id: habitId, date });
    state.logs.add(key);
    cell.classList.add('done');
  }
}

// ---- Day modal ----
function openDayModal(date) {
  const modal = document.getElementById('day-modal');
  const d = new Date(date + 'T00:00:00');
  document.getElementById('modal-date-title').textContent =
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('modal-remark').value = state.remarks[date] || '';
  modal.dataset.date = date;
  modal.classList.add('open');
  setTimeout(() => document.getElementById('modal-remark').focus(), 50);
}

async function saveDayModal() {
  const modal  = document.getElementById('day-modal');
  const date   = modal.dataset.date;
  const remark = document.getElementById('modal-remark').value;
  await db.from('remarks').upsert({ date, remark }, { onConflict: 'date' });
  state.remarks[date] = remark;
  modal.classList.remove('open');
  renderHeatmap();
}

function closeDayModal() {
  document.getElementById('day-modal').classList.remove('open');
}

// ---- Habits modal ----
function openHabitsModal()  { renderHabitsList(); document.getElementById('habits-modal').classList.add('open'); }
function closeHabitsModal() { document.getElementById('habits-modal').classList.remove('open'); renderHeatmap(); }

function renderHabitsList() {
  const list = document.getElementById('habits-list');
  list.innerHTML = '';

  if (state.habits.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">No habits added yet.</p>';
    return;
  }

  const seenCats = new Set();
  const orderedCats = [];
  for (const h of state.habits) {
    const cat = h.category || '';
    if (!seenCats.has(cat)) { seenCats.add(cat); orderedCats.push(cat); }
  }

  const lastIdx = state.habits.length - 1;

  orderedCats.forEach(cat => {
    const color = categoryColor(cat);
    const catHabits = state.habits.filter(h => (h.category || '') === cat);

    if (cat) {
      const divider = document.createElement('div');
      divider.className = 'habits-list-category';
      divider.textContent = cat;
      if (color) { divider.style.color = color.label; divider.style.borderLeftColor = color.done; divider.style.background = color.header; }
      list.appendChild(divider);
    }

    catHabits.forEach(habit => {
      const globalIdx = state.habits.indexOf(habit);
      const hColor    = categoryColor(habit.category);
      const item      = document.createElement('div');
      item.className  = `habit-item${habit.active ? '' : ' inactive'}`;
      if (hColor) item.style.borderLeftColor = hColor.done;

      item.innerHTML =
        `<div class="habit-reorder">` +
          `<button class="btn-icon btn-reorder" title="Move up" onclick="reorderHabit(${habit.id},'up')" ${globalIdx === 0 ? 'disabled' : ''}>↑</button>` +
          `<button class="btn-icon btn-reorder" title="Move down" onclick="reorderHabit(${habit.id},'down')" ${globalIdx === lastIdx ? 'disabled' : ''}>↓</button>` +
        `</div>` +
        `<span class="habit-item-name" title="${habit.name}">${habit.name}</span>` +
        `<input class="habit-category-input" type="text" value="${habit.category || ''}" placeholder="Category..."` +
          ` onblur="saveHabitCategory(${habit.id}, this.value)" onkeydown="if(event.key==='Enter') this.blur()">` +
        `<div class="habit-item-actions">` +
          `<button class="btn-icon" onclick="toggleHabitActive(${habit.id}, ${habit.active})">${habit.active ? 'Pause' : 'Resume'}</button>` +
          `<button class="btn-icon btn-danger" onclick="deleteHabit(${habit.id})">Delete</button>` +
        `</div>`;

      list.appendChild(item);
    });
  });
}

// ---- Habit CRUD ----
async function addHabit() {
  const input = document.getElementById('new-habit-input');
  const name  = input.value.trim();
  if (!name) return;
  const { data: maxRow } = await db.from('habits').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const maxOrder = maxRow?.sort_order ?? 0;
  const { data: habit, error } = await db
    .from('habits').insert({ name, category: '', sort_order: maxOrder + 10, active: 1 }).select().single();
  if (error) { console.error(error); return; }
  state.habits.push(habit);
  input.value = '';
  renderHabitsList();
}

async function reorderHabit(id, direction) {
  const { data: all } = await db.from('habits').select('id').order('sort_order').order('id');
  const idx = all.findIndex(h => h.id === id);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx >= 0 && swapIdx < all.length) {
    [all[idx], all[swapIdx]] = [all[swapIdx], all[idx]];
    await Promise.all(all.map((h, i) => db.from('habits').update({ sort_order: (i + 1) * 10 }).eq('id', h.id)));
  }
  const { data } = await db.from('habits').select('*').order('sort_order').order('id');
  state.habits = data || [];
  renderHabitsList();
}

async function saveHabitCategory(id, category) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit || (habit.category || '') === category.trim()) return;
  await db.from('habits').update({ category: category.trim() }).eq('id', id);
  habit.category = category.trim();
  renderHeatmap();
}

async function toggleHabitActive(id, currentActive) {
  const newActive = currentActive ? 0 : 1;
  await db.from('habits').update({ active: newActive }).eq('id', id);
  const habit = state.habits.find(h => h.id === id);
  habit.active = newActive;
  renderHabitsList();
}

async function deleteHabit(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!confirm(`Delete "${habit.name}" and all its history? This cannot be undone.`)) return;
  await db.from('logs').delete().eq('habit_id', id);
  await db.from('habits').delete().eq('id', id);
  state.habits = state.habits.filter(h => h.id !== id);
  for (const key of state.logs) { if (key.startsWith(`${id}-`)) state.logs.delete(key); }
  renderHabitsList();
}

// ---- Month navigation ----
async function goToMonth(year, month) {
  state.year = year; state.month = month;
  await loadMonth();
  renderHeatmap();
  if (document.getElementById('notes-panel').style.display !== 'none') renderNotesPanel();
}

// ---- Admin notes ----
function isAdmin() { return sessionStorage.getItem('habitAdmin') === '1'; }

function openNotesPanel() {
  if (isAdmin()) { showNotesPanel(); return; }
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').style.display = 'none';
  document.getElementById('pin-modal').classList.add('open');
  setTimeout(() => document.getElementById('pin-input').focus(), 50);
}

function submitPin() {
  if (document.getElementById('pin-input').value === ADMIN_PIN) {
    sessionStorage.setItem('habitAdmin', '1');
    document.getElementById('pin-modal').classList.remove('open');
    showNotesPanel();
  } else {
    document.getElementById('pin-error').style.display = 'block';
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-input').focus();
  }
}

function showNotesPanel() {
  renderNotesPanel();
  document.getElementById('notes-panel').style.display = 'block';
  document.getElementById('btn-view-notes').style.display = 'none';
  document.getElementById('btn-lock-notes').style.display = 'inline-block';
}

function lockNotes() {
  sessionStorage.removeItem('habitAdmin');
  document.getElementById('notes-panel').style.display = 'none';
  document.getElementById('btn-view-notes').style.display = 'inline-block';
  document.getElementById('btn-lock-notes').style.display = 'none';
}

function renderNotesPanel() {
  const { year, month, remarks } = state;
  document.getElementById('notes-panel-title').textContent =
    `${MONTH_NAMES[month - 1]} ${year} — Notes`;

  const entries = Object.entries(remarks)
    .filter(([, r]) => r.trim())
    .sort(([a], [b]) => b.localeCompare(a)); // descending by date

  const list = document.getElementById('notes-panel-list');
  if (entries.length === 0) {
    list.innerHTML = '<div class="notes-empty">No notes recorded this month.</div>';
    return;
  }
  list.innerHTML = entries.map(([date, remark]) => {
    const d = new Date(date + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const safe  = remark.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="note-entry">
      <div class="note-entry-date">${label}</div>
      <div class="note-entry-text">${safe}</div>
    </div>`;
  }).join('');
}

// ---- Init ----
async function init() {
  await Promise.all([loadHabits(), loadMonth()]);
  renderHeatmap();

  document.getElementById('btn-prev').addEventListener('click', () => {
    let { year, month } = state;
    month--; if (month < 1) { month = 12; year--; }
    goToMonth(year, month);
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    let { year, month } = state;
    month++; if (month > 12) { month = 1; year++; }
    goToMonth(year, month);
  });

  document.getElementById('btn-manage-habits').addEventListener('click', openHabitsModal);
  document.getElementById('btn-close-habits').addEventListener('click', closeHabitsModal);
  document.getElementById('btn-close-habits-footer').addEventListener('click', closeHabitsModal);
  document.getElementById('btn-add-habit').addEventListener('click', addHabit);
  document.getElementById('new-habit-input').addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });

  document.getElementById('btn-close-day').addEventListener('click', closeDayModal);
  document.getElementById('btn-cancel-day').addEventListener('click', closeDayModal);
  document.getElementById('btn-save-day').addEventListener('click', saveDayModal);
  document.getElementById('modal-remark').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDayModal(); });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.classList.remove('open'); });
  });

  // Notes panel & PIN
  document.getElementById('btn-view-notes').addEventListener('click', openNotesPanel);
  document.getElementById('btn-lock-notes').addEventListener('click', lockNotes);
  document.getElementById('btn-submit-pin').addEventListener('click', submitPin);
  document.getElementById('btn-cancel-pin').addEventListener('click', () => document.getElementById('pin-modal').classList.remove('open'));
  document.getElementById('btn-close-pin').addEventListener('click', () => document.getElementById('pin-modal').classList.remove('open'));
  document.getElementById('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

  // Restore notes panel if already authenticated this session
  if (isAdmin()) showNotesPanel();
}

init();
