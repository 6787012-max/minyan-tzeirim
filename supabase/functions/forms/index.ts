/**
 * forms — נקודת הקצה היחידה שהאתר כותב אליה.
 *
 * שני דברים שנדרשו במפורש, ושניהם קורים כאן ולא בדפדפן:
 *   1. הרישום נשמר באמת. לא mailto שאפשר לסגור באמצע.
 *   2. המייל נשלח בפועל מהשרת, לא נפתח כטיוטה בטאב.
 *
 * סדר הפעולות: קודם שומרים, אחר כך שולחים. אם המייל ייכשל — והוא
 * ייכשל מתישהו — הרישום כבר במסד, mail_status נשאר 'failed',
 * והפאנל מסמן אותו. הסדר ההפוך היה מאבד רישומים בשקט.
 *
 * ── למה אין כאן אף import ──────────────────────────────────────
 * הפריסה דרך Management API שולחת קוד מקור בלי bundling, וה-runtime
 * לא פותר תלויות באתחול: כל import חיצוני — supabase-js, denomailer,
 * מ-esm.sh, מ-jsr או מ-deno.land — מפיל את הפונקציה ב-BOOT_ERROR.
 * נבדק שלושתם בנפרד. לכן PostgREST נקרא ב-fetch רגיל, ו-SMTP
 * ממומש כאן ידנית מעל Deno.connectTls. SMTP הוא פרוטוקול טקסט פשוט
 * וזה יוצא קצר יותר מלהיאבק בכלי בנייה.
 */

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAIL_USER = Deno.env.get('MAIL_USER') ?? '';
const MAIL_PASS = Deno.env.get('MAIL_PASS') ?? '';
const MAIL_TO = Deno.env.get('MAIL_TO') ?? '';
const SITE = Deno.env.get('SITE_ORIGIN') ?? 'https://minyan.mokad.co.il';

/* OAuth של גוגל דרייב — משמש להעברת ספחי ת״ז מ-Storage לדרייב. הכרחי כי
   נטפרי חוסם URLs של Supabase Storage אבל מאפשר drive.google.com. */
const GDRIVE_CLIENT_ID = Deno.env.get('GDRIVE_CLIENT_ID') ?? '';
const GDRIVE_CLIENT_SECRET = Deno.env.get('GDRIVE_CLIENT_SECRET') ?? '';
const GDRIVE_REFRESH_TOKEN = Deno.env.get('GDRIVE_REFRESH_TOKEN') ?? '';

/* Gemini Vision — משמש לחילוץ פרטי משפחה מספח ת״ז שהועלה. gemini-2.5-flash
   קורא את התמונה/PDF ומחזיר JSON מובנה של שמות ילדים+תאריכי לידה. */
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

const ALLOWED = new Set([SITE, 'http://localhost:8787', 'http://127.0.0.1:8787']);

/* ── עזרי HTTP ─────────────────────────────────────────────────── */

function cors(origin: string | null) {
  const ok = origin && ALLOWED.has(origin) ? origin : SITE;
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

/** PostgREST ישירות. Content-Profile הוא מה שמפנה אותו ל-schema minyan. */
async function db(path: string, init: RequestInit & { prefer?: string } = {}) {
  const h: Record<string, string> = {
    'apikey': SERVICE,
    'Authorization': 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
    'Accept-Profile': 'minyan',
    'Content-Profile': 'minyan',
  };
  if (init.prefer) h['Prefer'] = init.prefer;
  return await fetch(URL_ + '/rest/v1/' + path, { ...init, headers: h });
}

/* ── SMTP מינימלי מעל TLS ──────────────────────────────────────── */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(s: string) {
  const bytes = enc.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

class Smtp {
  private conn!: Deno.TlsConn;
  private buf = new Uint8Array(8192);

  async connect(hostname: string, port: number) {
    this.conn = await Deno.connectTls({ hostname, port });
    await this.expect(220);
  }

  private async read(): Promise<string> {
    const n = await this.conn.read(this.buf);
    if (n === null) throw new Error('smtp: closed');
    return dec.decode(this.buf.subarray(0, n));
  }

  /** קורא עד שמגיעה שורת סיום (קוד ואחריו רווח) ומוודא את הקוד */
  private async expect(code: number): Promise<string> {
    let out = '';
    for (let i = 0; i < 40; i++) {
      out += await this.read();
      const lines = out.trimEnd().split(/\r?\n/);
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        if (!last.startsWith(String(code))) {
          throw new Error('smtp ' + last.slice(0, 90));
        }
        return out;
      }
    }
    throw new Error('smtp: no terminal line');
  }

  async cmd(line: string, code: number) {
    await this.conn.write(enc.encode(line + '\r\n'));
    return await this.expect(code);
  }

  async close() {
    try { await this.cmd('QUIT', 221); } catch { /* לא משנה */ }
    try { this.conn.close(); } catch { /* כנ"ל */ }
  }
}

/** כותרת עם עברית חייבת encoded-word, אחרת היא מגיעה כג'יבריש */
function mimeHeader(s: string) {
  return '=?UTF-8?B?' + b64(s) + '?=';
}

async function sendMail(subject: string, html: string) {
  if (!MAIL_USER || !MAIL_PASS || !MAIL_TO) {
    return { ok: false, err: 'mail-not-configured' };
  }
  const s = new Smtp();
  try {
    await s.connect('smtp.gmail.com', 465);
    await s.cmd('EHLO minyan.mokad.co.il', 250);
    await s.cmd('AUTH LOGIN', 334);
    await s.cmd(b64(MAIL_USER), 334);
    await s.cmd(b64(MAIL_PASS), 235);
    await s.cmd('MAIL FROM:<' + MAIL_USER + '>', 250);
    await s.cmd('RCPT TO:<' + MAIL_TO + '>', 250);
    await s.cmd('DATA', 354);

    const body = [
      'From: ' + mimeHeader('מניין הצעירים') + ' <' + MAIL_USER + '>',
      'To: <' + MAIL_TO + '>',
      'Subject: ' + mimeHeader(subject),
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      /* שורות base64 קצרות — שרתי SMTP חותכים שורות ארוכות מ-998 */
      (b64(html).match(/.{1,76}/g) ?? []).join('\r\n'),
      '.',
    ].join('\r\n');

    await s.cmd(body, 250);
    return { ok: true, err: '' };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 300) };
  } finally {
    await s.close();
  }
}

/* ── תוכן ──────────────────────────────────────────────────────── */

const KINDS = ['kibud', 'shas', 'seats', 'contact', 'other'];

const LABEL: Record<string, string> = {
  kibud: 'כיבוד ללומדים',
  shas: 'ש״ס שוטנשטיין',
  seats: 'מקומות לימים נוראים',
  contact: 'פנייה מהאתר',
  other: 'אחר',
};

function clean(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** מוריד קובץ מ-Supabase Storage. מחזיר Blob או null. */
async function downloadFromStorage(pathWithBucket: string): Promise<{data: Uint8Array; mime: string} | null> {
  const slash = pathWithBucket.indexOf('/');
  if (slash < 0) return null;
  const bucket = pathWithBucket.slice(0, slash);
  const objectPath = pathWithBucket.slice(slash + 1);
  try {
    const r = await fetch(
      URL_ + '/storage/v1/object/' + bucket + '/' + encodeURI(objectPath),
      { headers: { 'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE } },
    );
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    return { data: buf, mime: r.headers.get('content-type') || 'application/octet-stream' };
  } catch { return null; }
}

/** ממיר refresh token ל-access token תקף. תוקף של שעה. */
async function gdriveAccessToken(): Promise<string> {
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) return '';
  try {
    const body = new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!r.ok) return '';
    const j = await r.json();
    return String(j.access_token || '');
  } catch { return ''; }
}

/** מעלה קובץ לגוגל דרייב, מגדיר anyone-with-link ומחזיר URL של view. */
async function uploadToDrive(name: string, mime: string, data: Uint8Array): Promise<string> {
  const tok = await gdriveAccessToken();
  if (!tok) return '';
  try {
    // multipart upload — יעיל לקבצים עד ~5MB, ועובד גם עד ~50MB (במגבלת memory)
    const boundary = '===mniyan_' + crypto.randomUUID();
    const meta = JSON.stringify({ name, mimeType: mime });
    const head = enc.encode(
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      meta + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n',
    );
    const tail = enc.encode('\r\n--' + boundary + '--\r\n');
    const body = new Uint8Array(head.length + data.length + tail.length);
    body.set(head, 0);
    body.set(data, head.length);
    body.set(tail, head.length + data.length);

    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + tok,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body,
    });
    if (!up.ok) return '';
    const uj = await up.json();
    const fileId = String(uj.id || '');
    if (!fileId) return '';

    // מרשה גישה לכל מי שיש לו את הקישור (reader)
    await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return 'https://drive.google.com/file/d/' + fileId + '/view';
  } catch { return ''; }
}

/** מעביר קובץ מ-Supabase Storage לדרייב. מחזיר URL של דרייב, או '' בכשל. */
async function relayStorageToDrive(pathWithBucket: string, displayName: string): Promise<string> {
  const f = await downloadFromStorage(pathWithBucket);
  if (!f) return '';
  return await uploadToDrive(displayName || 'id-scan', f.mime, f.data);
}

/* ── Gemini Vision — חילוץ פרטי משפחה מספח ת״ז ──────────────── */

/** ממיר Uint8Array ל-base64 בלי לפוצץ zoro ב-btoa על מחרוזות ארוכות. */
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    bin += String.fromCharCode(...sub);
  }
  return btoa(bin);
}

interface FamilyCard {
  head_of_household?: { name?: string; id?: string };
  spouse?: { name?: string; id?: string };
  address?: string;
  city?: string;
  children?: { name?: string; id?: string; birth_date?: string; gender?: string }[];
  notes?: string;
  model?: string;
  extracted_at?: string;
}

/** קורא ספח ת״ז (image או PDF) ומחזיר JSON של המשפחה — או null בכשל. */
async function extractFamilyFromScan(data: Uint8Array, mime: string): Promise<FamilyCard | null> {
  if (!GEMINI_API_KEY) return null;
  if (!data || data.length < 500) return null;

  /* Gemini תומך ישירות ב-image/* ובחלק מ-PDF. אם ה-mime חסר או "octet-stream"
     ננסה image/jpeg כברירת מחדל (רוב המכשירים שולחים JPG). */
  let effectiveMime = mime && mime.includes('/') ? mime.toLowerCase() : 'image/jpeg';
  if (effectiveMime === 'image/jpg') effectiveMime = 'image/jpeg';
  /* HEIC/HEIF לא נתמך היטב ב-Gemini — נדלג בשקט במקום להפיל מודל */
  if (effectiveMime.includes('heic') || effectiveMime.includes('heif')) return null;

  const b64data = bytesToB64(data);

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `You are given a scan of an Israeli teudat zehut (ID) appendix ("ספח").
Extract the family members listed on it into a strict JSON object with this exact structure:

{
  "head_of_household": {"name": "<full name in Hebrew>", "id": "<9-digit ID or empty>"},
  "spouse": {"name": "<name>", "id": "<id>"} or null if not present,
  "address": "<street + number in Hebrew>" or "",
  "city": "<city name in Hebrew>" or "",
  "children": [
    {"name": "<full name in Hebrew>", "id": "<9-digit>", "birth_date": "YYYY-MM-DD", "gender": "male" or "female"}
  ]
}

Rules:
- Return names in Hebrew, exactly as printed on the document.
- Convert Hebrew calendar dates to Gregorian YYYY-MM-DD if only Hebrew is shown; otherwise use what's printed.
- If any field is missing on the scan, omit it (do not invent).
- Gender is inferred from name/context ("בן"/"בת") when explicit.
- If the scan is not a teudat zehut / ספח — return {"children": [], "notes": "not-a-teudat-zehut"}.
- Return ONLY the JSON, no markdown, no commentary.`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: effectiveMime, data: b64data } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error('gemini extract non-ok', r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const j = await r.json();
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    let raw = '';
    for (const p of parts) if (typeof p?.text === 'string') raw += p.text;
    raw = raw.trim();
    if (!raw) return null;
    /* לפעמים המודל חוזר עם ```json … ``` למרות ה-responseMimeType. מנקים. */
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    let parsed: FamilyCard;
    try { parsed = JSON.parse(raw); } catch {
      console.error('gemini extract JSON parse fail', raw.slice(0, 200));
      return null;
    }
    parsed.model = model;
    parsed.extracted_at = new Date().toISOString();
    return parsed;
  } catch (e) {
    console.error('gemini extract exception', String(e).slice(0, 200));
    return null;
  }
}

/** מחלץ מ-Storage + מפעיל Gemini + מחזיר את הכרטיס. */
async function extractFamilyFromStoragePath(pathWithBucket: string): Promise<FamilyCard | null> {
  const f = await downloadFromStorage(pathWithBucket);
  if (!f) return null;
  return await extractFamilyFromScan(f.data, f.mime);
}

/** מרנדר בלוק "כרטיסייה של משפחה" למייל, אם החילוץ הצליח. */
function familyCardHtml(fam: FamilyCard | null): string {
  if (!fam) return '';
  const rows: string[] = [];
  const line = (label: string, value: string) => {
    if (!value) return;
    rows.push(`<div style="margin:4px 0;font-size:14px"><b style="color:#B08D3E">${esc(label)}:</b> <span style="color:#12233F">${esc(value)}</span></div>`);
  };
  if (fam.head_of_household?.name) line('ראש המשפחה', fam.head_of_household.name + (fam.head_of_household.id ? ' · ' + fam.head_of_household.id : ''));
  if (fam.spouse?.name)             line('בן/בת זוג',   fam.spouse.name + (fam.spouse.id ? ' · ' + fam.spouse.id : ''));
  if (fam.address || fam.city)      line('כתובת',       [fam.address, fam.city].filter(Boolean).join(', '));

  let kidsHtml = '';
  if (Array.isArray(fam.children) && fam.children.length) {
    const items = fam.children.map((c) => {
      const parts: string[] = [];
      if (c.name) parts.push(c.name);
      if (c.id) parts.push('ת״ז ' + c.id);
      if (c.birth_date) parts.push('נולד/ה ' + c.birth_date);
      return `<li style="margin:3px 0;color:#12233F;font-size:14px">${esc(parts.join(' · '))}</li>`;
    }).join('');
    kidsHtml =
      `<div style="margin:10px 0 0;font-size:14px"><b style="color:#B08D3E">ילדים (${fam.children.length}):</b>
       <ul style="margin:6px 0 0 20px;padding:0">${items}</ul></div>`;
  }

  if (!rows.length && !kidsHtml) return '';

  return `<div style="margin:18px 0 0;background:#FBF8F3;border:1px solid #E7DFD2;border-radius:10px;padding:14px 18px">
    <div style="font-size:12px;letter-spacing:.08em;color:#B08D3E;margin-bottom:6px">כרטיסיית המשפחה · חולץ אוטומטית מהספח</div>
    ${rows.join('')}
    ${kidsHtml}
  </div>`;
}

function mailHtml(kind: string, row: Record<string, unknown>, scanLink: string, scanName: string, fam: FamilyCard | null) {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const lines: [string, string][] = [];
  const push = (k: string, v: unknown) => {
    const s = clean(v, 400);
    if (s) lines.push([k, s]);
  };
  push('שם', row.name);
  push('טלפון', row.phone);
  push('מייל', row.email);
  push('פריט', row.ref_label);
  push('כמות', row.qty);
  push('סכום', row.amount ? '₪' + row.amount : '');
  for (const [k, v] of Object.entries(d)) {
    // אלה שדות פנימיים לחתימת URL — לא צריך להדביק אותם למייל
    if (k === 'id_scan_path' || k === 'id_scan_name' || k === 'id_scan_mime') continue;
    push(k, v);
  }
  push('מהדף', row.source);

  const rows = lines.map(([k, v]) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#6b6257;white-space:nowrap">${esc(k)}</td>` +
    `<td style="padding:6px 0;color:#12233F;font-weight:600">${esc(v)}</td></tr>`).join('');

  const scanBlock = scanLink
    ? `<p style="margin:16px 0 0"><a href="${esc(scanLink)}"
         style="display:inline-block;background:#B08D3E;color:#fff;text-decoration:none;
                padding:10px 18px;border-radius:9px;font-size:14px">📎 פתיחת ספח בגוגל דרייב</a>
       <span style="font-size:12px;color:#6b6257;display:block;margin-top:6px">${esc(scanName || '')}</span></p>`
    : '';

  return `<div dir="rtl" style="font-family:Arial,sans-serif;background:#FBF8F3;padding:22px">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #E7DFD2;border-radius:14px;padding:22px">
    <div style="font-size:13px;letter-spacing:.08em;color:#B08D3E">מניין הצעירים · מעלה עמוס</div>
    <h2 style="margin:6px 0 2px;color:#12233F;font-size:21px">רישום חדש — ${esc(LABEL[kind] ?? kind)}</h2>
    <p style="margin:0 0 16px;color:#6b6257;font-size:13px">נשלח אוטומטית מהאתר. הרישום כבר שמור במערכת.</p>
    <table style="border-collapse:collapse;font-size:15px;width:100%">${rows}</table>
    ${familyCardHtml(fam)}
    ${scanBlock}
    <p style="margin:20px 0 0"><a href="${SITE}/admin.html"
       style="display:inline-block;background:#12233F;color:#fff;text-decoration:none;
              padding:10px 18px;border-radius:9px;font-size:14px">לאזור הניהול</a></p>
  </div></div>`;
}

/* ── הנקודה עצמה ───────────────────────────────────────────────── */

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: 'json' }, 400, origin); }

  const kind = clean(b.kind, 20);
  const name = clean(b.name, 80);
  if (!KINDS.includes(kind)) return json({ error: 'kind' }, 400, origin);
  if (name.length < 2) return json({ error: 'name' }, 400, origin);

  const qty = Number(b.qty);
  const amount = Number(b.amount);
  const row = {
    kind,
    name,
    ref_key: clean(b.ref_key, 60) || null,
    ref_label: clean(b.ref_label, 120) || null,
    phone: clean(b.phone, 30) || null,
    email: clean(b.email, 120) || null,
    qty: Number.isFinite(qty) && qty > 0 ? Math.min(99, Math.floor(qty)) : null,
    amount: Number.isFinite(amount) && amount >= 0 ? Math.min(99999, amount) : null,
    details: (b.details && typeof b.details === 'object') ? b.details : {},
    source: clean(b.source, 120) || null,
    mail_status: 'pending',
  };

  const ins = await db('signups', {
    method: 'POST',
    body: JSON.stringify(row),
    prefer: 'return=representation',
  });

  /* PostgREST מחזיר 201 עם גוף ריק בלי return=representation — לכן
   * קוראים טקסט קודם ורק אחר כך מנסים JSON. */
  const insText = await ins.text();
  if (!ins.ok) {
    /* 23505 = האינדקס הייחודי: מישהו הקדים. מצב אמיתי, לא תקלה. */
    if (insText.indexOf('23505') >= 0) return json({ error: 'taken' }, 409, origin);
    console.error('db insert', ins.status, insText.slice(0, 300));
    return json({ error: 'db' }, 500, origin);
  }

  let id: number | null = null;
  try { id = JSON.parse(insText)[0]?.id ?? null; } catch { /* לא קריטי */ }

  /* אם הלקוח העלה ספח ת״ז ל-Storage — מעבירים ל-Google Drive למייל,
     ובמקביל שולחים ל-Gemini Vision לחילוץ פרטי המשפחה.
     נטפרי חוסם קישורי storage.supabase — drive.google.com מותר בסביבה החרדית. */
  const details = row.details as Record<string, unknown>;
  const scanPath = clean(details?.id_scan_path, 200);
  const scanName = clean(details?.id_scan_name, 120) || 'id-scan';
  let scanLink = '';
  let family: FamilyCard | null = null;
  let extractionStatus: 'extracted' | 'failed' | 'skipped' = 'skipped';

  if (scanPath) {
    // מוסיפים סיומת אם חסרה, ומקדימים את השם הלוגי עם שם המגיש
    const safeName = (name + ' — ' + scanName).replace(/[<>:"|?*]/g, '_').slice(0, 180);
    // מוריד פעם אחת מ-Storage, ואז משתמש בבתים לגם דרייב וגם Gemini
    const scan = await downloadFromStorage(scanPath);
    if (scan) {
      // Drive
      scanLink = await uploadToDrive(safeName, scan.mime, scan.data);
      // Gemini
      family = await extractFamilyFromScan(scan.data, scan.mime);
      extractionStatus = family ? 'extracted' : 'failed';
    } else {
      // הקובץ הלך לאיבוד? עדיין שולחים מייל — הרישום הגיע
      extractionStatus = 'failed';
    }
  }

  const m = await sendMail(
    'רישום חדש — ' + (LABEL[kind] ?? kind) + ' — ' + name,
    mailHtml(kind, row, scanLink, scanName, family),
  );

  if (id !== null) {
    const patch: Record<string, unknown> = {
      mail_status: m.ok ? 'sent'
        : (m.err === 'mail-not-configured' ? 'skipped' : 'failed'),
      mail_error: m.ok ? null : m.err,
    };
    if (scanPath) {
      patch.extraction_status = extractionStatus;
      patch.family_extracted = family ?? null;
      if (!family && extractionStatus === 'failed') {
        patch.extraction_error = GEMINI_API_KEY ? 'gemini-returned-null' : 'gemini-not-configured';
      }
    }
    await db('signups?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  await db('audit', {
    method: 'POST',
    body: JSON.stringify({
      actor: 'site', action: 'signup:' + kind, target: String(id),
      data: { name, ref: row.ref_key, mail: m.ok },
    }),
  });

  /* saved:true הוא מה שקובע מבחינת המשתמשת. כישלון מייל הוא ענייננו. */
  return json({ ok: true, id, saved: true, mailed: m.ok }, 200, origin);
});
