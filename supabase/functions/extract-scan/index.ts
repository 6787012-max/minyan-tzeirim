/**
 * extract-scan — חילוץ פרטי משפחה מספח ת״ז שהועלה ישירות מפאנל הניהול
 * (לא דרך טופס ציבורי). רק admin מחובר יכול לקרוא לזה — לא anon —
 * כי Gemini Vision עולה כסף, ובלי הבדיקה הזו כל מי שיש לו את ה-anon
 * key הגלוי בקוד הדף היה יכול להריץ אותו בחינם.
 *
 * בלי imports חיצוניים בכוונה — כמו forms/index.ts, פריסה דרך
 * Management API בלי bundling מפילה כל import ב-BOOT_ERROR.
 */

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SITE = Deno.env.get('SITE_ORIGIN') ?? 'https://minyan.mokad.co.il';

const ALLOWED = new Set([SITE, 'http://localhost:8787', 'http://127.0.0.1:8787']);

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
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

async function downloadFromStorage(pathWithBucket: string): Promise<{ data: Uint8Array; mime: string } | null> {
  const slash = pathWithBucket.indexOf('/');
  if (slash < 0) return null;
  const bucket = pathWithBucket.slice(0, slash);
  const objectPath = pathWithBucket.slice(slash + 1);
  try {
    const r = await fetch(URL_ + '/storage/v1/object/' + bucket + '/' + encodeURI(objectPath), {
      headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
    });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    return { data: buf, mime: r.headers.get('content-type') || 'application/octet-stream' };
  } catch { return null; }
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

interface FamilyCard {
  head_of_household?: { name?: string; id?: string };
  spouse?: { name?: string; id?: string };
  address?: string; city?: string;
  children?: { name?: string; id?: string; birth_date?: string; gender?: string }[];
  notes?: string; model?: string; extracted_at?: string;
}

async function extractFamilyFromScan(data: Uint8Array, mime: string): Promise<FamilyCard | null> {
  if (!GEMINI_API_KEY) return null;
  if (!data || data.length < 500) return null;
  let effectiveMime = mime && mime.includes('/') ? mime.toLowerCase() : 'image/jpeg';
  if (effectiveMime === 'image/jpg') effectiveMime = 'image/jpeg';
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
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: effectiveMime, data: b64data } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
  };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { console.error('gemini non-ok', r.status, (await r.text()).slice(0, 300)); return null; }
    const j = await r.json();
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    let raw = '';
    for (const p of parts) if (typeof p?.text === 'string') raw += p.text;
    raw = raw.trim();
    if (!raw) return null;
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    let parsed: FamilyCard;
    try { parsed = JSON.parse(raw); } catch { console.error('gemini parse fail', raw.slice(0, 200)); return null; }
    parsed.model = model;
    parsed.extracted_at = new Date().toISOString();
    return parsed;
  } catch (e) { console.error('gemini exception', String(e).slice(0, 200)); return null; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);

  const auth = req.headers.get('authorization') || '';
  if (!auth) return json({ error: 'unauthorized' }, 401, origin);

  /* מוודאים admin אמיתי דרך RLS — לא anon, לא כל authenticated.
     admins RLS policy כבר מגבילה ל-user_id = auth.uid() משלו, אז שורה
     חוזרת רק אם המשתמש שה-JWT שייך לו רשום שם. */
  let isAdmin = false;
  try {
    const chk = await fetch(URL_ + '/rest/v1/admins?select=user_id&limit=1', {
      headers: { apikey: ANON, Authorization: auth, 'Accept-Profile': 'minyan' },
    });
    const rows = chk.ok ? await chk.json() : [];
    isAdmin = Array.isArray(rows) && rows.length > 0;
  } catch { isAdmin = false; }
  if (!isAdmin) return json({ error: 'forbidden' }, 403, origin);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: 'json' }, 400, origin); }
  const scanPath = String(b.scan_path ?? '').slice(0, 300);
  if (!scanPath) return json({ error: 'scan_path' }, 400, origin);

  const scan = await downloadFromStorage(scanPath);
  if (!scan) return json({ error: 'download-failed' }, 404, origin);

  const family = await extractFamilyFromScan(scan.data, scan.mime);
  if (!family) return json({ error: 'extract-failed' }, 502, origin);

  return json({ ok: true, family }, 200, origin);
});
