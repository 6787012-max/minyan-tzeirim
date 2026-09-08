# -*- coding: utf-8 -*-
"""seed_congregants.py — מזין את 33 מתפללי הרשימה המקורית ל-minyan.congregants,
לפי המחקר ב-_congregants_lookup.md. ריצה חד-פעמית (upsert לפי surname+full_name,
לפי unique index congregants_surname_uq) — אפשר להריץ שוב בלי ליצור כפילויות.

"שמחה" מהרשימה המקורית לא מקבל שורה: זה שם אמצעי של מאיר שמחה שחור (#30),
לא בית-אב נפרד — ראה ההערה ב-_congregants_lookup.md.
"""
import json
import sys
import urllib.error
import urllib.request

sys.path.insert(0, r'C:\projects\minyan-tzeirim-site\tools')
import sb  # noqa: E402

ROWS = [
    dict(surname='לוינשטיין', full_name='לוינשטיין זאבי', phone='0583288616',
         email='z0504172202@gmail.com', match_note='ודאי'),
    dict(surname='רייך', full_name='רייך בנימין', phone='052-7186580',
         email=None, match_note='לא נמצא מייל'),
    dict(surname='וייס', full_name='וייס יעקב והינדה', phone='0527168804',
         email='yakov31122@gmail.com', match_note='ודאי'),
    dict(surname='שטארק', full_name='שטרק שלמה', phone='0548408914',
         email='szs8408914@gmail.com', match_note='ודאי'),
    dict(surname='שניידר', full_name='שניידר יוסף', phone='0556742853',
         email='6742853@gmail.com', match_note='זה יוסף עצמו'),
    dict(surname='רקובסקי', full_name='רקובסקי עמנואל', phone='054-8451402',
         email='e0548451402@gmail.com', match_note='ודאי'),
    dict(surname='גלזר', full_name='גלזר ישראל ורות', phone='050-6209003',
         email='yisraelglaser@gmail.com', match_note='ודאי — הוא #1 מתוך 2 בתי גלזר'),
    dict(surname='גלזר 2', full_name='גלזר יצחק וחיה רחל', phone='052-7670451',
         email='yg120992@gmail.com',
         match_note='מייל ודאי; אי-התאמת טלפון בין ספר הטלפונים (052-7670451) לנדרים פלוס (0546450859)'),
    dict(surname='פריימרק', full_name='פריימרק אליעזר ולאה', phone='0584477527',
         email='avital8825@gmail.com', match_note='לא ודאי — שם פרטי בכתובת לא תואם'),
    dict(surname='צייטלין', full_name='צייטלין בן ציון ואלישבע', phone='0586996360',
         email='b0583296360@gmail.com',
         match_note='אי-ודאות בין 2 בתים, נבחר לפי תרומה מאומתת בפועל'),
    dict(surname='שמחה', full_name=None, phone=None, email=None,
         match_note='לא בית-אב נפרד — שם אמצעי של מאיר שמחה שחור, ראו רשומת שחור'),
    dict(surname='ברקוביץ', full_name='ברקוביץ מנחם צבי ואסתר פייגא רבקה', phone='055-6777572',
         email=None, match_note='אי-ודאות בין 2 בתים, לא נמצא מייל לאף אחד'),
    dict(surname='פוליאס', full_name='פוליאס צבי ונעמי', phone='054-6477771',
         email='p025918888@gmail.com', match_note='ודאי'),
    dict(surname='וסרמן', full_name='וסרמן מנשה וליאה', phone='0552723994',
         email='menashev395@gmail.com', match_note='ודאי'),
    dict(surname='אליאך', full_name='אליאך שלמה ומירי', phone='0534284015',
         email='shlomo5967@gmail.com', match_note='ודאי'),
    dict(surname='מיכאל סטפנסקי', full_name='סטפנסקי מיכאל ואלישבע', phone='054-366-2291',
         email='meirmichael6@gmail.com', match_note='ודאי'),
    dict(surname='דובינסקי', full_name='דובינסקי מיכאל ואילנה', phone='052-7969222',
         email='mdubinski30@gmail.com', match_note='ודאי'),
    dict(surname='סופר', full_name='סופר ישראל וחיה', phone='0586686137',
         email='israel0504104056@gmail.com',
         match_note='אי-ודאות בין 2 בתים, נבחר לפי תרומה מאומתת בפועל'),
    dict(surname='יעקובזון', full_name='יעקובסון אוריאל ולאה', phone='0502660688',
         email=None, match_note='לא נמצא מייל'),
    dict(surname='ירוחימוב', full_name='ירוחימוב יעקב ותהילה', phone='0527155528',
         email='jacob555528@gmail.com', match_note='ודאי'),
    dict(surname='סימונס', full_name='סימונס יעקב ויעל', phone='0583222575',
         email='jak058322@gmail.com', match_note='ודאי'),
    dict(surname='פיבן', full_name='פיבן יוסף ומרים', phone=None,
         email='p0533102940@gmail.com', match_note='ודאי, אין טלפון בספר הטלפונים'),
    dict(surname='ילין', full_name='ילין שלמה ובת שבע', phone='0585502299',
         email=None, match_note='מאומת שאין לו מייל בכלל — טעון פנייה טלפונית'),
    dict(surname='אידלמן', full_name='אידלמן ישראל מרדכי ושירה תמר', phone='052-7673487',
         email='admorisrael@gmail.com', match_note='ודאי'),
    dict(surname='מלר', full_name='מלר חיים וחיה פייגא', phone='054-8428219',
         email='0504164904z@gmail.com', match_note='כתובת רשומה על שם האישה'),
    dict(surname='רוטמן', full_name='רוטמן משה חיים ורוחמה בלימול', phone='052-8530280',
         email='ruchamaapl@gmail.com', match_note='כתובת רשומה על שם האישה'),
    dict(surname='אבי וייס', full_name='וויס אברהם ואלישבע', phone='058-7804802',
         email='e0587804803@gmail.com', match_note='כתובת רשומה על שם האישה'),
    dict(surname='שטיין', full_name='שטיין יעקב ישראל', phone='0527117462',
         email='yaakov6521@gmail.com', match_note='טלפון חדש שנמצא, לא היה בספר הטלפונים'),
    dict(surname='קסן', full_name='קסן שמואל וחנה', phone='0527649377',
         email='ceg97980@gmail.com', match_note='ודאי בסבירות גבוהה'),
    dict(surname='רובין', full_name='רובין יעקב ורבקה (הרב יעקב רובין)', phone='0548598978',
         email='r026542628@gmail.com', match_note='ודאי — מגיד שיעור הדף היומי'),
    dict(surname='שחור', full_name='שחור מאיר שמחה ולאה', phone='0527193411',
         email='meirsimc@gmail.com', match_note='ודאי'),
    dict(surname='חפץ', full_name='מזרחי (חפץ) מאיר ובת שבע', phone='054-8528229',
         email='s0527115927@gmail.com', match_note='ודאי'),
    dict(surname='רחמים ישראל', full_name='ישראל רחמים אהרון ושרה', phone='052-7158868',
         email='sy.sarah7@gmail.com', match_note='כנראה כתובת האישה שרה'),
    dict(surname='מייזליש', full_name='מייזליש אריאל וברכה', phone='0534768675',
         email='abmeyzlish@gmail.com', match_note='ודאי'),
]


def upsert(rows, creds):
    url = 'https://%s.supabase.co/rest/v1/congregants' % creds['ref']
    body = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('apikey', creds['service'])
    req.add_header('Authorization', 'Bearer ' + creds['service'])
    req.add_header('Content-Profile', 'minyan')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'resolution=merge-duplicates,return=minimal')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        raise RuntimeError('HTTP %s: %s' % (e.code, e.read().decode('utf-8', 'replace')[:600]))


def main():
    creds = sb.creds()
    st = upsert(ROWS, creds)
    print('upsert HTTP', st, '|', len(ROWS), 'שורות')


if __name__ == '__main__':
    main()
