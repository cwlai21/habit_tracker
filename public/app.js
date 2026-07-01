// ---- State ----
const state = {
  habits: [],
  logs: new Set(),      // "habitId-date"
  prevLogs: new Set(),  // previous month logs
  remarks: {},          // date -> remark string
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  prevYear: null,
  prevMonth: null,
};

// ---- Category color palette ----
const PALETTE = [
  { row: '#eff6ff', done: '#3b82f6', doneHover: '#2563eb', hover: '#bfdbfe', header: '#dbeafe', label: '#1e40af' }, // blue
  { row: '#f0fdf4', done: '#22c55e', doneHover: '#16a34a', hover: '#bbf7d0', header: '#dcfce7', label: '#15803d' }, // green
  { row: '#fdf4ff', done: '#a855f7', doneHover: '#9333ea', hover: '#e9d5ff', header: '#fae8ff', label: '#7e22ce' }, // purple
  { row: '#fff7ed', done: '#f97316', doneHover: '#ea580c', hover: '#fed7aa', header: '#ffedd5', label: '#c2410c' }, // orange
  { row: '#fdf2f8', done: '#ec4899', doneHover: '#db2777', hover: '#fbcfe8', header: '#fce7f3', label: '#9d174d' }, // pink
  { row: '#f0fdfa', done: '#14b8a6', doneHover: '#0d9488', hover: '#99f6e4', header: '#ccfbf1', label: '#0f766e' }, // teal
  { row: '#fefce8', done: '#ca8a04', doneHover: '#a16207', hover: '#fef08a', header: '#fef9c3', label: '#854d0e' }, // yellow
  { row: '#fef2f2', done: '#ef4444', doneHover: '#dc2626', hover: '#fecaca', header: '#fee2e2', label: '#991b1b' }, // red
];

function categoryColor(name) {
  if (!name) return null;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ---- API ----
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

// ---- Data loading ----
async function loadHabits() {
  state.habits = await api('GET', '/api/habits');
}

async function loadMonth() {
  let prevYear = state.year, prevMonth = state.month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  state.prevYear = prevYear;
  state.prevMonth = prevMonth;

  const [cur, prev] = await Promise.all([
    api('GET', `/api/month/${state.year}/${state.month}`),
    api('GET', `/api/month/${prevYear}/${prevMonth}`),
  ]);

  state.logs = new Set(cur.logs.map(l => `${l.habit_id}-${l.date}`));
  state.remarks = {};
  cur.remarks.forEach(r => { state.remarks[r.date] = r.remark; });

  state.prevLogs = new Set(prev.logs.map(l => `${l.habit_id}-${l.date}`));
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
  const days = countableDays(year, month);
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

function calcCategoryStats(logsSet, habits, year, month) {
  const days = countableDays(year, month);
  if (!days) return {};
  const active = habits.filter(h => h.active);
  const result = {};
  const seen = new Set();
  for (const h of active) {
    const cat = h.category || '';
    if (seen.has(cat)) continue;
    seen.add(cat);
    const catHabits = active.filter(a => (a.category || '') === cat);
    let done = 0;
    for (let d = 1; d <= days; d++) {
      const date = fmtDate(year, month, d);
      catHabits.forEach(a => { if (logsSet.has(`${a.id}-${date}`)) done++; });
    }
    const total = catHabits.length * days;
    result[cat] = { done, total, pct: total > 0 ? Math.round(done / total * 100) : 0 };
  }
  return result;
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

// ---- Helpers ----
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function fmtDate(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

// ---- Render stats bar ----
function renderStatsBar() {
  const { habits, logs, prevLogs, year, month, prevYear, prevMonth } = state;
  const bar = document.getElementById('stats-bar');
  bar.innerHTML = '';

  const cur  = calcOverallStats(logs, habits, year, month);
  const prev = calcOverallStats(prevLogs, habits, prevYear, prevMonth);

  if (!cur) return; // future month or no habits

  // Current month card
  const curCard = document.createElement('div');
  curCard.className = 'stat-card';
  const days = countableDays(year, month);
  curCard.innerHTML =
    `<span class="stat-label">${MONTH_NAMES[month - 1]} ${year} · Completion</span>` +
    `<span class="stat-value">${cur.pct}%</span>` +
    `<span class="stat-sub">${cur.done} / ${cur.total} habit-days (${days}d tracked)</span>`;
  bar.appendChild(curCard);

  // Comparison card (only if previous month has data)
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

  // Category comparison cards
  const curCatStats  = calcCategoryStats(logs, habits, year, month);
  const prevCatStats = calcCategoryStats(prevLogs, habits, prevYear, prevMonth);

  const seenCats = new Set();
  const orderedCats = [];
  for (const h of habits.filter(h => h.active)) {
    const cat = h.category || '';
    if (!seenCats.has(cat)) { seenCats.add(cat); orderedCats.push(cat); }
  }

  for (const cat of orderedCats) {
    if (!cat) continue;
    const curStat  = curCatStats[cat];
    const prevStat = prevCatStats[cat];
    if (!curStat) continue;

    const color = categoryColor(cat);
    const catCard = document.createElement('div');
    catCard.className = 'stat-card stat-card-cat';
    if (color) catCard.style.borderTop = `3px solid ${color.done}`;

    let deltaHtml = '';
    if (prevStat && prevStat.total > 0) {
      const delta = curStat.pct - prevStat.pct;
      const sign  = delta >= 0 ? '+' : '';
      const cls   = delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat';
      const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
      deltaHtml = `<span class="stat-cat-delta ${cls}">${arrow} ${sign}${delta}%</span>`;
    }

    const prevPctLabel = (prevStat && prevStat.total > 0) ? `${prevStat.pct}%` : 'N/A';
    catCard.innerHTML =
      `<span class="stat-label" style="${color ? `color:${color.label}` : ''}">${cat}</span>` +
      `<div class="stat-cat-row">` +
        `<span class="stat-cat-pct" style="${color ? `color:${color.done}` : ''}">${curStat.pct}%</span>` +
        deltaHtml +
      `</div>` +
      `<span class="stat-sub">vs ${MONTH_NAMES[prevMonth - 1]}: ${prevPctLabel}</span>`;

    bar.appendChild(catCard);
  }
}

// ---- Render heatmap ----
function renderHeatmap() {
  const { year, month, habits, logs, remarks } = state;
  const days = daysInMonth(year, month);
  const today = new Date();
  const isCurMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = today.getDate();

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
    const dow = new Date(year, month - 1, d).getDay();
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

  // -- TBODY (grouped by category) --
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
    // Collect ordered unique categories
    const seenCats = new Set();
    const orderedCats = [];
    for (const h of activeHabits) {
      const cat = h.category || '';
      if (!seenCats.has(cat)) { seenCats.add(cat); orderedCats.push(cat); }
    }

    orderedCats.forEach(cat => {
      const color = categoryColor(cat);
      const catHabits = activeHabits.filter(h => (h.category || '') === cat);

      // Category header row (only for named categories)
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

      // Habit rows
      catHabits.forEach(habit => {
        const tr = document.createElement('tr');
        if (color) {
          tr.style.setProperty('--cell-done', color.done);
          tr.style.setProperty('--cell-done-hover', color.doneHover);
          tr.style.setProperty('--cell-hover', color.hover);
          tr.style.setProperty('--cell-row', color.row);
        }

        const nameTd = document.createElement('td');
        nameTd.className = 'habit-name-cell';
        if (color) nameTd.style.background = color.row;
        const habitStats = calcHabitPct(habit.id, logs, year, month);
        const pctBadge = habitStats
          ? `<span class="habit-pct">${habitStats.pct}%</span>`
          : '';
        nameTd.innerHTML = `<span class="habit-name-text" title="${habit.name}">${habit.name}</span>${pctBadge}`;
        tr.appendChild(nameTd);

        for (let d = 1; d <= days; d++) {
          const date = fmtDate(year, month, d);
          const dow = new Date(year, month - 1, d).getDay();
          const isToday = isCurMonth && d === todayDay;
          const done = logs.has(`${habit.id}-${date}`);

          const td = document.createElement('td');
          td.className = 'log-cell';
          if (done) td.classList.add('done');
          if (isToday) td.classList.add('today');
          if (dow === 0 || dow === 6) td.classList.add('weekend');

          td.addEventListener('click', () => toggleLog(habit.id, date, td));
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      });
    });
  }

  // Notes row (always shown at the bottom)
  const notesTr = document.createElement('tr');
  notesTr.className = 'notes-row';

  const notesLabel = document.createElement('td');
  notesLabel.className = 'habit-name-cell notes-label';
  notesLabel.textContent = 'Notes';
  notesTr.appendChild(notesLabel);

  for (let d = 1; d <= days; d++) {
    const date = fmtDate(year, month, d);
    const dow = new Date(year, month - 1, d).getDay();
    const isToday = isCurMonth && d === todayDay;

    const td = document.createElement('td');
    td.className = 'note-cell';
    if (remarks[date]) td.classList.add('has-note');
    if (isToday) td.classList.add('today');
    if (dow === 0 || dow === 6) td.classList.add('weekend');
    if (remarks[date]) td.title = remarks[date];

    td.addEventListener('click', () => openDayModal(date));
    notesTr.appendChild(td);
  }

  tbody.appendChild(notesTr);
  table.appendChild(tbody);

  // Measure the widest habit name text and set --name-col-width accordingly
  requestAnimationFrame(() => {
    const sampleText = document.querySelector('.habit-name-text');
    if (!sampleText) return;

    const measurer = document.createElement('span');
    measurer.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(sampleText).font};`;
    document.body.appendChild(measurer);

    let maxTextWidth = 0;
    document.querySelectorAll('.habit-name-text').forEach(el => {
      measurer.textContent = el.textContent;
      maxTextWidth = Math.max(maxTextWidth, measurer.offsetWidth);
    });
    document.body.removeChild(measurer);

    // padding (0.75rem × 2 ≈ 24px) + gap (0.3rem ≈ 5px) + pct badge (≈36px) + breathing room (12px)
    const colWidth = maxTextWidth + 24 + 5 + 36 + 12;
    document.documentElement.style.setProperty('--name-col-width', `${colWidth}px`);
  });
}

// ---- Toggle log ----
async function toggleLog(habitId, date, cell) {
  const key = `${habitId}-${date}`;
  try {
    const { done } = await api('POST', '/api/logs/toggle', { habit_id: habitId, date });
    if (done) { state.logs.add(key); cell.classList.add('done'); }
    else       { state.logs.delete(key); cell.classList.remove('done'); }
  } catch (e) {
    console.error('Toggle failed', e);
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
  const modal = document.getElementById('day-modal');
  const date = modal.dataset.date;
  const remark = document.getElementById('modal-remark').value;
  await api('POST', '/api/remarks', { date, remark });
  state.remarks[date] = remark;
  modal.classList.remove('open');
  renderHeatmap();
}

function closeDayModal() {
  document.getElementById('day-modal').classList.remove('open');
}

// ---- Habits modal ----
function openHabitsModal() {
  renderHabitsList();
  document.getElementById('habits-modal').classList.add('open');
}

function closeHabitsModal() {
  document.getElementById('habits-modal').classList.remove('open');
  renderHeatmap();
}

function renderHabitsList() {
  const list = document.getElementById('habits-list');
  list.innerHTML = '';

  if (state.habits.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">No habits added yet.</p>';
    return;
  }

  // Mirror the heat map grouping: collect categories in sort_order appearance order
  const seenCats = new Set();
  const orderedCats = [];
  for (const h of state.habits) {
    const cat = h.category || '';
    if (!seenCats.has(cat)) { seenCats.add(cat); orderedCats.push(cat); }
  }

  orderedCats.forEach(cat => {
    const color = categoryColor(cat);
    const catHabits = state.habits.filter(h => (h.category || '') === cat);

    // Category divider — same label style as the heat map header
    if (cat) {
      const divider = document.createElement('div');
      divider.className = 'habits-list-category';
      divider.textContent = cat;
      if (color) {
        divider.style.color = color.label;
        divider.style.borderLeftColor = color.done;
        divider.style.background = color.header;
      }
      list.appendChild(divider);
    }

    catHabits.forEach((habit, catIdx) => {
      const prevId = catIdx > 0 ? catHabits[catIdx - 1].id : null;
      const nextId = catIdx < catHabits.length - 1 ? catHabits[catIdx + 1].id : null;
      const hColor = categoryColor(habit.category);
      const item = document.createElement('div');
      item.className = `habit-item${habit.active ? '' : ' inactive'}`;
      if (hColor) item.style.borderLeftColor = hColor.done;

      item.innerHTML =
        `<div class="habit-reorder">` +
          `<button class="btn-icon btn-reorder" title="Move up" onclick="swapHabits(${habit.id},${prevId})" ${!prevId ? 'disabled' : ''}>↑</button>` +
          `<button class="btn-icon btn-reorder" title="Move down" onclick="swapHabits(${habit.id},${nextId})" ${!nextId ? 'disabled' : ''}>↓</button>` +
        `</div>` +
        `<input class="habit-name-input" type="text" value="${habit.name}" maxlength="60"` +
          ` onblur="saveHabitName(${habit.id}, this.value)"` +
          ` onkeydown="if(event.key==='Enter') this.blur()">` +
        `<input class="habit-category-input" type="text" value="${habit.category || ''}" placeholder="Category..."` +
          ` onblur="saveHabitCategory(${habit.id}, this.value)"` +
          ` onkeydown="if(event.key==='Enter') this.blur()">` +
        `<div class="habit-item-actions">` +
          `<button class="btn-icon" title="${habit.active ? 'Pause' : 'Resume'}" onclick="toggleHabitActive(${habit.id}, ${habit.active})">${habit.active ? 'Pause' : 'Resume'}</button>` +
          `<button class="btn-icon btn-danger" title="Delete permanently" onclick="deleteHabit(${habit.id})">Delete</button>` +
        `</div>`;

      list.appendChild(item);
    });
  });
}

async function addHabit() {
  const input = document.getElementById('new-habit-input');
  const name = input.value.trim();
  if (!name) return;
  const habit = await api('POST', '/api/habits', { name });
  state.habits.push(habit);
  input.value = '';
  renderHabitsList();
}

async function swapHabits(id, targetId) {
  if (!targetId) return;
  await api('POST', '/api/habits/reorder', { id, targetId });
  state.habits = await api('GET', '/api/habits');
  renderHabitsList();
}

async function saveHabitName(id, name) {
  const habit = state.habits.find(h => h.id === id);
  const trimmed = name.trim();
  if (!habit || !trimmed || habit.name === trimmed) {
    // Revert input to current name if empty or unchanged
    if (habit && !trimmed) renderHabitsList();
    return;
  }
  await api('PUT', `/api/habits/${id}`, { name: trimmed });
  habit.name = trimmed;
  renderHeatmap();
}

async function saveHabitCategory(id, category) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit || (habit.category || '') === category.trim()) return;
  await api('PUT', `/api/habits/${id}`, { category: category.trim() });
  habit.category = category.trim();
  renderHeatmap();
}

async function toggleHabitActive(id, currentActive) {
  await api('PUT', `/api/habits/${id}`, { active: !currentActive });
  const habit = state.habits.find(h => h.id === id);
  habit.active = currentActive ? 0 : 1;
  renderHabitsList();
}

async function deleteHabit(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!confirm(`Delete "${habit.name}" and all its history? This cannot be undone.`)) return;
  await api('DELETE', `/api/habits/${id}`);
  state.habits = state.habits.filter(h => h.id !== id);
  for (const key of state.logs) {
    if (key.startsWith(`${id}-`)) state.logs.delete(key);
  }
  renderHabitsList();
}

// ---- Month navigation ----
async function goToMonth(year, month) {
  state.year = year;
  state.month = month;
  await loadMonth();
  renderHeatmap();
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
  document.getElementById('new-habit-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addHabit();
  });

  document.getElementById('btn-close-day').addEventListener('click', closeDayModal);
  document.getElementById('btn-cancel-day').addEventListener('click', closeDayModal);
  document.getElementById('btn-save-day').addEventListener('click', saveDayModal);
  document.getElementById('modal-remark').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDayModal();
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  });
}

init();
