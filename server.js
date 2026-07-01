const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new Database(path.join(__dirname, 'habits.db'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Init DB
db.exec(`
  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    UNIQUE(habit_id, date),
    FOREIGN KEY(habit_id) REFERENCES habits(id)
  );
  CREATE TABLE IF NOT EXISTS remarks (
    date TEXT PRIMARY KEY,
    remark TEXT NOT NULL DEFAULT ''
  );
`);

// Migrations
try { db.exec("ALTER TABLE habits ADD COLUMN category TEXT NOT NULL DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE habits ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS weekly_reflections (week_date TEXT PRIMARY KEY, reflection TEXT NOT NULL DEFAULT '')"); } catch(e) {}

// Initialize sort_order for habits that still have it at 0
const _maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits").get().m;
db.prepare("SELECT id FROM habits WHERE sort_order = 0 ORDER BY id").all()
  .forEach((h, i) => db.prepare("UPDATE habits SET sort_order = ? WHERE id = ?").run(_maxOrder + (i + 1) * 10, h.id));

// --- Habits ---
app.get('/api/habits', (req, res) => {
  res.json(db.prepare('SELECT * FROM habits ORDER BY sort_order ASC, id ASC').all());
});

app.post('/api/habits', (req, res) => {
  const { name, category = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits").get().m;
  const result = db.prepare('INSERT INTO habits (name, category, sort_order) VALUES (?, ?, ?)').run(name.trim(), category.trim(), maxOrder + 10);
  res.json({ id: result.lastInsertRowid, name: name.trim(), category: category.trim(), active: 1, sort_order: maxOrder + 10 });
});

app.put('/api/habits/:id', (req, res) => {
  const { name, active, category } = req.body;
  if (name !== undefined)     db.prepare('UPDATE habits SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (active !== undefined)   db.prepare('UPDATE habits SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  if (category !== undefined) db.prepare('UPDATE habits SET category = ? WHERE id = ?').run(category.trim(), req.params.id);
  res.json({ success: true });
});

app.delete('/api/habits/:id', (req, res) => {
  db.prepare('DELETE FROM logs WHERE habit_id = ?').run(req.params.id);
  db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Month data (logs + remarks combined) ---
app.get('/api/month/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const start = `${year}-${month.padStart(2, '0')}-01`;
  const end   = `${year}-${month.padStart(2, '0')}-31`;
  const logs               = db.prepare('SELECT habit_id, date FROM logs WHERE date >= ? AND date <= ?').all(start, end);
  const remarks            = db.prepare('SELECT date, remark FROM remarks WHERE date >= ? AND date <= ?').all(start, end);
  const weeklyReflections  = db.prepare('SELECT week_date, reflection FROM weekly_reflections WHERE week_date >= ? AND week_date <= ?').all(start, end);
  res.json({ logs, remarks, weeklyReflections });
});

// --- Toggle log ---
app.post('/api/logs/toggle', (req, res) => {
  const { habit_id, date } = req.body;
  const existing = db.prepare('SELECT id FROM logs WHERE habit_id = ? AND date = ?').get(habit_id, date);
  if (existing) {
    db.prepare('DELETE FROM logs WHERE id = ?').run(existing.id);
    res.json({ done: false });
  } else {
    db.prepare('INSERT INTO logs (habit_id, date) VALUES (?, ?)').run(habit_id, date);
    res.json({ done: true });
  }
});

// --- Weekly reflection ---
app.post('/api/weekly-reflections', (req, res) => {
  const { week_date, reflection } = req.body;
  db.prepare(
    'INSERT INTO weekly_reflections (week_date, reflection) VALUES (?, ?) ON CONFLICT(week_date) DO UPDATE SET reflection = excluded.reflection'
  ).run(week_date, reflection ?? '');
  res.json({ success: true });
});

// --- Reorder habits ---
app.post('/api/habits/reorder', (req, res) => {
  const { id, targetId } = req.body;
  const h1 = db.prepare('SELECT sort_order FROM habits WHERE id = ?').get(id);
  const h2 = db.prepare('SELECT sort_order FROM habits WHERE id = ?').get(targetId);
  if (!h1 || !h2) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE habits SET sort_order = ? WHERE id = ?').run(h2.sort_order, id);
  db.prepare('UPDATE habits SET sort_order = ? WHERE id = ?').run(h1.sort_order, targetId);
  res.json({ success: true });
});

// --- Remark ---
app.post('/api/remarks', (req, res) => {
  const { date, remark } = req.body;
  db.prepare(
    'INSERT INTO remarks (date, remark) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET remark = excluded.remark'
  ).run(date, remark ?? '');
  res.json({ success: true });
});

// --- Auto-backup ---
const DB_PATH     = path.join(__dirname, 'habits.db');
const BACKUP_DIR  = path.join(__dirname, 'backups');
const MAX_BACKUPS = 10;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function runBackup() {
  try {
    const ts   = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const dest = path.join(BACKUP_DIR, `habits-${ts}.db`);
    fs.copyFileSync(DB_PATH, dest);

    // Keep only the latest MAX_BACKUPS files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('habits-') && f.endsWith('.db'))
      .sort();
    files.slice(0, Math.max(0, files.length - MAX_BACKUPS))
      .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));

    console.log(`[backup] ${path.basename(dest)}`);
  } catch (e) {
    console.error('[backup] failed:', e.message);
  }
}

function shutdown() {
  console.log('\nBacking up database...');
  runBackup();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Habit Tracker running at http://localhost:${PORT}`);
  console.log('Access from other devices using your local IP address.');
  console.log(`Auto-backup on shutdown → ${BACKUP_DIR}`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error(`Run this to free it:  lsof -ti :${PORT} | xargs kill -9\nThen restart the server.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
