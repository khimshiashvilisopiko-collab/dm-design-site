const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'data', 'dmdesign.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,          -- kitchen | bathroom | living | custom
  title TEXT NOT NULL,
  description TEXT,
  image_path TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
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
  const rows = [
    ['kitchen', 'სამზარეულოს კომპლექტი "მუხა"', 'მუხის ხის ფასადები, ჩაშენებული ტექნიკით და მინიმალისტური ფურნიტურით.', '/assets/placeholder-kitchen.svg', 1, 1],
    ['bathroom', 'აბაზანის კარადა "მარმარილო"', 'თანამედროვე წყალგამძლე კარადა, ქვის იმიტაციის ზედაპირით.', '/assets/placeholder-bathroom.svg', 1, 1],
    ['living', 'მისაღების კედლის სისტემა', 'ტელევიზორის კედელი ჩაშენებული განათებით და ღია თაროებით.', '/assets/placeholder-living.svg', 1, 1],
    ['custom', 'საოფისე კაბინეტი', 'ინდივიდუალურად დაპროექტებული სამუშაო სივრცე შეკვეთით.', '/assets/placeholder-custom.svg', 1, 0],
  ];
  rows.forEach(r => seed.run(...r));
}

module.exports = db;
