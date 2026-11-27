const { hashPassword } = require('./security');

// Dữ liệu mẫu để thử nghiệm ngay sau khi chạy
module.exports = function seed(db) {
  const addUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, school, phone, role) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const pw = hashPassword('123456');
  addUser.run('Quản trị viên', 'admin@reusecampus.vn', hashPassword('admin123'), 'Ban quản trị', null, 'admin');
  const an   = addUser.run('Nguyễn Văn An', 'an@sv.edu.vn',   pw, 'ĐH Bách Khoa',        '0901234567', 'user').lastInsertRowid;
  const binh = addUser.run('Trần Thị Bình', 'binh@sv.edu.vn', pw, 'ĐH Kinh tế Quốc dân', '0912345678', 'user').lastInsertRowid;
  const chi  = addUser.run('Lê Minh Chi',   'chi@sv.edu.vn',  pw, 'ĐH Sư phạm',          '0987654321', 'user').lastInsertRowid;

  const addListing = db.prepare(`
    INSERT INTO listings (user_id, title, description, category, type, price, item_condition, wanted, location, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`);
  const L = (u, title, desc, cat, type, price, cond, wanted, loc, ago) =>
    addListing.run(u, title, desc, cat, type, price, cond, wanted, loc, ago).lastInsertRowid;

  L(an, 'Giáo trình Giải tích 1 + Đại số tuyến tính', 'Sách còn mới, có ghi chú bút chì vài trang. Bán cả combo.', 'sach', 'sell', 60000, 'good', null, 'KTX Bách Khoa', '-3 hours');
  L(an, 'Quạt điện để bàn Senko', 'Dùng 1 năm, chạy êm, 3 mức gió. Ra trường nên thanh lý.', 'phong-tro', 'sell', 120000, 'good', null, 'Hai Bà Trưng, Hà Nội', '-5 hours');
  const keyboard = L(an, 'Bàn phím cơ Akko 3068 (switch xanh)', 'Gõ sướng tay nhưng hơi ồn với phòng trọ. Muốn đổi sang đồ khác.', 'dien-tu', 'exchange', 300000, 'like_new', 'Chuột không dây hoặc tai nghe bluetooth', 'KTX Bách Khoa', '-1 days');
  const scam = L(an, 'iPhone 14 Pro Max giá 1 triệu, chuyển khoản trước', 'Máy zin, giá rẻ bất ngờ. Chuyển khoản cọc trước mới giao.', 'dien-tu', 'sell', 1000000, 'like_new', null, 'Online', '-2 days');

  L(binh, 'Xe đạp Thống Nhất mini', 'Xe đi học hằng ngày, phanh tốt, mới thay lốp.', 'xe', 'sell', 850000, 'good', null, 'Đống Đa, Hà Nội', '-1 days');
  L(binh, 'Tặng chồng sách tiểu thuyết', 'Khoảng 10 cuốn, ai cần qua lấy nhé, ưu tiên bạn ở gần.', 'sach', 'give', 0, 'fair', null, 'KTX Kinh tế Quốc dân', '-6 hours');
  const headphone = L(binh, 'Tai nghe bluetooth Sony WH-CH520', 'Pin trâu, còn hộp. Muốn đổi lấy bàn phím cơ.', 'dien-tu', 'exchange', 250000, 'like_new', 'Bàn phím cơ', 'Đống Đa, Hà Nội', '-20 hours');
  L(binh, 'Đèn học LED chống cận', 'Đèn 3 chế độ sáng, cổng USB.', 'hoc-tap', 'sell', 90000, 'like_new', null, 'Đống Đa, Hà Nội', '-2 days');

  L(chi, 'Máy tính Casio fx-580VN X', 'Dùng 1 kỳ, không trầy xước, được mang vào phòng thi.', 'hoc-tap', 'sell', 350000, 'like_new', null, 'Cầu Giấy, Hà Nội', '-4 hours');
  L(chi, 'Áo khoác đồng phục khoa (size M)', 'Mặc vài lần, mình tặng lại cho bạn khoá dưới.', 'quan-ao', 'give', 0, 'good', null, 'ĐH Sư phạm', '-8 hours');
  L(chi, 'Vợt cầu lông Yonex Nanoray', 'Còn căng dây, có bao vợt.', 'the-thao', 'exchange', 0, 'good', 'Giày chạy bộ size 39', 'Cầu Giấy, Hà Nội', '-3 days');
  const cooker = L(chi, 'Nồi cơm điện mini 0.8L', 'Hợp cho 1–2 người, nấu ngon.', 'phong-tro', 'sell', 150000, 'good', null, 'Cầu Giấy, Hà Nội', '-6 days');

  // Một tin đã giao dịch (Chi bán cho An) + đánh giá hai chiều
  db.prepare("UPDATE listings SET status = 'done', partner_id = ?, done_at = datetime('now', '-4 days') WHERE id = ?").run(an, cooker);
  const addReview = db.prepare(
    "INSERT INTO reviews (reviewer_id, reviewee_id, listing_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', '-4 days'))"
  );
  addReview.run(an, chi, cooker, 5, 'Nồi đúng mô tả, bạn Chi nhiệt tình, giao tận nơi.');
  addReview.run(chi, an, cooker, 4, 'Bạn An đúng hẹn, giao dịch nhanh gọn.');

  // Bình đề xuất đổi tai nghe lấy bàn phím của An
  db.prepare('INSERT INTO offers (listing_id, offered_listing_id, from_user_id, message) VALUES (?, ?, ?, ?)')
    .run(keyboard, headphone, binh, 'Mình đổi tai nghe Sony lấy bàn phím của bạn nhé, tai nghe còn bảo hành 6 tháng.');

  // Một báo cáo tin giả
  db.prepare('INSERT INTO reports (listing_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)')
    .run(scam, binh, 'fake', 'Giá quá rẻ và đòi chuyển khoản trước, nghi lừa đảo.');
};
