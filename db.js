const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Data directory — configurable via DATA_DIR so it can point at a Render
// Persistent Disk mount (e.g. /var/data). Falls back to a local "data"
// folder next to this file for local development.
const dataDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'db') : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'dmdesign.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,          -- kitchen | bathroom | living | custom
  title TEXT NOT NULL,
  description TEXT,
  image_path TEXT NOT NULL,
  media_type TEXT DEFAULT 'image', -- image | video
  sort_order INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Additional photos/videos belonging to a single catalog item, so one
-- piece of furniture can show a scrollable set of angles/media on the
-- public site instead of just one cover image.
CREATE TABLE IF NOT EXISTS catalog_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_item_id INTEGER NOT NULL,
  media_path TEXT NOT NULL,
  media_type TEXT DEFAULT 'image', -- image | video
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  category TEXT,
  message TEXT,
  status TEXT DEFAULT 'new',       -- new | contacted | in_progress | closed
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
`);

// migration safety net: if catalog_items already existed from before the
// media_type column was introduced, add it now so old databases still work
const catalogColumns = db.prepare(`PRAGMA table_info(catalog_items)`).all().map(c => c.name);
if (!catalogColumns.includes('media_type')) {
  db.exec(`ALTER TABLE catalog_items ADD COLUMN media_type TEXT DEFAULT 'image'`);
}

// migration safety net: backfill catalog_media for any existing catalog_items
// row (from before the multi-media gallery feature) that has no media rows yet
const orphanItems = db.prepare(`
  SELECT ci.id, ci.image_path, ci.media_type FROM catalog_items ci
  LEFT JOIN catalog_media cm ON cm.catalog_item_id = ci.id
  WHERE cm.id IS NULL
`).all();
if (orphanItems.length) {
  const backfill = db.prepare(`INSERT INTO catalog_media (catalog_item_id, media_path, media_type, sort_order) VALUES (?,?,?,0)`);
  orphanItems.forEach(item => backfill.run(item.id, item.image_path, item.media_type || 'image'));
}

// Seed a default admin user if none exists (username/password printed to console on first run)
const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
if (adminCount === 0) {
  const defaultUser = process.env.ADMIN_USER || 'admin';
  const defaultPass = process.env.ADMIN_PASS || 'dmdesign2026';
  const hash = bcrypt.hashSync(defaultPass, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(defaultUser, hash);
  console.log('----------------------------------------------------');
  console.log('Admin user created:');
  console.log('  username:', defaultUser);
  console.log('  password:', defaultPass);
  console.log('  (change this via the ADMIN_USER / ADMIN_PASS env vars, or in the admin panel)');
  console.log('----------------------------------------------------');
}

// Seed a few sample catalog items so the site isn't empty on first run
const itemCount = db.prepare('SELECT COUNT(*) AS c FROM catalog_items').get().c;
if (itemCount === 0) {
  const seed = db.prepare(`INSERT INTO catalog_items (category, title, description, image_path, sort_order, featured) VALUES (?,?,?,?,?,?)`);
  const seedMedia = db.prepare(`INSERT INTO catalog_media (catalog_item_id, media_path, media_type, sort_order) VALUES (?,?,?,?)`);
  const rows = [
    ['kitchen', 'სამზარეულოს კომპლექტი "მუხა"', 'მუხის ხის ფასადები, ჩაშენებული ტექნიკით და მინიმალისტური ფურნიტურით.', '/assets/placeholder-kitchen.svg', 1, 1],
    ['bathroom', 'აბაზანის კარადა "მარმარილო"', 'თანამედროვე წყალგამძლე კარადა, ქვის იმიტაციის ზედაპირით.', '/assets/placeholder-bathroom.svg', 1, 1],
    ['living', 'მისაღების კედლის სისტემა', 'ტელევიზორის კედელი ჩაშენებული განათებით და ღია თაროებით.', '/assets/placeholder-living.svg', 1, 1],
    ['custom', 'საოფისე კაბინეტი', 'ინდივიდუალურად დაპროექტებული სამუშაო სივრცე შეკვეთით.', '/assets/placeholder-custom.svg', 1, 0],
  ];
  rows.forEach(r => {
    const result = seed.run(...r);
    seedMedia.run(result.lastInsertRowid, r[3], 'image', 0);
  });
}

module.exports = db;
