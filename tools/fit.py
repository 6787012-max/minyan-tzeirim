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
SAFE = 78               # מרווח ביטחון — ראה הערה ב-measure()
PROBE = """
<script>document.addEventListener('DOMContentLoaded',function(){
  /* .mid הוא flex:1 — ה-scrollHeight שלו הוא מה שהוקצה לו, לא מה
     שהוא צריך. מדידה נאיבית שלו תמיד תחזיר את אותו מספר, וזה בדיוק
     מה שגרם לסקלר להיראות כאילו אין לו השפעה. סוכמים את הילדים. */
  var p=document.querySelector('.panel');
  var need=0;
  [].forEach.call(p.children,function(c){
    if (c.classList.contains('pc')) return;          /* פינות — absolute */
    if (c.classList.contains('mid')) {
      var cs=getComputedStyle(c);
      need+=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom);
      [].forEach.call(c.children,function(k){
        var ks=getComputedStyle(k);
        need+=k.getBoundingClientRect().height
             +parseFloat(ks.marginTop)+parseFloat(ks.marginBottom);
      });
    } else {
      need+=c.getBoundingClientRect().height;
    }
  });
  var ps=getComputedStyle(p);
  need+=parseFloat(ps.paddingTop)+parseFloat(ps.paddingBottom);
  /* המגבלה היא גובה העמוד ולא clientHeight של הפנל: כשהפנל אינו
     absolute הוא גדל עם התוכן, ואז המדידה תמיד מדווחת «נכנס». */
  document.title='M'+Math.round(need)+'/'+Math.round(
    p.classList.contains('inner') ? 1123 - 0
      : p.clientHeight+parseFloat(ps.paddingTop)+parseFloat(ps.paddingBottom));
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


def fit_one(name, lo=0.52, hi=1.0, rounds=9):
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
    names = sys.argv[1:] or ["sparka", "reich-glazer", "simons", "kiddush", "zmanim"]
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
