# -*- coding: utf-8 -*-
"""מייצר דף רישום מודפס לחלוקת ש״ס — docs/shas-rishum.pdf

דף **A3** לתלייה בבית הכנסת: הלוגו למעלה, 73 הכרכים בארבעה טורים לפי סדרים,
ולצד כל כרך שורה ריקה לרישום שם. הנתונים מגיעים מ-data/shas.json — אותו מקור
שמזין את האתר, כך שהדף המודפס והאתר לא יכולים להיפרד.

העיצוב ממלא את הדף: הטורים נמתחים לגובה מלא והשורות מתפרשות ביניהן, כך שאין
שטח לבן בתחתית ללא תלות בכמה כרכים כבר נלקחו.

## שלוש החלטות עיצוב שנובעות מהנתונים עצמם

1. **לוח הכבוד במקום שם שחוזר.** תורם אחד לקח 30 כרכים. להדפיס את שמו 30 פעם
   הופך את הדף לרעש ומסתיר את מה שהדף נועד לו — הכרכים שעדיין פנויים. לכן
   השמות מרוכזים בפס «בזכות התורמים» בראש הדף, והשורה שליד כרך תפוס מסומנת
   בלבד. השם עדיין מודפס לידה, אבל דהוי — כדי שהעין תנחת על הפנויים.
2. **הפנוי בולט, התפוס נסוג.** שורת רישום פנויה מקבלת קו כתיבה מלא וכהה; שורה
   תפוסה מקבלת מעוין זהב וטקסט אפור. זה ההיפך מהאינטואיציה הרגילה, אבל הדף
   הוא כלי גיוס — לא דוח.
3. **הטורים מאוזנים לפי כרכים, לא לפי סדרים.** «מועד» לבדו הוא 20 כרכים מתוך
   73. חלוקה נאיבית לפי סדרים משאירה טור אחד ארוך ושלושה קצרים.

הרינדור: HTML → Chrome headless → PDF. אין תלות בספריות PDF.
הרצה:  python tools/gen_shas_pdf.py
"""
import base64
import io
import json
import os
import subprocess

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data", "shas.json")
DOCS = os.path.join(HERE, "docs")
OUT = os.path.join(DOCS, "shas-rishum.pdf")
QR = r"C:\projects\minyan-tzeirim-ad\qr.png"

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME):
    CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

NAVY, GOLD, GOLD_LT, CREAM = "#12233F", "#B08D3E", "#D9BE7C", "#F6F1E5"
INK = "#1B2C4A"
MUTED = "#77808F"
LINE = "#A9B2C0"


def font_face(name, path, weight=400):
    p = os.path.join(HERE, "fonts", path).replace("\\", "/")
    return ("@font-face{font-family:'%s';src:url('file:///%s') format('woff2');"
            "font-weight:%d;font-display:block}" % (name, p, weight))


def data_uri(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def diamond(size=7, fill=GOLD):
    return ('<svg class="dm" viewBox="0 0 10 10" width="%d" height="%d" fill="none">'
            '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="%s"/></svg>' % (size, size, fill))


def rule_svg(w=420):
    """קו הפרדה עם מעוין במרכז — הסימן הגרפי של המניין."""
    half = w / 2.0 - 15
    return ('<svg class="rl" viewBox="0 0 %d 18" width="%d" height="18" fill="none">'
            '<path d="M0 9 H%.1f" stroke="%s" stroke-width="1"/>'
            '<path d="M%.1f 9 H%d" stroke="%s" stroke-width="1"/>'
            '<path d="M%.1f 9 L%.1f 2 L%.1f 9 L%.1f 16 Z" fill="%s"/></svg>'
            % (w, w, half, GOLD, w - half, w, GOLD,
               w / 2.0 - 7, w / 2.0, w / 2.0 + 7, w / 2.0, GOLD))


def balance_columns(order, groups, ncol=4):
    """מחלק את הסדרים ל-ncol טורים כך שמספר הכרכים בכל טור דומה.

    חלוקה חמדנית לפי «כמה כרכים כבר יש בטור מול כמה עוד נשארו» — סדר נשאר
    שלם ולא נחתך בין טורים, כי סדר חצוי בין שני טורים לא קריא בדף מודפס.
    """
    total = sum(len(groups[s]) for s in order)
    target = total / float(ncol)
    cols, cur, run, left = [], [], 0, total
    for i, sd in enumerate(order):
        n = len(groups[sd])
        # לפתוח טור חדש רק אם הנוכחי כבר מלא, ורק אם נשארו מספיק סדרים
        # למלא את הטורים שעוד לא נפתחו.
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


def build_html(d, row_mm=11.0):
    vols = d["volumes"]
    price = d["pricePerVolume"]

    groups, order = {}, []
    for v in vols:
        if v["seder"] not in groups:
            groups[v["seder"]] = []
            order.append(v["seder"])
        groups[v["seder"]].append(v)

    def rows_html(sd):
        out = []
        for x in groups[sd]:
            by = (x.get("by") or "").strip()
            if by:
                out.append('<div class="v taken"><span class="n">%s</span>'
                           '<span class="nm">%s</span>'
                           '<span class="ln">%s%s</span></div>'
                           % (x["n"], x["name"], diamond(6), by))
            else:
                out.append('<div class="v"><span class="n">%s</span>'
                           '<span class="nm">%s</span>'
                           '<span class="ln"></span></div>' % (x["n"], x["name"]))
        return "".join(out)

    def sd_block(sd):
        free = sum(1 for x in groups[sd] if not (x.get("by") or "").strip())
        tag = ('<i class="free">%d פנויים</i>' % free) if free else '<i class="full">הושלם</i>'
        # flex-grow לפי מספר הכרכים: סדר בן 20 כרכים מקבל פי עשרה מקום מסדר
        # בן 2. כך הטור מתחלק לבדו, השורות נמתחות למלא אותו, ושום דבר לא
        # גולש מתחת לתחתית הדף — גם אם הנתונים ישתנו.
        return ('<section class="sd" style="flex-grow:%d">'
                '<h2><span class="t">%s</span>%s</h2>'
                '<div class="vs">%s</div></section>'
                % (len(groups[sd]), sd, tag, rows_html(sd)))

    cols = balance_columns(order, groups, 4)
    main = "".join('<div class="col">%s</div>'
                   % "".join(sd_block(s) for s in c) for c in cols)

    # הטמעה inline: Chrome headless לא טוען אמין <img src="file://...svg"> בהדפסה
    lp = os.path.join(HERE, "img", "logo-framed.svg")
    logo_svg = io.open(lp, encoding="utf-8").read() if os.path.exists(lp) else ""

    taken = sum(1 for v in vols if (v.get("by") or "").strip())
    free = len(vols) - taken

    # ── לוח הכבוד ──────────────────────────────────────────────────────────
    # נבנה מ-credits אם קיים (שם + כמה כרכים), ואם לא — נספר מתוך השדה by,
    # כדי שהפס לא ייעלם כשמישהו נרשם ידנית בלי להתעדכן ב-credits.
    tally = {}
    for v in vols:
        by = (v.get("by") or "").strip()
        if by:
            tally[by] = tally.get(by, 0) + 1
    for c in (d.get("credits") or []):
        tally.setdefault(c["name"], int(c.get("volumes") or 0))
    honor = sorted(tally.items(), key=lambda kv: -kv[1])
    honor_html = ""
    if honor:
        honor_html = (
            '<div class="hn"><span class="k">בזכות התורמים</span>%s</div>'
            % "".join('<span class="r"><b>%s</b><em>%d כרכים</em></span>'
                      % (n, c) if c > 1 else
                      '<span class="r"><b>%s</b><em>כרך אחד</em></span>' % n
                      for n, c in honor))

    qr_html = ('<img class="qr" src="%s">' % data_uri(QR)) if os.path.exists(QR) else ""

    css = """
%s %s %s %s %s
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A3;margin:0}
html,body{width:297mm;height:420mm}
body{background:%s;color:%s;font-family:'Asst',Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden}
.pg{width:297mm;height:420mm;padding:16mm 15mm 11mm;position:relative;
  display:flex;flex-direction:column}
.frame{position:absolute;inset:7mm;border:1.2pt solid %s;pointer-events:none}
.frame::before{content:'';position:absolute;inset:1.7mm;border:.4pt solid %s;opacity:.9}
.bsd{position:absolute;top:11.5mm;right:14mm;font-family:'Frank',serif;
  font-size:11pt;color:%s}

/* ── כותרת ─────────────────────────────────────────────────────────────── */
header{text-align:center;position:relative;z-index:1;flex:0 0 auto}
header .logo svg{height:34mm;width:auto;display:block;margin:0 auto}
header .eyebrow{font-family:'Drug',serif;font-size:12.5pt;color:%s;
  letter-spacing:.30em;margin-top:3mm}
header h1{font-family:'Frank',serif;font-weight:900;font-size:40pt;
  line-height:1.05;margin-top:1.5mm;color:%s}
header .sub{font-size:12.5pt;color:%s;margin-top:2mm;line-height:1.5}
header .rl{margin:2.5mm auto 0;display:block}

/* ── פס המספרים ────────────────────────────────────────────────────────── */
.bar{display:flex;justify-content:center;gap:0;margin-top:3.5mm}
.bar span{font-size:10.5pt;color:%s;padding:0 7mm;text-align:center;
  border-inline-start:.5pt solid %s;line-height:1.35}
.bar span:first-child{border:none}
.bar b{display:block;font-family:'Frank',serif;font-weight:900;
  font-size:21pt;color:%s;line-height:1.1}
.bar .hi b{color:%s}

/* ── לוח הכבוד ─────────────────────────────────────────────────────────── */
.hn{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;
  gap:1mm 8mm;background:%s;color:%s;padding:2.6mm 6mm;margin-top:4mm;
  position:relative;z-index:1}
.hn .k{font-family:'Drug',serif;font-size:10pt;letter-spacing:.24em;color:%s}
.hn .r{font-family:'Frank',serif;font-size:14pt;white-space:nowrap}
.hn .r b{font-weight:500}
.hn .r em{font-style:normal;font-family:'Asst',sans-serif;font-size:9.5pt;
  color:%s;margin-inline-start:2mm}

/* ── הטורים ────────────────────────────────────────────────────────────── */
main{flex:1;display:flex;gap:7mm;margin-top:4.5mm;position:relative;z-index:1;
  min-height:0}
.col{flex:1;display:flex;flex-direction:column;min-width:0}
.sd{display:flex;flex-direction:column;margin-bottom:3.5mm;
  flex-basis:0;flex-shrink:1;min-height:0}
.sd:last-child{margin-bottom:0}
.sd h2{flex:0 0 auto;display:flex;align-items:baseline;gap:2mm;
  border-bottom:.8pt solid %s;padding-bottom:1mm;margin-bottom:1.5mm}
.sd h2 .t{font-family:'Frank',serif;font-weight:900;font-size:15pt;color:%s}
.sd h2 i{font-style:normal;font-size:8.5pt;margin-inline-start:auto;
  white-space:nowrap;letter-spacing:.04em}
.sd h2 .free{color:%s}
.sd h2 .full{color:%s}
.vs{flex:1;display:flex;flex-direction:column;justify-content:space-between;
  min-height:0}
/* השורות נמתחות למלא את הסדר. max-height מונע שורות ענקיות בסדר קצר
   (טהרות = 2 כרכים) שאחרת היה מקבל שורות בגובה חצי טור. */
.v{flex:1 1 0;min-height:ROWMM;max-height:14mm;
  display:flex;align-items:flex-end;gap:1.5mm;padding-bottom:.9mm}
.v .n{flex:0 0 7mm;font-family:'Frank',serif;font-size:10pt;color:%s;
  text-align:center}
.v .nm{flex:0 0 auto;max-width:31mm;font-size:11pt;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
/* קו הכתיבה — זה הדבר שאדם אמור למלא, ולכן הוא הכהה ביותר בשורה */
.v .ln{flex:1;min-width:0;height:5.4mm;margin-inline-start:1mm;
  border-bottom:.6pt solid %s;font-size:10pt;text-align:center;
  white-space:nowrap;overflow:hidden;display:flex;align-items:center;
  justify-content:center;gap:1.4mm}
.v.taken{opacity:.62}
.v.taken .ln{border-bottom:.5pt dotted %s;color:%s;font-family:'Frank',serif}
.v.taken .dm{flex:0 0 auto}

/* ── תחתית ─────────────────────────────────────────────────────────────── */
footer{flex:0 0 auto;margin-top:4mm;padding-top:3.5mm;border-top:1pt solid %s;
  display:flex;align-items:center;gap:7mm;position:relative;z-index:1}
footer .qr{width:20mm;height:20mm;flex:0 0 auto}
footer .txt{flex:1;text-align:center;font-size:11pt;color:%s;line-height:1.65}
footer .txt b{color:%s}
footer .site{font-family:'Frank',serif;font-weight:900;font-size:15pt;
  color:%s;margin-top:1mm}
footer .qrlbl{font-size:7.5pt;color:%s;text-align:center;margin-top:.8mm;
  line-height:1.3}
footer .qrbox{flex:0 0 auto}
""" % (
        font_face("Frank", "frank-medium.woff2", 500),
        font_face("Frank", "frank-black.woff2", 900),
        font_face("Drug", "drugulin-bold.woff2", 700),
        font_face("Asst", "assistant-regular.woff2", 400),
        font_face("Asst", "assistant-semibold.woff2", 600),
        "#FFFFFF", INK,
        GOLD, GOLD_LT, GOLD,
        GOLD, NAVY, MUTED,
        MUTED, GOLD_LT, NAVY, GOLD,
        NAVY, CREAM, GOLD_LT, GOLD_LT,
        GOLD_LT, NAVY, GOLD, MUTED,
        GOLD, LINE, GOLD_LT, MUTED,
        GOLD, MUTED, NAVY, NAVY, MUTED)

    return ("""<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>%s</style></head><body>
<div class="pg">
  <div class="frame"></div><div class="bsd">בס״ד</div>

  <header>
    <div class="logo">%s</div>
    <div class="eyebrow">%s</div>
    <h1>%s</h1>
    <div class="sub">%s</div>
    %s
    <div class="bar">
      <span class="hi"><b>%d</b>כרכים פנויים</span>
      <span><b>₪%d</b>עלות כרך</span>
      <span><b>%d</b>כרכים נתפסו</span>
      <span><b>%d</b>סך הכרכים</span>
    </div>
  </header>

  %s

  <main>%s</main>

  <footer>
    <div class="qrbox">%s<div class="qrlbl">לתרומה<br>מהנייד</div></div>
    <div class="txt">
      לרישום — למלא את השם בשורה שליד הכרך, או להירשם באתר.<br>
      התשלום דרך <b>נדרים פלוס</b> · מוסד <b>%s</b> · קבוצה <b>%s</b><br>
      %s
      <div class="site">%s</div>
    </div>
    <div class="qrbox">%s<div class="qrlbl">לתרומה<br>מהנייד</div></div>
  </footer>
</div></body></html>""" % (
        css.replace("ROWMM", "%.2fmm" % row_mm),
        logo_svg,
        d.get("eyebrow", ""),
        d["title"],
        d["intro"],
        rule_svg(430),
        free, price, taken, len(vols),
        honor_html,
        main,
        qr_html,
        "8000707",
        (d.get("nedarim") or {}).get("groupe", ""),
        d.get("priceNote", ""),
        "minyan.mokad.co.il",
        qr_html))


def render(d, row_mm):
    """מרנדר ומחזיר את מספר העמודים."""
    html = os.path.join(DOCS, "_shas-rishum.html")
    io.open(html, "w", encoding="utf-8").write(build_html(d, row_mm))
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    "--print-to-pdf=" + OUT, "file:///" + html.replace("\\", "/")],
                   check=False, capture_output=True)
    os.remove(html)
    if not os.path.exists(OUT):
        return 0
    import fitz
    doc = fitz.open(OUT)
    n = doc.page_count
    doc.close()
    return n


def preview(png, dpi=150):
    import fitz
    doc = fitz.open(OUT)
    doc[0].get_pixmap(dpi=dpi).save(png)
    doc.close()


def main():
    d = json.load(io.open(DATA, encoding="utf-8"))
    os.makedirs(DOCS, exist_ok=True)

    # אין חיפוש בינארי על גובה השורה. הגרסה הקודמת חיפשה את הגובה הגדול
    # ביותר ש"נכנס לעמוד אחד", אבל `overflow:hidden` גורם לתוכן שגולש
    # להיחתך במקום לפתוח עמוד שני — כלומר הבדיקה תמיד החזירה "עמוד אחד",
    # והטור הארוך נחתך מתחת לתחתית הדף בלי שאיש ישים לב.
    # עכשיו ה-flex מחלק את גובה הטור בעצמו; ROWMM הוא רק רצפה.
    pages = render(d, 4.5)
    print("docs/shas-rishum.pdf  ·  %s עמודים  ·  %d KB"
          % (pages, os.path.getsize(OUT) // 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
