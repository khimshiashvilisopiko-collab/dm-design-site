require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'db') : path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'dm-design-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'ავტორიზაცია საჭიროა' });
}

// ---------- file upload ----------
// Uploaded files live under DATA_DIR (a Render Persistent Disk mount) when
// configured, so they survive redeploys — otherwise fall back to a local
// "uploads" folder for development.
const uploadDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB — enough for short product-demo video clips
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.webm', '.mov'];
    const ok = imageExts.includes(ext) || videoExts.includes(ext);
    cb(ok ? null : new Error('დაშვებულია მხოლოდ სურათები (jpg, png, webp) ან ვიდეო (mp4, webm, mov)'), ok);
  }
});

function mediaTypeFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image';
}

app.use('/uploads', express.static(uploadDir));

// =====================================================
// PUBLIC API
// =====================================================

// Get catalog items (optionally filtered by category), for the public site
app.get('/api/catalog', (req, res) => {
  const { category } = req.query;
  let rows;
  if (category && category !== 'all') {
    rows = db.prepare('SELECT * FROM catalog_items WHERE category = ? ORDER BY sort_order DESC, id DESC').all(category);
  } else {
    rows = db.prepare('SELECT * FROM catalog_items ORDER BY sort_order DESC, id DESC').all();
  }
  res.json(rows);
});

// Submit an inquiry / order request from the contact form
app.post('/api/inquiries', (req, res) => {
  const { name, phone, email, category, message } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'სახელი და ტელეფონი სავალდებულოა' });
  }
  const stmt = db.prepare(`INSERT INTO inquiries (name, phone, email, category, message) VALUES (?,?,?,?,?)`);
  const result = stmt.run(name.trim(), phone.trim(), (email || '').trim(), category || '', (message || '').trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

// =====================================================
// ADMIN AUTH
// =====================================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'არასწორი მომხმარებელი ან პაროლი' });
  }
  req.session.adminId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  res.json({ loggedIn: false });
});

app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.adminId);
  if (!bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'მიმდინარე პაროლი არასწორია' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'ახალი პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, req.session.adminId);
  res.json({ success: true });
});

// =====================================================
// ADMIN: CATALOG MANAGEMENT
// =====================================================

app.get('/api/admin/catalog', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM catalog_items ORDER BY sort_order DESC, id DESC').all();
  res.json(rows);
});

app.post('/api/admin/catalog', requireAuth, upload.single('image'), (req, res) => {
  const { category, title, description, sort_order, featured } = req.body;
  if (!category || !title || !req.file) {
    return res.status(400).json({ error: 'კატეგორია, სათაური და ფაილი სავალდებულოა' });
  }
  const imagePath = '/uploads/' + req.file.filename;
  const mediaType = mediaTypeFromFilename(req.file.filename);
  const stmt = db.prepare(`INSERT INTO catalog_items (category, title, description, image_path, media_type, sort_order, featured) VALUES (?,?,?,?,?,?,?)`);
  const result = stmt.run(category, title, description || '', imagePath, mediaType, Number(sort_order) || 0, featured ? 1 : 0);
  res.json({ success: true, id: result.lastInsertRowid, image_path: imagePath, media_type: mediaType });
});

app.put('/api/admin/catalog/:id', requireAuth, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'ვერ მოიძებნა' });

  const { category, title, description, sort_order, featured } = req.body;
  let imagePath = existing.image_path;
  let mediaType = existing.media_type;
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
    mediaType = mediaTypeFromFilename(req.file.filename);
    // remove old uploaded file if it was a real upload (not a placeholder asset)
    if (existing.image_path.startsWith('/uploads/')) {
      const oldFile = path.join(uploadDir, path.basename(existing.image_path));
      fs.unlink(oldFile, () => {});
    }
  }
  db.prepare(`UPDATE catalog_items SET category=?, title=?, description=?, image_path=?, media_type=?, sort_order=?, featured=? WHERE id=?`)
    .run(category || existing.category, title || existing.title, description ?? existing.description, imagePath, mediaType, Number(sort_order) || 0, featured ? 1 : 0, id);
  res.json({ success: true });
});

app.delete('/api/admin/catalog/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'ვერ მოიძებნა' });
  if (existing.image_path.startsWith('/uploads/')) {
    fs.unlink(path.join(uploadDir, path.basename(existing.image_path)), () => {});
  }
  db.prepare('DELETE FROM catalog_items WHERE id = ?').run(id);
  res.json({ success: true });
});

// =====================================================
// ADMIN: INQUIRIES
// =====================================================

app.get('/api/admin/inquiries', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  res.json(rows);
});

app.put('/api/admin/inquiries/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ['new', 'contacted', 'in_progress', 'closed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'არასწორი სტატუსი' });
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, id);
  res.json({ success: true });
});

app.delete('/api/admin/inquiries/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =====================================================
// STATIC SITE
// =====================================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// central error handler — catches multer errors (bad file type, too large) and
// anything else thrown in a route, returning clean JSON instead of a stack trace
app.use((err, req, res, next) => {
  if (err) {
    console.error(err.message);
    const status = err.status || 400;
    return res.status(status).json({ error: err.message || 'დაფიქსირდა შეცდომა' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`DM Design server running on http://localhost:${PORT}`);
});
