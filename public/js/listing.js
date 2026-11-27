boot(async ({ me, meta }) => {
  const id = param('id');
  const root = $('#detail');
  let data;

  async function load() {
    try {
      data = await api.get('/api/listings/' + encodeURIComponent(id));
    } catch (err) {
      root.innerHTML = `<div class="empty" style="margin-top:30px"><span class="big">😕</span>${esc(err.message)}<br><br><a class="btn" href="/">Về trang chủ</a></div>`;
      return;
    }
    render();
  }

  /* ---------- Hiển thị ---------- */

  function ownerCard(o) {
    const contact = o.phone !== undefined
      ? `<div class="contact">
           ${o.phone ? `<span>📞 <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></span>` : ''}
           <span>✉️ <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></span>
         </div>`
      : `<div class="contact"><span><a href="${loginUrl()}">Đăng nhập</a> để xem thông tin liên hệ</span></div>`;
    return `
      <div class="panel">
        <div class="owner-card">
          ${avatar(o.name, 'md')}
          <div>
            <a class="name" href="/user.html?id=${o.id}">${esc(o.name)}</a>
            <div class="small muted">${esc(o.school || 'Sinh viên')}</div>
            <div class="small">${o.reviewCount ? `${stars(o.rating)} ${o.rating} (${o.reviewCount} đánh giá)` : '<span class="muted">Chưa có đánh giá</span>'}
              · ${o.doneCount} giao dịch</div>
          </div>
        </div>
        ${contact}
      </div>`;
  }

  function ownerActions(l) {
    if (l.status === 'active') {
      return `
        <div class="panel">
          <h3>Quản lý tin của bạn</h3>
          <form id="done-form">
            <label>Email người mua / người nhận <small>(không bắt buộc – để hai bên đánh giá nhau)</small>
              <input name="buyer_email" type="email" placeholder="ban.ay@sv.edu.vn">
            </label>
            <button class="btn primary block" type="submit">✔ Đánh dấu đã giao dịch</button>
          </form>
          <button id="delete-btn" class="btn danger-ghost block" style="margin-top:8px">Xoá tin</button>
        </div>`;
    }
    if (l.status === 'hidden') {
      return `
        <div class="panel warn">
          <h3>⚠️ Tin đang bị ẩn</h3>
          <p class="small">Tin bị nhiều người báo cáo hoặc đã bị quản trị viên ẩn. Người khác hiện không thể xem tin này.</p>
          <button id="delete-btn" class="btn danger-ghost block">Xoá tin</button>
        </div>`;
    }
    return '';
  }

  function doneNotice(l) {
    if (l.status !== 'done') return '';
    const who = data.partner ? ` với <a href="/user.html?id=${data.partner.id}">${esc(data.partner.name)}</a>` : '';
    const canReview = me && data.partner && (data.isOwner || data.partner.id === me.id);
    return `
      <div class="panel notice">
        <b>✔ Món đồ đã được giao dịch${who}</b>
        <div class="small muted">${timeAgo(l.done_at)}</div>
        ${canReview ? `<a class="btn sm" style="margin-top:10px" href="/me.html#reviews">⭐ Đánh giá giao dịch</a>` : ''}
      </div>`;
  }

  function offerPanel(l) {
    if (l.type !== 'exchange' || l.status !== 'active' || data.isOwner) return '';
    if (!me) {
      return `<div class="panel"><h3>🔁 Đề xuất trao đổi</h3>
        <p class="small muted">Có món đồ muốn đổi? Đăng nhập để gửi đề xuất cho người đăng.</p>
        <a class="btn primary block" href="${loginUrl()}">Đăng nhập để đề xuất</a></div>`;
    }
    const pending = data.myOffers.find((o) => o.status === 'pending');
    if (pending) {
      return `<div class="panel"><h3>🔁 Đề xuất của bạn</h3>
        <p>Bạn đã đề xuất đổi <b>${esc(pending.offered_title)}</b>. ${offerBadge('pending')}</p>
        <button class="btn sm danger-ghost" data-offer="${pending.id}" data-action="cancel">Huỷ đề xuất</button></div>`;
    }
    const last = data.myOffers[0];
    const history = last ? `<p class="small muted">Đề xuất trước của bạn: ${offerBadge(last.status)}</p>` : '';
    if (!data.myActiveListings.length) {
      return `<div class="panel"><h3>🔁 Đề xuất trao đổi</h3>${history}
        <p class="small muted">Bạn cần có ít nhất một tin đang hiển thị để đem ra trao đổi.</p>
        <a class="btn primary block" href="/post.html">＋ Đăng món đồ của bạn</a></div>`;
    }
    return `
      <div class="panel">
        <h3>🔁 Đề xuất trao đổi</h3>
        ${history}
        <form id="offer-form">
          <label>Món đồ bạn đem đổi
            <select name="offered_listing_id" required>
              ${data.myActiveListings.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('')}
            </select>
          </label>
          <label>Lời nhắn <small>(không bắt buộc)</small>
            <textarea name="message" maxlength="500" rows="3" placeholder="Giới thiệu món đồ của bạn, thời gian/địa điểm có thể gặp…"></textarea>
          </label>
          <button class="btn primary block" type="submit">Gửi đề xuất</button>
        </form>
      </div>`;
  }

  function reportPanel() {
    if (!me || data.isOwner) return '';
    if (data.reported) return `<p class="small muted">🚩 Bạn đã báo cáo tin này. Cảm ơn bạn đã giúp cộng đồng an toàn hơn!</p>`;
    return `
      <details class="report panel">
        <summary>🚩 Báo cáo tin giả / vi phạm</summary>
        <form id="report-form">
          <label>Lý do
            <select name="reason" required>
              ${Object.entries(meta.reportReasons).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
            </select>
          </label>
          <label>Chi tiết <small>(giúp quản trị viên xử lý nhanh hơn)</small>
            <textarea name="details" maxlength="500" rows="3"></textarea>
          </label>
          <button class="btn danger block" type="submit">Gửi báo cáo</button>
        </form>
      </details>`;
  }

  function offersSection() {
    if (!data.isOwner || !data.offers.length) return '';
    const pending = data.offers.filter((o) => o.status === 'pending').length;
    return `
      <section class="panel" id="offers">
        <h2>Đề xuất trao đổi nhận được ${pending ? `<span class="badge o-pending">${pending} đang chờ</span>` : ''}</h2>
        ${data.offers.map((o) => offerRow(o, 'incoming')).join('')}
      </section>`;
  }

  function adminSection(l) {
    if (!data.reports) return '';
    const open = data.reports.filter((r) => r.status === 'open').length;
    return `
      <section class="panel warn">
        <h2>🛡️ Kiểm duyệt (${data.reports.length} báo cáo, ${open} chưa xử lý)</h2>
        ${data.reports.map((r) => `
          <div class="report-line">
            <span class="badge r-${r.status}">${{ open: 'Chưa xử lý', resolved: 'Đã xử lý', dismissed: 'Bỏ qua' }[r.status]}</span>
            <b>${esc(meta.reportReasons[r.reason] || r.reason)}</b> – ${esc(r.details || '')}
            <span class="small muted">· ${esc(r.reporter_name)}, ${timeAgo(r.created_at)}</span>
          </div>`).join('') || '<p class="small muted">Không có báo cáo nào.</p>'}
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap">
          ${l.status !== 'hidden' && l.status !== 'done' ? '<button class="btn danger sm" data-moderate="hide">Ẩn tin (vi phạm)</button>' : ''}
          ${open || l.status === 'hidden' ? '<button class="btn sm" data-moderate="dismiss">Bỏ qua báo cáo & hiện tin</button>' : ''}
        </div>
      </section>`;
  }

  function render() {
    const l = data.listing;
    const cat = category(l.category);
    document.title = `${l.title} – ReUse Campus`;

    root.innerHTML = `
      <nav class="crumbs"><a href="/">Trang chủ</a> › <a href="/?category=${l.category}">${esc(cat.name)}</a> › ${esc(l.title)}</nav>
      ${param('new') ? '<div class="panel notice">🎉 Đăng tin thành công! Tin của bạn đã hiển thị trên chợ.</div>' : ''}
      <div class="detail">
        <div>
          <div class="detail-media"><div class="thumb">${thumb(l.image, l.category)}</div></div>
          <div class="panel" style="margin-top:16px">
            <h3>Mô tả</h3>
            <p class="desc">${l.description ? esc(l.description) : '<span class="muted">Người đăng chưa thêm mô tả.</span>'}</p>
          </div>
          ${offersSection()}
          ${adminSection(l)}
        </div>
        <div>
          <div class="panel">
            <div>${typeBadge(l.type)} ${l.status !== 'active' ? statusBadge(l.status) : ''}</div>
            <h1>${esc(l.title)}</h1>
            ${priceHtml(l, 'big')}
            ${l.type === 'exchange' ? `<div class="wanted"><b>🔁 Muốn đổi lấy:</b> ${esc(l.wanted)}</div>` : ''}
            <ul class="facts">
              <li><span>Danh mục</span><span>${cat.icon} ${esc(cat.name)}</span></li>
              <li><span>Tình trạng</span><span>${esc(meta.conditions[l.item_condition] || '')}</span></li>
              <li><span>Khu vực</span><span>${esc(l.location || 'Chưa ghi')}</span></li>
              <li><span>Đăng lúc</span><span>${timeAgo(l.created_at)}</span></li>
            </ul>
          </div>
          ${doneNotice(l)}
          ${data.isOwner ? ownerActions(l) : ''}
          ${offerPanel(l)}
          ${ownerCard(data.owner)}
          ${reportPanel()}
        </div>
      </div>`;
    bindForms();
  }

  /* ---------- Xử lý thao tác ---------- */

  function bindForms() {
    const doneForm = $('#done-form');
    if (doneForm) {
      doneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = doneForm.buyer_email.value.trim();
        const msg = email
          ? `Xác nhận đã giao dịch với ${email}? Tin sẽ không còn hiển thị trên chợ.`
          : 'Xác nhận đã giao dịch? Tin sẽ không còn hiển thị trên chợ.\n(Không có email người mua thì hai bên sẽ không đánh giá nhau được.)';
        if (!confirm(msg)) return;
        await withBusy(doneForm.querySelector('button'), async () => {
          await api.post(`/api/listings/${id}/done`, { buyer_email: email });
          toast('Đã đánh dấu tin là đã giao dịch ✔');
          await load();
        });
      });
    }

    const delBtn = $('#delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Xoá vĩnh viễn tin này?')) return;
        await withBusy(delBtn, async () => {
          await api.del('/api/listings/' + id);
          location.href = '/me.html';
        });
      });
    }

    const offerForm = $('#offer-form');
    if (offerForm) {
      offerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy(offerForm.querySelector('button'), async () => {
          await api.post(`/api/listings/${id}/offers`, {
            offered_listing_id: offerForm.offered_listing_id.value,
            message: offerForm.message.value,
          });
          toast('Đã gửi đề xuất trao đổi! Người đăng sẽ phản hồi sớm.');
          await load();
        });
      });
    }

    const reportForm = $('#report-form');
    if (reportForm) {
      reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy(reportForm.querySelector('button'), async () => {
          const res = await api.post(`/api/listings/${id}/report`, {
            reason: reportForm.reason.value,
            details: reportForm.details.value,
          });
          toast(res.autoHidden ? 'Đã gửi báo cáo. Tin đã tạm ẩn do có nhiều báo cáo.' : 'Đã gửi báo cáo, cảm ơn bạn!');
          await load();
        });
      });
    }

    $$('[data-moderate]').forEach((btn) => btn.addEventListener('click', async () => {
      await withBusy(btn, async () => {
        await api.post(`/api/admin/listings/${id}/moderate`, { action: btn.dataset.moderate });
        toast('Đã cập nhật');
        await load();
      });
    }));
  }

  bindOfferActions(root, load);
  await load();
});
