# ♻ ReUse Campus – Chợ đồ cũ sinh viên

Website để sinh viên **bán, trao đổi và tặng** đồ cũ cho nhau.

## Chạy dự án

Cần **Node.js 22.13 trở lên** (dùng SQLite có sẵn trong Node, không phải cài thêm CSDL).

```bash
npm install
npm start        # hoặc: npm run dev  (tự khởi động lại khi sửa code)
```

Mở trình duyệt: <http://localhost:3000>

Lần chạy đầu tiên sẽ tự tạo CSDL `data/reuse.db` kèm dữ liệu mẫu.
Muốn làm lại từ đầu: `npm run reset-db` rồi `npm start`.

### Tài khoản dùng thử

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Sinh viên | an@sv.edu.vn / binh@sv.edu.vn / chi@sv.edu.vn | 123456 |
| Quản trị viên | admin@reusecampus.vn | admin123 |

## Chức năng

| Chức năng | Ở đâu |
|---|---|
| **Đăng tin** bán / trao đổi / tặng, kèm ảnh (≤ 3MB) | `post.html` → `POST /api/listings` |
| **Tìm kiếm** theo từ khoá, danh mục, hình thức, **khoảng giá**, sắp xếp | `index.html` → `GET /api/listings?q=&category=&type=&min=&max=&sort=` |
| **Đề xuất trao đổi**: chọn 1 món của mình để đổi lấy tin "Trao đổi" của người khác; chủ tin đồng ý / từ chối, người gửi có thể huỷ | `listing.html`, `me.html` → `POST /api/listings/:id/offers`, `POST /api/offers/:id/accept\|reject\|cancel` |
| **Đánh dấu đã giao dịch** (có thể ghi email người mua). Khi đồng ý trao đổi, cả hai tin tự chuyển sang "đã giao dịch" | `POST /api/listings/:id/done` |
| **Đánh giá người dùng** 1–5 sao sau khi giao dịch xong (chỉ người trong giao dịch, mỗi giao dịch 1 lần) | `me.html#reviews`, `user.html` → `POST /api/reviews` |
| **Báo cáo tin giả**. Tin có ≥ 3 báo cáo sẽ tự ẩn; quản trị viên xác nhận ẩn hoặc bỏ qua | `listing.html`, `admin.html` → `POST /api/listings/:id/report`, `/api/admin/...` |

## Cấu trúc thư mục

```
server.js        Toàn bộ API (Express)
db.js            Kết nối SQLite + tạo bảng
seed.js          Dữ liệu mẫu
constants.js     Danh mục, loại tin, lý do báo cáo...
security.js      Băm mật khẩu (scrypt)
public/
  *.html         Các trang giao diện
  css/style.css
  js/common.js   Hàm dùng chung (gọi API, header, thẻ tin...)
  js/<trang>.js  Logic riêng từng trang
  uploads/       Ảnh người dùng tải lên
data/reuse.db    CSDL (tự tạo)
```

## Cơ sở dữ liệu

- `users` – người dùng (role: user / admin)
- `listings` – tin đăng (`type`: sell / exchange / give; `status`: active / done / hidden; `partner_id`: người giao dịch cùng)
- `offers` – đề xuất trao đổi (`listing_id` ← `offered_listing_id`, status: pending / accepted / rejected / cancelled)
- `reviews` – đánh giá (duy nhất theo người đánh giá + tin)
- `reports` – báo cáo (status: open / resolved / dismissed)

## Ghi chú bảo mật

- Mật khẩu băm bằng scrypt, phiên đăng nhập lưu bằng cookie httpOnly.
- Mọi dữ liệu người dùng đều được escape trước khi hiển thị (chống XSS); truy vấn dùng tham số (chống SQL injection).
- Phiên đăng nhập lưu trong bộ nhớ nên sẽ mất khi khởi động lại server. Khi triển khai thật, hãy đặt biến môi trường `SESSION_SECRET` và dùng session store bền vững.
