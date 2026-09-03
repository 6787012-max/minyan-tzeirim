# -*- coding: utf-8 -*-
"""storage.py — העלאת תמונות ל-Supabase Storage (bucket ציבורי `news`).

הקבצים המצורפים למייל לא יכולים להישאר במייל: דף ציבורי לא יכול
למשוך מתיבת הדואר של יוסף. לכן כל תמונה נשמרת פעם אחת בדלי ציבורי,
והלוח מפנה אליה בכתובת קבועה.

שם הקובץ נגזר מ-hash של התוכן. אותה מודעה שנשלחת פעמיים — וזה קורה
הרבה בקבוצה — מקבלת את אותה כתובת ולא תופסת מקום פעמיים.
"""
import hashlib
import os
import ssl
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sb  # noqa: E402

BUCKET = "news"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

EXT = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
       "image/webp": "webp", "image/gif": "gif"}


def upload(data, mime, prefix=""):
    """מחזיר (url, שגיאה). לא זורק — תמונה שנכשלה לא מפילה הודעה."""
    c = sb.creds()
    ext = EXT.get(mime)
    if not ext:
        return "", "mime:" + str(mime)
    if len(data) > 5 * 1024 * 1024:
        return "", "too-large"

    h = hashlib.sha256(data).hexdigest()[:24]
    path = "%s%s.%s" % (prefix, h, ext)
    base = "https://%s.supabase.co/storage/v1" % c["ref"]
    url = "%s/object/public/%s/%s" % (base, BUCKET, path)

    req = urllib.request.Request(
        "%s/object/%s/%s" % (base, BUCKET, path), data=data, method="POST")
    req.add_header("Authorization", "Bearer " + c["service"])
    req.add_header("apikey", c["service"])
    req.add_header("Content-Type", mime)
    req.add_header("x-upsert", "true")
    try:
        urllib.request.urlopen(req, context=CTX, timeout=180)
        return url, ""
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        # 409 = הקובץ כבר קיים. עם hash בשם זה בדיוק אותו קובץ.
        if e.code == 409 or "Duplicate" in body:
            return url, ""
        return "", "upload %s: %s" % (e.code, body[:140])
    except Exception as e:
        return "", str(e)[:140]
