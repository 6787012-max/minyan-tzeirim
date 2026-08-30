# -*- coding: utf-8 -*-
"""מייצר את data/shabbat.json — טבלת פרשיות ומועדים סטטית.

למה טבלה ולא חישוב בדפדפן: חישוב הפרשיות תלוי בסוג השנה ובמועדים שנופלים בשבת,
וזה מקום קלאסי לשגיאה שקטה. במקום זה אנחנו נשענים על ספריית `pyluach` המקומית
ומקפיאים את התוצאה. התאריך העברי עצמו *כן* מחושב בדפדפן (js/luach.js) — הוא
אריתמטיקה טהורה ואומת מול הספרייה יום-יום.

הרצה:  python tools/gen_luach.py [שנת_סיום]
"""
import datetime
import io
import json
import os
import sys

from pyluach import dates, parshios

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "data", "shabbat.json")

START = datetime.date(datetime.date.today().year, 1, 1)
END = datetime.date(int(sys.argv[1]) if len(sys.argv) > 1 else START.year + 20, 12, 31)

# כתיב מלא, כמו שנהוג בלוחות בארץ
SPELL = {
    "נצבים": "ניצבים",
    "כי תבא": "כי תבוא",
    "חקת": "חוקת",
}


def parsha(hd):
    p = parshios.getparsha_string(hd, israel=True, hebrew=True)
    if not p:
        return None
    parts = [SPELL.get(x.strip(), x.strip()) for x in p.split(",")]
    return "־".join(parts)          # מקף עברי לפרשות מחוברות


def holiday(hd):
    h = hd.holiday(israel=True, hebrew=True, prefix_day=True)
    if h == "שמיני עצרת":           # בארץ זה גם שמחת תורה
        return "שמיני עצרת · שמחת תורה"
    return h


def main():
    shabbat, days = {}, {}
    d = START
    while d <= END:
        hd = dates.HebrewDate.from_pydate(d)
        h = holiday(hd)
        if h:
            days[d.isoformat()] = h
        if d.weekday() == 5:                       # שבת
            e = {}
            p = parsha(hd)
            if p:
                e["p"] = p
            if h:
                e["h"] = h
            shabbat[d.isoformat()] = e
        d += datetime.timedelta(days=1)

    data = {
        "_": "נוצר אוטומטית ע\"י tools/gen_luach.py (pyluach). אין לערוך ביד.",
        "from": START.isoformat(),
        "to": END.isoformat(),
        "shabbat": shabbat,
        "days": days,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("שבתות: %d · ימים מיוחדים: %d · %d KB"
          % (len(shabbat), len(days), os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
