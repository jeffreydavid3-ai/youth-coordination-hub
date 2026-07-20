// import_calendar.mjs — one-shot importer for the ward's annual youth
// calendar spreadsheet ("Youth Parents" tab, exported as CSV).
//
// Usage:  node import/import_calendar.mjs [csvPath] [wardCode]
//   defaults: import/2026_calendar.csv, ward code 2FC514
//
// Idempotent: skips events that already exist (same date + title) and
// only fills themes for months that don't have one yet.
//
// CSV columns: Oganization[sic], Subject, Start date, Start time, Description, Location
// Month header rows ("JAN") and per-month column-header rows are skipped.

import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://ynenukjgsurkgpssimfs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BTuBFFxlyUY8MKzM2HGb9g_KT1aXogL';

const csvPath = process.argv[2] || 'import/2026_calendar.csv';
const wardCode = process.argv[3] || '2FC514';

// ---------- tiny CSV parser (quotes + embedded newlines) ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

// ---------- mapping ----------
function levelFor(org) {
  const o = (org || '').toLowerCase();
  if (o.includes('ward')) return 'ward';
  if (o.includes('stake')) return 'stake';
  if (o.includes('church')) return 'church';
  if (o.includes('holiday')) return 'holiday';
  if (o.includes('school')) return 'school';
  return 'holiday'; // blank org rows in the sheet are holiday-ish (e.g. Fathers Day)
}
function formatFor(org) {
  const o = (org || '').toLowerCase();
  if (o.includes('yw')) return 'yw_combined';
  if (o.includes('ym')) return 'ym_combined';
  return 'all_combined'; // "Ward, Youth"
}
const CATS = ['spiritual', 'social', 'physical', 'intellectual'];

function parseRow(cells) {
  const [org, subject, date, time, desc, location] = cells.map(c => (c || '').trim());
  if (!subject || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const level = levelFor(org);
  const ev = {
    event_date: date, type: 'activity', level,
    start_time: time || null, location: location || null, status: 'scheduled',
  };

  // Description: pull out "Theme: …" and "Leader(s): …" lines; rest → notes
  let theme = null;
  const noteLines = [];
  (desc || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    const t = l.match(/^Theme:\s*(.+)$/i);
    const ld = l.match(/^Leaders?:\s*(.+)$/i);
    if (t) theme = t[1].trim();
    else if (ld) ev.leaders = ld[1].trim();
    else noteLines.push(l);
  });
  if (noteLines.length) ev.notes = noteLines.join('\n');

  // Title: strip combined-prefix, split "Physical/Bowling" into category+title
  let title = subject
    .replace(/^All Youth Combined\s*[:-]\s*/i, '')
    .replace(/^All YM Combined\s*[:-]\s*/i, '')
    .replace(/^YW Combined\s*[:-]\s*/i, '')
    .trim();
  const catMatch = title.match(/^(Spiritual|Social|Physical|Intellectual)\s*\/\s*(.+)$/i);
  if (catMatch && level === 'ward') {
    ev.category = catMatch[1].toLowerCase();
    title = catMatch[2].trim();
  }
  ev.title = title;

  if (level === 'ward') {
    ev.format = /class(es)? and quorums/i.test(subject) ? 'class' : formatFor(org);
    ev.plan_status = 'planned'; // it's on the annual calendar with a named activity
  }
  return { ev, theme };
}

// ---------- supabase REST helpers ----------
let token = null;
async function api(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(path + ' → ' + res.status + ': ' + text.slice(0, 300));
  return body;
}

async function main() {
  const rows = parseCSV(readFileSync(csvPath, 'utf8'));

  // sign in (anonymous device) + join ward
  const auth = await api('/auth/v1/signup', { method: 'POST', body: '{}' });
  token = auth.access_token;
  const ward = await api('/rest/v1/rpc/join_ward', {
    method: 'POST', body: JSON.stringify({ p_code: wardCode, p_label: 'calendar import' }),
  });
  console.log('Ward:', ward.name, ward.id);

  // parse all rows
  const events = [];
  const themes = {}; // 'YYYY-MM' -> theme
  rows.forEach(cells => {
    const parsed = parseRow(cells);
    if (!parsed) return;
    parsed.ev.ward_id = ward.id;
    events.push(parsed.ev);
    if (parsed.theme) {
      const ym = parsed.ev.event_date.slice(0, 7);
      themes[ym] = themes[ym] || parsed.theme;
    }
  });
  console.log('Parsed events:', events.length, '| months with themes:', Object.keys(themes).length);

  // skip events already present (same date + title)
  const existing = await api(`/rest/v1/events?select=event_date,title&ward_id=eq.${ward.id}&type=eq.activity`);
  const have = new Set(existing.map(e => e.event_date + '|' + (e.title || '')));
  const fresh = events.filter(e => !have.has(e.event_date + '|' + (e.title || '')));
  console.log('Already present:', events.length - fresh.length, '| inserting:', fresh.length);

  if (fresh.length) {
    const ins = await api('/rest/v1/events', {
      method: 'POST', body: JSON.stringify(fresh),
      headers: { Prefer: 'return=representation' },
    });
    console.log('Inserted events:', ins.length);
  }

  // themes: only fill months that have none
  const haveThemes = await api(`/rest/v1/monthly_themes?select=year,month&ward_id=eq.${ward.id}`);
  const haveYM = new Set(haveThemes.map(t => t.year + '-' + String(t.month).padStart(2, '0')));
  const freshThemes = Object.entries(themes)
    .filter(([ym]) => !haveYM.has(ym))
    .map(([ym, theme]) => ({
      ward_id: ward.id, year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)), theme,
    }));
  if (freshThemes.length) {
    await api('/rest/v1/monthly_themes', { method: 'POST', body: JSON.stringify(freshThemes) });
  }
  console.log('Inserted themes:', freshThemes.length, freshThemes.map(t => t.month).join(','));
  console.log('Done.');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
