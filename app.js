// app.js — views + interaction. Depends on window.DB (db.js).
// auth.js calls APP.start() once DB.boot() has finished.

(function () {
  const D = window.DB;
  const $ = (sel) => document.querySelector(sel);

  const state = {
    view: 'sundays',
    date: D.nextSundays(1)[0],
    picker: null, // { key, idx }
  };

  // ================= helpers =================
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }

  function classChip(cls) {
    const c = D.CLASSES[cls];
    return `<span class="chip ${c.group}">${c.short}</span>`;
  }
  function roleChip(role) {
    const label = D.ROLES[role];
    return label ? `<span class="chip role">${label}</span>` : '';
  }

  function fillStats(dateISO) {
    const day = D.ensureSunday(dateISO);
    let filled = 0, total = 0;
    D.SECTIONS.forEach(s => {
      day.slots[s.key].forEach(mid => { total++; if (mid) filled++; });
    });
    return { filled, total };
  }

  // ================= sundays view =================
  function renderSundays() {
    const dates = D.nextSundays(8);
    if (!dates.includes(state.date)) state.date = dates[0];
    const day = D.ensureSunday(state.date);

    const pills = dates.map(d => {
      const day2 = D.ensureSunday(d);
      const { filled, total } = fillStats(d);
      let fill = '';
      if (day2.off) fill = '<span class="dp-fill">off</span>';
      else if (filled === total) fill = '<span class="dp-fill done">✓ full</span>';
      else fill = `<span class="dp-fill ${filled ? 'partial' : ''}">${filled}/${total}</span>`;
      return `<button class="date-pill ${d === state.date ? 'active' : ''}" data-date="${d}">
        <span class="dp-day">${D.fmtDate(d, { month: 'short' })}</span>
        <span class="dp-date">${d.slice(8)}</span>${fill}</button>`;
    }).join('');

    let body;
    if (day.off) {
      body = `<div class="off-banner"><span>No assignments this Sunday (stake conference, ward conference, etc.)</span>
        <button class="btn" id="week-on">Undo</button></div>`;
    } else {
      body = D.SECTIONS.map(s => renderSection(s, day)).join('');
    }

    $('#view').innerHTML = `
      <div class="date-row">${pills}</div>
      <div class="board-head">
        <div class="board-date">${D.fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div class="board-actions">
          ${day.off ? '' : '<button class="btn ghost" id="week-off">Week off</button>'}
          <button class="btn primary" id="copy-week">Copy as text</button>
        </div>
      </div>
      ${body}`;

    document.querySelectorAll('.date-pill').forEach(b =>
      b.addEventListener('click', () => { state.date = b.dataset.date; render(); }));
    const off = $('#week-off'); if (off) off.addEventListener('click', () => { D.setWeekOff(state.date, true); render(); });
    const on = $('#week-on'); if (on) on.addEventListener('click', () => { D.setWeekOff(state.date, false); render(); });
    $('#copy-week').addEventListener('click', copyWeek);

    document.querySelectorAll('.slot-open').forEach(b =>
      b.addEventListener('click', () => openPicker(b.dataset.key, Number(b.dataset.idx))));
    document.querySelectorAll('.slot-x').forEach(b =>
      b.addEventListener('click', () => { D.clearSlot(state.date, b.dataset.key, Number(b.dataset.idx)); render(); }));
  }

  function renderSection(s, day) {
    const slots = day.slots[s.key];
    const filled = slots.filter(Boolean).length;
    const rows = slots.map((mid, i) => {
      if (!mid) {
        return `<div class="slot-row">
          <button class="slot-open" data-key="${s.key}" data-idx="${i}">+ Assign</button></div>`;
      }
      const m = D.memberById(mid);
      if (!m) return '';
      const dbl = D.conflicts(state.date, mid, s.key, i);
      const warn = dbl.length ? `<span class="chip warn" title="Also assigned: ${dbl.map(x => x.title).join(', ')}">⚠ double-booked</span>` : '';
      return `<div class="slot-row">
        <div class="slot-name">${m.name} ${classChip(m.cls)} ${warn}</div>
        <button class="slot-x" data-key="${s.key}" data-idx="${i}" title="Remove">✕</button></div>`;
    }).join('');

    return `<div class="section-card">
      <div class="section-head">
        <div class="section-title">${s.title}</div>
        <div class="section-count ${filled === slots.length ? 'done' : ''}">${filled}/${slots.length}</div>
      </div>
      <div class="section-owner">Owner: ${s.owner}</div>
      ${s.note ? `<div class="section-note">${s.note}</div>` : ''}
      ${rows}</div>`;
  }

  function copyWeek() {
    const day = D.ensureSunday(state.date);
    const lines = [`⛪ Sunday Assignments — ${D.fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' })}`];
    if (day.off) {
      lines.push('No assignments this week.');
    } else {
      D.SECTIONS.forEach(s => {
        const names = day.slots[s.key].map(mid => {
          const m = mid && D.memberById(mid);
          return m ? m.name : null;
        });
        const open = names.filter(n => !n).length;
        const list = names.filter(Boolean).join(', ') || '—';
        lines.push(`${s.title}: ${list}${open ? ` (${open} open)` : ''}`);
      });
    }
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('Copied — paste into your group chat'),
        () => toast('Copy failed — long-press to select text'));
    } else {
      toast('Clipboard unavailable in this browser');
    }
  }

  // ================= member picker =================
  function openPicker(key, idx) {
    state.picker = { key, idx };
    const s = D.SECTIONS.find(x => x.key === key);
    $('#sheet-title').textContent = `Assign — ${s.title}`;
    $('#sheet-sub').textContent = D.fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' });

    const groups = s.eligible.map(cls => {
      const label = D.CLASSES[cls].label + (s.key === 'pass' && cls === 'teachers' ? ' (helpers)' : '');
      const rows = D.activeByClass(cls)
        .map(m => {
          const last = D.lastServed(m.id, state.date);
          const wks = last ? D.weeksBetween(last, state.date) : null;
          const dbl = D.conflicts(state.date, m.id);
          return { m, last, wks, dbl };
        })
        .sort((a, b) => {
          if (!a.last && b.last) return -1;
          if (a.last && !b.last) return 1;
          if (a.last && b.last && a.last !== b.last) return a.last < b.last ? -1 : 1;
          return a.m.name.localeCompare(b.m.name);
        })
        .map(({ m, wks, dbl }) => {
          const servedTxt = wks === null ? '<span class="never">never served</span>'
            : wks === 0 ? 'served today' : wks === 1 ? 'served last wk' : `served ${wks} wks ago`;
          const conflictTxt = dbl.length ? `<div class="conflict">⚠ already: ${dbl.map(x => x.title).join(', ')}</div>` : '';
          return `<button class="pick-row" data-mid="${m.id}">
            <span class="pick-name">${m.name} ${roleChip(m.role)}</span>
            <span class="pick-meta">${conflictTxt}<div>${servedTxt}</div></span></button>`;
        }).join('');
      return `<div class="pick-group">${label}</div>${rows || '<div class="section-note" style="margin:6px 0;">No active members</div>'}`;
    }).join('');

    $('#sheet-list').innerHTML = groups;
    $('#sheet-backdrop').style.display = 'flex';

    document.querySelectorAll('.pick-row').forEach(b =>
      b.addEventListener('click', () => {
        const mid = b.dataset.mid;
        const dbl = D.conflicts(state.date, mid);
        D.assign(state.date, key, idx, mid);
        closePicker();
        if (dbl.length) {
          const m = D.memberById(mid);
          toast(`⚠ ${m.name} is now double-booked (${[...dbl.map(x => x.title), s.title].join(' + ')})`);
        }
        render();
      }));
  }

  function closePicker() {
    state.picker = null;
    $('#sheet-backdrop').style.display = 'none';
  }

  // ================= roster view =================
  function renderRoster() {
    const clsOptions = Object.entries(D.CLASSES)
      .map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
    const roleOptions = Object.entries(D.ROLES)
      .map(([k, l]) => `<option value="${k}">${l || 'Member'}</option>`).join('');

    const groups = Object.keys(D.CLASSES).map(cls => {
      const list = D.members().filter(m => m.cls === cls)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(m => `<div class="member-row ${m.active ? '' : 'inactive'}">
          <div class="slot-name">${m.name} ${roleChip(m.role)}</div>
          <button class="mini-btn" data-act="toggle" data-mid="${m.id}">${m.active ? 'Active' : 'Inactive'}</button>
          <button class="mini-btn" data-act="remove" data-mid="${m.id}">✕</button></div>`).join('');
      const count = D.activeByClass(cls).length;
      return `<div class="section-card">
        <div class="section-head">
          <div class="section-title">${D.CLASSES[cls].label}</div>
          <div class="section-count">${count} active</div>
        </div>${list || '<div class="section-note">No members yet</div>'}</div>`;
    }).join('');

    $('#view').innerHTML = `
      <div class="roster-add">
        <input id="new-name" placeholder="Name" maxlength="40">
        <select id="new-cls">${clsOptions}</select>
        <select id="new-role">${roleOptions.replace('value="member"', 'value="member" selected')}</select>
        <button class="btn primary" id="add-member">Add</button>
      </div>
      ${groups}`;

    $('#add-member').addEventListener('click', async () => {
      const name = $('#new-name').value.trim();
      if (!name) { toast('Enter a name'); return; }
      const m = await D.addMember(name, $('#new-cls').value, $('#new-role').value);
      if (m) toast(`Added ${m.name}`);
      render();
    });
    document.querySelectorAll('.mini-btn').forEach(b =>
      b.addEventListener('click', () => {
        const m = D.memberById(b.dataset.mid);
        if (!m) return;
        if (b.dataset.act === 'toggle') {
          D.updateMember(m.id, { active: !m.active });
        } else if (confirm(`Remove ${m.name} from the roster? Their assignments will be cleared.`)) {
          D.removeMember(m.id);
        }
        render();
      }));
  }

  // ================= activities placeholder =================
  function renderActivities() {
    $('#view').innerHTML = `<div class="placeholder">
      <div class="ph-icon">🎯</div>
      <b>Thursday activities — coming in Phase 2</b><br>
      Annual cadence calendar, monthly themes, planning<br>
      assignments, and the imported 2026 youth calendar.</div>`;
  }

  // ================= shell =================
  function render() {
    $('#ward-name').textContent = D.ward().name;
    if (state.view === 'sundays') renderSundays();
    else if (state.view === 'roster') renderRoster();
    else renderActivities();
  }

  function renderModeChip() {
    const chip = $('#mode-chip');
    if (!D.LIVE) {
      chip.textContent = 'DEMO';
      chip.title = 'Data is saved on this device only. Set config.js to go live.';
      chip.onclick = null;
      return;
    }
    const code = D.ward().join_code || '';
    chip.textContent = `WARD CODE: ${code}`;
    chip.title = 'Tap to copy — share with presidencies and leaders so their devices can join';
    chip.onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => toast(`Ward code ${code} copied`));
      }
    };
  }

  function start() {
    D.onError(toast);
    renderModeChip();
    render();

    if (D.LIVE) {
      // Pick up other presidencies' changes: poll every 60s + on tab focus.
      const maybeRefresh = async () => {
        if (state.picker) return; // don't yank the sheet out from under a pick
        const changed = await D.refresh();
        if (changed && !state.picker) { renderModeChip(); render(); }
      };
      setInterval(maybeRefresh, 60000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) maybeRefresh();
      });
    }
  }

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => {
      state.view = t.dataset.view;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      render();
    }));

  $('#sheet-backdrop').addEventListener('click', (e) => {
    if (e.target === $('#sheet-backdrop')) closePicker();
  });

  window.APP = { start };
})();
