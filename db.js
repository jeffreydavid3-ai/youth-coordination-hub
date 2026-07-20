// db.js — data layer for Youth Coordination Hub.
// DEMO MODE: persists to localStorage on this device only.
// Phase 1b swaps the store internals for Supabase calls (see schema.sql);
// the window.DB API surface stays the same so app.js doesn't change.

(function () {
  const KEY = 'ych_data_v1';

  const CLASSES = {
    yw_younger: { label: 'YW Younger', short: 'YW-Y', group: 'yw' },
    yw_middle:  { label: 'YW Middle',  short: 'YW-M', group: 'yw' },
    yw_older:   { label: 'YW Older',   short: 'YW-O', group: 'yw' },
    deacons:    { label: 'Deacons',    short: 'Dea',  group: 'ym' },
    teachers:   { label: 'Teachers',   short: 'Tea',  group: 'ym' },
    priests:    { label: 'Priests',    short: 'Pri',  group: 'ym' },
  };

  const ROLES = {
    president:  'President',
    counselor1: '1st Counselor',
    counselor2: '2nd Counselor',
    secretary:  'Secretary',
    member:     '',
  };

  // The five Sunday assignment sections. `eligible` is ordered: primary
  // classes first (pass = deacons first, teachers are the helpers).
  const SECTIONS = [
    { key: 'prep',     title: 'Prepare the Sacrament', owner: 'Teachers Quorum Pres.', count: 4, eligible: ['teachers'] },
    { key: 'bless',    title: 'Bless the Sacrament',   owner: 'Priests Quorum Pres.',  count: 3, eligible: ['priests'] },
    { key: 'pass',     title: 'Pass the Sacrament',    owner: 'Deacons Quorum Pres.',  count: 8, eligible: ['deacons', 'teachers'], note: 'Deacons first — teachers fill remaining spots' },
    { key: 'greet_yw', title: 'Greeters — Young Women', owner: 'YW Class Presidents',  count: 2, eligible: ['yw_younger', 'yw_middle', 'yw_older'] },
    { key: 'greet_ym', title: 'Greeters — Young Men',   owner: 'YW Class Presidents',  count: 2, eligible: ['deacons', 'teachers', 'priests'] },
  ];

  function uid() { return 'm' + Math.random().toString(36).slice(2, 10); }

  function seedMembers() {
    const mk = (name, cls, role) => ({ id: uid(), name, cls, role: role || 'member', active: true });
    return [
      mk('Ethan B.', 'deacons', 'president'), mk('Carter H.', 'deacons', 'counselor1'),
      mk('Liam S.', 'deacons'), mk('Miles T.', 'deacons'), mk('Owen K.', 'deacons'), mk('Jonas P.', 'deacons'),
      mk('Noah G.', 'teachers', 'president'), mk('Ryan D.', 'teachers', 'counselor1'),
      mk('Tyler M.', 'teachers'), mk('Blake W.', 'teachers'), mk('Sam R.', 'teachers'),
      mk('Jacob F.', 'priests', 'president'), mk('Dylan C.', 'priests', 'counselor1'),
      mk('Aaron L.', 'priests'), mk('Chase N.', 'priests'), mk('Ben A.', 'priests'),
      mk('Emma J.', 'yw_younger', 'president'), mk('Lily P.', 'yw_younger', 'counselor1'),
      mk('Ava M.', 'yw_younger'), mk('Sophie K.', 'yw_younger'), mk('Grace T.', 'yw_younger'),
      mk('Olivia R.', 'yw_middle', 'president'), mk('Mia H.', 'yw_middle', 'counselor1'),
      mk('Zoe C.', 'yw_middle'), mk('Ella S.', 'yw_middle'),
      mk('Abby W.', 'yw_older', 'president'), mk('Chloe D.', 'yw_older', 'counselor1'),
      mk('Hannah B.', 'yw_older'), mk('Kate M.', 'yw_older'), mk('Sarah L.', 'yw_older'),
    ];
  }

  function freshStore() {
    return { ward: { name: 'Our Ward' }, members: seedMembers(), sundays: {} };
  }

  let store;
  function load() {
    try { store = JSON.parse(localStorage.getItem(KEY)); } catch (e) { store = null; }
    if (!store || !store.members) store = freshStore();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(store)); }

  // ---------- dates ----------
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nextSundays(n) {
    const out = [];
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // today if already Sunday
    for (let i = 0; i < n; i++) { out.push(iso(new Date(d))); d.setDate(d.getDate() + 7); }
    return out;
  }
  function fmtDate(isoStr, opts) {
    const [y, m, dd] = isoStr.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ---------- sundays / slots ----------
  function ensureSunday(dateISO) {
    if (!store.sundays[dateISO]) {
      const slots = {};
      SECTIONS.forEach(s => { slots[s.key] = Array(s.count).fill(null); });
      store.sundays[dateISO] = { off: false, note: '', slots };
      save();
    }
    return store.sundays[dateISO];
  }

  function assign(dateISO, sectionKey, idx, memberId) {
    const day = ensureSunday(dateISO);
    day.slots[sectionKey][idx] = memberId;
    save();
  }
  function clearSlot(dateISO, sectionKey, idx) {
    const day = ensureSunday(dateISO);
    day.slots[sectionKey][idx] = null;
    save();
  }
  function setWeekOff(dateISO, off) {
    const day = ensureSunday(dateISO);
    day.off = off;
    save();
  }

  // Sections (other slots) this member is already assigned to on this date.
  function conflicts(dateISO, memberId, exceptKey, exceptIdx) {
    const day = store.sundays[dateISO];
    if (!day || !memberId) return [];
    const hits = [];
    SECTIONS.forEach(s => {
      (day.slots[s.key] || []).forEach((mid, i) => {
        if (mid === memberId && !(s.key === exceptKey && i === exceptIdx)) hits.push(s);
      });
    });
    return hits;
  }

  // Most recent Sunday strictly before dateISO on which member held any slot.
  function lastServed(memberId, beforeISO) {
    let best = null;
    Object.keys(store.sundays).forEach(d => {
      if (d >= beforeISO) return;
      const day = store.sundays[d];
      const served = SECTIONS.some(s => (day.slots[s.key] || []).includes(memberId));
      if (served && (!best || d > best)) best = d;
    });
    return best;
  }
  function weeksBetween(aISO, bISO) {
    const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    return Math.round((toD(bISO) - toD(aISO)) / (7 * 24 * 3600 * 1000));
  }

  // ---------- roster ----------
  function members() { return store.members.slice(); }
  function activeByClass(cls) {
    return store.members.filter(m => m.cls === cls && m.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function memberById(id) { return store.members.find(m => m.id === id) || null; }
  function addMember(name, cls, role) {
    const m = { id: uid(), name: name.trim(), cls, role: role || 'member', active: true };
    store.members.push(m); save(); return m;
  }
  function updateMember(id, patch) {
    const m = memberById(id);
    if (m) { Object.assign(m, patch); save(); }
  }
  function removeMember(id) {
    store.members = store.members.filter(m => m.id !== id);
    Object.values(store.sundays).forEach(day => {
      Object.keys(day.slots).forEach(k => {
        day.slots[k] = day.slots[k].map(mid => (mid === id ? null : mid));
      });
    });
    save();
  }

  function resetDemo() { store = freshStore(); save(); }

  load();

  window.DB = {
    CLASSES, ROLES, SECTIONS,
    nextSundays, fmtDate, ensureSunday, assign, clearSlot, setWeekOff,
    conflicts, lastServed, weeksBetween,
    members, activeByClass, memberById, addMember, updateMember, removeMember,
    ward: () => store.ward, resetDemo,
  };
})();
