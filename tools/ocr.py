# -*- coding: utf-8 -*-
"""ocr.py — חילוץ טקסט עברי מתמונה, דרך ה-OCR של גוגל דרייב.

במחשב הזה אין tesseract ואי אפשר להוריד אותו (נטפרי). דרייב עושה OCR
בעצמו כשמעלים תמונה כמסמך גוגל עם ocrLanguage=iw, והאיכות בעברית
טובה בהרבה מכל מה שאפשר להריץ מקומית — כולל טקסט על רקע גרפי,
שזה בדיוק מה שמודעה סרוקה היא.

כל קובץ נמחק מהדרייב מיד אחרי ההורדה, אחרת מצטברות שם מאות טיוטות.
מבוסס על הצינור המאומת ב-C:\\projects\\gemach-kesafim.
"""
import io
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

CLASPRC = os.path.join(os.path.expanduser("~"), ".clasprc.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

_token_cache = {"access": None}


def _refresh_token():
    """clasp שומר refresh_token; access_token שלו פג תוך שעה."""
    d = json.load(io.open(CLASPRC, encoding="utf-8"))
    tok = d.get("tokens", {}).get("default") or d.get("token") or d
    body = urllib.parse.urlencode({
        "client_id": tok["client_id"] if "client_id" in tok else d.get("oauth2ClientSettings", {}).get("clientId"),
        "client_secret": tok["client_secret"] if "client_secret" in tok else d.get("oauth2ClientSettings", {}).get("clientSecret"),
        "refresh_token": tok["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", UA)
    r = urllib.request.urlopen(req, context=CTX, timeout=60)
    return json.loads(r.read())["access_token"]


def token():
    if not _token_cache["access"]:
        _token_cache["access"] = _refresh_token()
    return _token_cache["access"]


def _multipart(meta, data, mime):
    b = "----ocr" + uuid.uuid4().hex
    out = io.BytesIO()
    out.write(("--%s\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" % b).encode())
    out.write(json.dumps(meta).encode("utf-8"))
    out.write(("\r\n--%s\r\nContent-Type: %s\r\n\r\n" % (b, mime)).encode())
    out.write(data)
    out.write(("\r\n--%s--\r\n" % b).encode())
    return out.getvalue(), "multipart/related; boundary=" + b


def _req(method, url, data=None, ctype=None, retry=True):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    req.add_header("User-Agent", UA)
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=180)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        # טוקן שפג באמצע ריצה ארוכה — מרעננים פעם אחת ומנסים שוב
        if e.code == 401 and retry:
            _token_cache["access"] = None
            return _req(method, url, data, ctype, retry=False)
        return e.code, e.read()


def image_to_text(data, mime="image/jpeg", name=None):
    """מחזיר (טקסט, שגיאה). לעולם לא זורק — OCR שנכשל לא אמור
    להפיל איסוף של הודעה שהטקסט שלה תקין בלי קשר."""
    if not data or len(data) < 4000:
        return "", "too-small"
    meta = {"name": name or ("ocr-" + uuid.uuid4().hex),
            "mimeType": "application/vnd.google-apps.document"}
    body, ctype = _multipart(meta, data, mime)

    st, out = _req(
        "POST",
        "https://www.googleapis.com/upload/drive/v3/files"
        "?uploadType=multipart&ocrLanguage=iw&fields=id",
        body, ctype)
    if st >= 300:
        return "", "upload %s: %s" % (st, out[:160].decode("utf-8", "replace"))

    try:
        fid = json.loads(out)["id"]
    except Exception:
        return "", "no-id"

    try:
        st, out = _req(
            "GET",
            "https://www.googleapis.com/drive/v3/files/%s/export"
            "?mimeType=text/plain" % fid)
        if st >= 300:
            return "", "export %s" % st
        return out.decode("utf-8", "replace").replace("\r\n", "\n").strip(), ""
    finally:
        # תמיד מנקים, גם אם הייצוא נכשל
        _req("DELETE", "https://www.googleapis.com/drive/v3/files/" + fid)


if __name__ == "__main__":
    p = sys.argv[1]
    mime = "image/png" if p.lower().endswith(".png") else "image/jpeg"
    txt, err = image_to_text(io.open(p, "rb").read(), mime)
    print("err:", err or "-")
    print("chars:", len(txt))
    io.open(p + ".txt", "w", encoding="utf-8").write(txt)
    print("נכתב ל-", p + ".txt")
