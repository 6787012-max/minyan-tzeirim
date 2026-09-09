# -*- coding: utf-8 -*-
"""gen_tfila_sign.py — מודעת זמנים גדולה: סליחות ושחרית, לתלייה על לוח.

שונה בכוונה משאר המודעות ב-moda/data.json: כאן אין פרוזה ואין eyebrow
ארוך — רק שם התפילה והשעה, בגודל שנקרא מקצה החדר. משתמש באותה תבנית
(moda/tpl.html) ובאותו pipeline רינדור (moda/gen_modaot.render) כדי
שהמסגרת, הלוגו והרקע יהיו זהים לשאר המודעות של המניין.

שימוש:  python tools/gen_tfila_sign.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_modaot as G

MID = """
<style>
#mid { justify-content:center; }
/* margin-bottom נדיב בכוונה: ה-.slogan שבתחתית העמוד הוא
   position:absolute בצבע כהה שמיועד לרקע הקלף הבהיר. אם ה-plaque
   הכהה מגיע עד לשם, הכיתוב נבלע לתוך רקע כהה ונהיה בלתי קריא —
   נבדק בפועל בניסיון עם padding גדול יותר. */
.tf-plaque { padding:18mm 10mm 20mm; margin-bottom:28mm; }
.tf-row { display:flex; align-items:baseline; justify-content:center; gap:9mm; margin:19mm 0; }
.tf-name {
  font-family:'Drug','Shofar',serif; font-weight:700; font-size:5.8em;
  color:#EFE4CC;
}
.tf-time {
  font-family:'Num',sans-serif; font-weight:900; font-size:11.2em; line-height:1;
  direction:ltr; unicode-bidi:isolate;
  background:linear-gradient(180deg, #F6E7B8 0%, #E3C883 40%, #B08D3E 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.tf-sep {
  height:1.8px; width:72%; margin:0 auto;
  background:linear-gradient(90deg, transparent, rgba(227,200,131,.6), transparent);
}
</style>
<div class="plaque tf-plaque">
  <div class="eyebrow">בתקופת הסליחות · בכל בוקר</div>
  <div class="tf-row"><span class="tf-name">סליחות</span><span class="tf-time">6:20</span></div>
  <div class="tf-sep"></div>
  <div class="tf-row"><span class="tf-name">שחרית</span><span class="tf-time">6:40</span></div>
</div>
"""


def main():
    os.makedirs(G.OUT, exist_ok=True)
    ok = G.render("tfila-boker", MID, slogan="בואו נפתח יחד את היום", alt_font=True)
    print("  tfila-boker".ljust(20), " | ".join(ok))


if __name__ == "__main__":
    sys.exit(main())
