# -*- coding: utf-8 -*-
"""ממיר את גופני האתר ל-WOFF2 מצומצם ומכניס אותם ל-fonts.

למה לא Google Fonts: נטפרי חוסם דומיינים שלא אושרו, ואתר שתלוי בגופן חיצוני
נראה שבור אצל חלק מהמשתמשים. הגופנים כאן חופשיים לשימוש ולהפצה
(FrankRuhlLibre ו-Assistant ברישיון OFL, DrugulinCLM של Culmus ברישיון חופשי),
ולכן הם נארזים בתוך האתר.

הצמצום: עברית + ניקוד + פיסוק + ספרות + לטינית בסיסית. זה חותך ~85% מהמשקל.

הרצה:  python tools/gen_fonts.py
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(HERE, "fonts")
WIN = r"C:\Windows\Fonts"

FONTS = [
    ("FrankRuhlLibre-Medium.ttf", "frank-medium.woff2"),
    ("FrankRuhlLibre-Black.ttf",  "frank-black.woff2"),
    ("Assistant-Regular.ttf",     "assistant-regular.woff2"),
    ("Assistant-SemiBold.ttf",    "assistant-semibold.woff2"),
    ("drugulinclm-bold-webfont.ttf", "drugulin-bold.woff2"),
]

# עברית (כולל ניקוד וטעמים), פיסוק עברי, ספרות, לטינית, וסימנים שבשימוש
UNICODES = (
    "U+0020-007E,"      # לטינית בסיסית וספרות
    "U+00A0,U+00AB,U+00BB,"
    "U+0590-05FF,"      # עברית מלאה
    "U+200E,U+200F,U+2013,U+2014,U+2018-201D,U+2022,U+2026,"
    "U+05F3,U+05F4,"    # גרש וגרשיים
    "U+00B7,U+2219,U+00D7"
)


def main():
    os.makedirs(DST, exist_ok=True)
    total = 0
    for src, out in FONTS:
        p = os.path.join(WIN, src)
        if not os.path.exists(p):
            print("חסר: %s — דלג" % src)
            continue
        dst = os.path.join(DST, out)
        args = [p, "--unicodes=" + UNICODES, "--layout-features=*",
                "--flavor=woff2", "--output-file=" + dst,
                "--no-hinting", "--desubroutinize"]
        subset.main(args)
        before = os.path.getsize(p) // 1024
        after = os.path.getsize(dst) // 1024
        total += after
        print("%-32s %4dKB -> %3dKB" % (out, before, after))
    print("סה\"כ גופנים: %d KB" % total)


if __name__ == "__main__":
    main()
