boot(async ({ me }) => {
  if (!requireLogin()) return;
  const content = $('#tab-content');
  let data;
  let tab = location.hash.slice(1) || 'listings';

  const empty = (icon, text) => `<div class="empty"><span class="big">${icon}</span>${text}</div>`;

  function listingsTab() {
    if (!data.listings.length) return empty('📦', 'Bạn chưa đăng tin nào. <a href="/post.html">Đăng tin đầu tiên</a>');
    const filters = ['all', 'active', 'done', 'hidden'];
    const label = { all: 'Tất cả', active: 'Đang hiển thị', done: 'Đã giao dịch', hidden: 'Bị ẩn' };
    const current = content.dataset.filter || 'all';
    const rows = data.listings.filter((l) => current === 'all' || l.status === current);
    return `
      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap">
        ${filters.map((f) => `<button class="chip ${f === current ? 'active' : ''}" data-filter="${f}">${label[f]}
          (${f === 'all' ? data.listings.length : data.listings.filter((l) => l.status === f).length})</button>`).join('')}
      </div>
      <div class="row-list">
        ${rows.map((l) => `
          <div class="row-item">
            ${miniThumb(l.image, l.category)}
            <div>
              <a class="title" href="/listing.html?id=${l.id}">${esc(l.title)}</a>
              <div style="margin:2px 0">${typeBadge(l.type)} ${statusBadge(l.status)}
                ${l.pending_offers ? `<span class="badge o-pending">${l.pending_offers} đề xuất chờ</span>` : ''}
                ${l.open_reports ? `<span class="badge r-open">🚩 ${l.open_reports} báo cáo</span>` : ''}</div>
              <div class="small muted">
                ${l.type === 'give' ? 'Miễn phí' : l.price ? fmtMoney(l.price) : 'Trao đổi'} · đăng ${timeAgo(l.created_at)}
                ${l.status === 'done' ? ` · giao dịch ${l.partner_name ? 'với ' + esc(l.partner_name) : ''} ${timeAgo(l.done_at)}` : ''}
              </div>
            </div>
            <div class="actions">
              ${l.status === 'active' ? `<button class="btn sm primary" data-done="${l.id}">✔ Đã giao dịch</button>` : ''}
              ${l.status !== 'done' ? `<button class="btn sm danger-ghost" data-delete="${l.id}">Xoá</button>` : ''}
            </div>
          </div>`).join('') || empty('🗂️', 'Không có tin nào ở mục này.')}
      </div>`;
  }

  function offersTab(list, mode) {
    if (!list.length) {
      return mode === 'incoming'
        ? empty('📭', 'Chưa có ai gửi đề xuất trao đổi. Đăng tin dạng "Trao đổi" để nhận đề xuất nhé!')
        : empty('🔁', 'Bạn chưa gửi đề xuất nào. Tìm các tin <a href="/?type=exchange">Trao đổi</a> để bắt đầu.');
    }
    return `<div class="panel">${list.map((o) => offerRow(o, mode)).join('')}</div>`;
  }

  function reviewsTab() {
    if (!data.reviewable.length) {
      return empty('⭐', 'Không có giao dịch nào cần đánh giá.<br><span class="small">Khi đánh dấu "đã giao dịch", hãy nhập email người mua để hai bên có thể đánh giá nhau.</span>');
    }
    return `<div class="row-list">${data.reviewable.map((r) => `
      <form class="panel review-form" data-listing="${r.listing_id}" style="margin:0">
        <div class="review-head">
          ${avatar(r.other_name, 'md')}
          <div>
            Đánh giá <a href="/user.html?id=${r.other_id}"><b>${esc(r.other_name)}</b></a>
            <div class="small muted">${r.my_role === 'owner' ? 'Người nhận' : 'Người đăng'} món
              <a href="/listing.html?id=${r.listing_id}">${esc(r.title)}</a> · ${timeAgo(r.done_at)}</div>
          </div>
        </div>
        <div class="star-input" style="margin:12px 0 6px">
          ${[5, 4, 3, 2, 1].map((s) => `
            <input type="radio" name="rating" id="s${r.listing_id}-${s}" value="${s}">
            <label for="s${r.listing_id}-${s}" title="${s} sao">★</label>`).join('')}
        </div>
        <textarea name="comment" maxlength="500" rows="2" placeholder="Chia sẻ trải nghiệm: đúng hẹn, đồ đúng mô tả, thân thiện…"></textarea>
        <div style="text-align:right; margin-top:10px"><button class="btn primary sm" type="submit">Gửi đánh giá</button></div>
      </form>`).join('')}</div>`;
  }

  function render() {
    $$('#tabs .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
      const count = {
        incoming: data.incoming.filter((o) => o.status === 'pending').length,
        outgoing: data.outgoing.filter((o) => o.status === 'pending').length,
        reviews: data.reviewable.length,
        listings: data.listings.length,
      }[t.dataset.tab];
      t.querySelector('.count')?.remove();
      if (count) {
        t.insertAdjacentHTML('beforeend',
          `<span class="count ${t.dataset.tab === 'listings' || t.dataset.tab === 'outgoing' ? 'grey' : ''}">${count}</span>`);
      }
    });
    content.innerHTML = {
      listings: listingsTab,
      incoming: () => offersTab(data.incoming, 'incoming'),
      outgoing: () => offersTab(data.outgoing, 'outgoing'),
      reviews: reviewsTab,
    }[tab]();
  }

  async function load() {
    data = await api.get('/api/me/dashboard');
    render();
  }

  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    tab = t.dataset.tab;
    history.replaceState(null, '', '#' + tab);
    render();
  });

  content.addEventListener('click', async (e) => {
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      content.dataset.filter = filter.dataset.filter;
      return render();
    }
    const done = e.target.closest('[data-done]');
    if (done) {
      const email = prompt('Nhập email người mua / người nhận (để trống nếu không có tài khoản):', '');
      if (email === null) return;
      return withBusy(done, async () => {
        await api.post(`/api/listings/${done.dataset.done}/done`, { buyer_email: email.trim() });
        toast('Đã đánh dấu đã giao dịch ✔');
        await load();
      });
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!confirm('Xoá vĩnh viễn tin này?')) return;
      return withBusy(del, async () => {
        await api.del('/api/listings/' + del.dataset.delete);
        toast('Đã xoá tin');
        await load();
      });
    }
  });

  content.addEventListener('submit', async (e) => {
    const form = e.target.closest('.review-form');
    if (!form) return;
    e.preventDefault();
    const rating = form.querySelector('input[name="rating"]:checked');
    if (!rating) return toast('Vui lòng chọn số sao', 'error');
    await withBusy(form.querySelector('button'), async () => {
      await api.post('/api/reviews', {
        listing_id: form.dataset.listing,
        rating: Number(rating.value),
        comment: form.comment.value,
      });
      toast('Cảm ơn bạn đã đánh giá! ⭐');
      await load();
    });
  });

  bindOfferActions(content, load);
  await load();
});
