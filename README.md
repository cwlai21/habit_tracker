# Habit Tracker

A personal habit tracker with a monthly heat map, daily notes, category grouping, and completion statistics. Built as a static web app backed by [Supabase](https://supabase.com) — no server required.

---

## Features

- **Monthly heat map** — habits as rows, days as columns; click any cell to mark done/not done
- **Categories** — group habits with colour-coded category headers
- **Custom ordering** — reorder habits with ↑ ↓ buttons
- **Daily notes** — click any cell in the Notes row to write a free-text note for that day
- **Completion stats** — overall monthly completion % and comparison with the previous month
- **Per-habit %** — each habit shows its own completion rate in the name column
- **Cross-device** — data stored in Supabase, accessible from any device via the URL

---

## Tech stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Vanilla HTML / CSS / JavaScript   |
| Database | Supabase (hosted PostgreSQL)      |
| Hosting  | GitHub Pages                      |

---

## Deployment

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a new project.

### 2. Create the database tables

Open your project → **SQL Editor** and run:

```sql
create table if not exists habits (
  id bigserial primary key,
  name text not null,
  active integer not null default 1,
  category text not null default '',
  sort_order integer not null default 0
);

create table if not exists logs (
  id bigserial primary key,
  habit_id bigint references habits(id),
  date text not null,
  unique(habit_id, date)
);

create table if not exists remarks (
  date text primary key,
  remark text not null default ''
);

alter table habits disable row level security;
alter table logs    disable row level security;
alter table remarks disable row level security;
```

### 3. Configure credentials

Open `docs/config.js` and paste your Supabase credentials (found on your project dashboard under **Copy** → **Project URL** and **Publishable key**):

```js
const SUPABASE_URL      = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

### 4. Push to GitHub

```bash
cd habit-tracker
git init
git checkout -b main
git add docs/ .gitignore
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/habit-tracker.git
git push -u origin main
```

### 5. Enable GitHub Pages

Go to the GitHub repo → **Settings → Pages** → Source: **Deploy from branch** → Branch: `main`, Folder: `/docs` → Save.

The app will be live at `https://YOUR_USERNAME.github.io/habit-tracker` within a few minutes.

---

## Local development (optional)

A local Express + SQLite version is also included for offline use.

```bash
npm install
npm start        # runs on http://localhost:3000
```

Data is stored in `habits.db`. The server automatically backs up the database to the `backups/` folder whenever it is shut down (Ctrl+C), keeping the 10 most recent backups.

---

## Usage

### Managing habits

Click **Manage Habits** in the top-right corner to:
- Add a new habit (type a name and press Enter or click Add)
- Assign a category (type in the category field; habits with the same category are grouped and colour-coded)
- Reorder habits with the ↑ ↓ buttons
- Pause a habit (hides it from the tracker but keeps its history)
- Delete a habit permanently

Habits and their categories persist month to month. Adjust them at the end of each month to plan the next one.

### Logging habits

Click any coloured cell in the heat map to toggle it between done and not done.

### Daily notes

Click any cell in the **Notes** row at the bottom of the heat map to open a text note for that day. Days with notes show a ✎ icon. Press **Cmd+Enter** (or **Ctrl+Enter**) to save quickly.

### Navigating months

Use the **←** and **→** arrows in the header to browse past and future months.
