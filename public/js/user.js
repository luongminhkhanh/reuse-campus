boot(async ({ me }) => {
  const root = $('#profile');
  let data;
  try {
    data = await api.get('/api/users/' + encodeURIComponent(param('id')));
  } catch (err) {
    root.innerHTML = `<div class="empty" style="margin-top:30px"><span class="big">😕</span>${esc(err.message)}</div>`;
    return;
  }
  const { user: u, reviews, distribution, listings } = data;
  document.title = `${u.name} – ReUse Campus`;
  const isMe = me && me.id === u.id;

  root.innerHTML = `
    <div class="panel profile-head">
      ${avatar(u.name, 'lg')}
      <div>
        <h1 style="margin-bottom:2px">${esc(u.name)} ${isMe ? '<span class="badge s-active">Bạn</span>' : ''}</h1>
        <div class="muted">🎓 ${esc(u.school || 'Sinh viên')} · Tham gia ${fmtDate(u.joined)}</div>
        <div class="small" style="margin-top:6px">📦 ${listings.length} tin đang đăng · 🤝 ${u.doneCount} giao dịch thành công</div>
        ${u.email ? `<div class="small" style="margin-top:4px">✉️ ${esc(u.email)} ${u.phone ? ' · 📞 ' + esc(u.phone) : ''}</div>` : ''}
      </div>
      <div class="rating-box">
        <div class="score">${u.rating ?? '–'}</div>
        ${stars(u.rating)}
        <div class="small muted">${u.reviewCount} đánh giá</div>
      </div>
    </div>

    <div class="two-col">
      <section class="panel">
        <h2>Đánh giá từ người dùng khác</h2>
        ${u.reviewCount ? `<div class="dist" style="margin-bottom:16px">
          ${distribution.map((d) => `
            <div class="dist-row"><span>${d.star} ★</span>
              <div class="bar"><i style="width:${(d.count / u.reviewCount) * 100}%"></i></div>
              <span class="muted">${d.count}</span></div>`).join('')}
        </div>` : ''}
        ${reviews.map((r) => `
          <div class="review">
            <div class="review-head">
              ${avatar(r.reviewer_name)}
              <div>
                <a href="/user.html?id=${r.reviewer_id}"><b>${esc(r.reviewer_name)}</b></a>
                <div class="small">${stars(r.rating)} <span class="muted">· ${timeAgo(r.created_at)}</span></div>
              </div>
            </div>
            ${r.comment ? `<p style="margin:8px 0 2px">${esc(r.comment)}</p>` : ''}
            ${r.listing_title ? `<div class="small muted">Giao dịch: ${esc(r.listing_title)}</div>` : ''}
          </div>`).join('') || '<p class="muted small">Chưa có đánh giá nào.</p>'}
      </section>

      <section>
        <h2>Tin đang đăng (${listings.length})</h2>
        <div class="grid">${listings.map(listingCard).join('') ||
          '<div class="empty" style="grid-column:1/-1">Hiện không có tin nào.</div>'}</div>
      </section>
    </div>`;
});
