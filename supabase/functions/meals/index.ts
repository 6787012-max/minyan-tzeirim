/**
 * meals — שיבוץ ארוחות (meals.html ציבורי, meals-admin.html למנהל).
 * ציבורי: get / contacts (הצעות שמות בלבד, טלפון מוסתר) / sign / cancel.
 * מנהל: דורש body.admin = הסוד MEALS_ADMIN_KEY (לא בקוד).
 * הטבלאות סגורות ל-anon; הכול עובר כאן עם מפתח השירות. הפונקציה לא שולחת שום הודעה.
 */
const SITE = Deno.env.get('SITE_ORIGIN') ?? 'https://minyan.mokad.co.il';
const ADMIN_KEY = Deno.env.get('MEALS_ADMIN_KEY') ?? '';
const ALLOWED = new Set([SITE, 'http://localhost:8765', 'http://127.0.0.1:8765']);
const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function cors(origin: string | null) {
  const ok = origin && ALLOWED.has(origin) ? origin : SITE;
  return { 'Access-Control-Allow-Origin': ok, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
           'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}
function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}
async function db(path: string, init: RequestInit & { prefer?: string } = {}) {
  const h: Record<string, string> = {
    'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE, 'Content-Type': 'application/json',
    'Accept-Profile': 'minyan', 'Content-Profile': 'minyan',
  };
  if (init.prefer) h['Prefer'] = init.prefer;
  return await fetch(URL_ + '/rest/v1/' + path, { ...init, headers: h });
}
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanMulti = (v: unknown, max: number) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const dow = (s: string) => new Date(s + 'T00:00:00Z').getUTCDay();
function addDays(s: string, n: number) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

const KINDS: Record<string, string> = {
  breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב',
  shabbat_1: 'סעודה ראשונה (ליל שבת)', shabbat_2: 'סעודה שנייה', shabbat_3: 'סעודה שלישית',
};
const SHORT: Record<string, string> = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', shabbat_1: 'סעודה 1', shabbat_2: 'סעודה 2', shabbat_3: 'סעודה 3' };
// תבנית ברירת מחדל: ראשון-רביעי בוקר, ראשון-חמישי צהריים, שבת שלוש סעודות. מפתח = יום בשבוע (0=ראשון)
const DEFAULT_TEMPLATE: Record<string, string[]> = {
  '0': ['breakfast', 'lunch'], '1': ['breakfast', 'lunch'], '2': ['breakfast', 'lunch'], '3': ['breakfast', 'lunch'],
  '4': ['lunch'], '5': [], '6': ['shabbat_1', 'shabbat_2', 'shabbat_3'],
};
const kindOk = (k: string) => /^[a-z0-9_]{1,30}$/.test(k);
function cleanTemplate(t: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const src = (t && typeof t === 'object') ? t as Record<string, unknown> : {};
  for (let i = 0; i < 7; i++) {
    const a = Array.isArray(src[String(i)]) ? src[String(i)] as unknown[] : [];
    out[String(i)] = a.map((x) => String(x)).filter((k) => KINDS[k]).filter((k, j, arr) => arr.indexOf(k) === j);
  }
  return out;
}
function cleanBring(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) { if (kindOk(k)) { const t = cleanMulti(x, 300); if (t) out[k] = t; } }
  return out;
}
function israelToday(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }

function normPhone(v: unknown): string {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^0\d{8,9}$/.test(d) ? d : '';
}
function maskPhone(p: string): string {
  const pre = p.length === 10 ? p.slice(0, 3) : p.slice(0, 2);
  return pre + '-***-**' + p.slice(-2);
}
function dispPhone(p: string): string {
  return p.length === 10 ? p.slice(0, 3) + '-' + p.slice(3) : p.slice(0, 2) + '-' + p.slice(2);
}
function randId(n: number) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}
function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// הגבלת קצב פשוטה להשלמת שמות (בזיכרון המופע)
const hits = new Map<string, number[]>();
function limited(ip: string, max = 40, ms = 60_000) {
  const now = Date.now(); const arr = (hits.get(ip) ?? []).filter((t) => now - t < ms);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 2000) hits.clear();
  return arr.length > max;
}

async function genSlots(eventId: number, from: string, to: string, template: Record<string, string[]>) {
  const rows: { event_id: number; day: string; kind: string; active: boolean }[] = [];
  for (let d = from, i = 0; d <= to && i < 150; d = addDays(d, 1), i++) {
    for (const kind of template[String(dow(d))] ?? []) rows.push({ event_id: eventId, day: d, kind, active: true });
  }
  if (rows.length) {   // משבצת שבוטלה חוזרת לחיים; קיימת נשארת כמות שהיא
    await db('meal_slots?on_conflict=event_id,day,kind', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify(rows) });
  }
}
// בנייה מחדש: מוחק משבצות ריקות שאינן בתבנית (או מחוץ לטווח); משבצות עם הרשמה נשארות
async function syncSlots(eventId: number, from: string, to: string, template: Record<string, string[]>) {
  const r = await db('meal_slots?select=id,day,kind,meal_signups(id)&event_id=eq.' + eventId);
  const a: { id: number; day: string; kind: string; meal_signups: unknown }[] = r.ok ? await r.json() : [];
  const drop = a.filter((s) => {
    const has = Array.isArray(s.meal_signups) ? s.meal_signups.length > 0 : !!s.meal_signups;
    if (has) return false;
    if (s.day < from || s.day > to) return true;
    return !(template[String(dow(s.day))] ?? []).includes(s.kind);
  }).map((s) => s.id);
  for (let i = 0; i < drop.length; i += 50) {
    await db('meal_slots?id=in.(' + drop.slice(i, i + 50).join(',') + ')', { method: 'DELETE', prefer: 'return=minimal' });
  }
  await genSlots(eventId, from, to, template);
}

async function eventBySlug(slug: string) {
  const r = await db('meal_events?select=*&slug=eq.' + encodeURIComponent(slug) + '&limit=1');
  const a = r.ok ? await r.json() : [];
  return a[0] ?? null;
}
async function slotsOf(eventId: number, full: boolean) {
  const r = await db('meal_slots?select=id,day,kind,label,active,meal_signups(id,name,phone,dish,created_at)&event_id=eq.' + eventId + '&order=day.asc,kind.asc');
  const a: { id: number; day: string; kind: string; label: string; active: boolean; meal_signups: { id: number; name: string; phone: string; dish: string; created_at: string } | { id: number; name: string; phone: string; dish: string; created_at: string }[] | null }[] = r.ok ? await r.json() : [];
  return a.filter((s) => full || s.active).map((s) => {
    const su = Array.isArray(s.meal_signups) ? s.meal_signups[0] : s.meal_signups;
    return {
      id: s.id, day: s.day, kind: s.kind, label: s.label || KINDS[s.kind] || s.kind, short: s.label || SHORT[s.kind] || s.kind, custom: !!s.label, active: s.active,
      taken: su ? { name: su.name, dish: su.dish, phone: full ? dispPhone(su.phone) : maskPhone(su.phone), phone_raw: full ? su.phone : undefined, at: su.created_at } : null,
    };
  });
}
const pubEvent = (e: Record<string, unknown>) => ({ slug: e.slug, family: e.family, date_from: e.date_from, date_to: e.date_to, address: e.address, notes: e.notes, closed: e.closed, bring: e.bring ?? {} });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, origin, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, origin, 400); }
  const action = String(b.action ?? '');
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x';

  /* ---------- מנהל ---------- */
  if (b.admin !== undefined) {
    if (!safeEq(String(b.admin), ADMIN_KEY)) return json({ ok: false, error: 'auth' }, origin, 403);
    if (action === 'events') {
      const r = await db('meal_events?select=*,meal_slots(id,active,meal_signups(id))&order=created_at.desc');
      const a = r.ok ? await r.json() : [];
      return json({ ok: true, kinds: KINDS, default_template: DEFAULT_TEMPLATE, events: a.map((e: Record<string, unknown> & { meal_slots: { active: boolean; meal_signups: unknown }[] }) => {
        const act = e.meal_slots.filter((s) => s.active);
        const filled = act.filter((s) => Array.isArray(s.meal_signups) ? s.meal_signups.length : !!s.meal_signups).length;
        return { ...e, meal_slots: undefined, total: act.length, filled };
      }) }, origin);
    }
    if (action === 'event') {
      const r = await db('meal_events?select=*&id=eq.' + Number(b.id) + '&limit=1');
      const e = (r.ok ? await r.json() : [])[0];
      if (!e) return json({ ok: false, error: 'not-found' }, origin, 404);
      return json({ ok: true, event: { ...e, template: cleanTemplate(e.template ?? DEFAULT_TEMPLATE) }, slots: await slotsOf(e.id, true), kinds: KINDS, default_template: DEFAULT_TEMPLATE }, origin);
    }
    if (action === 'save') {
      const family = clean(b.family, 80), from = String(b.date_from ?? ''), to = String(b.date_to ?? '');
      if (family.length < 2 || !isDate(from) || !isDate(to) || to < from) return json({ ok: false, error: 'fields' }, origin, 400);
      if ((Date.parse(to) - Date.parse(from)) / 86400000 > 120) return json({ ok: false, error: 'range' }, origin, 400);
      const template = b.template ? cleanTemplate(b.template) : null;
      const body: Record<string, unknown> = { family, date_from: from, date_to: to, address: clean(b.address, 160), notes: cleanMulti(b.notes, 600) };
      if (template) body.template = template;
      if (b.bring !== undefined) body.bring = cleanBring(b.bring);
      let id = Number(b.id) || 0;
      if (id) {
        const r = await db('meal_events?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(body) });
        if (!r.ok) return json({ ok: false, error: 'db' }, origin, 500);
      } else {
        let slug = clean(b.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!slug) slug = randId(6);
        if (!template) body.template = DEFAULT_TEMPLATE;
        const r = await db('meal_events', { method: 'POST', prefer: 'return=representation', body: JSON.stringify({ ...body, slug }) });
        if (!r.ok) return json({ ok: false, error: r.status === 409 ? 'slug-exists' : 'db' }, origin, r.status === 409 ? 409 : 500);
        id = (await r.json())[0].id;
      }
      const e0 = (await (await db('meal_events?select=*&id=eq.' + id)).json())[0];
      const tpl = cleanTemplate(e0.template ?? DEFAULT_TEMPLATE);
      // אירוע חדש או rebuild: מסנכרן לפי התבנית; עריכה רגילה רק מוסיפה משבצות חסרות
      if (!Number(b.id) || b.rebuild) await syncSlots(id, from, to, tpl); else await genSlots(id, from, to, tpl);
      return json({ ok: true, event: e0 }, origin);
    }
    if (action === 'close') {
      const r = await db('meal_events?id=eq.' + Number(b.id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ closed: !!b.closed }) });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'delete_event') {
      const r = await db('meal_events?id=eq.' + Number(b.id), { method: 'DELETE', prefer: 'return=minimal' });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'slot_add') {
      const day = String(b.day ?? ''); let kind = String(b.kind ?? ''); const label = clean(b.label, 40);
      if (!isDate(day)) return json({ ok: false, error: 'fields' }, origin, 400);
      if (kind === 'custom') { if (label.length < 2) return json({ ok: false, error: 'label' }, origin, 400); kind = 'x' + randId(6); }
      else if (!KINDS[kind]) return json({ ok: false, error: 'fields' }, origin, 400);
      const r = await db('meal_slots?on_conflict=event_id,day,kind', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify({ event_id: Number(b.event_id), day, kind, label: kind[0] === 'x' && label ? label : '', active: true }) });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'slot_rename') {   // שם מותאם למשבצת; ריק = חוזר לשם הרגיל
      const r = await db('meal_slots?id=eq.' + Number(b.slot_id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ label: clean(b.label, 40) }) });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'signup_edit') {    // עריכת הרשמה, או שיבוץ ידני למשבצת ריקה
      const slotId = Number(b.slot_id), name = clean(b.name, 60), dish = clean(b.dish, 120);
      if (name.length < 2 || dish.length < 2) return json({ ok: false, error: 'fields' }, origin, 400);
      const ex = (await (await db('meal_signups?select=id,phone&slot_id=eq.' + slotId)).json())[0];
      const phone = normPhone(b.phone) || ex?.phone || '';
      if (!phone) return json({ ok: false, error: 'phone' }, origin, 400);
      const r = ex
        ? await db('meal_signups?slot_id=eq.' + slotId, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ name, dish, phone }) })
        : await db('meal_signups', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ slot_id: slotId, name, dish, phone, token: randId(16) }) });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'apply_template') {   // mode=add מוסיף חסרות, mode=sync מוחק גם ריקות שלא בתבנית
      const id = Number(b.id);
      const e = (await (await db('meal_events?select=*&id=eq.' + id)).json())[0];
      if (!e) return json({ ok: false, error: 'not-found' }, origin, 404);
      const tpl = cleanTemplate(b.template ?? e.template ?? DEFAULT_TEMPLATE);
      await db('meal_events?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ template: tpl }) });
      if (b.mode === 'sync') await syncSlots(id, e.date_from, e.date_to, tpl); else await genSlots(id, e.date_from, e.date_to, tpl);
      return json({ ok: true }, origin);
    }
    if (action === 'slot_remove') {   // משבצת מתבטלת; הרשמה קיימת נמחקת רק עם force
      const id = Number(b.slot_id);
      const has = await (await db('meal_signups?select=id&slot_id=eq.' + id)).json();
      if (has.length && !b.force) return json({ ok: false, error: 'has-signup' }, origin, 409);
      await db('meal_signups?slot_id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
      const r = await db('meal_slots?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ active: false }) });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'signup_clear') {
      const r = await db('meal_signups?slot_id=eq.' + Number(b.slot_id), { method: 'DELETE', prefer: 'return=minimal' });
      return json({ ok: r.ok }, origin);
    }
    if (action === 'contacts_count') {
      const r = await db('meal_contacts?select=id', { prefer: 'count=exact' });
      const m = (r.headers.get('content-range') ?? '').split('/')[1];
      return json({ ok: true, count: Number(m) || 0 }, origin);
    }
    return json({ ok: false, error: 'action' }, origin, 400);
  }

  /* ---------- ציבורי ---------- */
  if (action === 'get') {
    const e = await eventBySlug(clean(b.slug, 40));
    if (!e) return json({ ok: false, error: 'not-found' }, origin, 404);
    return json({ ok: true, event: pubEvent(e), slots: await slotsOf(e.id, false), today: israelToday() }, origin);
  }

  if (action === 'home') {   // דף הבית: יולדות פעילות, מוני פנוי/תפוס, ודחוף היום ומחר. בלי טלפונים ובלי שמות מתנדבות.
    const today = israelToday(), tomorrow = addDays(today, 1);
    const r = await db('meal_events?select=slug,family,date_from,date_to,address,closed,bring,meal_slots(id,day,kind,label,active,meal_signups(id))&closed=eq.false&date_to=gte.' + today + '&order=date_from.asc');
    type S = { id: number; day: string; kind: string; label: string; active: boolean; meal_signups: unknown };
    const a: (Record<string, unknown> & { slug: string; family: string; meal_slots: S[] })[] = r.ok ? await r.json() : [];
    const urgent: unknown[] = [];
    const families = a.map((e) => {
      const act = e.meal_slots.filter((s) => s.active && s.day >= today).sort((x, y) => x.day.localeCompare(y.day));
      let free = 0, taken = 0, nextFree = '';
      for (const s of act) {
        const has = Array.isArray(s.meal_signups) ? s.meal_signups.length > 0 : !!s.meal_signups;
        if (has) { taken++; continue; }
        free++; if (!nextFree) nextFree = s.day;
        if (s.day === today || s.day === tomorrow) {
          urgent.push({ slug: e.slug, family: e.family, slot_id: s.id, day: s.day, kind: s.kind, label: s.label || KINDS[s.kind] || s.kind, short: s.label || SHORT[s.kind] || s.kind, bring: (e.bring as Record<string, string> | undefined)?.[s.kind] ?? '' });
        }
      }
      return { slug: e.slug, family: e.family, date_from: e.date_from, date_to: e.date_to, address: e.address, free, taken, next_free: nextFree };
    });
    const KO = Object.keys(KINDS);
    (urgent as { day: string; kind: string; family: string }[]).sort((x, y) => x.day.localeCompare(y.day) || KO.indexOf(x.kind) - KO.indexOf(y.kind) || x.family.localeCompare(y.family));
    return json({ ok: true, today, tomorrow, families, urgent }, origin);
  }

  if (action === 'contacts') {
    if (limited(ip)) return json({ ok: false, error: 'rate' }, origin, 429);
    const q = clean(b.q, 30).replace(/[%_*\\,()"]/g, '');
    if (q.length < 2) return json({ ok: true, items: [] }, origin);
    const r = await db('meal_contacts?select=id,name,phone&name=ilike.*' + encodeURIComponent(q) + '*&order=name.asc&limit=8');
    const a: { id: number; name: string; phone: string }[] = r.ok ? await r.json() : [];
    return json({ ok: true, items: a.map((c) => ({ id: c.id, name: c.name, phone_masked: maskPhone(c.phone) })) }, origin);
  }

  if (action === 'sign') {
    if (limited(ip, 20)) return json({ ok: false, error: 'rate' }, origin, 429);
    const e = await eventBySlug(clean(b.slug, 40));
    if (!e) return json({ ok: false, error: 'not-found' }, origin, 404);
    if (e.closed) return json({ ok: false, error: 'closed' }, origin, 409);
    const slotId = Number(b.slot_id);
    const sr = await db('meal_slots?select=id,active&id=eq.' + slotId + '&event_id=eq.' + e.id);
    const slot = (sr.ok ? await sr.json() : [])[0];
    if (!slot || !slot.active) return json({ ok: false, error: 'slot' }, origin, 404);
    const name = clean(b.name, 60), dish = clean(b.dish, 120);
    if (name.length < 2) return json({ ok: false, error: 'name' }, origin, 400);
    if (dish.length < 2) return json({ ok: false, error: 'dish' }, origin, 400);
    let phone = normPhone(b.phone);
    const cid = Number(b.contact_id) || 0;
    let known = false;
    if (cid) {
      const cr = await db('meal_contacts?select=name,phone&id=eq.' + cid);
      const c = (cr.ok ? await cr.json() : [])[0];
      if (c) { known = true; if (!phone) phone = c.phone; }
    }
    if (!phone) return json({ ok: false, error: 'phone' }, origin, 400);
    const token = randId(16);
    const ins = await db('meal_signups', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ slot_id: slotId, name, phone, dish, token }) });
    if (!ins.ok) {
      const t = await ins.text();
      if (ins.status === 409 || t.includes('23505')) return json({ ok: false, error: 'taken' }, origin, 409);
      return json({ ok: false, error: 'db' }, origin, 500);
    }
    if (!known) {   // נרשמת חדשה נשמרת לפעם הבאה
      await db('meal_contacts?on_conflict=phone,name', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: JSON.stringify({ name, phone, source: 'signup' }) });
    }
    return json({ ok: true, token }, origin);
  }

  if (action === 'cancel') {
    const token = clean(b.token, 40);
    if (token.length < 10) return json({ ok: false, error: 'auth' }, origin, 403);
    const r = await db('meal_signups?slot_id=eq.' + Number(b.slot_id) + '&token=eq.' + encodeURIComponent(token), { method: 'DELETE', prefer: 'return=representation' });
    const a = r.ok ? await r.json() : [];
    return json({ ok: a.length > 0, error: a.length ? undefined : 'auth' }, origin, a.length ? 200 : 403);
  }

  return json({ ok: false, error: 'action' }, origin, 400);
});
