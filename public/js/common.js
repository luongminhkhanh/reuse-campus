/* Các hàm dùng chung cho mọi trang */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Chống XSS: luôn escape dữ liệu người dùng trước khi chèn vào HTML
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const api = {
  async request(method, url, body) {
    const options = { method, headers: {} };
    if (body instanceof FormData) options.body = body;
    else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại');
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body = {}) { return this.request('POST', url, body); },
  del(url) { return this.request('DELETE', url); },
};

const App = { me: null, meta: null };

/* ---------- Định dạng ---------- */

function fmtMoney(n) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}

function priceHtml(l, extraClass = '') {
  if (l.type === 'give') return `<div class="price give ${extraClass}">Miễn phí</div>`;
  if (l.type === 'exchange') {
    return `<div class="price swap ${extraClass}">${l.price > 0 ? '≈ ' + fmtMoney(l.price) : 'Trao đổi'}</div>`;
  }
  return `<div class="price ${extraClass}">${fmtMoney(l.price)}</div>`;
}

// SQLite lưu giờ UTC dạng "YYYY-MM-DD HH:MM:SS"
function parseDate(s) {
  return new Date(String(s).replace(' ', 'T') + 'Z');
}

function timeAgo(s) {
  if (!s) return '';
  const sec = (Date.now() - parseDate(s)) / 1000;
  if (sec < 60) return 'vừa xong';
  if (sec < 3600) return Math.floor(sec / 60) + ' phút trước';
  if (sec < 86400) return Math.floor(sec / 3600) + ' giờ trước';
  if (sec < 86400 * 30) return Math.floor(sec / 86400) + ' ngày trước';
  return parseDate(s).toLocaleDateString('vi-VN');
}

function fmtDate(s) {
  return parseDate(s).toLocaleDateString('vi-VN');
}

function stars(rating) {
  const r = Math.round(rating || 0);
  return `<span class="stars" aria-label="${rating || 0} sao">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`;
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return esc(parts[parts.length - 1][0].toUpperCase());
}

function avatar(name, size = '') {
  return `<span class="avatar ${size}">${initials(name)}</span>`;
}

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

function category(key) {
  return App.meta.categories[key] || { name: key, icon: '📦' };
}

/* ---------- Thành phần giao diện ---------- */

function typeBadge(type) {
  const icon = { sell: '🏷️', exchange: '🔁', give: '🎁' }[type];
  return `<span class="badge t-${type}">${icon} ${esc(App.meta.types[type])}</span>`;
}

const STATUS_TEXT = { active: 'Đang hiển thị', done: 'Đã giao dịch', hidden: 'Đang bị ẩn' };
function statusBadge(status) {
  return `<span class="badge s-${status}">${STATUS_TEXT[status]}</span>`;
}

const OFFER_TEXT = { pending: 'Đang chờ', accepted: 'Đã chấp nhận', rejected: 'Bị từ chối', cancelled: 'Đã huỷ' };
function offerBadge(status) {
  return `<span class="badge o-${status}">${OFFER_TEXT[status]}</span>`;
}

function thumb(image, categoryKey, inner = '') {
  const media = image
    ? `<img src="/uploads/${encodeURIComponent(image)}" alt="" loading="lazy">`
    : `<div class="ph">${category(categoryKey).icon}</div>`;
  return media + inner;
}

function listingCard(l) {
  const overlay = l.status === 'done' ? '<div class="status-overlay">ĐÃ GIAO DỊCH</div>' : '';
  return `
    <a class="card" href="/listing.html?id=${l.id}">
      <div class="thumb">${thumb(l.image, l.category, typeBadge(l.type) + overlay)}</div>
      <div class="card-body">
        <div class="card-title">${esc(l.title)}</div>
        ${priceHtml(l)}
        <div class="card-meta">
          <span>📍 ${esc(l.location || l.owner_school || 'Không rõ')}</span>
          <span>${timeAgo(l.created_at)}</span>
        </div>
      </div>
    </a>`;
}

function miniThumb(image, categoryKey) {
  return `<div class="mini-thumb">${image
    ? `<img src="/uploads/${encodeURIComponent(image)}" alt="">`
    : category(categoryKey).icon}</div>`;
}

/* Một dòng đề xuất trao đổi.
   mode = 'incoming' (mình là chủ tin, được chấp nhận/từ chối) | 'outgoing' (mình gửi, được huỷ) */
function offerRow(o, mode) {
  const pending = o.status === 'pending';
  let line, actions = '';
  if (mode === 'incoming') {
    line = `<a href="/user.html?id=${o.from_user_id}"><b>${esc(o.from_name)}</b></a> muốn đổi
            <a href="/listing.html?id=${o.offered_listing_id}"><b>${esc(o.offered_title)}</b></a>
            ${o.listing_title ? `lấy <a href="/listing.html?id=${o.listing_id}">${esc(o.listing_title)}</a> của bạn` : ''}`;
    if (pending) {
      actions = `<button class="btn primary sm" data-offer="${o.id}" data-action="accept">✔ Đồng ý đổi</button>
                 <button class="btn sm" data-offer="${o.id}" data-action="reject">Từ chối</button>`;
    }
  } else {
    line = `Bạn đề xuất đổi <a href="/listing.html?id=${o.offered_listing_id}"><b>${esc(o.offered_title)}</b></a>
            lấy <a href="/listing.html?id=${o.listing_id}"><b>${esc(o.listing_title)}</b></a>
            của <a href="/user.html?id=${o.owner_id}">${esc(o.owner_name)}</a>`;
    if (pending) actions = `<button class="btn sm danger-ghost" data-offer="${o.id}" data-action="cancel">Huỷ đề xuất</button>`;
  }
  return `
    <div class="offer">
      ${miniThumb(o.offered_image, o.offered_category)}
      <div>
        <div class="swap-line">${line}</div>
        ${o.message ? `<div class="msg">“${esc(o.message)}”</div>` : ''}
        <div class="small muted">${offerBadge(o.status)} · ${timeAgo(o.created_at)}</div>
      </div>
      <div class="actions">${actions}</div>
    </div>`;
}

// Gắn xử lý cho các nút chấp nhận / từ chối / huỷ đề xuất trong một vùng
function bindOfferActions(container, onDone) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-offer]');
    if (!btn) return;
    const { offer, action } = btn.dataset;
    const confirmText = {
      accept: 'Đồng ý trao đổi? Cả hai món đồ sẽ được đánh dấu "Đã giao dịch" và các đề xuất khác sẽ bị từ chối.',
      reject: 'Từ chối đề xuất này?',
      cancel: 'Huỷ đề xuất trao đổi này?',
    }[action];
    if (!confirm(confirmText)) return;
    await withBusy(btn, async () => {
      await api.post(`/api/offers/${offer}/${action}`);
      toast({ accept: 'Đã chấp nhận trao đổi 🎉 Hãy liên hệ để hẹn giao đồ nhé!', reject: 'Đã từ chối đề xuất', cancel: 'Đã huỷ đề xuất' }[action]);
      await onDone();
    });
  });
}

function toast(message, type = 'ok') {
  let box = $('#toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'error' ? 'error' : '');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function loginUrl() {
  return '/auth.html?next=' + encodeURIComponent(location.pathname + location.search);
}

// Chuyển tới trang đăng nhập nếu chưa đăng nhập
function requireLogin() {
  if (!App.me) {
    location.href = loginUrl();
    return false;
  }
  return true;
}

// Khoá nút trong lúc gửi để tránh bấm nhiều lần
async function withBusy(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function renderHeader() {
  const me = App.me;
  const here = location.pathname;
  const link = (href, text) => `<a href="${href}" class="${here === href ? 'active' : ''}">${text}</a>`;
  $('#site-header').className = 'site-header';
  $('#site-header').innerHTML = `
    <div class="container">
      <a class="logo" href="/"><span class="logo-mark">♻</span><span>ReUse Campus<small>Chợ đồ cũ sinh viên</small></span></a>
      <button class="menu-toggle" aria-label="Mở menu">☰</button>
      <nav class="nav">
        ${link('/', 'Khám phá')}
        ${link('/post.html', '＋ Đăng tin')}
        ${me ? link('/me.html', 'Quản lý của tôi') : ''}
        ${me && me.role === 'admin' ? link('/admin.html', '🛡️ Kiểm duyệt') : ''}
        ${me
          ? `<a class="user-chip" href="/user.html?id=${me.id}">${avatar(me.name)} ${esc(me.name)}</a>
             <a href="#" id="logout-link">Đăng xuất</a>`
          : `<a href="${loginUrl()}" class="btn primary sm" style="color:#fff">Đăng nhập</a>`}
      </nav>
    </div>`;
  $('.menu-toggle').onclick = () => $('.nav').classList.toggle('open');
  const logout = $('#logout-link');
  if (logout) {
    logout.onclick = async (e) => {
      e.preventDefault();
      await api.post('/api/auth/logout');
      location.href = '/';
    };
  }

  if (!$('.site-footer')) {
    document.body.insertAdjacentHTML('beforeend', `
      <footer class="site-footer"><div class="container">
        <span>♻ ReUse Campus – Đồ cũ của bạn, kho báu của người khác.</span>
        <span>Giao dịch trực tiếp, kiểm tra hàng trước khi trả tiền. Không chuyển khoản cọc cho người lạ.</span>
      </div></footer>`);
  }
}

// Khởi động trang: lấy người dùng hiện tại + danh mục rồi chạy hàm riêng của trang
async function boot(pageMain) {
  try {
    const [me, meta] = await Promise.all([api.get('/api/auth/me'), api.get('/api/meta')]);
    App.me = me.user;
    App.meta = meta;
    renderHeader();
    await pageMain(App);
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  }
}
