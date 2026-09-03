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

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "moda")
                if False else "")

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


def svg_uri(svg):
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode()


def lib(name, fallback=None):
    """עיטור מספריית העיצוב של יוסף (Z:\עיצוב_ויצירה), שהועתקה
    ל-moda/orn-lib. עדיף על מה שאני מצייר: אלה נכסים שכבר נבחרו
    לשימוש במוסד, והם עקביים עם שאר החומרים שיוצאים משם.
    fallback הוא הציור המקומי, למקרה שהקובץ חסר."""
    p = os.path.join(MODA, "orn-lib", name + ".svg")
    if os.path.exists(p):
        try:
            return io.open(p, encoding="utf-8").read()
        except Exception:
            pass
    return fallback


def inject_ornaments(html):
    """כל העיטורים כ-data URI. Chrome ב---headless לא טוען אמינות
    קבצים יחסיים בהדפסה, ו-SVG חיצוני נעלם בלי שגיאה.
    כל עיטור ב-<img> נפרד, ולכן מזהי הגרדיאנט שחוזרים בכמה מהם
    (url(#cg), url(#ag)) לא מתנגשים."""
    sys.path.insert(0, MODA)
    import orn
    import arch
    return (html
            .replace('src="ARCH"', 'src="%s"' % svg_uri(arch.arch()))
            .replace('src="COLUMN"', 'src="%s"' % svg_uri(arch.column()))
            .replace('src="BASEORN"', 'src="%s"' % svg_uri(arch.base_orn()))
            .replace('src="CORNER"', 'src="%s"'
                     % svg_uri(lib("corner_filigree", orn.corner())))
            .replace('src="RULE"', 'src="%s"'
                     % svg_uri(lib("title_flourish", orn.rule_small())))
            .replace('src="DIVIDER"', 'src="%s"'
                     % svg_uri(lib("divider_classical", orn.divider()))))


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

    def ttf(m):
        p = os.path.normpath(os.path.join(MODA, m.group(1)))
        if not os.path.exists(p):
            return m.group(0)
        b = base64.b64encode(io.open(p, "rb").read()).decode()
        return "url('data:font/ttf;base64,%s') format('truetype')" % b
    html = re.sub(r"url\('([^']+\.ttf)'\) format\('truetype'\)", ttf, html)

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

def crest(kind):
    """העיטור שבראש הלוחית. תמיד בגרסת on_dark — הלוחית כחולה."""
    sys.path.insert(0, MODA)
    import orn
    if kind == "אירוע":
        return ('<img class="crest" src="%s" style="width:26mm">'
                % svg_uri(orn.on_dark(orn.pomegranate())))
    return ('<img class="crest" src="%s" style="width:40mm">'
            % svg_uri(orn.on_dark(orn.crown())))


def body_text(m):
    sys.path.insert(0, MODA)
    import orn
    n = len(m.get("title", ""))
    cls = " long" if n > 30 else (" mid-len" if n > 20 else "")

    plaque = [crest(m.get("kind", "")),
              '<div class="eyebrow">%s</div>' % esc(m.get("eyebrow", "")),
              '<h1 class="%s">%s</h1>' % (cls.strip(), esc(m["title"]))]
    if m.get("lead"):
        plaque.append('<div class="lead">%s</div>' % esc(m["lead"]))

    h = ['<div class="plaque">%s</div>' % "".join(plaque)]

    paras = m.get("body", [])
    h.append('<div class="body">%s</div>' % "".join(
        '<p%s>%s</p>' % (' class="strong"' if i == 0 and len(paras) > 1 else '', esc(p))
        for i, p in enumerate(paras)))
    if m.get("when"):
        h.append('<div class="when">%s</div>' % esc(m["when"]))
    if m.get("sign"):
        h.append('<div class="sign">%s</div>' % esc(m["sign"]))
    return "".join(h)


def zblock(b):
    """בלוק של יום אחד. המבנה לקוח מלוח ראש השנה תשפ״ו של בית הכנסת
    המרכזי — כותרת יום ומתחתיה שורות «שם הזמן … שעה». זה הפורמט
    שהקהילה כבר קוראת, ואין סיבה להמציא אחר."""
    rows = []
    for r in b["rows"]:
        label, val = r[0], r[1]
        kind = r[2] if len(r) > 2 else ""
        if kind == "note":
            v = '<i class="z-nt">%s</i>' % esc(val)
        elif val == "—":
            # זמן תפילה שטרם נקבע: קו למילוי ביד. מקף היה נקרא
            # כאילו הוחלט שאין תפילה.
            v = '<i class="z-fill"></i>'
        else:
            v = '<b class="z-v%s">%s</b>' % (" big" if kind == "big" else "", esc(val))
        rows.append('<div class="z-row%s"><span>%s</span>%s</div>'
                    % (" em" if kind == "big" else "", esc(label), v))
    warn = ('<div class="z-warn">%s</div>' % esc(b["warn"])) if b.get("warn") else ""
    return ('<div class="zb%s"><div class="zb-h">%s<span>%s</span></div>%s%s</div>'
            % (" hl" if b.get("hl") else "", esc(b["head"]), esc(b["date"]),
               "".join(rows), warn))


def body_zmanim(z):
    sys.path.insert(0, MODA)
    import orn
    h = ['<div class="plaque tight">'
         '<img class="crest" src="%s" style="width:30mm">'
         '<h1 class="zt">%s <em>%s</em></h1>'
         '<div class="lead">%s</div></div>'
         % (svg_uri(orn.on_dark(orn.shofar())), esc(z["title"]),
            esc(z.get("year", "")), esc(z.get("sub", "")))]
    if z.get("note"):
        h.append('<div class="z-note">%s</div>' % esc(z["note"]))
    h.append('<div class="z-grid">%s</div>' % "".join(zblock(b) for b in z["blocks"]))
    if z.get("foot"):
        h.append('<div class="foot-note">%s</div>' % esc(z["foot"]))
    return "".join(h)


def render(name, mid_html, slogan=None):
    tpl = io.open(os.path.join(MODA, "tpl.html"), encoding="utf-8").read()
    html = tpl.replace('<div class="mid" id="mid"></div>',
                       '<div class="mid" id="mid">%s</div>' % mid_html)
    if slogan:
        html = html.replace('id="slogan">שנה טובה ומבורכת<',
                            'id="slogan">%s<' % esc(slogan))
    html = inject_ornaments(html)
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
