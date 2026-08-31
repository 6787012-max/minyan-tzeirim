/**
 * mokad-stats — מונה ביקורים לאתרי mokad.co.il
 *
 * למה Worker משלנו ולא Google Analytics או Plausible:
 *   1. נטפרי מאשר את mokad.co.il כולו, כך ש-stats.mokad.co.il עובר בלי
 *      בקשה נוספת. שירותי צד־שלישי נחסמים, והמדידה פשוט לא קורית.
 *   2. הנתונים נשארים אצל יוסף.
 *   3. בלי עוגיות ובלי מזהה אישי — אין מה לבקש עליו הסכמה.
 *
 * מה נשמר: מונים בלבד. אין IP, אין User-Agent, אין מזהה משתמש.
 * מבקר יחיד מזוהה רק דרך hash יומי שנשמר אצלו ב-sessionStorage,
 * ולא נשמר כאן בכלל.
 *
 * מפתחות ב-KV:
 *   d:<YYYY-MM-DD>            סה"כ צפיות ביום
 *   d:<YYYY-MM-DD>:u          מבקרים ייחודיים ביום
 *   p:<YYYY-MM-DD>:<path>     צפיות בעמוד
 *   e:<YYYY-MM-DD>:<event>    אירועים (לחיצות)
 *   t:total                   סה"כ מאז ומעולם
 */

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };

function today() {
  /* שעון ישראל — כדי שה"יום" יתחיל בחצות מקומית ולא ב-UTC */
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  };
}

/** מגדיל מונה ב-KV. KV הוא eventually-consistent, ולכן מונה זה
 *  קירוב טוב ולא ספירה חשבונאית — וזה בסדר גמור לשימוש הזה. */
async function bump(env, key, by = 1) {
  const cur = parseInt((await env.STATS.get(key)) || '0', 10);
  await env.STATS.put(key, String(cur + by));
  return cur + by;
}

async function handleHit(request, env, ctx) {
  let body = {};
  try { body = await request.json(); } catch (_) { /* גוף ריק — עדיין נספור */ }

  const day = today();
  /* נתיב מנורמל: רק אותיות, ספרות, מקף וסלאש, עד 60 תווים */
  const path = String(body.p || '/').replace(/[^a-zA-Z0-9\-_/.]/g, '').slice(0, 60) || '/';
  const isNew = body.n === 1;                    /* מבקר חדש היום */
  const event = body.e ? String(body.e).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : null;

  const jobs = [
    bump(env, `d:${day}`),
    bump(env, `p:${day}:${path}`),
    bump(env, 't:total'),
  ];
  if (isNew) jobs.push(bump(env, `d:${day}:u`));
  if (event) jobs.push(bump(env, `e:${day}:${event}`));

  ctx.waitUntil(Promise.all(jobs));
  return new Response('', { status: 204, headers: corsHeaders(request, env) });
}

/** מחזיר סיכום ל-N הימים האחרונים */
async function handleStats(request, env) {
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));

  const dates = [];
  for (let i = 0; i < days; i++) {
    dates.push(new Date(Date.now() + 3 * 3600e3 - i * 864e5).toISOString().slice(0, 10));
  }

  const daily = await Promise.all(dates.map(async d => ({
    date: d,
    views: parseInt((await env.STATS.get(`d:${d}`)) || '0', 10),
    uniques: parseInt((await env.STATS.get(`d:${d}:u`)) || '0', 10),
  })));

  /* עמודים ואירועים — סורקים את המפתחות של הטווח */
  const pages = {}, events = {};
  const [pl, el] = await Promise.all([
    env.STATS.list({ prefix: 'p:', limit: 1000 }),
    env.STATS.list({ prefix: 'e:', limit: 1000 }),
  ]);
  await Promise.all([
    ...pl.keys.filter(k => dates.includes(k.name.split(':')[1])).map(async k => {
      const name = k.name.split(':').slice(2).join(':');
      pages[name] = (pages[name] || 0) + parseInt((await env.STATS.get(k.name)) || '0', 10);
    }),
    ...el.keys.filter(k => dates.includes(k.name.split(':')[1])).map(async k => {
      const name = k.name.split(':').slice(2).join(':');
      events[name] = (events[name] || 0) + parseInt((await env.STATS.get(k.name)) || '0', 10);
    }),
  ]);

  const total = parseInt((await env.STATS.get('t:total')) || '0', 10);

  return new Response(JSON.stringify({
    ok: true, days, total,
    daily: daily.reverse(),
    pages: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 30),
    events: Object.entries(events).sort((a, b) => b[1] - a[1]).slice(0, 30),
  }), { headers: { ...JSON_H, ...corsHeaders(request, env) } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (url.pathname === '/hit' && request.method === 'POST') {
      return handleHit(request, env, ctx);
    }
    if (url.pathname === '/stats') {
      return handleStats(request, env);
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, day: today() }), { headers: JSON_H });
    }
    return new Response('mokad-stats', { status: 404 });
  },
};
