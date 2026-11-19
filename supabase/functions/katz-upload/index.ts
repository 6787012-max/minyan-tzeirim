/**
 * katz-upload — העלאת הקלטות של קורס חיים כץ (דף katz.html).
 * הדפדפן שולח שם, גודל, סוג ותאריך הקובץ, והפונקציה פותחת סשן העלאה מתחדש בדרייב
 * בתיקייה "העלאות הקלטות" שבתוך תיקיית הקורס, ומחזירה לדפדפן את כתובת הסשן.
 * הדפדפן שולח את הקובץ במקטעים ישר לגוגל. כל הסודות נקראים מהסביבה, לא מהקוד.
 * מפתח הגישה: פרמטר k בכתובת (הסוד KATZ_UPLOAD_KEY). בלי מפתח נכון — 403.
 */
const KEY = Deno.env.get('KATZ_UPLOAD_KEY') ?? '';
const CLIENT_ID = Deno.env.get('KATZ_DRIVE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('KATZ_DRIVE_CLIENT_SECRET') ?? '';
const REFRESH = Deno.env.get('KATZ_DRIVE_REFRESH_TOKEN') ?? '';
const FOLDER = Deno.env.get('KATZ_UPLOAD_FOLDER_ID') ?? '';
const PAGE_ORIGIN = 'https://6787012-max.github.io';
const ALLOWED = new Set([PAGE_ORIGIN, 'http://localhost:8765', 'http://127.0.0.1:8765']);
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const AV_EXT = new Set(['m4a', 'mp3', 'wav', 'ogg', 'opus', 'aac', 'mp4', 'mov', 'mkv', 'webm']);

let cachedTok = '';
let cachedAt = 0;

function cors(origin: string | null) {
  const ok = origin && ALLOWED.has(origin) ? origin : PAGE_ORIGIN;
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

async function accessToken(): Promise<string> {
  if (cachedTok && Date.now() - cachedAt < 45 * 60 * 1000) return cachedTok;
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH, grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  cachedTok = j.access_token;
  cachedAt = Date.now();
  return cachedTok;
}

function cleanName(s: string): string {
  return s.replace(/[\\/\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'הקלטה';
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method' }, origin, 405);

  const url = new URL(req.url);
  if (!KEY || url.searchParams.get('k') !== KEY) return json({ error: 'forbidden' }, origin, 403);
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !FOLDER) return json({ error: 'config' }, origin, 500);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad_json' }, origin, 400); }

  const size = Number(b?.size);
  const name = cleanName(String(b?.name ?? ''));
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const type = String(b?.type ?? '');
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return json({ error: 'size', message: 'הקובץ גדול מדי (עד 2GB) או ריק' }, origin, 400);
  }
  if (!(type.startsWith('audio/') || type.startsWith('video/') || AV_EXT.has(ext))) {
    return json({ error: 'type', message: 'אפשר להעלות רק שמע או וידאו' }, origin, 400);
  }
  const mime = type || (ext === 'mp3' ? 'audio/mpeg' : 'application/octet-stream');
  const lm = Number(b?.lastModified);
  const recorded = Number.isFinite(lm) && lm > 0 ? new Date(lm).toISOString() : '';

  try {
    const tok = await accessToken();
    const meta = {
      name, parents: [FOLDER],
      appProperties: { source: 'katz-upload', recorded: recorded },
    };
    const r = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + tok,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mime,
          'X-Upload-Content-Length': String(size),
          // Google מתעד את ה-Origin של האתר ומחזיר CORS לחיבור הדפדפן לסשן
          'Origin': origin && ALLOWED.has(origin) ? origin : PAGE_ORIGIN,
        },
        body: JSON.stringify(meta),
      },
    );
    if (!r.ok) return json({ error: 'drive', status: r.status }, origin, 502);
    const session = r.headers.get('Location');
    if (!session) return json({ error: 'no_session' }, origin, 502);
    return json({ session, name, size }, origin);
  } catch (e) {
    return json({ error: 'server' }, origin, 500);
  }
});
