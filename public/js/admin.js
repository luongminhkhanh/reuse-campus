boot(async ({ me, meta }) => {
  if (!requireLogin()) return;
  if (me.role !== 'admin') {
    $('main').innerHTML = '<div class="empty" style="margin-top:30px"><span class="big">⛔</span>Chỉ quản trị viên mới truy cập được trang này.</div>';
    return;
  }
  let data;
  let show = 'open';
  const REPORT_STATUS = { open: 'Chưa xử lý', resolved: 'Đã xử lý (ẩn tin)', dismissed: 'Đã bỏ qua' };

  function render() {
    const s = data.stats;
    $('#stats').innerHTML = [
      [s.users, 'Người dùng'], [s.active, 'Tin đang hiển thị'], [s.done, 'Đã giao dịch'],
      [s.hidden, 'Tin bị ẩn'], [s.open_reports, 'Báo cáo chờ xử lý'],
    ].map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join('');

    // Gom báo cáo theo từng tin
    const groups = new Map();
    for (const r of data.reports) {
      if (!groups.has(r.listing_id)) groups.set(r.listing_id, []);
      groups.get(r.listing_id).push(r);
    }
    const list = [...groups.values()].filter((rs) => show === 'all' || rs.some((r) => r.status === 'open'));

    $('#reports').innerHTML = list.map((rs) => {
      const r0 = rs[0];
      const open = rs.filter((r) => r.status === 'open').length;
      return `
        <div class="panel">
          <div class="report-group-head">
            <div>
              <a href="/listing.html?id=${r0.listing_id}"><b>${esc(r0.listing_title)}</b></a> ${statusBadge(r0.listing_status)}
              <div class="small muted">Người đăng: <a href="/user.html?id=${r0.owner_id}">${esc(r0.owner_name)}</a>
                · ${rs.length} báo cáo${open ? `, <b style="color:var(--danger)">${open} chưa xử lý</b>` : ''}</div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap">
              ${open && r0.listing_status !== 'done' ? `<button class="btn danger sm" data-id="${r0.listing_id}" data-action="hide">Ẩn tin (xác nhận vi phạm)</button>` : ''}
              ${open || r0.listing_status === 'hidden' ? `<button class="btn sm" data-id="${r0.listing_id}" data-action="dismiss">Bỏ qua & hiện tin</button>` : ''}
            </div>
          </div>
          ${rs.map((r) => `
            <div class="report-line">
              <span class="badge r-${r.status}">${REPORT_STATUS[r.status]}</span>
              <b>${esc(meta.reportReasons[r.reason] || r.reason)}</b>${r.details ? ' – ' + esc(r.details) : ''}
              <span class="small muted">· ${esc(r.reporter_name)}, ${timeAgo(r.created_at)}</span>
            </div>`).join('')}
        </div>`;
    }).join('') || '<div class="empty"><span class="big">✅</span>Không có báo cáo nào cần xử lý.</div>';
  }

  async function load() {
    data = await api.get('/api/admin/reports');
    render();
  }

  $('#filter-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-show]');
    if (!t) return;
    show = t.dataset.show;
    $$('#filter-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    render();
  });

  $('#reports').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const msg = btn.dataset.action === 'hide'
      ? 'Xác nhận tin vi phạm và ẩn khỏi chợ?'
      : 'Bỏ qua các báo cáo và hiển thị lại tin (nếu đang bị ẩn)?';
    if (!confirm(msg)) return;
    await withBusy(btn, async () => {
      await api.post(`/api/admin/listings/${btn.dataset.id}/moderate`, { action: btn.dataset.action });
      toast('Đã xử lý báo cáo');
      await load();
    });
  });

  await load();
});
