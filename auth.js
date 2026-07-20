// auth.js — boot flow. Signs in (anonymous device auth), routes to the
// join/create-ward screen when the device has no ward yet, then hands
// off to APP.start(). Demo mode skips straight to the app.

(function () {
  const root = document.getElementById('auth-root');
  const shell = document.getElementById('app-shell');

  function show(html) { root.style.display = 'flex'; root.innerHTML = html; }

  function startApp() {
    root.style.display = 'none';
    shell.style.display = 'flex';
    window.APP.start();
  }

  function handle(res) {
    if (res.status === 'ready') { startApp(); return; }
    if (res.status === 'needs_ward') { renderWardScreen(); return; }
    renderError(res.message || 'Something went wrong.');
  }

  function renderError(message) {
    show(`
      <div class="auth-card">
        <div class="auth-logo">⛪</div>
        <h2>Can't connect</h2>
        <p class="auth-err">${message}</p>
        <p class="auth-hint">If this is a fresh Supabase project, make sure
        <b>schema.sql</b> has been run in the SQL Editor and
        <b>Anonymous sign-ins</b> are enabled under Authentication → Sign In / Up.</p>
        <button class="btn primary" id="auth-retry">Try again</button>
      </div>`);
    document.getElementById('auth-retry').addEventListener('click', boot);
  }

  function renderWardScreen(errMsg) {
    show(`
      <div class="auth-card">
        <div class="auth-logo">⛪</div>
        <h2>Youth Coordination Hub</h2>
        <p class="auth-hint">Join your ward with the code from your leader, or set up a new ward.</p>
        ${errMsg ? `<p class="auth-err">${errMsg}</p>` : ''}
        <div class="auth-field">
          <input id="join-code" placeholder="Ward code (e.g. 4F7A2C)" maxlength="6" autocomplete="off">
          <button class="btn primary" id="join-btn">Join ward</button>
        </div>
        <div class="auth-divider">or</div>
        <div class="auth-field">
          <input id="ward-name" placeholder="New ward name" maxlength="60">
          <button class="btn" id="create-btn">Create ward</button>
        </div>
      </div>`);

    const busy = (b) => {
      document.getElementById('join-btn').disabled = b;
      document.getElementById('create-btn').disabled = b;
    };
    document.getElementById('join-btn').addEventListener('click', async () => {
      const code = document.getElementById('join-code').value.trim();
      if (!code) return renderWardScreen('Enter a ward code.');
      busy(true);
      const res = await DB.joinWard(code);
      if (res.status === 'ready') startApp(); else renderWardScreen(res.message);
    });
    document.getElementById('create-btn').addEventListener('click', async () => {
      const name = document.getElementById('ward-name').value.trim();
      if (!name) return renderWardScreen('Enter a ward name.');
      busy(true);
      const res = await DB.createWard(name);
      if (res.status === 'ready') startApp(); else renderWardScreen(res.message);
    });
  }

  async function boot() {
    show(`<div class="auth-card"><div class="auth-logo">⛪</div><p class="auth-hint">Loading…</p></div>`);
    let res;
    try { res = await DB.boot(); }
    catch (e) { res = { status: 'error', message: e.message || String(e) }; }
    handle(res);
  }

  boot();
})();
