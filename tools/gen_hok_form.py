# -*- coding: utf-8 -*-
"""מכין את נכסי טופס ההוראת־קבע הבנקאית (מס״ב) לאתר.

מייצר:
  img/hok-form.png      — הטופס המקורי של משגב כתמונה (רקע למילוי הדיגיטלי)
  img/hok-guide.png     — דף ההנחיות של נדרים פלוס
  data/hok.json         — מפת השדות באחוזים מגודל הדף + פרטי המוסד

למה תמונת רקע ולא שחזור הטופס: זה טופס הרשאה שנשלח לבנק. שחזור שלו בקוד
מייצר מסמך שהבנק עלול לפסול. המילוי הדיגיטלי מציב טקסט *מעל* הסריקה
של הטופס המקורי, כך שמה שיוצא במדפסת הוא הטופס התקני עצמו.

מקור: מייל "שרות מס״ב מסלול ג׳" מנדרים פלוס, 30/08/2026. ה-PDF-ים ב-_masav/.
הרצה:  python tools/gen_hok_form.py
"""
import io
import json
import os

import fitz
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "_masav")
IMG = os.path.join(HERE, "img")
DATA = os.path.join(HERE, "data")

FORM_PDF = os.path.join(SRC, "טופס הוראת קבע.pdf")
GUIDE_PDF = os.path.join(SRC, "איך מקימים הוק - מסלול ג.pdf")

# ── מפת השדות ────────────────────────────────────────────────────────────
# קואורדינטות ב-pt על עמוד A4 של הטופס (595.28 x 841.89), נמדדו מתוך
# שכבת הטקסט של ה-PDF. x0/x1 הם קצות הקו המקווקו, y הוא קו הבסיס.
PAGE_W, PAGE_H = 595.28, 841.89

FIELDS = [
    # id,            x0,    x1,     y,    align, size, label
    # y הוא קו הבסיס של השורה (y0 של שורת הנקודות ב-PDF + ~8pt)
    ("name",        297,   494,  161.0, "center", 10, "שם פרטי ומשפחה"),
    ("zeout",       169,   274,  161.0, "center", 10, "ת.ז."),
    ("phone",        13,   110,  161.0, "center", 10, "טלפון"),
    ("address",     252,   521,  192.5, "center", 10, "כתובת מלאה"),
    ("email",        13,   225,  192.5, "center", 9, "מייל"),
    ("avour",        13,   186,  254.5, "center", 9, "התרומה מיועדת עבור"),
    ("notes",        13,   213,  274.5, "center", 9, "הערות"),
    ("amount",      495,   543,  290.7, "center", 11, "סכום לתשלום בכל חודש"),
    ("payments",    392,   441,  284.7, "center", 11, "מספר פעמים לחיוב"),
    # החלק שנשלח לבנק
    ("bankName",    455,   540,  467.0, "center", 10, "שם הבנק"),
    ("branchName",  334,   408,  467.0, "center", 10, "שם הסניף"),
    ("holder",      258,   498,  566.0, "center", 10, "שם בעלי החשבון"),
    ("holderId",    120,   172,  566.0, "center", 10, "מס׳ זהות / ח.פ."),
    ("date",         33,   142,  795.8, "center", 10, "תאריך"),
]

# תיבות סימון: id, x מרכז, y מרכז — נמדדו מהריבועים הווקטוריים שב-PDF (7x7pt)
CHECKS = [
    ("day1",  345.6, 279.4), ("day5",  316.7, 278.9), ("day10", 291.2, 278.9),
    ("day15", 345.3, 293.6), ("day20", 316.5, 293.1), ("day28", 290.9, 293.1),
    ("noLimit", 432.5, 296.1),
]

# תאי הטבלה של פרטי החשבון (בנק / סניף / מספר חשבון) — תיבה אחת לכל שדה
BOXES = [
    ("bankNo",   17.0,  40.0, 437.0, 458.0),
    ("branchNo", 43.0,  90.0, 437.0, 458.0),
    ("account", 100.0, 205.0, 437.0, 458.0),
]


def pct(v, total):
    return round(v / total * 100, 3)


def main():
    os.makedirs(IMG, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)

    # ── תמונות ──
    # הטופס הוא קו-ארט: פלטה של 4 גוונים חותכת אותו מ-240KB ל-36KB בלי הבדל נראה.
    if os.path.exists(FORM_PDF):
        doc = fitz.open(FORM_PDF)
        pix = doc[0].get_pixmap(dpi=150)
        path = os.path.join(IMG, "hok-form.png")
        pix.save(path)
        doc.close()
        im = Image.open(path).convert("L")
        im = im.point(lambda v: 0 if v < 110 else (128 if v < 205 else 255))
        im.convert("P", palette=Image.ADAPTIVE, colors=4).save(path, optimize=True)
        print("%-16s %4dx%-5d %4d KB" % ("hok-form.png", pix.width, pix.height,
                                         os.path.getsize(path) // 1024))

    # דף ההנחיות צבעוני — JPEG
    if os.path.exists(GUIDE_PDF):
        doc = fitz.open(GUIDE_PDF)
        pix = doc[0].get_pixmap(dpi=130)
        tmp = os.path.join(IMG, "_guide_tmp.png")
        pix.save(tmp)
        doc.close()
        gi = Image.open(tmp).convert("RGB")
        gi.thumbnail((1000, 1600), Image.LANCZOS)
        out = os.path.join(IMG, "hok-guide.jpg")
        gi.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        os.remove(tmp)
        print("%-16s %4dx%-5d %4d KB" % ("hok-guide.jpg", gi.width, gi.height,
                                         os.path.getsize(out) // 1024))

    # ── מפת השדות ──
    data = {
        "_": "נוצר ע\"י tools/gen_hok_form.py — אין לערוך ביד.",
        "page": {"w": PAGE_W, "h": PAGE_H},
        "mosad": {
            "masavCode": "47859",
            "masavName": "משגב",
            "mosadName": "א.ח- מנין הצעירים מעלה עמוס",
            "nedarimMosad": "8000707",
            "masavMail": "m089798583@gmail.com",
            "masavFax": "08-9798585",
        },
        "days": [1, 5, 10, 15, 20, 28],
        "fields": [
            {"id": i, "x": pct(x0, PAGE_W), "w": pct(x1 - x0, PAGE_W),
             "y": pct(y, PAGE_H), "align": a, "size": s, "label": lb}
            for (i, x0, x1, y, a, s, lb) in FIELDS
        ],
        "checks": [
            {"id": i, "x": pct(x, PAGE_W), "y": pct(y, PAGE_H)}
            for (i, x, y) in CHECKS
        ],
        "boxes": [
            {"id": i, "x": pct(x0, PAGE_W), "w": pct(x1 - x0, PAGE_W),
             "y": pct(y0, PAGE_H), "h": pct(y1 - y0, PAGE_H)}
            for (i, x0, x1, y0, y1) in BOXES
        ],
    }
    p = os.path.join(DATA, "hok.json")
    with io.open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("data/hok.json  %d שדות · %d סימונים · %d תאים"
          % (len(FIELDS), len(CHECKS), len(BOXES)))


if __name__ == "__main__":
    main()
