// Các danh mục, loại tin... dùng chung cho server và giao diện (qua /api/meta)
const CATEGORIES = {
  'sach':      { name: 'Sách & Giáo trình',   icon: '📚' },
  'dien-tu':   { name: 'Đồ điện tử',          icon: '💻' },
  'hoc-tap':   { name: 'Dụng cụ học tập',     icon: '✏️' },
  'phong-tro': { name: 'Đồ dùng phòng trọ',   icon: '🛏️' },
  'quan-ao':   { name: 'Quần áo & Phụ kiện',  icon: '👕' },
  'the-thao':  { name: 'Thể thao & Giải trí', icon: '🏸' },
  'xe':        { name: 'Xe cộ',               icon: '🚲' },
  'khac':      { name: 'Khác',                icon: '📦' },
};

const TYPES = {
  sell: 'Bán',
  exchange: 'Trao đổi',
  give: 'Tặng miễn phí',
};

const CONDITIONS = {
  new: 'Mới, chưa dùng',
  like_new: 'Như mới (99%)',
  good: 'Còn tốt',
  fair: 'Đã dùng nhiều',
};

const REPORT_REASONS = {
  fake: 'Tin giả / có dấu hiệu lừa đảo',
  wrong_info: 'Sai thông tin, hình ảnh',
  prohibited: 'Hàng cấm / không phù hợp',
  spam: 'Spam / đăng trùng lặp',
  other: 'Lý do khác',
};

// Tin có từ chừng này báo cáo (chưa xử lý) trở lên sẽ tự động bị ẩn chờ kiểm duyệt
const AUTO_HIDE_REPORTS = 3;

module.exports = { CATEGORIES, TYPES, CONDITIONS, REPORT_REASONS, AUTO_HIDE_REPORTS };
