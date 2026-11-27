const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { db, transaction } = require('./db');
const C = require('./constants');
const { hashPassword, verifyPassword } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ================== Tiện ích ================== */

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Cắt khoảng trắng và giới hạn độ dài chuỗi người dùng gửi lên
function str(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(404, 'Không tìm thấy');
  return id;
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, school: u.school, phone: u.phone };
}

// Thông tin hồ sơ ngắn gọn của một người dùng (kèm điểm đánh giá)
function userSummary(id, withContact) {
  const u = db.prepare('SELECT id, name, school, phone, email, created_at FROM users WHERE id = ?').get(id);
  if (!u) return null;
  const r = db.prepare('SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*) AS count FROM reviews WHERE reviewee_id = ?').get(id);
  const done = db.prepare("SELECT COUNT(*) AS c FROM listings WHERE status = 'done' AND (user_id = ? OR partner_id = ?)").get(id, id).c;
  const summary = {
    id: u.id, name: u.name, school: u.school, joined: u.created_at,
    rating: r.avg, reviewCount: r.count, doneCount: done,
  };
  if (withContact) Object.assign(summary, { phone: u.phone, email: u.email });
  return summary;
}

// Từ chối mọi đề xuất đang chờ liên quan tới một tin (khi tin đã giao dịch / bị ẩn / bị xoá)
function closePendingOffers(listingId) {
  db.prepare(`UPDATE offers SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
              WHERE status = 'pending' AND (listing_id = ? OR offered_listing_id = ?)`).run(listingId, listingId);
}

function removeImage(filename) {
  if (!filename) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(filename)), { force: true }, () => {});
}

/* ================== Middleware ================== */

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 },
}));

// Gắn người dùng đang đăng nhập vào req.user
app.use((req, res, next) => {
  if (req.session.userId) {
    req.user = db.prepare('SELECT id, name, email, role, school, phone FROM users WHERE id = ?').get(req.session.userId);
    if (!req.user) delete req.session.userId;
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return next(httpError(401, 'Bạn cần đăng nhập để thực hiện thao tác này'));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return next(httpError(403, 'Chỉ quản trị viên mới được truy cập'));
  next();
}

const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    IMAGE_EXT[file.mimetype] ? cb(null, true) : cb(httpError(400, 'Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF')),
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

/* ================== Thông tin chung ================== */

app.get('/api/meta', (req, res) => {
  res.json({
    categories: C.CATEGORIES,
    types: C.TYPES,
    conditions: C.CONDITIONS,
    reportReasons: C.REPORT_REASONS,
  });
});

/* ================== Tài khoản ================== */

app.post('/api/auth/register', async (req, res) => {
  const name = str(req.body.name, 60);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  const school = str(req.body.school, 100);
  const phone = str(req.body.phone, 20);

  if (name.length < 2) throw httpError(400, 'Vui lòng nhập họ tên');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Email không hợp lệ');
  if (password.length < 6) throw httpError(400, 'Mật khẩu cần ít nhất 6 ký tự');
  if (phone && !/^[0-9+ .-]{8,20}$/.test(phone)) throw httpError(400, 'Số điện thoại không hợp lệ');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'Email này đã được đăng ký');

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (name, email, password_hash, school, phone) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hashPassword(password), school || null, phone || null);

  await regenerateSession(req);
  req.session.userId = Number(lastInsertRowid);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
    throw httpError(401, 'Email hoặc mật khẩu không đúng');
  }
  await regenerateSession(req);
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

/* ================== Tin đăng ================== */

const LISTING_SELECT = `
  SELECT l.*, u.name AS owner_name, u.school AS owner_school
  FROM listings l JOIN users u ON u.id = l.user_id`;

// Tìm kiếm: từ khoá, danh mục, loại tin, khoảng giá, sắp xếp
app.get('/api/listings', (req, res) => {
  const { q, category, type, min, max, sort } = req.query;
  const where = ["l.status = 'active'"];
  const params = [];

  const keyword = str(q, 100);
  if (keyword) {
    where.push('(l.title LIKE ? OR l.description LIKE ? OR l.wanted LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category && C.CATEGORIES[category]) { where.push('l.category = ?'); params.push(category); }
  if (type && C.TYPES[type]) { where.push('l.type = ?'); params.push(type); }
  if (min !== undefined && min !== '' && Number.isFinite(Number(min))) { where.push('l.price >= ?'); params.push(Number(min)); }
  if (max !== undefined && max !== '' && Number.isFinite(Number(max))) { where.push('l.price <= ?'); params.push(Number(max)); }

  const orderBy = {
    newest: 'l.created_at DESC, l.id DESC',
    oldest: 'l.created_at ASC',
    price_asc: 'l.price ASC, l.created_at DESC',
    price_desc: 'l.price DESC, l.created_at DESC',
  }[sort] || 'l.created_at DESC, l.id DESC';

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM listings l WHERE ${whereSql}`).get(...params).c;
  const items = db.prepare(`${LISTING_SELECT} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT 60`).all(...params);
  res.json({ total, items });
});

app.get('/api/listings/:id', (req, res) => {
  const id = toId(req.params.id);
  const listing = db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(id);
  if (!listing) throw httpError(404, 'Tin đăng không tồn tại');

  const me = req.user;
  const isOwner = !!me && me.id === listing.user_id;
  const isAdmin = me?.role === 'admin';
  if (listing.status === 'hidden' && !isOwner && !isAdmin) {
    throw httpError(404, 'Tin đăng không tồn tại hoặc đã bị ẩn');
  }

  const result = {
    listing,
    isOwner,
    owner: userSummary(listing.user_id, !!me),
    partner: listing.partner_id ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(listing.partner_id) : null,
  };

  if (isOwner) {
    // Chủ tin xem các đề xuất trao đổi gửi tới tin này
    result.offers = db.prepare(`
      SELECT o.*, u.name AS from_name, ol.title AS offered_title, ol.price AS offered_price,
             ol.image AS offered_image, ol.category AS offered_category, ol.status AS offered_status
      FROM offers o
      JOIN users u ON u.id = o.from_user_id
      JOIN listings ol ON ol.id = o.offered_listing_id
      WHERE o.listing_id = ?
      ORDER BY o.status = 'pending' DESC, o.created_at DESC`).all(id);
  } else if (me) {
    result.myOffers = db.prepare(`
      SELECT o.id, o.status, o.created_at, ol.title AS offered_title
      FROM offers o JOIN listings ol ON ol.id = o.offered_listing_id
      WHERE o.listing_id = ? AND o.from_user_id = ? ORDER BY o.id DESC`).all(id, me.id);
    result.myActiveListings = db.prepare(
      "SELECT id, title FROM listings WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC"
    ).all(me.id);
    result.reported = !!db.prepare('SELECT 1 FROM reports WHERE listing_id = ? AND reporter_id = ?').get(id, me.id);
  }

  if (isAdmin) {
    result.reports = db.prepare(`
      SELECT r.*, u.name AS reporter_name FROM reports r JOIN users u ON u.id = r.reporter_id
      WHERE r.listing_id = ? ORDER BY r.created_at DESC`).all(id);
  }
  res.json(result);
});

function parseListingInput(body) {
  const data = {
    title: str(body.title, 100),
    description: str(body.description, 2000),
    category: String(body.category ?? ''),
    type: String(body.type ?? ''),
    item_condition: String(body.item_condition || 'good'),
    wanted: str(body.wanted, 300) || null,
    location: str(body.location, 100) || null,
    price: parseInt(String(body.price ?? '0').replace(/[^\d]/g, ''), 10) || 0,
  };
  if (data.title.length < 3) throw httpError(400, 'Tiêu đề cần ít nhất 3 ký tự');
  if (!C.CATEGORIES[data.category]) throw httpError(400, 'Vui lòng chọn danh mục');
  if (!C.TYPES[data.type]) throw httpError(400, 'Vui lòng chọn hình thức: bán, trao đổi hoặc tặng');
  if (!C.CONDITIONS[data.item_condition]) throw httpError(400, 'Tình trạng không hợp lệ');
  if (data.price > 1_000_000_000) throw httpError(400, 'Giá không hợp lệ');
  if (data.type === 'sell' && data.price <= 0) throw httpError(400, 'Vui lòng nhập giá bán');
  if (data.type === 'give') data.price = 0;
  if (data.type === 'exchange' && !data.wanted) throw httpError(400, 'Hãy mô tả món đồ bạn muốn đổi lấy');
  if (data.type !== 'exchange') data.wanted = null;
  return data;
}

// Đăng tin (kèm 1 ảnh, không bắt buộc)
app.post('/api/listings', requireAuth, upload.single('image'), (req, res) => {
  let data;
  try {
    data = parseListingInput(req.body);
  } catch (err) {
    if (req.file) removeImage(req.file.filename);
    throw err;
  }
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO listings (user_id, title, description, category, type, price, item_condition, wanted, location, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    req.user.id, data.title, data.description, data.category, data.type, data.price,
    data.item_condition, data.wanted, data.location, req.file ? req.file.filename : null
  );
  res.status(201).json({ id: Number(lastInsertRowid) });
});

app.delete('/api/listings/:id', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!l) throw httpError(404, 'Tin đăng không tồn tại');
  const isAdmin = req.user.role === 'admin';
  if (l.user_id !== req.user.id && !isAdmin) throw httpError(403, 'Bạn không có quyền xoá tin này');
  if (l.status === 'done' && !isAdmin) throw httpError(400, 'Tin đã giao dịch được giữ lại làm lịch sử, không thể xoá');
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  removeImage(l.image);
  res.json({ ok: true });
});

// Đánh dấu tin đã giao dịch (có thể ghi email người mua/nhận để hai bên đánh giá nhau)
app.post('/api/listings/:id/done', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!l) throw httpError(404, 'Tin đăng không tồn tại');
  if (l.user_id !== req.user.id) throw httpError(403, 'Chỉ người đăng mới được đánh dấu tin');
  if (l.status !== 'active') throw httpError(400, 'Tin này không còn ở trạng thái đang hiển thị');

  let partnerId = null;
  const buyerEmail = str(req.body.buyer_email, 120).toLowerCase();
  if (buyerEmail) {
    const buyer = db.prepare('SELECT id FROM users WHERE email = ?').get(buyerEmail);
    if (!buyer) throw httpError(400, 'Không tìm thấy tài khoản có email này trên ReUse Campus');
    if (buyer.id === req.user.id) throw httpError(400, 'Không thể giao dịch với chính mình');
    partnerId = buyer.id;
  }

  transaction(() => {
    db.prepare("UPDATE listings SET status = 'done', partner_id = ?, done_at = CURRENT_TIMESTAMP WHERE id = ?").run(partnerId, id);
    closePendingOffers(id);
  });
  res.json({ ok: true });
});

/* ================== Đề xuất trao đổi ================== */

app.post('/api/listings/:id/offers', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const target = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!target || target.status !== 'active') throw httpError(400, 'Tin này không còn nhận đề xuất');
  if (target.type !== 'exchange') throw httpError(400, 'Chỉ có thể đề xuất trao đổi với tin "Trao đổi"');
  if (target.user_id === req.user.id) throw httpError(400, 'Bạn không thể đề xuất đổi với tin của chính mình');

  const offeredId = Number(req.body.offered_listing_id);
  const offered = db.prepare('SELECT * FROM listings WHERE id = ?').get(offeredId);
  if (!offered || offered.user_id !== req.user.id || offered.status !== 'active') {
    throw httpError(400, 'Vui lòng chọn một món đồ đang hiển thị của bạn để đem đổi');
  }
  const dup = db.prepare(
    "SELECT 1 FROM offers WHERE listing_id = ? AND from_user_id = ? AND status = 'pending'"
  ).get(id, req.user.id);
  if (dup) throw httpError(409, 'Bạn đã có một đề xuất đang chờ cho tin này');

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO offers (listing_id, offered_listing_id, from_user_id, message) VALUES (?, ?, ?, ?)'
  ).run(id, offeredId, req.user.id, str(req.body.message, 500) || null);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

// accept / reject: chủ tin ; cancel: người gửi đề xuất
app.post('/api/offers/:id/:action', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const { action } = req.params;
  if (!['accept', 'reject', 'cancel'].includes(action)) throw httpError(404, 'Không tìm thấy');

  const o = db.prepare(`
    SELECT o.*, l.user_id AS owner_id, l.status AS target_status, ol.status AS offered_status
    FROM offers o
    JOIN listings l ON l.id = o.listing_id
    JOIN listings ol ON ol.id = o.offered_listing_id
    WHERE o.id = ?`).get(id);
  if (!o) throw httpError(404, 'Đề xuất không tồn tại');
  if (o.status !== 'pending') throw httpError(400, 'Đề xuất này đã được xử lý');

  const setStatus = (status) =>
    db.prepare('UPDATE offers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);

  if (action === 'cancel') {
    if (o.from_user_id !== req.user.id) throw httpError(403, 'Bạn không thể huỷ đề xuất này');
    setStatus('cancelled');
    return res.json({ ok: true });
  }

  if (o.owner_id !== req.user.id) throw httpError(403, 'Chỉ chủ tin mới được phản hồi đề xuất');
  if (action === 'reject') {
    setStatus('rejected');
    return res.json({ ok: true });
  }

  // Chấp nhận: hai tin cùng chuyển sang "đã giao dịch", các đề xuất khác bị từ chối
  if (o.target_status !== 'active' || o.offered_status !== 'active') {
    throw httpError(400, 'Một trong hai món đồ không còn khả dụng');
  }
  transaction(() => {
    setStatus('accepted');
    const markDone = db.prepare(
      "UPDATE listings SET status = 'done', partner_id = ?, done_at = CURRENT_TIMESTAMP WHERE id = ?"
    );
    markDone.run(o.from_user_id, o.listing_id);
    markDone.run(o.owner_id, o.offered_listing_id);
    closePendingOffers(o.listing_id);
    closePendingOffers(o.offered_listing_id);
  });
  res.json({ ok: true });
});

/* ================== Trang cá nhân của tôi ================== */

app.get('/api/me/dashboard', requireAuth, (req, res) => {
  const me = req.user.id;
  const listings = db.prepare(`
    SELECT l.*, p.name AS partner_name,
      (SELECT COUNT(*) FROM offers WHERE listing_id = l.id AND status = 'pending') AS pending_offers,
      (SELECT COUNT(*) FROM reports WHERE listing_id = l.id AND status = 'open') AS open_reports
    FROM listings l LEFT JOIN users p ON p.id = l.partner_id
    WHERE l.user_id = ? ORDER BY l.created_at DESC`).all(me);

  const offerSelect = `
    SELECT o.*,
      l.title AS listing_title, l.image AS listing_image, l.category AS listing_category, l.user_id AS owner_id,
      ol.title AS offered_title, ol.image AS offered_image, ol.category AS offered_category,
      fu.name AS from_name, ou.name AS owner_name
    FROM offers o
    JOIN listings l ON l.id = o.listing_id
    JOIN listings ol ON ol.id = o.offered_listing_id
    JOIN users fu ON fu.id = o.from_user_id
    JOIN users ou ON ou.id = l.user_id`;
  const incoming = db.prepare(`${offerSelect} WHERE l.user_id = ? ORDER BY o.status = 'pending' DESC, o.created_at DESC`).all(me);
  const outgoing = db.prepare(`${offerSelect} WHERE o.from_user_id = ? ORDER BY o.status = 'pending' DESC, o.created_at DESC`).all(me);

  // Các giao dịch đã xong mà mình chưa đánh giá đối phương
  const reviewable = db.prepare(`
    SELECT l.id AS listing_id, l.title, l.type, l.done_at,
           CASE WHEN l.user_id = ? THEN l.partner_id ELSE l.user_id END AS other_id,
           u.name AS other_name,
           CASE WHEN l.user_id = ? THEN 'owner' ELSE 'partner' END AS my_role
    FROM listings l
    JOIN users u ON u.id = CASE WHEN l.user_id = ? THEN l.partner_id ELSE l.user_id END
    WHERE l.status = 'done' AND l.partner_id IS NOT NULL AND (l.user_id = ? OR l.partner_id = ?)
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.listing_id = l.id AND r.reviewer_id = ?)
    ORDER BY l.done_at DESC`).all(me, me, me, me, me, me);

  res.json({ listings, incoming, outgoing, reviewable });
});

/* ================== Đánh giá người dùng ================== */

app.post('/api/reviews', requireAuth, (req, res) => {
  const listingId = toId(req.body.listing_id);
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Vui lòng chọn số sao từ 1 đến 5');

  const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!l || l.status !== 'done' || !l.partner_id) throw httpError(400, 'Chỉ có thể đánh giá sau khi giao dịch hoàn tất');

  let revieweeId;
  if (l.user_id === req.user.id) revieweeId = l.partner_id;
  else if (l.partner_id === req.user.id) revieweeId = l.user_id;
  else throw httpError(403, 'Bạn không tham gia giao dịch này');

  try {
    db.prepare('INSERT INTO reviews (reviewer_id, reviewee_id, listing_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, revieweeId, listingId, rating, str(req.body.comment, 500) || null);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw httpError(409, 'Bạn đã đánh giá giao dịch này rồi');
    throw err;
  }
  res.status(201).json({ ok: true });
});

app.get('/api/users/:id', (req, res) => {
  const id = toId(req.params.id);
  const user = userSummary(id, !!req.user);
  if (!user) throw httpError(404, 'Người dùng không tồn tại');
  const reviews = db.prepare(`
    SELECT r.rating, r.comment, r.created_at, u.id AS reviewer_id, u.name AS reviewer_name, l.title AS listing_title
    FROM reviews r JOIN users u ON u.id = r.reviewer_id LEFT JOIN listings l ON l.id = r.listing_id
    WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`).all(id);
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));
  const listings = db.prepare(`${LISTING_SELECT} WHERE l.user_id = ? AND l.status = 'active' ORDER BY l.created_at DESC`).all(id);
  res.json({ user, reviews, distribution, listings });
});

/* ================== Báo cáo tin giả ================== */

app.post('/api/listings/:id/report', requireAuth, (req, res) => {
  const id = toId(req.params.id);
  const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!l) throw httpError(404, 'Tin đăng không tồn tại');
  if (l.user_id === req.user.id) throw httpError(400, 'Bạn không thể báo cáo tin của chính mình');
  const reason = String(req.body.reason ?? '');
  if (!C.REPORT_REASONS[reason]) throw httpError(400, 'Vui lòng chọn lý do báo cáo');
  const details = str(req.body.details, 500);
  if (reason === 'other' && !details) throw httpError(400, 'Vui lòng mô tả lý do');

  let autoHidden = false;
  try {
    transaction(() => {
      db.prepare('INSERT INTO reports (listing_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)')
        .run(id, req.user.id, reason, details || null);
      const open = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE listing_id = ? AND status = 'open'").get(id).c;
      if (open >= C.AUTO_HIDE_REPORTS && l.status === 'active') {
        db.prepare("UPDATE listings SET status = 'hidden' WHERE id = ?").run(id);
        closePendingOffers(id);
        autoHidden = true;
      }
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw httpError(409, 'Bạn đã báo cáo tin này rồi');
    throw err;
  }
  res.status(201).json({ ok: true, autoHidden });
});

/* ================== Quản trị ================== */

app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, u.name AS reporter_name, l.title AS listing_title, l.status AS listing_status,
           l.user_id AS owner_id, o.name AS owner_name
    FROM reports r
    JOIN users u ON u.id = r.reporter_id
    JOIN listings l ON l.id = r.listing_id
    JOIN users o ON o.id = l.user_id
    ORDER BY r.created_at DESC`).all();
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM listings WHERE status = 'active') AS active,
      (SELECT COUNT(*) FROM listings WHERE status = 'done') AS done,
      (SELECT COUNT(*) FROM listings WHERE status = 'hidden') AS hidden,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports`).get();
  res.json({ reports, stats });
});

// hide: xác nhận vi phạm, ẩn tin ; dismiss: báo cáo sai, bỏ qua (và hiện lại tin nếu đang bị tự ẩn)
app.post('/api/admin/listings/:id/moderate', requireAdmin, (req, res) => {
  const id = toId(req.params.id);
  const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!l) throw httpError(404, 'Tin đăng không tồn tại');
  const { action } = req.body;

  transaction(() => {
    if (action === 'hide') {
      if (l.status !== 'done') db.prepare("UPDATE listings SET status = 'hidden' WHERE id = ?").run(id);
      db.prepare("UPDATE reports SET status = 'resolved' WHERE listing_id = ? AND status = 'open'").run(id);
      closePendingOffers(id);
    } else if (action === 'dismiss') {
      if (l.status === 'hidden') db.prepare("UPDATE listings SET status = 'active' WHERE id = ?").run(id);
      db.prepare("UPDATE reports SET status = 'dismissed' WHERE listing_id = ? AND status = 'open'").run(id);
    } else {
      throw httpError(400, 'Thao tác không hợp lệ');
    }
  });
  res.json({ ok: true });
});

/* ================== Xử lý lỗi ================== */

app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh tối đa 3MB' : 'Lỗi tải ảnh lên' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Lỗi máy chủ, vui lòng thử lại' : err.message });
});

app.listen(PORT, () => {
  console.log(`♻  ReUse Campus đang chạy tại http://localhost:${PORT}`);
});
