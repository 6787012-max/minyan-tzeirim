# -*- coding: utf-8 -*-
"""meals_seed.py - הזנת אנשי קשר לטבלת minyan.meal_contacts (השלמת שמות בדף הארוחות).
רץ מהמחשב עם מפתח השירות (נקרא בזמן ריצה דרך sb.creds, לא נכתב לשום מקום).
מקורות (מקומיים בלבד, לא בריפו): tools/_tzeirim_residents_v2.csv, reference-maale-amos-contacts.md.
שימוש: python tools/meals_seed.py [--dry]
"""
import csv
import io
import json
import os
import re
import ssl
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sb  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "_tzeirim_residents_v2.csv")
MEM = os.path.join(os.path.expanduser("~"), ".claude", "projects", "C--", "memory", "reference-maale-amos-contacts.md")


def norm(p):
    d = re.sub(r"\D", "", p or "")
    if d.startswith("972"):
        d = "0" + d[3:]
    return d if re.fullmatch(r"0\d{8,9}", d) else ""


def collect():
    out = {}   # (phone, name) -> source
    stats = {"residents-book": 0, "memory": 0}
    with io.open(CSV, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            sur = (r.get("surname") or "").strip()
            for given, ph in ((r.get("wife_given"), r.get("phone_w")), (r.get("husband_given"), r.get("phone_h"))):
                given = (given or "").strip()
                p = norm(ph)
                if sur and given and p:
                    out[(p, given + " " + sur)] = "residents-book"
    stats["residents-book"] = len(out)
    return out, stats


def main():
    dry = "--dry" in sys.argv
    data, stats = collect()
    rows = [{"name": n, "phone": p, "source": s} for (p, n), s in sorted(data.items(), key=lambda x: x[0][1])]
    print("אנשי קשר:", len(rows), stats)
    if dry:
        return 0
    c = sb.creds()
    ctx = ssl._create_unverified_context()
    url = "https://%s.supabase.co/rest/v1/meal_contacts?on_conflict=phone,name" % c["ref"]
    req = urllib.request.Request(url, data=json.dumps(rows).encode("utf-8"), method="POST")
    for k, v in (("apikey", c["service"]), ("Authorization", "Bearer " + c["service"]),
                 ("Content-Type", "application/json"), ("Content-Profile", "minyan"),
                 ("Prefer", "resolution=ignore-duplicates,return=minimal"),
                 ("User-Agent", "Mozilla/5.0")):
        req.add_header(k, v)
    r = urllib.request.urlopen(req, context=ctx, timeout=60)
    print("HTTP", r.status)
    return 0


if __name__ == "__main__":
    sys.exit(main())
