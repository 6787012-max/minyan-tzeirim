/**
 * katz-course — נסיעות לצפת והערות לסיכומים ולמשחקים, לדפי /katz/ (קורס חיים כץ).
 *
 * גישה: פרמטר k בכתובת (הסוד KATZ_COURSE_KEY). בלי מפתח נכון — 403.
 * קריאה (GET): ?k=…&a=rides   ו-  ?k=…&a=comments
 * כתיבה (POST, גוף JSON): a = ride_create | ride_update | ride_delete |
 *                              comment_create | comment_update | comment_delete
 * כל שינוי דורש ec (קוד עריכה). המסד שומר רק hash שלו. מי שיצר את הרשומה
 * שומר את הקוד בדפדפן שלו בלבד, ורק הוא יכול לערוך או למחוק אותה.
 *
 * ── למה אין כאן אף import ──────────────────────────────────────
 * הפריסה דרך Management API שולחת קוד מקור בלי bundling. כל import חיצוני
 * מפיל את הפונקציה ב-BOOT_ERROR. לכן PostgREST נקרא ב-fetch רגיל.
 */

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY = Deno.env.get('KATZ_COURSE_KEY') ?? '';
const SITE = 'https://minyan.mokad.co.il';
const ALLOWED = new Set([SITE, 'http://localhost:8765', 'http://127.0.0.1:8765']);

const MODES = new Set(['offer', 'seek']);
const KINDS = new Set(['note', 'fix', 'add']);
const TARGET_PREFIX = ['meeting:', 'game:', 'video:', 'booklet:'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const ok = origin && ALLOWED.has(origin) ? origin : SITE;
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
  });
}

/** PostgREST ישירות, בסכימה katz. */
async function db(path: string, method = 'GET', body?: unknown, prefer?: string) {
  const h: Record<string, string> = {
    'apikey': SERVICE,
    'Authorization': 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
    'Accept-Profile': 'katz',
    'Content-Profile': 'katz',
  };
  if (prefer) h['Prefer'] = prefer;
  return await fetch(URL_ + '/rest/v1/' + path, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const line = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

function validEc(ec: unknown): ec is string {
  return typeof ec === 'string' && ec.length >= 8 && ec.length <= 64;
}

/** שדות נסיעה מנוקים. מחזיר שגיאה בעברית או את הרשומה. */
function rideFields(b: any): { error?: string; row?: Record<string, unknown> } {
  const name = line(b?.name, 40);
  const from_city = line(b?.from_city, 30);
  const leave_time = line(b?.leave_time, 20);
  const mode = String(b?.mode ?? '');
  if (!name) return { error: 'צריך לכתוב שם' };
  if (!from_city) return { error: 'צריך לכתוב מאיזו עיר יוצאים' };
  if (!leave_time) return { error: 'צריך לכתוב באיזו שעה יוצאים' };
  if (!MODES.has(mode)) return { error: 'צריך לבחור: יש מקומות, או מחפש טרמפ' };
  let seats = Number(b?.seats ?? 0);
  if (!Number.isInteger(seats) || seats < 0 || seats > 12) return { error: 'מספר המקומות חייב להיות בין 0 ל-12' };
  if (mode === 'seek') seats = 0;
  const pl = Array.isArray(b?.passengers) ? b.passengers : [];
  const passengers = pl.map((p: unknown) => line(p, 40)).filter((p: string) => p.length > 0);
  if (passengers.length > 12) return { error: 'יותר מדי נוסעים ברשימה' };
  if (mode === 'offer' && passengers.length > seats) return { error: 'יש יותר נוסעים מהמקומות שסימנתם' };
  return {
    row: {
      name, from_city, leave_time, mode, seats, passengers,
      pickup: line(b?.pickup, 200) || null,
      contact: line(b?.contact, 100) || null,
      note: text(b?.note, 300) || null,
    },
  };
}

/** מאמת את קוד העריכה מול הרשומה. מחזיר null אם תקין, אחרת תשובת שגיאה. */
async function checkOwner(table: string, id: string, ec: string, origin: string | null): Promise<Response | null> {
  const r = await db(`${table}?id=eq.${id}&select=edit_hash`);
  if (!r.ok) return json({ error: 'db', message: 'שגיאה בשרת, נסו שוב' }, origin, 500);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'missing', message: 'הרשומה לא נמצאה, אולי נמחקה' }, origin, 404);
  const h = await sha256(ec);
  if (rows[0].edit_hash !== h) return json({ error: 'not_yours', message: 'קוד העריכה לא תואם לרשומה הזו' }, origin, 403);
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  const url = new URL(req.url);
  if (!KEY || url.searchParams.get('k') !== KEY) return json({ error: 'forbidden', message: 'הקישור לא שלם' }, origin, 403);
  if (!URL_ || !SERVICE) return json({ error: 'config' }, origin, 500);

  const a = url.searchParams.get('a') ?? '';

  try {
    // ── קריאה ──
    if (req.method === 'GET') {
      if (a === 'rides') {
        const r = await db('rides?select=id,created_at,updated_at,name,from_city,leave_time,mode,seats,passengers,pickup,contact,note&order=created_at.asc&limit=500');
        if (!r.ok) return json({ error: 'db', message: 'שגיאה בטעינה' }, origin, 500);
        return json({ rides: await r.json() }, origin);
      }
      if (a === 'comments') {
        const r = await db('comments?select=id,created_at,updated_at,target,kind,body,name&order=created_at.asc&limit=2000');
        if (!r.ok) return json({ error: 'db', message: 'שגיאה בטעינה' }, origin, 500);
        return json({ comments: await r.json() }, origin);
      }
      return json({ error: 'action', message: 'פעולה לא מוכרת' }, origin, 400);
    }

    // ── כתיבה ──
    if (req.method !== 'POST') return json({ error: 'method' }, origin, 405);
    let b: any;
    try { b = await req.json(); } catch { return json({ error: 'bad_json', message: 'הבקשה לא תקינה' }, origin, 400); }
    const ec = b?.ec;
    const id = String(b?.id ?? '');

    if (a === 'ride_create') {
      const f = rideFields(b);
      if (f.error) return json({ error: 'invalid', message: f.error }, origin, 400);
      if (!validEc(ec)) return json({ error: 'ec', message: 'חסר קוד עריכה' }, origin, 400);
      const row = { ...f.row, edit_hash: await sha256(ec) };
      const r = await db('rides', 'POST', row, 'return=representation');
      if (!r.ok) return json({ error: 'db', message: 'השמירה נכשלה, נסו שוב' }, origin, 500);
      const created = await r.json();
      return json({ ok: true, id: created[0]?.id }, origin);
    }

    if (a === 'ride_update' || a === 'ride_delete') {
      if (!UUID.test(id)) return json({ error: 'id', message: 'מזהה לא תקין' }, origin, 400);
      if (!validEc(ec)) return json({ error: 'ec', message: 'חסר קוד עריכה' }, origin, 400);
      const denied = await checkOwner('rides', id, ec, origin);
      if (denied) return denied;
      if (a === 'ride_delete') {
        const r = await db(`rides?id=eq.${id}`, 'DELETE');
        if (!r.ok) return json({ error: 'db', message: 'המחיקה נכשלה, נסו שוב' }, origin, 500);
        return json({ ok: true }, origin);
      }
      const f = rideFields(b);
      if (f.error) return json({ error: 'invalid', message: f.error }, origin, 400);
      const r = await db(`rides?id=eq.${id}`, 'PATCH', { ...f.row, updated_at: new Date().toISOString() });
      if (!r.ok) return json({ error: 'db', message: 'העדכון נכשל, נסו שוב' }, origin, 500);
      return json({ ok: true }, origin);
    }

    if (a === 'comment_create') {
      const target = line(b?.target, 120);
      const kind = String(b?.kind ?? '');
      const body = text(b?.body, 2000);
      const name = line(b?.name, 40) || null;
      if (!TARGET_PREFIX.some((p) => target.startsWith(p))) return json({ error: 'target', message: 'אי אפשר להעיר על זה' }, origin, 400);
      if (!KINDS.has(kind)) return json({ error: 'kind', message: 'צריך לבחור סוג הערה' }, origin, 400);
      if (!body) return json({ error: 'body', message: 'צריך לכתוב הערה' }, origin, 400);
      if (!validEc(ec)) return json({ error: 'ec', message: 'חסר קוד עריכה' }, origin, 400);
      const r = await db('comments', 'POST', { target, kind, body, name, edit_hash: await sha256(ec) }, 'return=representation');
      if (!r.ok) return json({ error: 'db', message: 'השמירה נכשלה, נסו שוב' }, origin, 500);
      const created = await r.json();
      return json({ ok: true, id: created[0]?.id }, origin);
    }

    if (a === 'comment_update' || a === 'comment_delete') {
      if (!UUID.test(id)) return json({ error: 'id', message: 'מזהה לא תקין' }, origin, 400);
      if (!validEc(ec)) return json({ error: 'ec', message: 'חסר קוד עריכה' }, origin, 400);
      const denied = await checkOwner('comments', id, ec, origin);
      if (denied) return denied;
      if (a === 'comment_delete') {
        const r = await db(`comments?id=eq.${id}`, 'DELETE');
        if (!r.ok) return json({ error: 'db', message: 'המחיקה נכשלה, נסו שוב' }, origin, 500);
        return json({ ok: true }, origin);
      }
      const body = text(b?.body, 2000);
      const kind = String(b?.kind ?? '');
      if (!body) return json({ error: 'body', message: 'צריך לכתוב הערה' }, origin, 400);
      if (!KINDS.has(kind)) return json({ error: 'kind', message: 'צריך לבחור סוג הערה' }, origin, 400);
      const r = await db(`comments?id=eq.${id}`, 'PATCH', { body, kind, updated_at: new Date().toISOString() });
      if (!r.ok) return json({ error: 'db', message: 'העדכון נכשל, נסו שוב' }, origin, 500);
      return json({ ok: true }, origin);
    }

    return json({ error: 'action', message: 'פעולה לא מוכרת' }, origin, 400);
  } catch (_e) {
    return json({ error: 'server', message: 'שגיאה בשרת, נסו שוב' }, origin, 500);
  }
});
