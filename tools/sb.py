# -*- coding: utf-8 -*-
"""sb.py — הרצת SQL ופריסת Edge Functions מול Supabase, מהמכונה של יוסף.

אין supabase CLI מותקן וגם אין צורך בו: Management API עושה את שני
הדברים דרך HTTPS רגיל. נטפרי מעביר את api.supabase.com בלי בעיה.

הסודות נקראים מ-C:\\projects\\gmachim-maale-amos\\_CREDENTIALS.md ולא
משוכפלים לכאן — קובץ סודות אחד עדיף על שלושה שנסחפים זה מזה.

שימוש:
    python tools/sb.py sql db/01_schema.sql
    python tools/sb.py query "select count(*) from minyan.signups"
"""
import io
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

CRED = r"C:\projects\gmachim-maale-amos\_CREDENTIALS.md"
API = "https://api.supabase.com"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE          # נטפרי מחליף תעודות


def creds():
    t = io.open(CRED, encoding="utf-8").read()
    ref = re.search(r"ref:\s*`([a-z0-9]+)`", t)
    pat = re.search(r"Management PAT:\s*`(sbp_[A-Za-z0-9]+)`", t)
    svc = re.search(r"service_role[^`]*`(ey[A-Za-z0-9._-]+)`", t)
    anon = re.search(r"anon[^`]*`(ey[A-Za-z0-9._-]+)`", t)
    if not (ref and pat):
        raise SystemExit("לא נמצאו ref/PAT ב-" + CRED)
    return {
        "ref": ref.group(1),
        "pat": pat.group(1),
        "service": svc.group(1) if svc else "",
        "anon": anon.group(1) if anon else "",
    }


def call(method, path, body=None, token=None, host=API, ctype="application/json"):
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(host + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", ctype)
    # בלי User-Agent של דפדפן, Cloudflare שלפני api.supabase.com
    # מחזיר 403 עם "error code: 1010" ולא שום דבר מובן
    req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                 "AppleWebKit/537.36 (KHTML, like Gecko) "
                                 "Chrome/131.0.0.0 Safari/537.36")
    req.add_header("Accept", "application/json")
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=120)
        raw = r.read().decode("utf-8", "replace")
        return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def run_sql(sql):
    c = creds()
    st, out = call("POST", "/v1/projects/%s/database/query" % c["ref"],
                   {"query": sql}, c["pat"])
    return st, out


def set_secrets(pairs):
    """secrets של Edge Functions. הערכים לא מודפסים לעולם."""
    c = creds()
    body = [{"name": k, "value": v} for k, v in pairs.items()]
    return call("POST", "/v1/projects/%s/secrets" % c["ref"], body, c["pat"])


def deploy_fn(slug, path, verify_jwt=False):
    c = creds()
    code = io.open(path, encoding="utf-8").read()
    body = {"slug": slug, "name": slug, "body": code,
            "verify_jwt": verify_jwt, "entrypoint_path": "index.ts"}
    st, out = call("POST", "/v1/projects/%s/functions" % c["ref"], body, c["pat"])
    # "Duplicated function slug" חוזר כ-400, לא כ-409. שני המקרים = קיימת.
    if st == 409 or (st == 400 and "Duplicated" in out):
        st, out = call("PATCH", "/v1/projects/%s/functions/%s" % (c["ref"], slug),
                       body, c["pat"])
    return st, out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    cmd, arg = sys.argv[1], sys.argv[2]

    if cmd == "sql":
        sql = io.open(arg, encoding="utf-8").read()
    elif cmd == "query":
        sql = arg
    elif cmd == "deploy":
        st, out = deploy_fn(arg, sys.argv[3])
        print("HTTP", st)
        if st >= 300:
            print(out[:600])
            return 1
        print("נפרסה:", arg)
        return 0
    elif cmd == "secrets":
        pairs = json.load(io.open(arg, encoding="utf-8"))
        st, out = set_secrets(pairs)
        print("HTTP", st, "| הוגדרו", len(pairs), "סודות")
        if st >= 300:
            print(out[:400])
            return 1
        return 0
    else:
        print("פקודה לא מוכרת:", cmd)
        return 1

    st, out = run_sql(sql)
    print("HTTP", st)
    # לא מדפיסים תוכן שורות — רק היקף. תוצאות אמיתיות נכתבות לקובץ.
    if st >= 300:
        print(out[:800])
        return 1
    try:
        rows = json.loads(out)
        print("rows:", len(rows) if isinstance(rows, list) else "n/a")
        io.open("_sql_out.json", "w", encoding="utf-8").write(
            json.dumps(rows, ensure_ascii=False, indent=2))
        print("נכתב ל-_sql_out.json")
    except Exception:
        print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
