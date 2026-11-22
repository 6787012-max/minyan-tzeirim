# -*- coding: utf-8 -*-
"""katz_sync.py — מסנכרן את נתוני דפי /katz/ (קורס חיים כץ).

מה הוא עושה:
  1. בונה katz/data/course.json מקבצי המפגשים בסקיל: games.json ו-flow.json
     של כל מפגש, וכן מפתחות החוברת מ-drive.json. סרטונים והגדרות ידניות
     נשמרים ב-katz/data/config.json (קובץ שנערך ביד, הסקריפט לא דורס אותו).
  2. מעתיק את CHANGELOG.json של החוברת (אם קיים בסקיל) ל-katz/data/changelog.json.
     אם אין, נשאר הקובץ הקיים (בהתחלה רשימה ריקה).
  3. מוריד את כל ההערות מהשרת ושומר אותן ב-comments_export.json בתיקיית הסקיל,
     כדי שבניית החוברת הבאה תשלב אותן. בלי קודי עריכה ובלי hash.
  4. עם --deploy: מריץ secret-audit, ואז commit ו-push רק לקבצים של הקורס.

פריסת Edge Function (katz-course) לא נעשית כאן. זה נעשה דרך tools/sb.py.

שימוש:
    python tools/katz_sync.py              בניית הקבצים והורדת ההערות
    python tools/katz_sync.py --no-comments
    python tools/katz_sync.py --deploy     גם commit ו-push (אחרי ביקורת סודות)
"""
import io
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KATZ = os.path.join(REPO, "katz")
DATA = os.path.join(KATZ, "data")
SKILL = os.path.join(os.path.expanduser("~"), ".claude", "skills", "chaim-katz")
KEY_PATH = os.path.join(os.path.expanduser("~"), ".secrets", "katz_course_key.txt")
FUNC = "https://cmsusfmwjtpfewbydzpi.supabase.co/functions/v1/katz-course"
AUDIT = "C:/tools/secret-audit/audit.py"
MEETINGS = [1, 2, 3, 4]
COURSE_FILES = [
    "katz", "tools/katz_sync.py", "db/20_katz_course.sql",
    "supabase/functions/katz-course",
]


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def build_course():
    config = read_json(os.path.join(DATA, "config.json"), {})
    drive = read_json(os.path.join(SKILL, "drive.json"), {})
    booklet_id = drive.get("booklet_file_id")
    short_id = drive.get("short_booklet_file_id")

    meetings = []
    for n in MEETINGS:
        base = os.path.join(SKILL, "מפגשים", "מפגש %d" % n)
        flow = read_json(os.path.join(base, "flow.json"), {})
        games = read_json(os.path.join(base, "games.json"), {})
        steps = []
        for i, s in enumerate(flow.get("steps", []), start=1):
            steps.append({
                "target": "meeting:%d:s%d" % (n, i),
                "title": s.get("title", ""),
                "what": s.get("what", ""),
                "goal": s.get("goal", ""),
                "note": s.get("note", ""),
            })
        game_list = []
        for name, g in games.items():
            game_list.append({
                "target": "game:%d:%s" % (n, name),
                "name": name,
                "solutions": g.get("solutions", ""),
                "processing": g.get("processing", ""),
            })
        meetings.append({
            "n": n,
            "title": "מפגש %d" % n,
            "partial": bool(flow.get("partial", False)),
            "note": flow.get("note", ""),
            "steps": steps,
            "games": game_list,
        })

    course = {
        "updated": date.today().isoformat(),
        "booklet": {
            # הקישור לחוברת מוצג רק אחרי שיוסף מסמן booklet_public ב-config.json.
            # כרגע הקובץ משותף רק לחשבון של יוסף, ושינוי שיתוף נשאר אצלו.
            "full_url": ("https://drive.google.com/file/d/%s/view" % booklet_id)
                        if (booklet_id and config.get("booklet_public")) else None,
            "short_url": ("https://drive.google.com/file/d/%s/view" % short_id) if short_id else None,
        },
        "videos": config.get("videos", []),
        "meetings": meetings,
    }
    write_json(os.path.join(DATA, "course.json"), course)
    print("course.json: %d מפגשים, %d משחקים" % (len(meetings), sum(len(m["games"]) for m in meetings)))


def copy_changelog():
    src = os.path.join(SKILL, "tools", "booklet", "CHANGELOG.json")
    dst = os.path.join(DATA, "changelog.json")
    if os.path.exists(src):
        data = read_json(src, [])
        write_json(dst, data)
        print("changelog.json הועתק מהסקיל: %d עדכונים" % len(data))
    elif not os.path.exists(dst):
        write_json(dst, [])
        print("changelog.json: אין עדיין קובץ בסקיל, נוצרה רשימה ריקה")
    else:
        print("changelog.json: אין קובץ חדש בסקיל, נשאר הקיים")


def export_comments():
    if not os.path.exists(KEY_PATH):
        print("אין מפתח קורס ב-~/.secrets, מדלגים על ההערות")
        return
    key = io.open(KEY_PATH, encoding="utf-8").read().strip()
    url = "%s?k=%s&a=comments" % (FUNC, key)
    req = urllib.request.Request(url, headers={
        # בלי User-Agent של דפדפן, Cloudflare חוסם בקשות בלי הסבר
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    comments = data.get("comments", [])
    write_json(os.path.join(SKILL, "comments_export.json"), comments)
    print("comments_export.json: %d הערות" % len(comments))


def deploy():
    audit = subprocess.run([sys.executable, AUDIT], cwd=REPO)
    if audit.returncode != 0:
        print("ביקורת הסודות מצאה משהו. לא מעלים.")
        return 1
    subprocess.run(["git", "-C", REPO, "add", "--"] + COURSE_FILES, check=True)
    diff = subprocess.run(["git", "-C", REPO, "diff", "--cached", "--quiet"])
    if diff.returncode == 0:
        print("אין שינויים לקורס, לא מעלים")
        return 0
    msg = ("katz: עדכון דפי הקורס (נסיעות, הערות, חוברת)\n\n"
           "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>")
    subprocess.run(["git", "-C", REPO, "commit", "-m", msg], check=True)
    subprocess.run(["git", "-C", REPO, "push", "origin", "main"], check=True)
    print("הועלה ל-GitHub")
    return 0


def main(argv):
    build_course()
    copy_changelog()
    if "--no-comments" not in argv:
        export_comments()
    if "--deploy" in argv:
        return deploy()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
