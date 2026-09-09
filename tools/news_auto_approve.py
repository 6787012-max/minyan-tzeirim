# -*- coding: utf-8 -*-
"""news_auto_approve.py — מאשר אוטומטית הודעות 'new' שנראות בטוחות
לפרסום ציבורי, לפי אישור מפורש של יוסף (09/09/2026: "כן — תתחיל, לפי
שיקול דעתך").

השיקול נשאר שמרני בכוונה: הרוב המכריע של "ישר ולעניין" הוא צ'אט
קהילתי תמים (טרמפים, מכירה/מסירה, שיעורים) — אבל חלק אמיתי חושף
מספר טלפון, כתובת מגורים/אולם לאירוע משפחתי פרטי, או נסיבות אישיות
רגישות (יתמות, מחלה). אלה נשארים 'new' לבדיקה ידנית, לא נדחים —
רק לא מאושרים לבד.

נבנה אחרי סקירה ידנית של 108 מועמדות שכבר עברו את הסינון הזה
(09/09/2026): 99 אושרו, 9 הוחזקו. שלוש סיבות אמיתיות שהרג'קס הראשון
פספס ותוקנו כאן: טלפון עם נקודות (054.848.5252), טלפון "הפוך"
(קידומת אחרי המספר: "4108990 - 050"), וכתובת אולם/רחוב באירוע משפחתי
פרטי (חתונה/שלום זכר) שאין בה טלפון או מייל בכלל.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, r'C:\projects\minyan-tzeirim-site\tools')
import sb  # noqa: E402


def rest(method, path, creds, body=None):
    url = 'https://%s.supabase.co/rest/v1/%s' % (creds['ref'], path)
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('apikey', creds['service'])
    req.add_header('Authorization', 'Bearer ' + creds['service'])
    req.add_header('Accept-Profile', 'minyan')
    req.add_header('Content-Profile', 'minyan')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, 'news_auto_approve.log')

PHONE_RE = re.compile(
    r'0\d{1,2}[-. ]?\d{7}'                 # 02-1234567 / 02.1234567 / 021234567
    r'|05\d[-. ]?\d{3}[-. ]?\d{4}'         # 050-123-4567 וכו'
    r'|\d{6,7}\s*-\s*0\d{1,2}'             # "4108990 - 050" (הפוך)
)
EMAIL_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')

SENSITIVE_KW = [
    'חולה', 'רפואה', 'מחלה', 'נפטר', 'נפטרה', 'פטירה', 'אבל', 'שבעה',
    'ניתוח', 'אשפוז', 'בית חולים', 'גירושין', 'משבר', 'דיכאון',
    'התייתמו', 'יתומים', 'יתומה',
]
# אירוע משפחתי פרטי + פרט מיקום = הזמנה לבית/אולם ספציפי, לא מיועדת לפרסום
# ציבורי רחב יותר ממה שהיה בקבוצת המייל הפנימית.
EVENT_KW = ['שלום זכר', 'ברית', 'חתונה', 'בר מצווה', 'בת מצווה', 'אירוסין']
VENUE_KW = ['רחוב', 'אולמי', 'אולם ', 'ברחוב']

# פוליטיקה/מחלוקת מקומית (תב"ע, ועד וכו') — לא סיכון פרטיות, אבל שיקול
# עריכתי-ציבורי שיוסף צריך לאשר בעצמו, לא רק "בטוח מבחינת PII".
CONTROVERSY_KW = ['תב"ע', 'ועד מקומי', 'עתירה', 'חתימות נגד']


def is_safe(title, body):
    hay = (title or '') + ' ' + (body or '')
    if PHONE_RE.search(hay) or EMAIL_RE.search(hay):
        return False, 'טלפון/מייל'
    if any(k in hay for k in SENSITIVE_KW):
        return False, 'נסיבות אישיות רגישות'
    if any(k in hay for k in EVENT_KW) and any(k in hay for k in VENUE_KW):
        return False, 'אירוע פרטי + כתובת'
    if any(k in hay for k in CONTROVERSY_KW):
        return False, 'מחלוקת מקומית — שיקול עריכתי'
    if len((body or '').strip()) < 3 and len((title or '').strip()) < 3:
        return False, 'תוכן ריק/חסר ערך'
    return True, ''


def log(msg):
    import datetime
    line = '%s  %s' % (datetime.datetime.now().strftime('%d/%m %H:%M:%S'), msg)
    print(line)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def main():
    dry = '--dry' in sys.argv
    c = sb.creds()
    if not c.get('service'):
        log('שגיאה: אין service_role key בקובץ הסודות.')
        return 1
    st, out = rest('GET', 'news?select=id,title,body,status&status=eq.new'
                   '&order=msg_date.desc&limit=500', c)
    if st != 200:
        log('שגיאה בקריאת new: HTTP %s' % st)
        return 1
    rows = json.loads(out)
    approve, hold = [], []
    for r in rows:
        ok, reason = is_safe(r.get('title'), r.get('body'))
        (approve if ok else hold).append((r['id'], reason))

    log('נבדקו %d · אושרו %d · הוחזקו %d' % (len(rows), len(approve), len(hold)))
    if dry or not approve:
        return 0

    ids = ','.join(str(i) for i, _ in approve)
    st2, out2 = rest('PATCH', 'news?id=in.(%s)&status=eq.new' % ids,
                      c, {'status': 'approved'})
    log('עדכון סטטוס: HTTP %s' % st2)
    return 0 if st2 < 300 else 1


if __name__ == '__main__':
    sys.exit(main())
