# -*- coding: utf-8 -*-
"""דף תודה לתורמי ש״ס שוטנשטיין — לוח כבוד להדפסה ולתלייה.

מיוצר מ-`data/shas.json` כדי שהדף המודפס וההרשמה באתר לא יוכלו להיפרד.
בניגוד ל-`gen_shas_pdf.py` (שהוא כלי גיוס — כרך פנוי בולט, תפוס נסוג), כאן
כל הכרכים תפוסים, ולכן הדף כולו חוגג את התורמים: לוח כבוד למעלה, טבלה
מלאה של הכרכים ולידם השם, וסימון עדין ל"שולם" למי שכבר העביר תשלום
דרך נדרים פלוס.

הרינדור: HTML → Chrome headless → PDF, בדיוק כמו במחולל הרישום.
הרצה: python tools/gen_shas_thanks_pdf.py
"""
import base64
import io
import json
import os
import subprocess

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data", "shas.json")
DOCS = os.path.join(HERE, "docs")
OUT = os.path.join(DOCS, "shas-thanks.pdf")
QR = r"C:\projects\minyan-tzeirim-ad\qr.png"

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME):
    CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

NAVY, GOLD, GOLD_LT, CREAM = "#12233F", "#B08D3E", "#D9BE7C", "#F6F1E5"
INK = "#1B2C4A"
MUTED = "#77808F"
LINE = "#A9B2C0"
PAID = "#2F7A47"  # ירוק עדין ל"שולם"


def font_face(name, path, weight=400):
    p = os.path.join(HERE, "fonts", path).replace("\\", "/")
    return ("@font-face{font-family:'%s';src:url('file:///%s') format('woff2');"
            "font-weight:%d;font-display:block}" % (name, p, weight))


def data_uri(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def diamond(size=8, fill=GOLD):
    return ('<svg viewBox="0 0 10 10" width="%d" height="%d" fill="none">'
            '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="%s"/></svg>' % (size, size, fill))


def rule_svg(w=430):
    half = w / 2.0 - 15
    return ('<svg class="rl" viewBox="0 0 %d 18" width="%d" height="18" fill="none">'
            '<path d="M0 9 H%.1f" stroke="%s" stroke-width="1"/>'
            '<path d="M%.1f 9 H%d" stroke="%s" stroke-width="1"/>'
            '<path d="M%.1f 9 L%.1f 2 L%.1f 9 L%.1f 16 Z" fill="%s"/></svg>'
            % (w, w, half, GOLD, w - half, w, GOLD,
               w / 2.0 - 7, w / 2.0, w / 2.0 + 7, w / 2.0, GOLD))


def balance_columns(order, groups, ncol=4):
    """מחלק את הסדרים ל-ncol טורים כך שמספר הכרכים בכל טור דומה.
    סדר לא נחתך בין טורים כדי שיהיה קריא."""
    total = sum(len(groups[s]) for s in order)
    target = total / float(ncol)
    cols, cur, run, left = [], [], 0, total
    for i, sd in enumerate(order):
        n = len(groups[sd])
        remaining_cols = ncol - len(cols) - 1
        if (cur and run + n / 2.0 > target and remaining_cols > 0
                and len(order) - i >= remaining_cols):
            cols.append(cur)
            cur, run = [], 0
        cur.append(sd)
        run += n
        left -= n
    if cur:
        cols.append(cur)
    while len(cols) < ncol:
        cols.append([])
    return cols


def build_html(d):
    vols = d["volumes"]

    groups, order = {}, []
    for v in vols:
        if v["seder"] not in groups:
            groups[v["seder"]] = []
            order.append(v["seder"])
        groups[v["seder"]].append(v)

    # ── לוח הכבוד המרוכז ─────────────────────────────────────────────────
    # לפי סדר הופעה — כך התורם הראשון (אקרמן, 30 כרכים) בולט בראש.
    tally = {}
    order_names = []
    for v in vols:
        by = (v.get("by") or "").strip()
        if by and by != "תפוס":
            if by not in tally:
                order_names.append(by)
            tally[by] = tally.get(by, 0) + 1

    honor_rows = []
    for nm in order_names:
        c = tally[nm]
        label = "%d כרכים" % c if c > 1 else "כרך אחד"
        honor_rows.append(
            '<span class="hr"><b>%s</b><em>%s</em></span>' % (nm, label))
    honor_html = ('<div class="hn"><span class="k">לוח הכבוד</span>%s</div>'
                  % "".join(honor_rows))

    # ── טבלת הכרכים לפי סדרים ──────────────────────────────────────────
    def rows_html(sd):
        out = []
        for x in groups[sd]:
            by = (x.get("by") or "").strip() or "—"
            paid = ' <span class="pd">שולם</span>' if x.get("paid") else ""
            out.append('<div class="v"><span class="n">%s</span>'
                       '<span class="nm">%s</span>'
                       '<span class="donor">%s%s%s</span></div>'
                       % (x["n"], x["name"], diamond(6), by, paid))
        return "".join(out)

    def sd_block(sd):
        total = len(groups[sd])
        return ('<section class="sd" style="flex-grow:%d">'
                '<h2><span class="t">%s</span><i>%d כרכים</i></h2>'
                '<div class="vs">%s</div></section>'
                % (total, sd, total, rows_html(sd)))

    cols = balance_columns(order, groups, 4)
    main = "".join('<div class="col">%s</div>'
                   % "".join(sd_block(s) for s in c) for c in cols)

    lp = os.path.join(HERE, "img", "logo-framed.svg")
    logo_svg = io.open(lp, encoding="utf-8").read() if os.path.exists(lp) else ""

    total_v = len(vols)
    total_donors = len(order_names)

    css = """
%s %s %s %s %s %s
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A3;margin:0}
html,body{width:297mm;height:420mm}
body{background:#FFFFFF;color:%s;font-family:'Asst',Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden}
.pg{width:297mm;height:420mm;padding:15mm 15mm 10mm;position:relative;
  display:flex;flex-direction:column}
.frame{position:absolute;inset:7mm;border:1.3pt solid %s;pointer-events:none}
.frame::before{content:'';position:absolute;inset:1.7mm;border:.4pt solid %s;opacity:.9}
.bsd{position:absolute;top:11.5mm;right:14mm;font-family:'Frank',serif;
  font-size:11pt;color:%s}

/* ── כותרת ──────────────────────────────────────────────────────────── */
header{text-align:center;position:relative;z-index:1;flex:0 0 auto}
header .logo svg{height:30mm;width:auto;display:block;margin:0 auto}
header .eyebrow{font-family:'Drug',serif;font-size:12pt;color:%s;
  letter-spacing:.30em;margin-top:2.5mm}
header h1{font-family:'Frank',serif;font-weight:900;font-size:44pt;
  line-height:1.02;margin-top:1.5mm;color:%s;letter-spacing:.01em}
header h1 em{font-style:normal;color:%s;font-weight:900}
header .sub{font-family:'Frank',serif;font-size:14pt;color:%s;margin-top:2mm;
  line-height:1.5}
header .rl{margin:2.5mm auto 0;display:block}

/* ── פס המספרים ───────────────────────────────────────────────────── */
.bar{display:flex;justify-content:center;gap:0;margin-top:3mm}
.bar span{font-size:10.5pt;color:%s;padding:0 8mm;text-align:center;
  border-inline-start:.5pt solid %s;line-height:1.35}
.bar span:first-child{border:none}
.bar b{display:block;font-family:'Frank',serif;font-weight:900;
  font-size:22pt;color:%s;line-height:1.1}

/* ── לוח הכבוד ─────────────────────────────────────────────────────── */
.hn{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;
  gap:2.5mm 6.5mm;background:%s;color:%s;padding:4mm 7mm;margin-top:4mm;
  position:relative;z-index:1;border-top:2pt solid %s;border-bottom:2pt solid %s}
.hn .k{width:100%%;text-align:center;font-family:'Drug',serif;font-size:11pt;
  letter-spacing:.28em;color:%s;margin-bottom:1.5mm}
.hn .hr{font-family:'Frank',serif;font-size:14.5pt;white-space:nowrap;
  color:#FFFFFF}
.hn .hr b{font-weight:900}
.hn .hr em{font-style:normal;font-family:'Asst',sans-serif;font-size:9.5pt;
  color:%s;margin-inline-start:2mm;font-weight:600}

/* ── הטורים ────────────────────────────────────────────────────────── */
main{flex:1;display:flex;gap:6mm;margin-top:4mm;position:relative;z-index:1;
  min-height:0}
.col{flex:1;display:flex;flex-direction:column;min-width:0}
.sd{display:flex;flex-direction:column;margin-bottom:3mm;
  flex-basis:0;flex-shrink:1;min-height:0}
.sd:last-child{margin-bottom:0}
.sd h2{flex:0 0 auto;display:flex;align-items:baseline;gap:2mm;
  border-bottom:.9pt solid %s;padding-bottom:1mm;margin-bottom:1.2mm}
.sd h2 .t{font-family:'Frank',serif;font-weight:900;font-size:15pt;color:%s}
.sd h2 i{font-style:normal;font-size:8.5pt;margin-inline-start:auto;
  white-space:nowrap;color:%s;letter-spacing:.04em}
.vs{flex:1;display:flex;flex-direction:column;justify-content:space-between;
  min-height:0}
.v{flex:1 1 0;min-height:5mm;max-height:11mm;
  display:flex;align-items:center;gap:1.5mm;padding:.4mm 0;
  border-bottom:.35pt dotted %s}
.v:last-child{border-bottom:none}
.v .n{flex:0 0 6.5mm;font-family:'Frank',serif;font-size:10pt;color:%s;
  text-align:center;font-weight:900}
.v .nm{flex:0 0 auto;max-width:29mm;font-size:10.5pt;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;color:%s;font-weight:600}
.v .donor{flex:1;min-width:0;font-size:11pt;text-align:end;
  color:%s;font-family:'Frank',serif;font-weight:500;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  display:flex;align-items:center;justify-content:flex-end;gap:1.5mm}
.v .donor svg{flex:0 0 auto}
.v .pd{background:%s;color:#FFFFFF;font-family:'Asst',sans-serif;
  font-size:7.5pt;font-weight:700;padding:.4mm 1.6mm;border-radius:1.6mm;
  letter-spacing:.05em;margin-inline-start:1.5mm}

/* ── תחתית ──────────────────────────────────────────────────────────── */
footer{flex:0 0 auto;margin-top:4mm;padding-top:3.5mm;border-top:1.2pt solid %s;
  display:flex;align-items:center;justify-content:center;gap:8mm;
  position:relative;z-index:1;text-align:center}
footer .msg{font-family:'Frank',serif;font-weight:500;font-size:13pt;color:%s;
  line-height:1.55;max-width:180mm}
footer .msg b{font-weight:900;color:%s}
footer .site{font-family:'Frank',serif;font-weight:900;font-size:14pt;
  color:%s;margin-top:1mm}
""" % (
        font_face("Frank", "frank-medium.woff2", 500),
        font_face("Frank", "frank-black.woff2", 900),
        font_face("Drug", "drugulin-bold.woff2", 700),
        font_face("Asst", "assistant-regular.woff2", 400),
        font_face("Asst", "assistant-semibold.woff2", 600),
        font_face("Asst", "assistant-extrabold.woff2", 800),
        INK,
        GOLD, GOLD_LT, GOLD, GOLD, NAVY, GOLD, MUTED,
        MUTED, GOLD_LT, NAVY,
        NAVY, CREAM, GOLD, GOLD, GOLD_LT, GOLD_LT,
        GOLD, NAVY, MUTED, LINE, GOLD, INK, NAVY, PAID,
        GOLD_LT, MUTED, NAVY, NAVY)

    return ("""<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>%s</style></head><body>
<div class="pg">
  <div class="frame"></div><div class="bsd">בס״ד</div>

  <header>
    <div class="logo">%s</div>
    <div class="eyebrow">מנין הצעירים · מעלה עמוס</div>
    <h1>תודה רבה לכל התורמים היקרים</h1>
    <div class="sub">
      שותפינו בזכות ש"ס שוטנשטיין לבית הכנסת
    </div>
    %s
    <div class="bar">
      <span><b>%d</b>כרכים בסך הכל</span>
      <span><b>%d</b>תורמים יקרים</span>
      <span><b>ברוך ה'</b>הושלמו כל הכרכים</span>
    </div>
  </header>

  %s

  <main>%s</main>

  <footer>
    <div class="msg">
      יהי רצון שיזכו התורמים היקרים ובני-ביתם לרוב תורה, בריאות, נחת, פרנסה
      טובה וברכה בכל מעשי ידיהם, ויזכו לראות בהתגלות משיח צדקנו בבניין
      בית מקדשנו במהרה בימינו, אמן.
      <div class="site">minyan.mokad.co.il · מוסד 8000707 בנדרים פלוס</div>
    </div>
  </footer>
</div></body></html>""" % (
        css,
        logo_svg,
        rule_svg(430),
        total_v, total_donors,
        honor_html,
        main))


def render(d):
    html = os.path.join(DOCS, "_shas-thanks.html")
    io.open(html, "w", encoding="utf-8").write(build_html(d))
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    "--print-to-pdf=" + OUT, "file:///" + html.replace("\\", "/")],
                   check=False, capture_output=True)
    # השאר את ה-HTML לצורך דיבוג אם הרינדור לא הצליח
    if not os.path.exists(OUT):
        return 0
    os.remove(html)
    import fitz
    doc = fitz.open(OUT)
    n = doc.page_count
    doc.close()
    return n


def preview(png, dpi=180):
    import fitz
    doc = fitz.open(OUT)
    doc[0].get_pixmap(dpi=dpi).save(png)
    doc.close()


def main():
    d = json.load(io.open(DATA, encoding="utf-8"))
    os.makedirs(DOCS, exist_ok=True)
    pages = render(d)
    print("docs/shas-thanks.pdf  ·  %s עמודים  ·  %d KB"
          % (pages, os.path.getsize(OUT) // 1024))
    preview_png = os.path.join(DOCS, "_shas-thanks-preview.png")
    preview(preview_png)
    print("preview:", preview_png)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
