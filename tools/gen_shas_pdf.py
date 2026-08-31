# -*- coding: utf-8 -*-
"""מייצר דף רישום מודפס לחלוקת ש״ס — docs/shas-rishum.pdf

דף A4 לתלייה בבית הכנסת: הלוגו למעלה, 73 הכרכים בטור לפי סדרים, ולצד כל
כרך שורה ריקה לרישום שם. הנתונים מגיעים מ-data/shas.json — אותו מקור שמזין
את האתר, כך שהדף המודפס והאתר לא יכולים להיפרד.

הרינדור: HTML → Chrome headless → PDF. אין תלות בספריות PDF.
הרצה:  python tools/gen_shas_pdf.py
"""
import io
import json
import os
import subprocess

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data", "shas.json")
DOCS = os.path.join(HERE, "docs")
OUT = os.path.join(DOCS, "shas-rishum.pdf")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME):
    CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

NAVY, GOLD, GOLD_LT, CREAM = "#12233F", "#B08D3E", "#D9BE7C", "#F6F1E5"


def font_face(name, path, weight=400):
    p = os.path.join(HERE, "fonts", path).replace("\\", "/")
    return ("@font-face{font-family:'%s';src:url('file:///%s') format('woff2');"
            "font-weight:%d;font-display:block}" % (name, p, weight))


def build_html(d):
    vols = d["volumes"]
    price = d["pricePerVolume"]

    # קיבוץ לפי סדר, בשמירה על הסדר המקורי
    groups, order = {}, []
    for v in vols:
        if v["seder"] not in groups:
            groups[v["seder"]] = []
            order.append(v["seder"])
        groups[v["seder"]].append(v)

    blocks = ""
    for sd in order:
        rows = "".join(
            '<div class="v%s"><span class="n">%s</span>'
            '<span class="nm">%s</span><span class="ln">%s</span></div>'
            % (" taken" if (x.get("by") or "").strip() else "",
               x["n"], x["name"], (x.get("by") or "").strip())
            for x in groups[sd])
        free = sum(1 for x in groups[sd] if not (x.get("by") or "").strip())
        blocks += ('<div class="sd"><h2>%s<i>%d כרכים · %d פנויים</i></h2>'
                   '<div class="vs">%s</div></div>' % (sd, len(groups[sd]), free, rows))

    # הטמעה inline: Chrome headless לא טוען אמין <img src="file://...svg"> בהדפסה
    lp = os.path.join(HERE, "img", "logo-h.svg")
    logo_svg = io.open(lp, encoding="utf-8").read() if os.path.exists(lp) else ""
    taken = sum(1 for v in vols if (v.get("by") or "").strip())

    return """<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
%s %s %s
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
body{width:210mm;background:#fff;color:%s;
  font-family:'Asst',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:210mm;min-height:297mm;padding:11mm 12mm 9mm;position:relative;
  page-break-after:always;display:flex;flex-direction:column}
.pg:last-child{page-break-after:auto}
.frame{position:absolute;inset:5mm;border:1.1pt solid %s;border-radius:2mm;pointer-events:none}
.frame::before{content:'';position:absolute;inset:1.6mm;border:.4pt solid %s;border-radius:1.4mm}
.bsd{position:absolute;top:8mm;right:10mm;font-size:8pt;color:%s}
header{text-align:center;padding-bottom:4mm;border-bottom:.8pt solid %s;margin-bottom:4mm;
  position:relative;z-index:1}
header .logo{height:15mm;margin:0 auto 2.5mm;display:flex;justify-content:center}
header .logo svg{height:15mm;width:auto;display:block}
header h1{font-family:'Frank',serif;font-weight:900;font-size:20pt;line-height:1.1}
header .sub{font-size:9.5pt;color:#5C6980;margin-top:1.5mm}
.bar{display:flex;justify-content:center;gap:5mm;margin-top:3mm;flex-wrap:wrap}
.bar span{font-size:9pt;background:%s;border:.5pt solid %s;border-radius:2mm;padding:1.2mm 4mm}
.bar b{font-family:'Frank',serif;font-size:11pt;color:%s}
main{flex:1;column-count:3;column-gap:5mm;position:relative;z-index:1}
.sd{break-inside:avoid;margin-bottom:2.8mm}
.sd h2{font-family:'Frank',serif;font-weight:500;font-size:11pt;color:%s;
  border-bottom:.5pt solid %s;padding-bottom:.7mm;margin-bottom:1.2mm;
  display:flex;align-items:baseline;gap:1.5mm}
.sd h2 i{font-style:normal;font-family:'Asst',sans-serif;font-size:6.6pt;color:#8A93A3;
  margin-inline-start:auto;white-space:nowrap}
.v{display:flex;align-items:baseline;gap:1.2mm;font-size:8.2pt;padding:.5mm 0;
  border-bottom:.3pt dotted #C9CEd6}
.v .n{flex:0 0 6.5mm;color:%s;font-family:'Frank',serif;font-size:7.6pt}
.v .nm{flex:0 0 auto;max-width:26mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v .ln{flex:1;min-width:0;border-bottom:.4pt solid #AEB6C2;margin-inline-start:1mm;
  height:3.1mm;font-size:7.4pt;color:%s;text-align:center;white-space:nowrap;overflow:hidden}
.v.taken .ln{border-bottom-color:%s;font-weight:600}
footer{margin-top:3.5mm;padding-top:2.5mm;border-top:.8pt solid %s;
  text-align:center;font-size:8.2pt;color:#5C6980;line-height:1.5;position:relative;z-index:1}
footer b{color:%s}
footer .site{font-family:'Frank',serif;font-size:10.5pt;color:%s;margin-top:1.2mm}
</style></head><body>
<div class="pg">
  <div class="frame"></div><div class="bsd">בס״ד</div>
  <header>
    <div class="logo">%s</div>
    <h1>%s</h1>
    <div class="sub">%s</div>
    <div class="bar">
      <span>סה״כ <b>%d</b> כרכים</span>
      <span>לכרך <b>₪%d</b></span>
      <span>נלקחו <b>%d</b></span>
      <span>פנויים <b>%d</b></span>
    </div>
  </header>
  <main>%s</main>
  <footer>
    לרישום — למלא את השם בשורה שליד הכרך, או להירשם באתר.<br>
    התשלום דרך <b>נדרים פלוס</b> · מוסד <b>%s</b> · %s<br>
    <div class="site">%s</div>
  </footer>
</div></body></html>""" % (
        font_face("Frank", "frank-medium.woff2", 500),
        font_face("Frank", "frank-black.woff2", 900),
        font_face("Asst", "assistant-regular.woff2", 400),
        NAVY, GOLD, GOLD_LT, GOLD, GOLD,
        CREAM, GOLD_LT, NAVY,
        NAVY, GOLD_LT, GOLD, NAVY, GOLD, GOLD, NAVY, GOLD,
        logo_svg, d["title"], d["intro"].split(".")[0] + ".",
        len(vols), price, taken, len(vols) - taken,
        blocks, "8000707", d.get("priceNote", ""),
        "minyan.mokad.co.il")


def main():
    d = json.load(io.open(DATA, encoding="utf-8"))
    os.makedirs(DOCS, exist_ok=True)
    html = os.path.join(DOCS, "_shas-rishum.html")
    io.open(html, "w", encoding="utf-8").write(build_html(d))

    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    "--print-to-pdf=" + OUT, "file:///" + html.replace("\\", "/")],
                   check=False, capture_output=True)

    if not os.path.exists(OUT):
        print("הרינדור נכשל")
        return 1
    try:
        import fitz
        doc = fitz.open(OUT)
        pages = doc.page_count
        doc.close()
    except Exception:
        pages = "?"
    os.remove(html)
    print("docs/shas-rishum.pdf  ·  %s עמודים  ·  %d KB"
          % (pages, os.path.getsize(OUT) // 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
