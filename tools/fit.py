# -*- coding: utf-8 -*-
"""fit.py — מודד את גובה המודעות ומכייל אותן לגובה עמוד.

הכיול נעשה עד היום בעין: משנים גדלים, מרנדרים, מסתכלים, ושוב.
זה בזבז סבבים שלמים והשאיר מודעות שגלשו בלי שאיש שם לב עד ההדפסה.
כאן Chrome מודד את הגובה בפועל, וסקלר CSS יחיד מתכווץ בצעדים עד
שהתוכן נכנס — אותו מנגנון לכל חמש המודעות, בלי לכוונן כל כלל בנפרד.

הסקלר הוא font-size על .panel, וכל המידות שבתוכו ב-em/pt נגזרות
ממנו. לכן ירידה אחת מקטינה את הכל באופן פרופורציוני, ולא מעוותת
את היחסים בין הכותרת לגוף.
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_modaot as g  # noqa: E402

PAGE_PX = 1123          # A4 לאורך ב-96dpi
SAFE = 0                # ה-body בגובה 297mm קבוע, ולכן scrollHeight
                        # לעולם אינו קטן מ-1123; כל תוספת הופכת כל
                        # מודעה ל«גולשת». הגלישה מזוהה מעצם החריגה.
PROBE = """
<script>window.addEventListener('load',function(){
  /* מדידה ישירה של גובה המסמך, ולא סכימה של הילדים.
     הסכימה פספסה גלישה אמיתית: הלוגו הנוסף ב-.bot הוסיף גובה
     שלא נספר, ו-zmanim דווח «נכנס» ב-1123 בעוד שהוא גלש ל-1402.
     window.load ולא DOMContentLoaded — ה-SVG-ים ב-data URI טרם
     נמדדו בשלב הקודם. */
  var need = Math.max(document.body.scrollHeight,
                      document.documentElement.scrollHeight);
  /* גובה המסמך לבדו אינו מספיק: overflow:hidden על ה-body חותך את
     מה שחורג, וה-scrollHeight נשאר 1123 בעוד ש«גוט שבת» כבר יצא
     מהעמוד. הסגלגל שבמסגרת ממורכז סביב 1055 והשורה חייבת להיגמר
     לפניו — 1108 הוא הקצה שנמדד כבטוח. */
  /* מיקום «גוט שבת» אינו נשלט ע"י הסקלר: .bot מיושר לתחתית ה-flex
     ונשאר במקומו בכל גודל. הקטנת הסקלר בגללו רק כיווצה את הטקסט
     בלי להזיז דבר, ולכן הוא ממוקם absolute בתבנית ולא נבדק כאן. */
  /* «גוט שבת» מקובע absolute ולכן אינו תלוי בסקלר, אבל החתימה
     שמעליו כן: היא בזרימת .mid, ובמודעות הצפופות היא ירדה עד 1105
     ונחתה על הסגלגל. 1030 הוא הקצה שמעליו היא בטוחה. */
  var sg = document.querySelector('.sign');
  if (sg) {
    var gb = sg.getBoundingClientRect().bottom;
    if (gb > 1030) need = Math.max(need, 1123 + (gb - 1030));
  }
  document.title = 'M' + Math.round(need) + '/' + 1123;
});</script>
"""


def measure(path):
    """מחזיר (גובה שהתוכן דורש, גובה הפנל בפועל)."""
    src = io.open(path, encoding="utf-8").read()
    probe = src.replace("</body>", PROBE + "</body>")
    tmp = os.path.join(g.OUT, "_fit.html")
    io.open(tmp, "w", encoding="utf-8").write(probe)
    r = subprocess.run(
        [g.chrome(), "--headless=new", "--disable-gpu", "--no-sandbox",
         "--virtual-time-budget=3500", "--window-size=794,1123", "--dump-dom",
         "file:///" + tmp.replace("\\", "/")],
        capture_output=True, timeout=180)
    os.remove(tmp)
    m = re.search(r"<title>M(\d+)/(\d+)</title>",
                  r.stdout.decode("utf-8", "replace"))
    if not m:
        return (0, 0)
    return int(m.group(1)) + SAFE, int(m.group(2))


def scaled(html, factor):
    """מזריק סקלר יחיד. 1.0 = ללא שינוי."""
    tag = "\n.panel { font-size:%.4fem; }\n</style>" % factor
    return html.replace("</style>", tag, 1)


def fit_one(name, lo=0.38, hi=1.0, rounds=10):
    """חיפוש בינארי על הסקלר. שבעה סבבים מספיקים לדיוק של פחות מאחוז,
    וזה פחות מסבב ידני אחד."""
    src = os.path.join(g.OUT, name + ".html")
    base = io.open(src, encoding="utf-8").read()

    need, avail = measure(src)
    if need <= avail:
        return 1.0, need, avail

    best = lo
    for _ in range(rounds):
        mid = (lo + hi) / 2
        io.open(src, "w", encoding="utf-8").write(scaled(base, mid))
        need, avail = measure(src)
        if need <= avail:
            best = mid
            lo = mid
        else:
            hi = mid
    io.open(src, "w", encoding="utf-8").write(scaled(base, best))
    need, avail = measure(src)
    return best, need, avail


def main():
    names = sys.argv[1:] or ["sparka", "reich-glazer", "simons",
                             "kiddush", "magbit", "klali",
                             "klali-zecharia", "klali-kehilati",
                             "klali-drug", "klali-both",
                             "dafyomi", "zmanim"]
    out = {}
    for n in names:
        f, need, avail = fit_one(n)
        out[n] = f
        print("  %-13s סקלר %.3f  → %d/%d %s"
              % (n, f, need, avail, "נכנס" if need <= avail else "עדיין גולש"))
        # רינדור מחדש מה-HTML המכויל
        src = os.path.join(g.OUT, n + ".html")
        url = "file:///" + src.replace("\\", "/")
        base = [g.chrome(), "--headless=new", "--disable-gpu", "--no-sandbox",
                "--force-device-scale-factor=2", "--hide-scrollbars"]
        subprocess.run(base + ["--print-to-pdf=" + os.path.join(g.OUT, n + ".pdf"),
                               "--no-pdf-header-footer", url],
                       check=False, timeout=180,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(base + ["--screenshot=" + os.path.join(g.OUT, n + ".png"),
                               "--window-size=794,1123", url],
                       check=False, timeout=180,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return 0


if __name__ == "__main__":
    sys.exit(main())
