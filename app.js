// app.js — views + interaction. Depends on window.DB (db.js).
// auth.js calls APP.start() once DB.boot() has finished.

(function () {
  const D = window.DB;
  const $ = (sel) => document.querySelector(sel);

  const state = {
    view: 'sundays',
    date: D.nextSundays(1)[0],
    picker: null,      // member picker open { key, idx }
    actSheet: null,    // activity sheet open { id } or { add: true }
    actShowAll: false, // activities: false = next ~10 weeks, true = everything
  };
  const sheetOpen = () => !!(state.picker || state.actSheet);

  // ================= helpers =================
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function classChip(cls) {
    const c = D.CLASSES[cls];
    return c ? `<span class="chip ${c.group}">${c.short}</span>` : '';
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

  function openSheet(title, sub, bodyHTML) {
    $('#sheet-title').textContent = title;
    $('#sheet-sub').textContent = sub || '';
    $('#sheet-list').innerHTML = bodyHTML;
    $('#sheet-backdrop').style.display = 'flex';
  }
  function closeSheet() {
    state.picker = null;
    state.actSheet = null;
    $('#sheet-backdrop').style.display = 'none';
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
      const warn = dbl.length ? `<span class="chip warn" title="Also assigned: ${esc(dbl.map(x => x.title).join(', '))}">⚠ double-booked</span>` : '';
      return `<div class="slot-row">
        <div class="slot-name">${esc(m.name)} ${classChip(m.cls)} ${warn}</div>
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
    copyText(lines.join('\n'), 'Copied — paste into your group chat');
  }
  function copyText(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast(okMsg), () => toast('Copy failed — long-press to select text'));
    } else {
      toast('Clipboard unavailable in this browser');
    }
  }

  // ================= member picker =================
  function openPicker(key, idx) {
    state.picker = { key, idx };
    const s = D.SECTIONS.find(x => x.key === key);

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
          const conflictTxt = dbl.length ? `<div class="conflict">⚠ already: ${esc(dbl.map(x => x.title).join(', '))}</div>` : '';
          return `<button class="pick-row" data-mid="${m.id}">
            <span class="pick-name">${esc(m.name)} ${roleChip(m.role)}</span>
            <span class="pick-meta">${conflictTxt}<div>${servedTxt}</div></span></button>`;
        }).join('');
      return `<div class="pick-group">${label}</div>${rows || '<div class="section-note" style="margin:6px 0;">No active members</div>'}`;
    }).join('');

    openSheet(`Assign — ${s.title}`,
      D.fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' }), groups);

    document.querySelectorAll('.pick-row').forEach(b =>
      b.addEventListener('click', () => {
        const mid = b.dataset.mid;
        const dbl = D.conflicts(state.date, mid);
        D.assign(state.date, key, idx, mid);
        closeSheet();
        if (dbl.length) {
          const m = D.memberById(mid);
          toast(`⚠ ${m.name} is now double-booked (${[...dbl.map(x => x.title), s.title].join(' + ')})`);
        }
        render();
      }));
  }

  // ================= activities view =================
  const FORMAT_ORDER = { all_combined: 0, yw_combined: 1, ym_combined: 2, class: 3 };
  const CLASS_ORDER = Object.keys(D.CLASSES);

  function defaultTitle(a) {
    if (a.title) return a.title;
    if (a.format === 'class') return 'Class activity';
    return D.FORMATS[a.format] || 'Activity';
  }
  function planChip(a) {
    return `<button class="plan-chip ${a.planStatus}" data-cycle="${a.id}" title="Tap to change status">${a.planStatus}</button>`;
  }

  function renderActivities() {
    const err = D.activitiesError();
    if (err) {
      $('#view').innerHTML = `<div class="placeholder"><div class="ph-icon">🎯</div>
        <b>Activities aren't set up yet</b><br>${esc(err)}<br><br>
        Run <b>migration_phase2.sql</b> in the Supabase SQL Editor, then reload.</div>`;
      return;
    }

    const today = D.todayISO();
    const horizon = D.addDaysISO(today, 70);
    let acts = D.activities().filter(a => a.date >= today);
    const hasMore = acts.some(a => a.date > horizon);
    if (!state.actShowAll) acts = acts.filter(a => a.date <= horizon);

    // group: month -> date -> events
    const months = [];
    const byMonth = {};
    acts.forEach(a => {
      const ym = a.date.slice(0, 7);
      if (!byMonth[ym]) { byMonth[ym] = {}; months.push(ym); }
      (byMonth[ym][a.date] = byMonth[ym][a.date] || []).push(a);
    });

    const monthHTML = months.map(ym => {
      const [y, m] = ym.split('-').map(Number);
      const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const theme = D.themeFor(ym);
      const dates = Object.keys(byMonth[ym]).sort();
      const dateCards = dates.map(d => renderActivityDate(d, byMonth[ym][d])).join('');
      return `<div class="month-head">
          <div class="month-name">${monthName}</div>
          <button class="theme-line" data-theme-ym="${ym}">
            ${theme ? `🎯 ${esc(theme)}` : '+ Set monthly theme'}</button>
        </div>${dateCards}`;
    }).join('');

    $('#view').innerHTML = `
      <div class="board-head" style="margin-top:8px;">
        <div class="board-date">Activities</div>
        <div class="board-actions">
          <button class="btn primary" id="act-add">+ Add event</button>
        </div>
      </div>
      ${monthHTML || '<div class="placeholder"><div class="ph-icon">🎯</div>No upcoming activities.</div>'}
      ${hasMore && !state.actShowAll ? '<button class="btn show-more" id="act-more">Show rest of year</button>' : ''}
      ${state.actShowAll ? '<button class="btn show-more" id="act-less">Show next 10 weeks only</button>' : ''}`;

    $('#act-add').addEventListener('click', () => openActivitySheet(null));
    const more = $('#act-more'); if (more) more.addEventListener('click', () => { state.actShowAll = true; render(); });
    const less = $('#act-less'); if (less) less.addEventListener('click', () => { state.actShowAll = false; render(); });

    document.querySelectorAll('[data-theme-ym]').forEach(b =>
      b.addEventListener('click', () => openThemeSheet(b.dataset.themeYm)));
    document.querySelectorAll('[data-cycle]').forEach(b =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = D.activityById(b.dataset.cycle);
        if (!a) return;
        const next = D.PLAN_STATUS[(D.PLAN_STATUS.indexOf(a.planStatus) + 1) % D.PLAN_STATUS.length];
        D.updateActivity(a.id, { planStatus: next });
        render();
      }));
    document.querySelectorAll('[data-act]').forEach(r =>
      r.addEventListener('click', () => openActivitySheet(r.dataset.act)));
  }

  function renderActivityDate(dateISO, list) {
    list.sort((a, b) => {
      const la = a.level === 'ward' ? 0 : 1, lb = b.level === 'ward' ? 0 : 1;
      if (la !== lb) return la - lb;
      const fa = FORMAT_ORDER[a.format] ?? 9, fb = FORMAT_ORDER[b.format] ?? 9;
      if (fa !== fb) return fa - fb;
      return CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls);
    });

    const rows = list.map(a => {
      if (a.level !== 'ward') {
        return `<div class="act-row context" data-act="${a.id}">
          <span class="chip level">${a.level}</span>
          <span class="act-title">${esc(defaultTitle(a))}</span>
          <span class="act-meta">${esc([a.time, a.location].filter(Boolean).join(' · '))}</span></div>`;
      }
      // chip: class chip for class rows; format chip only when a custom title
      // would otherwise hide the format
      const chip = a.cls ? classChip(a.cls)
        : (a.title ? `<span class="chip fmt">${D.FORMATS[a.format] || ''}</span>` : '');
      if (a.status === 'cancelled') {
        return `<div class="act-row cancelled" data-act="${a.id}">
          ${chip}<span class="act-title struck">${esc(defaultTitle(a))}</span>
          <span class="act-meta">cancelled</span></div>`;
      }
      return `<div class="act-row" data-act="${a.id}">
        ${planChip(a)}${chip}
        <span class="act-title">${esc(defaultTitle(a))}</span>
        <span class="act-meta">${esc([a.leaders, a.time].filter(Boolean).join(' · '))}</span></div>`;
    }).join('');

    return `<div class="section-card act-card">
      <div class="act-date">${D.fmtDate(dateISO, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
      ${rows}</div>`;
  }

  function openThemeSheet(ym) {
    state.actSheet = { theme: ym };
    const [y, m] = ym.split('-').map(Number);
    const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    openSheet('Monthly theme', monthName, `
      <div class="act-form">
        <label>Theme<input id="tf-theme" maxlength="80" value="${esc(D.themeFor(ym) || '')}" placeholder="e.g. Walk with Me with Courage"></label>
        <div class="af-actions"><button class="btn primary" id="tf-save">Save</button></div>
      </div>`);
    $('#tf-save').addEventListener('click', () => {
      const v = $('#tf-theme').value.trim();
      if (v) D.setTheme(ym, v);
      closeSheet(); render();
    });
  }

  const AUDIENCES = [
    { key: 'all_combined', label: 'All Youth Combined', level: 'ward', format: 'all_combined' },
    { key: 'yw_combined', label: 'YW Combined', level: 'ward', format: 'yw_combined' },
    { key: 'ym_combined', label: 'YM Combined', level: 'ward', format: 'ym_combined' },
    ...Object.entries(D.CLASSES).map(([k, c]) => ({ key: 'class_' + k, label: c.label + ' (class)', level: 'ward', format: 'class', cls: k })),
    { key: 'stake', label: 'Stake event (context)', level: 'stake' },
    { key: 'church', label: 'Church event (context)', level: 'church' },
    { key: 'holiday', label: 'Holiday / no activity (context)', level: 'holiday' },
  ];

  function openActivitySheet(id) {
    const a = id ? D.activityById(id) : null;
    state.actSheet = { id };
    const isWard = !a || a.level === 'ward';
    const catOpts = ['', ...D.CATEGORIES].map(c =>
      `<option value="${c}" ${a && a.category === c ? 'selected' : ''}>${c || '— category —'}</option>`).join('');
    const planOpts = D.PLAN_STATUS.map(p =>
      `<option value="${p}" ${a && a.planStatus === p ? 'selected' : ''}>${p}</option>`).join('');
    const audOpts = AUDIENCES.map(o => `<option value="${o.key}">${o.label}</option>`).join('');

    const body = `
      <div class="act-form">
        ${a ? '' : `<label>Date<input type="date" id="af-date" value="${D.nextThursdays(1)[0]}"></label>
                    <label>Who is it for<select id="af-aud">${audOpts}</select></label>`}
        <label>Title / activity<input id="af-title" maxlength="80" value="${esc(a ? (a.title || '') : '')}" placeholder="e.g. Bowling night"></label>
        ${isWard ? `<div class="af-row">
          <label>Category<select id="af-cat">${catOpts}</select></label>
          <label>Plan status<select id="af-plan">${planOpts}</select></label>
        </div>` : ''}
        <div class="af-row">
          <label>Time<input id="af-time" maxlength="20" value="${esc(a ? (a.time || '') : '7:00 PM')}"></label>
          <label>Location<input id="af-loc" maxlength="60" value="${esc(a ? (a.location || '') : '')}"></label>
        </div>
        ${isWard ? `<label>In charge / leaders<input id="af-leaders" maxlength="80" value="${esc(a ? (a.leaders || '') : '')}" placeholder="e.g. Priests / YW Older"></label>
        <label>The plan<textarea id="af-details" rows="3" placeholder="What's happening, supplies, assignments…">${esc(a ? (a.planDetails || '') : '')}</textarea></label>` : ''}
        <div class="af-actions">
          ${a ? (a.status === 'cancelled'
            ? `<button class="btn" id="af-restore">Restore</button>`
            : `<button class="btn ghost" id="af-remove">${a.level === 'ward' ? 'Cancel activity' : 'Delete'}</button>`) : ''}
          <button class="btn primary" id="af-save">${a ? 'Save' : 'Add'}</button>
        </div>
      </div>`;

    openSheet(a ? 'Edit — ' + defaultTitle(a) : 'Add event',
      a ? D.fmtDate(a.date, { weekday: 'long', month: 'long', day: 'numeric' }) : '', body);

    $('#af-save').addEventListener('click', async () => {
      const val = (sel) => { const el = $(sel); return el ? el.value.trim() : ''; };
      const patch = {
        title: val('#af-title') || null,
        time: val('#af-time') || null,
        location: val('#af-loc') || null,
      };
      if (isWard) {
        if ($('#af-cat')) patch.category = val('#af-cat') || null;
        if ($('#af-plan')) patch.planStatus = val('#af-plan');
        patch.leaders = val('#af-leaders') || null;
        patch.planDetails = val('#af-details') || null;
      }
      if (a) {
        D.updateActivity(a.id, patch);
        closeSheet(); render();
      } else {
        const aud = AUDIENCES.find(o => o.key === val('#af-aud')) || AUDIENCES[0];
        if (!val('#af-date')) { toast('Pick a date'); return; }
        const added = await D.addActivity({
          ...patch, date: val('#af-date'), level: aud.level,
          format: aud.format || null, cls: aud.cls || null,
          planStatus: patch.planStatus || 'idea',
        });
        closeSheet();
        if (added) toast('Added ' + defaultTitle(added));
        render();
      }
    });
    const rm = $('#af-remove');
    if (rm) rm.addEventListener('click', () => { D.removeActivity(a.id); closeSheet(); render(); });
    const rs = $('#af-restore');
    if (rs) rs.addEventListener('click', () => { D.restoreActivity(a.id); closeSheet(); render(); });
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
          <div class="slot-name">${esc(m.name)} ${roleChip(m.role)}</div>
          <button class="mini-btn" data-act-btn="toggle" data-mid="${m.id}">${m.active ? 'Active' : 'Inactive'}</button>
          <button class="mini-btn" data-act-btn="remove" data-mid="${m.id}">✕</button></div>`).join('');
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
        if (b.dataset.actBtn === 'toggle') {
          D.updateMember(m.id, { active: !m.active });
        } else if (confirm(`Remove ${m.name} from the roster? Their assignments will be cleared.`)) {
          D.removeMember(m.id);
        }
        render();
      }));
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
    chip.onclick = () => copyText(code, `Ward code ${code} copied`);
  }

  function start() {
    D.onError(toast);
    renderModeChip();
    render();

    if (D.LIVE) {
      const maybeRefresh = async () => {
        if (sheetOpen()) return;
        const changed = await D.refresh();
        if (changed && !sheetOpen()) { renderModeChip(); render(); }
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
    if (e.target === $('#sheet-backdrop')) closeSheet();
  });

  window.APP = { start };
})();
