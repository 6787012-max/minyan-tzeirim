# -*- coding: utf-8 -*-
"""donations_sync.py — מראה את כל היסטוריית התרומות (נדרים פלוס, מוסד
8000707) לתוך minyan.donations, בלי דרך הגיליון של Google Sheets.

הגיליון הישן (project-nedarim-plus) תלוי בהרשאת Drive של חשבון אחר
ונשבר בשקט בכל פעם שהיא זזה. כאן אין קובץ אמצעי: משיכה ישירה מנדרים,
כתיבה ישירה למסד של האתר. transaction_id הוא ה-PK, אז כל ריצה עושה
upsert על כל ההיסטוריה — אין state לתחזק ואין מה שיכול "להיתקע".

    python donations_sync.py            ריצה רגילה
    python donations_sync.py --dry      מדפיס כמה עסקאות נמשכו, בלי לכתוב
"""
import datetime
import io
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, r'C:\projects\nedarim-plus')
import np                                              # noqa: E402

sys.path.insert(0, r'C:\projects\minyan-tzeirim-site\tools')
import sb                                              # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, 'donations_sync.log')


def log(msg):
    line = '%s  %s' % (datetime.datetime.now().strftime('%d/%m %H:%M:%S'), msg)
    print(line)
    with io.open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def is_keva(tx):
    """הוראת קבע. אותו כלל כמו ב-minyan-tzeirim-thanks/watch.py —
    KevaId הוא האמין, TransactionType הוא הגיבוי."""
    return bool((tx.get('KevaId') or '').strip()) or 'הו' in (tx.get('TransactionType') or '')


def parse_time(s):
    for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y'):
        try:
            return datetime.datetime.strptime((s or '').strip(), fmt)
        except ValueError:
            pass
    return None


def row_of(tx):
    when = parse_time(tx.get('TransactionTime'))
    if when is None:
        return None
    try:
        amt = float(tx.get('Amount') or 0)
    except ValueError:
        amt = 0.0
    tid = str(tx.get('TransactionId') or '').strip()
    if not tid:
        return None
    return {
        'transaction_id': tid,
        'keva_id': (tx.get('KevaId') or '').strip() or None,
        'kind': 'keva' if is_keva(tx) else 'once',
        'client_name': (tx.get('ClientName') or '').strip() or 'תורם יקר',
        'amount': amt,
        'transaction_time': when.isoformat(),
        'kabala_id': (tx.get('KabalaId') or '').strip() or None,
    }


def upsert(rows, creds):
    url = 'https://%s.supabase.co/rest/v1/donations' % creds['ref']
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
        raise RuntimeError('HTTP %s: %s' % (e.code, e.read().decode('utf-8', 'replace')[:400]))


def main():
    dry = '--dry' in sys.argv
    try:
        txs = np.all_transactions()
    except Exception as e:
        log('שגיאה במשיכה מנדרים: %s' % e)
        return 1

    rows, skipped = [], 0
    for tx in txs:
        r = row_of(tx)
        if r is None:
            skipped += 1
            continue
        rows.append(r)

    log('נמשכו %d עסקאות · %d תקינות · %d דולגו' % (len(txs), len(rows), skipped))
    if dry or not rows:
        return 0

    creds = sb.creds()
    if not creds.get('service'):
        log('שגיאה: אין service_role key בקובץ הסודות.')
        return 1
    st = upsert(rows, creds)
    log('נכתב למסד (upsert) · HTTP %s · %d שורות' % (st, len(rows)))
    return 0 if st < 300 else 1


if __name__ == '__main__':
    sys.exit(main())
