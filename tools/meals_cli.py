# -*- coding: utf-8 -*-
"""meals_cli.py - פתיחת אירוע ארוחות משורת הפקודה (בלי להיכנס לדף המנהל).
המפתח נקרא מ-_meals_admin_key.txt (מקומי, ב-.gitignore) ולא מודפס.
שימוש:
  python tools/meals_cli.py list
  python tools/meals_cli.py new "שם המשפחה" 2026-11-22 2026-12-05 "כתובת" "הערות"
  python tools/meals_cli.py link <id>          # מדפיס קישור ציבורי ומנהל
"""
import io
import json
import os
import ssl
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://minyan.mokad.co.il"


def key():
    return io.open(os.path.join(ROOT, "_meals_admin_key.txt"), encoding="utf-8").read().strip()


def call(body):
    api = json.load(io.open(os.path.join(ROOT, "data", "site.json"), encoding="utf-8"))["api"]
    body["admin"] = key()
    req = urllib.request.Request(api["url"] + "/functions/v1/meals", data=json.dumps(body).encode("utf-8"), method="POST")
    for k, v in (("Content-Type", "application/json"), ("apikey", api["anon"]),
                 ("Authorization", "Bearer " + api["anon"]), ("User-Agent", "Mozilla/5.0")):
        req.add_header(k, v)
    try:
        r = urllib.request.urlopen(req, context=ssl._create_unverified_context(), timeout=60)
        return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8"))


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return 1
    if a[0] == "list":
        for e in call({"action": "events"}).get("events", []):
            print(e["id"], e["slug"], e["family"], e["date_from"], e["date_to"], "%s/%s" % (e["filled"], e["total"]), "סגור" if e["closed"] else "")
    elif a[0] == "new":
        d = call({"action": "save", "family": a[1], "date_from": a[2], "date_to": a[3],
                  "address": a[4] if len(a) > 4 else "", "notes": a[5] if len(a) > 5 else ""})
        print(d if not d.get("ok") else "נוצר: id=%s slug=%s" % (d["event"]["id"], d["event"]["slug"]))
    elif a[0] == "link":
        for e in call({"action": "events"}).get("events", []):
            if str(e["id"]) == a[1]:
                print(SITE + "/meals.html?e=" + e["slug"])
                print(SITE + "/meals-admin.html#k=<המפתח מ-_meals_admin_key.txt>")
    elif a[0] == "delete":
        print(call({"action": "delete_event", "id": int(a[1])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
