// db.js — data layer for Youth Coordination Hub. Two modes behind one API:
//   LIVE — Supabase (config.js has URL + key). In-memory store mirrors the
//          server; mutations update locally (optimistic) and write through.
//   DEMO — localStorage only (config.js values empty).
// app.js reads window.DB synchronously; auth.js drives DB.boot() first.

(function () {
  const KEY = 'ych_data_v1';
  const CFG = window.APP_CONFIG || {};
  const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

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

  const SECTIONS = [
    { key: 'prep',     title: 'Prepare the Sacrament', owner: 'Teachers Quorum Pres.', count: 4, eligible: ['teachers'] },
    { key: 'bless',    title: 'Bless the Sacrament',   owner: 'Priests Quorum Pres.',  count: 3, eligible: ['priests'] },
    { key: 'pass',     title: 'Pass the Sacrament',    owner: 'Deacons Quorum Pres.',  count: 8, eligible: ['deacons', 'teachers'], note: 'Deacons first — teachers fill remaining spots' },
    { key: 'greet_yw', title: 'Greeters — Young Women', owner: 'YW Class Presidents',  count: 2, eligible: ['yw_younger', 'yw_middle', 'yw_older'] },
    { key: 'greet_ym', title: 'Greeters — Young Men',   owner: 'YW Class Presidents',  count: 2, eligible: ['deacons', 'teachers', 'priests'] },
  ];

  let sb = null;      // supabase client (live mode)
  let store = null;   // { ward:{id?,name,join_code?}, members:[], sundays:{} }
  let maps = { event: {}, slot: {} }; // live-mode row ids: event[date], slot[date][key][idx]
  let errCb = null;
  function reportErr(msg) { if (errCb) errCb(msg); }

  function uid() { return 'm' + Math.random().toString(36).slice(2, 10); }

  // ================= demo internals =================
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
  function demoLoad() {
    try { store = JSON.parse(localStorage.getItem(KEY)); } catch (e) { store = null; }
    if (!store || !store.members) store = { ward: { name: 'Demo Ward' }, members: seedMembers(), sundays: {} };
  }
  function save() { if (!LIVE) localStorage.setItem(KEY, JSON.stringify(store)); }

  // ================= dates =================
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nextSundays(n) {
    const out = [];
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    for (let i = 0; i < n; i++) { out.push(iso(new Date(d))); d.setDate(d.getDate() + 7); }
    return out;
  }
  function fmtDate(isoStr, opts) {
    const [y, m, dd] = isoStr.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ================= boot / ward lifecycle (live) =================
  async function boot() {
    if (!LIVE) { demoLoad(); return { status: 'ready', mode: 'demo' }; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    let session;
    try {
      session = (await sb.auth.getSession()).data.session;
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
    } catch (e) {
      return { status: 'error', message: 'Sign-in failed: ' + (e.message || e) };
    }
    return reloadWard();
  }

  async function reloadWard() {
    const { data: wards, error } = await sb.from('wards').select('*').order('created_at');
    if (error) return { status: 'error', message: 'Could not load ward: ' + error.message };
    if (!wards || !wards.length) return { status: 'needs_ward' };
    return loadAll(wards[0]);
  }

  async function loadAll(ward) {
    const [mres, sres] = await Promise.all([
      sb.from('members').select('*').eq('ward_id', ward.id).order('name'),
      sb.rpc('ensure_sundays', { p_ward: ward.id, p_dates: nextSundays(8) }),
    ]);
    if (mres.error) return { status: 'error', message: 'Roster load failed: ' + mres.error.message };
    if (sres.error) return { status: 'error', message: 'Sundays load failed: ' + sres.error.message };

    store = {
      ward: { id: ward.id, name: ward.name, join_code: ward.join_code },
      members: (mres.data || []).map(r => ({ id: r.id, name: r.name, cls: r.class_key, role: r.role, active: r.active })),
      sundays: {},
    };
    maps = { event: {}, slot: {} };
    (sres.data || []).forEach(ev => {
      const date = ev.event_date;
      maps.event[date] = ev.id;
      const slots = {}, smap = {};
      SECTIONS.forEach(s => { slots[s.key] = Array(s.count).fill(null); smap[s.key] = Array(s.count).fill(null); });
      (ev.slots || []).forEach(sl => {
        if (slots[sl.slot_type] && sl.position < slots[sl.slot_type].length) {
          slots[sl.slot_type][sl.position] = sl.member_id;
          smap[sl.slot_type][sl.position] = sl.id;
        }
      });
      store.sundays[date] = { off: ev.status === 'no_assignments', note: '', slots };
      maps.slot[date] = smap;
    });
    return { status: 'ready', mode: 'live' };
  }

  async function createWard(name, label) {
    const { data, error } = await sb.rpc('create_ward', { p_name: name, p_label: label || null });
    if (error) return { status: 'error', message: error.message };
    return loadAll(data);
  }
  async function joinWard(code, label) {
    const { data, error } = await sb.rpc('join_ward', { p_code: code, p_label: label || null });
    if (error) return { status: 'error', message: error.message };
    return loadAll(data);
  }

  // Re-pull everything; resolves true if anything changed.
  async function refresh() {
    if (!LIVE || !store || !store.ward.id) return false;
    const before = JSON.stringify(store);
    const { data: wards, error } = await sb.from('wards').select('*').eq('id', store.ward.id);
    if (error || !wards || !wards.length) return false;
    const res = await loadAll(wards[0]);
    return res.status === 'ready' && JSON.stringify(store) !== before;
  }

  // ================= sundays / slots =================
  function ensureSunday(dateISO) {
    if (!store.sundays[dateISO]) {
      const slots = {};
      SECTIONS.forEach(s => { slots[s.key] = Array(s.count).fill(null); });
      store.sundays[dateISO] = { off: false, note: '', slots };
      save();
    }
    return store.sundays[dateISO];
  }

  function writeSlot(dateISO, sectionKey, idx, memberId) {
    const day = ensureSunday(dateISO);
    day.slots[sectionKey][idx] = memberId;
    save();
    if (!LIVE) return;
    const sid = maps.slot[dateISO] && maps.slot[dateISO][sectionKey] && maps.slot[dateISO][sectionKey][idx];
    if (!sid) { reportErr('Slot not synced yet — pull to refresh'); return; }
    sb.from('assignment_slots')
      .update({ member_id: memberId, status: memberId ? 'filled' : 'open' })
      .eq('id', sid)
      .then(({ error }) => { if (error) reportErr('Save failed: ' + error.message); });
  }
  function assign(dateISO, sectionKey, idx, memberId) { writeSlot(dateISO, sectionKey, idx, memberId); }
  function clearSlot(dateISO, sectionKey, idx) { writeSlot(dateISO, sectionKey, idx, null); }

  function setWeekOff(dateISO, off) {
    const day = ensureSunday(dateISO);
    day.off = off;
    save();
    if (!LIVE) return;
    const evId = maps.event[dateISO];
    if (!evId) { reportErr('Week not synced yet — pull to refresh'); return; }
    sb.from('events')
      .update({ status: off ? 'no_assignments' : 'scheduled' })
      .eq('id', evId)
      .then(({ error }) => { if (error) reportErr('Save failed: ' + error.message); });
  }

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

  // ================= roster =================
  function members() { return store.members.slice(); }
  function activeByClass(cls) {
    return store.members.filter(m => m.cls === cls && m.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function memberById(id) { return store.members.find(m => m.id === id) || null; }

  async function addMember(name, cls, role) {
    const local = { id: uid(), name: name.trim(), cls, role: role || 'member', active: true };
    if (!LIVE) { store.members.push(local); save(); return local; }
    const { data, error } = await sb.from('members')
      .insert({ ward_id: store.ward.id, name: local.name, class_key: cls, role: local.role })
      .select().single();
    if (error) { reportErr('Add failed: ' + error.message); return null; }
    const m = { id: data.id, name: data.name, cls: data.class_key, role: data.role, active: data.active };
    store.members.push(m);
    return m;
  }

  function updateMember(id, patch) {
    const m = memberById(id);
    if (!m) return;
    Object.assign(m, patch);
    save();
    if (!LIVE) return;
    const row = {};
    if ('name' in patch) row.name = patch.name;
    if ('cls' in patch) row.class_key = patch.cls;
    if ('role' in patch) row.role = patch.role;
    if ('active' in patch) row.active = patch.active;
    sb.from('members').update(row).eq('id', id)
      .then(({ error }) => { if (error) reportErr('Save failed: ' + error.message); });
  }

  function removeMember(id) {
    store.members = store.members.filter(m => m.id !== id);
    Object.values(store.sundays).forEach(day => {
      Object.keys(day.slots).forEach(k => {
        day.slots[k] = day.slots[k].map(mid => (mid === id ? null : mid));
      });
    });
    save();
    if (!LIVE) return;
    // Clear their slots first so status doesn't stay 'filled' with no member
    // (the FK only nulls member_id on delete).
    sb.from('assignment_slots').update({ member_id: null, status: 'open' }).eq('member_id', id)
      .then(() => sb.from('members').delete().eq('id', id))
      .then(({ error }) => { if (error) reportErr('Delete failed: ' + error.message); });
  }

  function resetDemo() {
    if (LIVE) return;
    store = { ward: { name: 'Demo Ward' }, members: seedMembers(), sundays: {} };
    save();
  }

  window.DB = {
    LIVE, CLASSES, ROLES, SECTIONS,
    boot, createWard, joinWard, refresh,
    nextSundays, fmtDate, ensureSunday, assign, clearSlot, setWeekOff,
    conflicts, lastServed, weeksBetween,
    members, activeByClass, memberById, addMember, updateMember, removeMember,
    ward: () => store.ward, resetDemo,
    onError: (cb) => { errCb = cb; },
  };
})();
