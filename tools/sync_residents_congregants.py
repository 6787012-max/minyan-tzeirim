# -*- coding: utf-8 -*-
"""sync_residents_congregants.py — ריצה חד-פעמית (16/09/2026) שמכניסה את
185 משקי-הבית מ-"ספר כתובות וטלפונים מעלה עמוס מעודכן" (tools/_tzeirim_
residents_v2.csv, מקור: יוסף) לתוך minyan.congregants, כדי שאפשר יהיה
לסמן "מתפלל אצלנו?" לכל אחד דרך פאנל הניהול במקום באקסל.

אותו אלגוריתם התאמה בדיוק כמו זה שכבר רץ בהצלחה על גיליון עליות יום כיפור
(scratchpad/merge_apply.py, 16/09/2026, 160 התאמות לפי טלפון + 3 לפי שם-
משפחה+שם-פרטי כשהטלפון השתנה, 0 אמביגואיות, 15 לא אותרו) — טלפון מנורמל
(9 ספרות אחרונות) קודם, נפילה לאחור לפי שם-משפחה+חפיפת שם-פרטי כשהטלפון
לא תואם, אמביגואיות מדווחות ולא נכתבות אוטומטית.

כללי כתיבה (לא למחוק כלום שכבר קיים):
  • congregant קיים שנמצאה לו התאמה: מתעדכן רק phone/full_name/address
    שכרגע *ריקים* אצלו — אף שדה לא נדרס. חריג יחיד: אם ההתאמה הייתה לפי
    שם-משפחה+שם (לא לפי טלפון) — כלומר הטלפון הישן כבר לא תואם כלום —
    אז מעדכנים גם טלפון, כי הישן ממילא לא שימושי.
  • congregant קיים בלי שום התאמה בספר המעודכן: לא נוגעים בו בכלל.
  • משק-בית מה-CSV שלא נתפס ע"י אף congregant קיים: כרטיס חדש.
  • התאמות אמביגואליות (כמה מועמדים אפשריים): לא נכתבות אוטומטית —
    מדווחות בקובץ הפלט, ל"בדיקת כפילויות" הקיימת בפאנל (rpc/dup_candidates).

הרצה: python tools/sync_residents_congregants.py
תלוי ב-tools/sb.py לקריאת הסודות (אותו CREDENTIALS.md כמו כל שאר הכלים).
כותב דוח מלא ל-tools/_sync_report.txt (לא מדפיס שמות/טלפונים למסך).
"""
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, r'C:\projects\minyan-tzeirim-site\tools')
import sb  # noqa: E402

CSV_PATH = r'C:\projects\minyan-tzeirim-site\tools\_tzeirim_residents_v2.csv'
REPORT_PATH = r'C:\projects\minyan-tzeirim-site\tools\_sync_report.txt'
NOTE = 'נוסף אוטומטית מסנכרון ספר הכתובות המעודכן (16/09/2026)'


def norm_phone(s):
    digits = re.sub(r'\D', '', s or '')
    return digits[-9:] if len(digits) >= 9 else digits


def norm_surname(s):
    return re.sub(r'\s+', ' ', (s or '').strip())


def clean_text(s):
    """אותו regex בדיוק שכבר אומת על הגיליון (merge_apply.py) — ה-DOCX
    המקורי הפך גרשיים עבריים (״) בתוך ראשי-תיבות ל-' " ' עם רווחים
    מסביב, גם בכתובות (רשב"ם) וגם בשם-משפחה אחד לפחות (חרל"פ)."""
    return re.sub(r'\s*"+\s*', '"', (s or '').strip())


def given_tokens(s):
    return set(re.findall(r'[\u0590-\u05FF]+', s or ''))


def best_phone(row, fallback=None):
    return row['phone_h'] or row['phone_w'] or fallback


def rest(method, path, creds, body=None, prefer=None):
    url = 'https://%s.supabase.co/rest/v1/%s' % (creds['ref'], path)
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('apikey', creds['service'])
    req.add_header('Authorization', 'Bearer ' + creds['service'])
    req.add_header('Accept-Profile', 'minyan')
    req.add_header('Content-Profile', 'minyan')
    req.add_header('Content-Type', 'application/json')
    if prefer:
        req.add_header('Prefer', prefer)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode('utf-8', 'replace')
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


def load_csv():
    rows = []
    with io.open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            rows.append({
                'surname': clean_text(row['surname']),
                'husband_given': clean_text(row['husband_given']),
                'wife_given': clean_text(row['wife_given']),
                'given_full': clean_text(row['given_full']),
                'address': clean_text(row['address']),
                'phone_h': (row['phone_h'] or '').strip(),
                'phone_w': (row['phone_w'] or '').strip(),
            })
    return rows


def main():
    creds = sb.creds()
    report = io.open(REPORT_PATH, 'w', encoding='utf-8')

    def w(*a):
        line = ' '.join(str(x) for x in a)
        report.write(line + '\n')

    csv_rows = load_csv()
    w('משקי-בית ב-CSV:', len(csv_rows))

    by_phone = {}
    for cr in csv_rows:
        for ph in (cr['phone_h'], cr['phone_w']):
            k = norm_phone(ph)
            if k and k not in by_phone:
                by_phone[k] = cr
    by_surname = {}
    for cr in csv_rows:
        by_surname.setdefault(norm_surname(cr['surname']), []).append(cr)

    st, body = rest('GET', 'congregants?select=id,surname,full_name,phone,address', creds)
    if st >= 300:
        w('שגיאה בשליפת congregants קיימים:', st, body[:500])
        report.close()
        print('FAILED — see', REPORT_PATH)
        return 1
    existing = json.loads(body)
    w('congregants קיימים לפני הסנכרון:', len(existing))

    claimed = set()
    matched_phone, matched_fallback, ambiguous, not_found = [], [], [], []

    for ex in existing:
        key = norm_phone(ex.get('phone'))
        cr = by_phone.get(key) if key else None
        if cr is not None and id(cr) not in claimed:
            claimed.add(id(cr))
            matched_phone.append((ex, cr))
            continue

        cand_all = [c for c in by_surname.get(norm_surname(ex.get('surname')), []) if id(c) not in claimed]
        ex_tokens = given_tokens((ex.get('full_name') or '') + ' ' + (ex.get('surname') or ''))
        cands = [c for c in cand_all if ex_tokens & given_tokens(c['given_full'])]

        if len(cands) == 1:
            cr = cands[0]
            claimed.add(id(cr))
            matched_fallback.append((ex, cr))
        elif len(cands) > 1:
            ambiguous.append((ex, cands))
        else:
            not_found.append(ex)

    # ── עדכון קיימים שנמצאה להם התאמה (רק שדות ריקים, ר' תיעוד למעלה) ──
    updated = 0
    update_errors = []
    for ex, cr in matched_phone + matched_fallback:
        patch = {}
        if not (ex.get('full_name') or '').strip():
            fn = (cr['surname'] + ' ' + cr['given_full']).strip()
            if fn:
                patch['full_name'] = fn
        if not (ex.get('address') or '').strip() and cr['address']:
            patch['address'] = cr['address']
        is_fallback = any(ex is fex and cr is fcr for fex, fcr in matched_fallback)
        if is_fallback:
            ph = best_phone(cr)
            if ph and norm_phone(ph) != norm_phone(ex.get('phone')):
                patch['phone'] = ph
        if not patch:
            continue
        st, resp = rest('PATCH', 'congregants?id=eq.%d' % ex['id'], creds, body=patch, prefer='return=minimal')
        if st >= 300:
            update_errors.append((ex['id'], st, resp[:300]))
        else:
            updated += 1

    # ── הוספת משקי-בית חדשים (לא נתפסו ע"י אף congregant קיים) ─────────
    new_rows = [cr for cr in csv_rows if id(cr) not in claimed]
    insert_bodies = []
    seen_pairs = set()
    dup_in_csv = []
    for cr in new_rows:
        full_name = (cr['surname'] + ' ' + cr['given_full']).strip()
        pair = (cr['surname'], full_name)
        if pair in seen_pairs:
            dup_in_csv.append(cr)
            continue
        seen_pairs.add(pair)
        insert_bodies.append({
            'surname': cr['surname'],
            'full_name': full_name or None,
            'phone': best_phone(cr),
            'address': cr['address'] or None,
            'match_note': NOTE,
        })

    inserted = 0
    insert_errors = []
    if insert_bodies:
        st, resp = rest('POST', 'congregants', creds, body=insert_bodies,
                         prefer='resolution=merge-duplicates,return=minimal')
        if st < 300:
            inserted = len(insert_bodies)
        else:
            w('בקשת ההוספה המרוכזת נכשלה (', st, ') — עובר להוספה שורה-שורה כדי לבודד את הבעיה.')
            w('  שגיאת הבאץ׳:', resp[:500])
            for b in insert_bodies:
                st1, resp1 = rest('POST', 'congregants', creds, body=[b],
                                   prefer='resolution=merge-duplicates,return=minimal')
                if st1 < 300:
                    inserted += 1
                else:
                    insert_errors.append((b['surname'], b['full_name'], st1, resp1[:200]))

    # ── דוח ──────────────────────────────────────────────────────────
    w('')
    w('=== תוצאה ===')
    w('הותאמו לפי טלפון:', len(matched_phone))
    w('הותאמו לפי שם-משפחה+שם-פרטי (טלפון התעדכן בהתאם):', len(matched_fallback))
    w('אמביגואי (לא נכתב אוטומטית — לבדוק ב"בדיקת כפילויות" בפאנל):', len(ambiguous))
    w('congregants קיימים שלא אותרו בספר המעודכן (לא נגעתי):', len(not_found))
    w('כרטיסים קיימים שעודכנו (מילוי שדות ריקים בלבד):', updated, '/', len(matched_phone) + len(matched_fallback))
    w('כרטיסים חדשים שנוספו:', inserted, '/', len(insert_bodies))
    if dup_in_csv:
        w('זוגות surname+full_name כפולים בתוך ה-CSV עצמו (רק הראשון נשלח):', len(dup_in_csv))
    if update_errors:
        w('שגיאות עדכון:', update_errors)
    if insert_errors:
        w('שגיאות הוספה:', insert_errors)

    st, body = rest('GET', 'congregants?select=id', creds)
    total_after = len(json.loads(body)) if st < 300 else '?'
    w('')
    w('סה"כ congregants אחרי הסנכרון:', total_after)

    if ambiguous:
        w('')
        w('=== פירוט אמביגואי ===')
        for ex, cands in ambiguous:
            w(' קיים: #%s %s / %s (טלפון %s)  —  %d מועמדים באותו שם-משפחה בלי חפיפת שם-פרטי ברורה' %
              (ex.get('id'), ex.get('surname'), ex.get('full_name'), ex.get('phone'), len(cands)))

    if not_found:
        w('')
        w('=== congregants קיימים שלא אותרו בספר המעודכן (נשארו כפי שהיו) ===')
        for ex in not_found:
            w(' #%s %s / %s — %s' % (ex.get('id'), ex.get('surname'), ex.get('full_name'), ex.get('phone')))

    report.close()
    print('DONE. total_after=%s matched_phone=%d matched_fallback=%d ambiguous=%d not_found=%d updated=%d inserted=%d'
          % (total_after, len(matched_phone), len(matched_fallback), len(ambiguous), len(not_found), updated, inserted))
    print('דוח מלא:', REPORT_PATH)
    return 0


if __name__ == '__main__':
    sys.exit(main())
