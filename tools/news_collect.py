# -*- coding: utf-8 -*-
"""news_collect.py — אוסף הודעות מקבוצת «ישר ולעניין» לתור האישור.

רץ כל שעה כמשימה מתוזמנת. **לא מפרסם כלום** — כל פריט נכנס כ-'new'
וממתין לאישור באזור הניהול. הקבוצה מלאה בטלפונים פרטיים, בבקשות
אישיות ובענייני בריאות, ופרסום אוטומטי לאתר ציבורי היה מדליף אותם.

הכל דרך IMAP עם App Password שכבר קיים במערכת של יוסף. אין כאן
תלות ב-Gmail API ואין צורך באישור OAuth נוסף.

הרצה ידנית:
    python tools/news_collect.py            # 24 שעות אחרונות
    python tools/news_collect.py --hours 72
    python tools/news_collect.py --dry      # בלי לכתוב למסד
"""
import argparse
import datetime as dt
import email
import email.header
import email.utils
import imaplib
import io
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SECRETS = r"C:\projects\personal-secretary\secrets.json"
LOG = os.path.join(ROOT, "_news.log")

GROUP = "yasharvelainyanma@googlegroups.com"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

sys.path.insert(0, HERE)
import sb       # noqa: E402  — אותו קובץ סודות, אותה שכבת HTTP
import ocr      # noqa: E402
import storage  # noqa: E402

# חתימות, לוגואים וספייסרים של גוגל. מודעה אמיתית שוקלת הרבה יותר.
MIN_IMAGE = 8000


# ── לוג ─────────────────────────────────────────────────────────────

def log(msg):
    line = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "  " + str(msg)
    try:
        with io.open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    try:
        print(line)
    except Exception:
        pass          # אין מסוף כשרץ כמשימה מתוזמנת


# ── קריאת המייל ─────────────────────────────────────────────────────

def account():
    d = json.load(io.open(SECRETS, encoding="utf-8"))
    a = d["accounts"]["private"]
    return a["email"], a["app_password"].replace(" ", "")


def decode(s):
    if not s:
        return ""
    out = []
    for part, enc in email.header.decode_header(s):
        if isinstance(part, bytes):
            out.append(part.decode(enc or "utf-8", "replace"))
        else:
            out.append(part)
    return "".join(out)


def images_of(msg):
    """התמונות המצורפות, בלי הקישוטים.
    inline קטן הוא כמעט תמיד לוגו בחתימה, לא מודעה."""
    out = []
    for part in msg.walk():
        ct = (part.get_content_type() or "").lower()
        if not ct.startswith("image/"):
            continue
        try:
            data = part.get_payload(decode=True) or b""
        except Exception:
            continue
        if len(data) < MIN_IMAGE:
            continue
        out.append((ct, data))
    return out[:4]        # תקרה שפויה; מודעה אחת לא מגיעה לארבע תמונות


def body_of(msg):
    """גוף טקסט. HTML הוא נפילה אחרונה — הקבוצה שולחת בעיקר טקסט."""
    html = None
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get_filename():
            continue
        ct = part.get_content_type()
        try:
            raw = part.get_payload(decode=True) or b""
            txt = raw.decode(part.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        if ct == "text/plain":
            return txt
        if ct == "text/html" and html is None:
            html = txt
    if html:
        html = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
        html = re.sub(r"(?i)<br\s*/?>|</p>", "\n", html)
        html = re.sub(r"<[^>]+>", " ", html)
        return html
    return ""


# ── ניקוי ──────────────────────────────────────────────────────────

# החתימה שגוגל גרופס מוסיפה לכל הודעה. בלי הסרה היא תופסת
# יותר מקום בכרטיס מאשר ההודעה עצמה.
#
# אין נוסח אחד. הכרטיס הראשון שפורסם באתר הראה את החתימה במקום את
# ההודעה, כי ניסיתי להתאים "מפני שאתה רשום לקבוצה" בעוד שגוגל כותבת
# גם "מכיוון שאתה מנוי לקבוצה". לכן חותכים במקום הראשון שבו מופיע
# *אחד* מכמה סימנים, ולא מנסים לנחש ניסוח מדויק.
FOOTER_MARKS = [
    r"קיבלת את ההודעה הזו",
    r"כדי לבטל את הרישום",
    r"You received this message",
    r"To unsubscribe from this group",
    r"groups\.google\.com",
    r"\n--\s*\n",          # מפריד החתימה התקני שגוגל גרופס מוסיפה
]
FOOTER = re.compile("|".join(FOOTER_MARKS))
#
# הציטוט של ההודעה הקודמת הוא הדליפה המסוכנת כאן: הוא גורר איתו את
# השם, המייל והטלפון של מי שכתב קודם. בכרטיס הראשון שפורסם הופיעו
# כך מספר טלפון וכתובת מייל פרטיים. הסרה שורה-שורה לא הספיקה, כי
# "On <date> <name> <address> wrote:" נשבר על פני כמה שורות.
# לכן חותכים מתחילת הציטוט ואילך, בדיוק כמו בחתימה.
QUOTE_MARKS = [
    r"\n\s*>",                              # ציטוט מסומן
    r"\n[‎‏‪-‮]*בתאריך[^\n]{0,40}\n?[^\n]{0,120}מאת",
    r"\nOn\s[^\n]{0,80}\n?[^\n]{0,120}wrote:",
    r"\n-{5,}\s*הודעה מועברת",
    r"\n-{2,}\s*Forwarded message",
]
QUOTED = re.compile("|".join(QUOTE_MARKS))


def clean_body(txt):
    txt = txt.replace("\r\n", "\n").replace("\xa0", " ")
    for pat in (FOOTER, QUOTED):
        m = pat.search(txt)
        if m:
            txt = txt[:m.start()]
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    txt = re.sub(r"[ \t]{2,}", " ", txt)
    txt = re.sub(r"^[\s.\-–—]+", "", txt)     # שאריות "..." ומקפים בראש
    return txt.strip()


SUBJ_TAG = re.compile(r"^\s*(\[[^\]]*\]|Re:|Fwd:|RE:|FW:)\s*", re.I)


def clean_subject(s):
    prev = None
    while prev != s:
        prev = s
        s = SUBJ_TAG.sub("", s).strip()
    return s


# ── קטגוריה ────────────────────────────────────────────────────────
#
# חיפוש מחרוזת חופשי לא עובד בעברית: הכלל "כנס" תפס 24 מתוך 62
# הודעות, כי הוא יושב בתוך «להיכנס», «נכנס» ו«הכנסה». לכן כל מילת
# מפתח נעטפת כך שהיא לא תתאים באמצע מילה, אבל כן תתאים אחרי
# אות שימוש (ו, ה, ב, ל, מ, ש, כ) שנדבקת למילה בעברית.
HEB = "֐-׿"


def W(*words):
    inner = "|".join(words)
    return "(?<![%s])[והבלמשכ]?(?:%s)(?![%s])" % (HEB, inner, HEB)


# סדר הבדיקה הוא סדר העדיפות. אבידה לפני טרמפ, כי הודעת אבידה
# שמזכירה נסיעה היא עדיין אבידה. טרמפ לפני בקשת עזרה, כי
# "מישהו יוצא ל..." הוא טרמפ ולא בקשה כללית.
RULES = [
    ("אבידות ומציאות", W("אבד", "אבדה", "אבידה", "אבידות", "מצאתי", "נמצאה",
                          "נמצא", "נשכח", "נשכחה", "השאיר", "השאירה")),
    ("טרמפים", W("טרמפ", "טרמפים", "הסעה", "הסעות", "נוסע", "נוסעת",
                  "נוסעים", "יוצא", "יוצאת", "יוצאים", "חוזר", "חוזרת",
                  "מביתר", "לביתר", "לירושלים", "מירושלים", "אפרת",
                  "לבית ?שמש", "מבית ?שמש")),
    ("מכירה ומסירה", W("למכירה", "למסירה", "מוכר", "מוכרת", "נמסר",
                        "מסירה", "בחינם", "גמח", "גמ\"ח") +
                     r"|יד שניי?ה"),
    ("דיור", W("דירה", "דירות", "להשכרה", "שכירות", "צימר", "אירוח")),
    ("שיעורים ואירועים", W("שיעור", "שיעורים", "הרצאה", "הרצאות", "כנס",
                            "כינוס", "מסיבה", "התוועדות", "חוג", "חוגים") +
                         r"|ערב עיון"),
    ("מכולת ומשק", W("מכולת", "קניות", "ירקות", "חלוקה", "מכירה") +
                   r"|הזמנה קבוצתית|רמי לוי|אושר עד"),
    ("בקשות עזרה", W("מחפש", "מחפשת", "מחפשים", "מבקש", "מבקשת", "דרוש",
                      "דרושה", "יעזור", "תעזור") +
                   r"|נשמח לעזר|האם מישהו"),
]


def categorize(subject, body):
    """הכותרת קודמת. היא נכתבה כדי לתאר את ההודעה, בעוד שהגוף
    גורר איתו ציטוטים, חתימות וקישורים שמייצרים התאמות מקריות."""
    for hay in (subject, (subject + " " + body)[:600]):
        for name, pat in RULES:
            if re.search(pat, hay):
                return name
    return "הודעות"


# פריטים עם חיי מדף קצרים — טרמפ של אתמול הוא רעש, לא חדשות.
TTL_HOURS = {"טרמפים": 20, "בקשות עזרה": 96}
TTL_DEFAULT = 24 * 14


def fetch(hours):
    user, pw = account()
    m = imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=CTX)
    m.login(user, pw)
    m.select('"[Gmail]/All Mail"', readonly=True)

    since = (dt.datetime.now() - dt.timedelta(hours=hours + 24)).strftime("%d-%b-%Y")
    typ, data = m.search(None, '(SINCE "%s" TO "%s")' % (since, GROUP))
    ids = data[0].split() if data and data[0] else []
    log("IMAP: %d הודעות מאז %s" % (len(ids), since))

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
    out = []
    for i in ids[-400:]:
        typ, d = m.fetch(i, "(RFC822)")
        if not d or not d[0]:
            continue
        msg = email.message_from_bytes(d[0][1])

        when = None
        try:
            when = email.utils.parsedate_to_datetime(msg.get("Date"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=dt.timezone.utc)
        except Exception:
            pass
        if when and when < cutoff:
            continue

        subject = clean_subject(decode(msg.get("Subject")))
        body = clean_body(body_of(msg))
        imgs = images_of(msg)
        # מודעה סרוקה מגיעה בלי גוף בכלל — היא עדיין הודעה
        if not subject and not body and not imgs:
            continue

        out.append({
            "msg_id": (msg.get("Message-ID") or "").strip("<> ") or ("imap-" + i.decode()),
            "title": subject[:200] or body.split("\n")[0][:200],
            "body": body[:4000],
            "sender": decode(msg.get("From"))[:200],
            "msg_date": when.isoformat() if when else None,
            "_imgs": imgs,
        })
    try:
        m.close()
        m.logout()
    except Exception:
        pass
    return dedupe(out)


def dedupe(items):
    """שרשור של תזכורות ("מישהו חוזר?" → "עדיין רלוונטי") מייצר כמה
    הודעות עם אותה כותרת. בלוח החדשות זה נראה כמו תקלה. שומרים אחת
    לכל נושא: המאוחרת ביותר, ואם היא ריקה — זו עם התוכן."""
    best = {}
    for it in items:
        key = re.sub(r"\s+", " ", it["title"]).strip().lower()
        if not key:
            best[it["msg_id"]] = it
            continue
        cur = best.get(key)
        if cur is None:
            best[key] = it
            continue
        newer = (it["msg_date"] or "") > (cur["msg_date"] or "")
        # הודעה עם מודעה מצורפת גוברת תמיד: היא זו שנושאת את התוכן
        if bool(it.get("_imgs")) != bool(cur.get("_imgs")):
            if it.get("_imgs"):
                best[key] = it
            continue
        if len(it["body"]) > len(cur["body"]) * 2 or (newer and len(it["body"]) >= 20):
            best[key] = it
        elif newer and len(cur["body"]) < 20:
            best[key] = it
    return list(best.values())


# ── כתיבה למסד ─────────────────────────────────────────────────────

def existing_ids():
    """מזהי ההודעות שכבר במסד. חשוב שזה יקרה *לפני* ה-OCR: כל תמונה
    עולה כ-20 שניות, והמשימה רצה כל שעה על חלון חופף. בלי הבדיקה
    הזו אותה מודעה הייתה עוברת OCR שוב ושוב עד שתפוג."""
    c = sb.creds()
    req = urllib.request.Request(
        "https://%s.supabase.co/rest/v1/news?select=msg_id&limit=5000" % c["ref"])
    for k, v in {"apikey": c["service"], "Authorization": "Bearer " + c["service"],
                 "Accept-Profile": "minyan"}.items():
        req.add_header(k, v)
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=60)
        return set(x["msg_id"] for x in json.loads(r.read()) if x.get("msg_id"))
    except Exception as e:
        log("  לא ניתן לשלוף מזהים קיימים: %s" % e)
        return set()


def handle_images(it, dry=False):
    """מעלה את התמונות ומחלץ מהן טקסט.
    מודעה סרוקה היא לרוב *כל* ההודעה — הגוף במייל ריק והתוכן כולו
    בתמונה. לכן הטקסט נכנס לגוף עצמו ולא רק לשדה צדדי: אחרת הכרטיס
    בלוח הוא כותרת ותמונה, ואי אפשר לחפש בו כלום."""
    imgs = it.pop("_imgs", []) or []
    it["images"] = []
    if not imgs:
        return
    ocr_parts = []
    for idx, (mime, data) in enumerate(imgs):
        if dry:
            ocr_parts.append("[יבש: OCR ל-%d KB]" % (len(data) // 1024))
            continue
        url, err = storage.upload(data, mime, prefix="mail/")
        if err:
            log("  העלאת תמונה נכשלה: %s" % err)
            continue
        it["images"].append(url)
        txt, oerr = ocr.image_to_text(data, mime, name="news-ocr")
        if oerr:
            log("  OCR נכשל (%s): %s" % (idx, oerr))
        elif txt.strip():
            ocr_parts.append(clean_ocr(txt))

    if it["images"]:
        it["image_url"] = it["images"][0]
    if not ocr_parts:
        return

    joined = "\n\n".join(p for p in ocr_parts if p)
    it["ocr_text"] = joined[:6000]
    body = (it.get("body") or "").strip()
    if not body:
        it["body"] = joined[:4000]
    else:
        it["body"] = (body + "\n\n— מתוך המודעה —\n" + joined)[:4000]
    # כותרת שהיא רק "מודעה" או ריקה — השורה הראשונה של המודעה עדיפה
    if len(it.get("title") or "") < 4:
        first = next((l.strip() for l in joined.split("\n") if len(l.strip()) > 3), "")
        if first:
            it["title"] = first[:200]


def clean_ocr(txt):
    """פלט OCR מגיע עם שורות קצרות שנשברו לפי פריסת המודעה ולא לפי
    המשפט. איחוד שורות קצרות רצופות הופך את זה לפסקה קריאה."""
    lines = [l.strip() for l in txt.replace("\r\n", "\n").split("\n")]
    out, buf = [], ""
    for l in lines:
        if not l:
            if buf:
                out.append(buf)
                buf = ""
            continue
        # שורה שנגמרת בסימן סיום, או ארוכה — עומדת בפני עצמה
        if buf and (len(buf) > 60 or re.search(r"[.!?:•]$", buf)):
            out.append(buf)
            buf = l
        else:
            buf = (buf + " " + l).strip() if buf else l
    if buf:
        out.append(buf)
    txt = "\n".join(out)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


def push(items, dry=False):
    c = sb.creds()
    base = "https://%s.supabase.co/rest/v1/news" % c["ref"]
    seen = set() if dry else existing_ids()
    added = 0
    skipped = 0
    for it in items:
        if it["msg_id"] in seen:
            skipped += 1
            it.pop("_imgs", None)
            continue

        handle_images(it, dry)

        cat = categorize(it["title"], it["body"])
        ttl = TTL_HOURS.get(cat, TTL_DEFAULT)
        base_dt = dt.datetime.now(dt.timezone.utc)
        if it["msg_date"]:
            try:
                base_dt = dt.datetime.fromisoformat(it["msg_date"])
            except Exception:
                pass
        row = dict(it)
        row["category"] = cat
        row["expires_at"] = (base_dt + dt.timedelta(hours=ttl)).isoformat()

        if dry:
            log("  [יבש] %s | %s%s" % (
                cat, row["title"][:60],
                " | %d תמונות" % len(row.get("images") or []) if row.get("images") else ""))
            added += 1
            continue

        req = urllib.request.Request(base, data=json.dumps(row).encode("utf-8"),
                                     method="POST")
        for k, v in {
            "apikey": c["service"], "Authorization": "Bearer " + c["service"],
            "Content-Type": "application/json", "Content-Profile": "minyan",
            # msg_id ייחודי — התנגשות היא הודעה שכבר נאספה, לא תקלה
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        }.items():
            req.add_header(k, v)
        try:
            r = urllib.request.urlopen(req, context=CTX, timeout=60)
            if r.status in (200, 201):
                added += 1
        except urllib.error.HTTPError as e:
            if e.code != 409:
                log("  שגיאה %s: %s" % (e.code, e.read().decode()[:180]))
    if skipped:
        log("  דילוג על %d הודעות שכבר במסד (לא בוזבז OCR)" % skipped)
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    try:
        items = fetch(a.hours)
        log("נאספו %d הודעות מ-%d השעות האחרונות" % (len(items), a.hours))
        n = push(items, a.dry)
        log("נוספו לתור האישור: %d%s" % (n, " (הרצה יבשה)" if a.dry else ""))
        return 0
    except Exception as e:
        log("כשל: %s: %s" % (type(e).__name__, e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
