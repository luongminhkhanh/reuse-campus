boot(async ({ me }) => {
  // Chỉ cho chuyển hướng về đường dẫn nội bộ (tránh open redirect)
  const next = param('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/auth.html') ? next : '/';
  if (me) { location.href = target; return; }

  const errorBox = $('#auth-error');
  const showError = (msg) => { errorBox.textContent = msg; errorBox.classList.remove('hidden'); };

  function switchTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $('#login-form').classList.toggle('hidden', name !== 'login');
    $('#register-form').classList.toggle('hidden', name !== 'register');
    errorBox.classList.add('hidden');
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  if (location.hash === '#register') switchTab('register');

  async function submit(form, url) {
    errorBox.classList.add('hidden');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.post(url, Object.fromEntries(new FormData(form)));
      location.href = target;
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
    }
  }

  $('#login-form').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/api/auth/login'); });
  $('#register-form').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/api/auth/register'); });

  $$('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    const form = $('#login-form');
    form.email.value = b.dataset.demo;
    form.password.value = b.dataset.pw || '123456';
    submit(form, '/api/auth/login');
  }));
});
