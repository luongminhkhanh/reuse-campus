const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'reuse.db'));

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  school        TEXT,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tin đăng: bán / trao đổi / tặng
CREATE TABLE IF NOT EXISTS listings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('sell','exchange','give')),
  price          INTEGER NOT NULL DEFAULT 0,
  item_condition TEXT NOT NULL DEFAULT 'good',
  wanted         TEXT,             -- món muốn đổi (với tin trao đổi)
  location       TEXT,
  image          TEXT,             -- tên file trong public/uploads
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','hidden')),
  partner_id     INTEGER REFERENCES users(id) ON DELETE SET NULL, -- người đã giao dịch cùng
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  done_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_listings_search ON listings(status, category, type, price);
CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);

-- Đề xuất trao đổi: from_user đem offered_listing để đổi lấy listing
CREATE TABLE IF NOT EXISTS offers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id         INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  offered_listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  from_user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message            TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT
);

-- Đánh giá sau giao dịch: mỗi người chỉ đánh giá 1 lần cho 1 tin
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reviewer_id, listing_id)
);

-- Báo cáo tin giả / vi phạm
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (listing_id, reporter_id)
);
`);

// Chạy nhiều câu lệnh trong 1 giao dịch: lỗi ở đâu thì huỷ toàn bộ
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Lần chạy đầu tiên: tạo dữ liệu mẫu
if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
  transaction(() => require('./seed')(db));
  console.log('✔ Đã tạo dữ liệu mẫu');
}

module.exports = { db, transaction };
