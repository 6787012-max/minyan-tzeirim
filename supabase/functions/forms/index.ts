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

function mailHtml(kind: string, row: Record<string, unknown>, scanLink: string, scanName: string) {
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
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E7DFD2;border-radius:14px;padding:22px">
    <div style="font-size:13px;letter-spacing:.08em;color:#B08D3E">מניין הצעירים · מעלה עמוס</div>
    <h2 style="margin:6px 0 2px;color:#12233F;font-size:21px">רישום חדש — ${esc(LABEL[kind] ?? kind)}</h2>
    <p style="margin:0 0 16px;color:#6b6257;font-size:13px">נשלח אוטומטית מהאתר. הרישום כבר שמור במערכת.</p>
    <table style="border-collapse:collapse;font-size:15px;width:100%">${rows}</table>
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

  /* אם הלקוח העלה ספח ת״ז ל-Storage — מעבירים ל-Google Drive למייל.
     נטפרי חוסם קישורי storage.supabase — drive.google.com מותר בסביבה החרדית. */
  const details = row.details as Record<string, unknown>;
  const scanPath = clean(details?.id_scan_path, 200);
  const scanName = clean(details?.id_scan_name, 120) || 'id-scan';
  let scanLink = '';
  if (scanPath) {
    // מוסיפים סיומת אם חסרה, ומקדימים את השם הלוגי עם שם המגיש
    const safeName = (name + ' — ' + scanName).replace(/[<>:"|?*]/g, '_').slice(0, 180);
    scanLink = await relayStorageToDrive(scanPath, safeName);
  }

  const m = await sendMail(
    'רישום חדש — ' + (LABEL[kind] ?? kind) + ' — ' + name,
    mailHtml(kind, row, scanLink, scanName),
  );

  if (id !== null) {
    await db('signups?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({
        mail_status: m.ok ? 'sent'
          : (m.err === 'mail-not-configured' ? 'skipped' : 'failed'),
        mail_error: m.ok ? null : m.err,
      }),
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
