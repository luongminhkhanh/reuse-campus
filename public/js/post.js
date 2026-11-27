boot(async ({ meta }) => {
  if (!requireLogin()) return;
  const form = $('#post-form');

  for (const [key, c] of Object.entries(meta.categories)) {
    form.category.insertAdjacentHTML('beforeend', `<option value="${key}">${c.icon} ${esc(c.name)}</option>`);
  }
  for (const [key, name] of Object.entries(meta.conditions)) {
    form.item_condition.insertAdjacentHTML('beforeend', `<option value="${key}" ${key === 'good' ? 'selected' : ''}>${esc(name)}</option>`);
  }

  // Ẩn/hiện ô giá và ô "muốn đổi" theo hình thức
  function onTypeChange() {
    const type = form.type.value;
    $('#price-field').classList.toggle('hidden', type === 'give');
    $('#wanted-field').classList.toggle('hidden', type !== 'exchange');
    $('#price-label').textContent = type === 'exchange' ? 'Giá trị ước tính (đ, không bắt buộc)' : 'Giá bán (đ) *';
  }
  $$('input[name="type"]').forEach((r) => r.addEventListener('change', onTypeChange));
  onTypeChange();

  // Xem trước ảnh
  form.image.addEventListener('change', () => {
    const file = form.image.files[0];
    const preview = $('#preview');
    if (!file) { preview.classList.add('hidden'); return; }
    if (file.size > 3 * 1024 * 1024) {
      toast('Ảnh tối đa 3MB', 'error');
      form.image.value = '';
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
    $('#image-hint').textContent = file.name + ' – bấm để đổi ảnh';
  });

  function showError(msg) {
    const box = $('#form-error');
    box.textContent = msg;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#form-error').classList.add('hidden');
    const type = form.type.value;
    if (form.title.value.trim().length < 3) return showError('Tiêu đề cần ít nhất 3 ký tự');
    if (!form.category.value) return showError('Vui lòng chọn danh mục');
    if (type === 'sell' && !(Number(form.price.value) > 0)) return showError('Vui lòng nhập giá bán');
    if (type === 'exchange' && !form.wanted.value.trim()) return showError('Hãy mô tả món đồ bạn muốn đổi lấy');

    const btn = $('#submit-btn');
    btn.disabled = true;
    btn.textContent = 'Đang đăng…';
    try {
      const { id } = await api.post('/api/listings', new FormData(form));
      location.href = `/listing.html?id=${id}&new=1`;
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Đăng tin';
    }
  });
});
