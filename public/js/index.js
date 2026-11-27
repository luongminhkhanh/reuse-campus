const PRICE_PRESETS = [
  { label: 'Miễn phí', min: '', max: '0' },
  { label: 'Dưới 100k', min: '', max: '100000' },
  { label: '100k – 500k', min: '100000', max: '500000' },
  { label: '500k – 2 triệu', min: '500000', max: '2000000' },
  { label: 'Trên 2 triệu', min: '2000000', max: '' },
];

boot(async ({ meta }) => {
  const form = $('#search-form');

  // Đổ danh mục, hình thức vào ô chọn
  for (const [key, c] of Object.entries(meta.categories)) {
    form.category.insertAdjacentHTML('beforeend', `<option value="${key}">${c.icon} ${esc(c.name)}</option>`);
  }
  for (const [key, name] of Object.entries(meta.types)) {
    form.type.insertAdjacentHTML('beforeend', `<option value="${key}">${esc(name)}</option>`);
  }

  $('#cat-chips').innerHTML =
    `<button type="button" class="chip" data-cat="">Tất cả</button>` +
    Object.entries(meta.categories)
      .map(([key, c]) => `<button type="button" class="chip" data-cat="${key}">${c.icon} ${esc(c.name)}</button>`)
      .join('');

  $('#price-presets').insertAdjacentHTML('beforeend', PRICE_PRESETS
    .map((p, i) => `<button type="button" class="chip" data-preset="${i}">${p.label}</button>`).join(''));

  // Đọc bộ lọc từ URL (để có thể chia sẻ link kết quả tìm kiếm)
  const initial = new URLSearchParams(location.search);
  for (const name of ['q', 'category', 'type', 'min', 'max', 'sort']) {
    if (initial.has(name)) form[name].value = initial.get(name);
  }

  function currentParams() {
    const params = new URLSearchParams();
    for (const name of ['q', 'category', 'type', 'min', 'max', 'sort']) {
      const v = form[name].value.trim();
      if (v && !(name === 'sort' && v === 'newest')) params.set(name, v);
    }
    return params;
  }

  function syncChips() {
    $$('#cat-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === form.category.value));
    $$('#price-presets .chip').forEach((c) => {
      const p = PRICE_PRESETS[c.dataset.preset];
      c.classList.toggle('active', p.min === form.min.value && p.max === form.max.value);
    });
  }

  async function search() {
    const params = currentParams();
    const min = Number(form.min.value), max = Number(form.max.value);
    if (form.min.value && form.max.value && min > max) {
      toast('Giá "từ" phải nhỏ hơn giá "đến"', 'error');
      return;
    }
    history.replaceState(null, '', params.toString() ? '?' + params : location.pathname);
    syncChips();
    $('#result-count').textContent = 'Đang tìm…';
    try {
      const { items, total } = await api.get('/api/listings?' + params);
      $('#result-count').textContent = total
        ? `Tìm thấy ${total} tin đăng${total > items.length ? ` (hiển thị ${items.length})` : ''}`
        : 'Không có kết quả';
      $('#results').innerHTML = items.length
        ? items.map(listingCard).join('')
        : `<div class="empty" style="grid-column:1/-1"><span class="big">🔍</span>Không tìm thấy món đồ phù hợp. Thử đổi từ khoá hoặc mở rộng khoảng giá nhé.</div>`;
    } catch (err) {
      $('#result-count').textContent = '';
      toast(err.message, 'error');
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
  form.category.addEventListener('change', search);
  form.type.addEventListener('change', search);
  form.sort.addEventListener('change', search);

  $('#cat-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    form.category.value = chip.dataset.cat;
    search();
  });
  $('#price-presets').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-preset]');
    if (!chip) return;
    const p = PRICE_PRESETS[chip.dataset.preset];
    const same = form.min.value === p.min && form.max.value === p.max;
    form.min.value = same ? '' : p.min;   // bấm lần nữa để bỏ chọn
    form.max.value = same ? '' : p.max;
    search();
  });
  $('#reset-btn').addEventListener('click', () => {
    form.reset();
    search();
  });

  search();
});
