/**
 * gan-sign — מקבלת PDF חתום מדף gan.html ושולחת אותו במייל לאילה שניידר.
 * (אותו סגנון כמו forms: בלי import, SMTP ידני מעל Deno.connectTls.)
 * סודות: MAIL_USER / MAIL_PASS (כבר מוגדרים בפרויקט). נמענים קבועים כאן.
 */
const MAIL_USER = Deno.env.get('MAIL_USER') ?? '';
const MAIL_PASS = Deno.env.get('MAIL_PASS') ?? '';
const SITE = Deno.env.get('SITE_ORIGIN') ?? 'https://minyan.mokad.co.il';
const TO = 'a0533177636@gmail.com';        // אילה שניידר
const ALLOWED = new Set([SITE, 'http://localhost:8765', 'http://127.0.0.1:8765']);

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
    status, headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

const enc = new TextEncoder();
const dec = new TextDecoder();
function b64(s: string) {
  const bytes = enc.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
const wrap76 = (s: string) => (s.match(/.{1,76}/g) ?? []).join('\r\n');
const mimeHeader = (s: string) => '=?UTF-8?B?' + b64(s) + '?=';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

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
  private async expect(code: number): Promise<string> {
    let out = '';
    for (let i = 0; i < 60; i++) {
      out += await this.read();
      const lines = out.trimEnd().split(/\r?\n/);
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        if (!last.startsWith(String(code))) throw new Error('smtp ' + last.slice(0, 90));
        return out;
      }
    }
    throw new Error('smtp: no terminal line');
  }
  async cmd(line: string, code: number) {
    await this.conn.write(enc.encode(line + '\r\n'));
    return await this.expect(code);
  }
  async raw(data: string, code: number) {
    const bytes = enc.encode(data + String.fromCharCode(13, 10));
    let off = 0;
    while (off < bytes.length) {            // כתיבה בנתחים — הודעה גדולה
      const n = await this.conn.write(bytes.subarray(off, off + 65536));
      off += n;
    }
    return await this.expect(code);
  }
  async close() {
    try { await this.cmd('QUIT', 221); } catch { /* */ }
    try { this.conn.close(); } catch { /* */ }
  }
}

async function sendWithPdf(subject: string, html: string, filename: string, pdfB64: string) {
  if (!MAIL_USER || !MAIL_PASS) return { ok: false, err: 'mail-not-configured' };
  const s = new Smtp();
  const bnd = '=_gan_' + crypto.randomUUID().replace(/-/g, '');
  try {
    await s.connect('smtp.gmail.com', 465);
    await s.cmd('EHLO minyan.mokad.co.il', 250);
    await s.cmd('AUTH LOGIN', 334);
    await s.cmd(b64(MAIL_USER), 334);
    await s.cmd(b64(MAIL_PASS), 235);
    await s.cmd('MAIL FROM:<' + MAIL_USER + '>', 250);
    await s.cmd('RCPT TO:<' + TO + '>', 250);
    if (MAIL_USER.toLowerCase() !== TO) await s.cmd('RCPT TO:<' + MAIL_USER + '>', 250);
    await s.cmd('DATA', 354);
    const msg = [
      'From: ' + mimeHeader('חתימות גן ניסנית ודגנית') + ' <' + MAIL_USER + '>',
      'To: <' + TO + '>',
      'Subject: ' + mimeHeader(subject),
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + bnd + '"',
      '',
      '--' + bnd,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(b64(html)),
      '--' + bnd,
      'Content-Type: application/pdf; name="' + mimeHeader(filename) + '"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="' + mimeHeader(filename) + '"',
      '',
      wrap76(pdfB64),
      '--' + bnd + '--',
      '.',
    ].join('\r\n');
    await s.raw(msg, 250);
    return { ok: true, err: '' };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 300) };
  } finally {
    await s.close();
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, origin);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, origin); }

  const name = clean(b.name, 60), child = clean(b.child, 60), gan = clean(b.gan, 20), phone = clean(b.phone, 20);
  const pdf = String(b.pdf ?? '');
  if (name.length < 2 || child.length < 2 || !gan) return json({ ok: false, error: 'fields' }, 400, origin);
  if (!pdf.startsWith('JVBER') || pdf.length > 4_000_000 || /[^A-Za-z0-9+/=]/.test(pdf)) {
    return json({ ok: false, error: 'pdf' }, 400, origin);
  }
  const html = '<div dir="rtl" style="font-family:Arial;font-size:16px">' +
    '<p>התקבלה חתימה חדשה על מכתב פיצול הגן.</p>' +
    '<p><b>שם האם:</b> ' + esc(name) + '<br><b>הילד/ה:</b> ' + esc(child) +
    '<br><b>הגן:</b> ' + esc(gan) + '<br><b>טלפון:</b> ' + esc(phone || '—') + '</p>' +
    '<p>הקובץ החתום מצורף. נשלח אוטומטית מדף החתימה.</p></div>';
  const r = await sendWithPdf('חתימה על מכתב פיצול הגן – ' + name + ' (' + gan + ')', html,
    'חתימה_' + name.replace(/[^֐-׿a-zA-Z0-9 ]/g, '').replace(/ +/g, '_') + '.pdf', pdf);
  if (!r.ok) { console.error('mail failed', r.err); return json({ ok: false, error: 'mail' }, 502, origin); }
  return json({ ok: true }, 200, origin);
});
