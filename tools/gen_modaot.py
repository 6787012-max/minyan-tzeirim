# -*- coding: utf-8 -*-
"""gen_modaot.py — מייצר את מודעות המניין כ-PDF להדפסה וכ-PNG לוואטסאפ.

התוכן ב-moda/data.json והעיצוב ב-moda/tpl.html. הפרדה מכוונת: מודעה
עם שם של אדם נתלית על לוח בבית הכנסת, וטעות בשם היא מביכה — לכן
התוכן יושב בקובץ אחד שאפשר להגיה, ולא מפוזר בתוך תבנית.

הזמנים לא מוקלדים כאן. הם חושבו ב-js/luach.js ואומתו לדקה מול לוח
הזמנים המודפס בגיליון «מעלה» 244 — נץ, חצות, שקיעה וסוף זמן ק״ש
יצאו זהים. ההיסטים המקומיים נגזרו מאותו לוח: הדלקה = שקיעה פחות 35,
צאת = שקיעה ועוד 36, ר״ת = שקיעה ועוד 71.

שימוש:  python tools/gen_modaot.py
"""
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODA = os.path.join(ROOT, "moda")
OUT = os.path.join(MODA, "out")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    found = shutil.which("chrome") or shutil.which("msedge")
    if found:
        return found
    raise SystemExit("לא נמצא Chrome או Edge לרינדור")


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def inline_assets(html):
    """הטמעת הפונטים והלוגו כ-data URI.
    Chrome ב---headless לא טוען אמינות משאבי file:// יחסיים בזמן הדפסה,
    וזה נכשל בשקט: הדף יוצא עם פונט ברירת מחדל ובלי הסמל. הטמעה
    מראש הופכת את הרינדור לדטרמיניסטי."""
    def font(m):
        rel = m.group(1)
        p = os.path.normpath(os.path.join(MODA, rel))
        if not os.path.exists(p):
            return m.group(0)
        b = base64.b64encode(io.open(p, "rb").read()).decode()
        return "url('data:font/woff2;base64,%s') format('woff2')" % b
    html = re.sub(r"url\('([^']+\.woff2)'\) format\('woff2'\)", font, html)

    def img(m):
        rel = m.group(1)
        p = os.path.normpath(os.path.join(MODA, rel))
        if not os.path.exists(p):
            return m.group(0)
        b = base64.b64encode(io.open(p, "rb").read()).decode()
        mime = "image/svg+xml" if p.endswith(".svg") else "image/png"
        return 'src="data:%s;base64,%s"' % (mime, b)
    return re.sub(r'src="([^"]+\.(?:svg|png))"', img, html)


# ── בניית הגוף לכל סוג מודעה ────────────────────────────────────────

def body_text(m):
    h = ['<div class="eyebrow">%s</div>' % esc(m.get("eyebrow", ""))]
    cls = " long" if len(m.get("title", "")) > 26 else ""
    h.append('<h1 class="%s">%s</h1>' % (cls.strip(), esc(m["title"])))
    if m.get("lead"):
        h.append('<div class="lead">%s</div>' % esc(m["lead"]))
    h.append('<div class="body">%s</div>' %
             "".join("<p>%s</p>" % esc(p) for p in m.get("body", [])))
    if m.get("when"):
        h.append('<div class="when">%s</div>' % esc(m["when"]))
    return "".join(h)


COLS = [("candles", "הדלקת נרות"), ("sunrise", "נץ"), ("shema", "סו״ז ק״ש"),
        ("chatzot", "חצות"), ("sunset", "שקיעה"), ("tzet", "צאת"), ("rt", "ר״ת")]


def body_zmanim(z):
    h = ['<div class="eyebrow">לוח זמנים</div>',
         '<h1>%s</h1>' % esc(z["title"])]
    if z.get("note"):
        h.append('<div class="z-note">%s</div>' % esc(z["note"]))

    head = "".join("<th>%s</th>" % esc(t) for _, t in COLS)
    rows = []
    for d in z["days"]:
        hl = " class=\"hl\"" if "ראש השנה" in d["label"] else ""
        cells = []
        for key, _ in COLS:
            v = d.get(key)
            if key == "candles" and not v and d.get("candlesNote"):
                cells.append('<td style="font-size:9.5pt;color:#8A5A16">%s</td>'
                             % esc(d["candlesNote"]))
                continue
            cells.append('<td>%s</td>' % (
                '<span class="num">%s</span>' % esc(v) if v else '<span class="dash">—</span>'))
        rows.append('<tr%s><td class="day"><b>%s</b><span>%s</span></td>%s</tr>'
                    % (hl, esc(d["label"]), esc(d["date"]), "".join(cells)))

    h.append('<table><thead><tr><th>היום</th>%s</tr></thead><tbody>%s</tbody></table>'
             % (head, "".join(rows)))
    h.append('<div class="foot-note">הזמנים לפי מנהג הלוח המקומי — הדלקה 35 דקות '
             'לפני השקיעה, צאת הכוכבים 36 דקות אחריה, רבנו תם 71 דקות. '
             'לכל המאוחר יש לקבל תוספת שבת ויום טוב לפני השקיעה.</div>')
    return "".join(h)


def render(name, mid_html, slogan=None):
    tpl = io.open(os.path.join(MODA, "tpl.html"), encoding="utf-8").read()
    html = tpl.replace('<div class="mid" id="mid"></div>',
                       '<div class="mid" id="mid">%s</div>' % mid_html)
    if slogan:
        html = html.replace('id="slogan">שנה טובה ומבורכת<',
                            'id="slogan">%s<' % esc(slogan))
    html = inline_assets(html)

    src = os.path.join(OUT, name + ".html")
    io.open(src, "w", encoding="utf-8").write(html)

    url = "file:///" + src.replace("\\", "/")
    base = [chrome(), "--headless=new", "--disable-gpu", "--no-sandbox",
            "--force-device-scale-factor=2", "--hide-scrollbars"]

    pdf = os.path.join(OUT, name + ".pdf")
    subprocess.run(base + ["--print-to-pdf=" + pdf, "--no-pdf-header-footer", url],
                   check=False, timeout=180,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    png = os.path.join(OUT, name + ".png")
    subprocess.run(base + ["--screenshot=" + png, "--window-size=794,1123", url],
                   check=False, timeout=180,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ok = []
    for p in (pdf, png):
        ok.append("%s %d KB" % (os.path.basename(p), os.path.getsize(p) // 1024)
                  if os.path.exists(p) and os.path.getsize(p) > 3000 else
                  "%s נכשל" % os.path.basename(p))
    return ok


def main():
    os.makedirs(OUT, exist_ok=True)
    d = json.load(io.open(os.path.join(MODA, "data.json"), encoding="utf-8"))

    todos = []
    for m in d["modaot"]:
        print(("  " + m["id"]).ljust(20), " | ".join(render(m["id"], body_text(m))))
        if m.get("_todo"):
            todos.append((m["id"], m["_todo"]))

    z = d["zmanim"]
    print("  zmanim".ljust(20), " | ".join(
        render("zmanim", body_zmanim(z), "שנה טובה ומבורכת · כתיבה וחתימה טובה")))
    if z.get("_todo"):
        todos.append(("zmanim", z["_todo"]))

    if todos:
        print("\nחסר לפני הדפסה:")
        for i, t in todos:
            print("  ·", i, "—", t)
    return 0


if __name__ == "__main__":
    sys.exit(main())
