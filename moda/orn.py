# -*- coding: utf-8 -*-
"""orn.py — העיטורים של המודעות, מצוירים כ-SVG.

הכל נכתב ידנית ולא נטען מספרייה: הרינדור רץ בלי רשת, וכל קובץ
חיצוני היה נכשל בשקט ומשאיר מודעה קירחת. חוץ מזה, עיטור שמצויר
לפי הצבעים של המניין יושב אחרת מאשר קליפ-ארט כללי.
"""

GOLD = "#B08D3E"
GOLD_L = "#D9BC79"
GOLD_D = "#8A6B24"
NAVY = "#12233F"


def corner(size=170, flip_x=False, flip_y=False):
    """פינה מעוטרת בסגנון ערבסקה — הקו הראשי, ספירלה פנימית,
    ושלוש נקודות שמונעות מהפינה להיראות קטועה."""
    t = []
    if flip_x:
        t.append("scale(-1,1) translate(-%d,0)" % size)
    if flip_y:
        t.append("scale(1,-1) translate(0,-%d)" % size)
    tr = ' transform="%s"' % " ".join(t) if t else ""
    return f'''<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" xmlns="http://www.w3.org/2000/svg" fill="none">
<g{tr} stroke="{GOLD}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 {size-4} L4 46 Q4 4 46 4 L{size-4} 4" stroke-width="2.4" opacity=".95"/>
  <path d="M13 {size-30} L13 50 Q13 13 50 13 L{size-30} 13" stroke-width="1" opacity=".55"/>
  <path d="M24 62 Q24 24 62 24" stroke-width="1.5" opacity=".8"/>
  <path d="M24 62 Q40 62 46 52 Q52 42 62 42 Q72 42 74 52" stroke-width="1.4" opacity=".75"/>
  <path d="M34 78 Q34 34 78 34" stroke-width=".8" opacity=".4"/>
  <circle cx="46" cy="46" r="4.5" fill="{GOLD}" stroke="none" opacity=".9"/>
  <circle cx="{size-26}" cy="13" r="2.6" fill="{GOLD}" stroke="none" opacity=".6"/>
  <circle cx="13" cy="{size-26}" r="2.6" fill="{GOLD}" stroke="none" opacity=".6"/>
</g></svg>'''


def divider(w=420):
    """מפריד: שני קווים שמתעדנים לקצוות, ויהלום במרכז."""
    h, m = 30, w // 2
    return f'''<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" fill="none">
<defs><linearGradient id="dg" x1="0" x2="1">
  <stop offset="0" stop-color="{GOLD}" stop-opacity="0"/>
  <stop offset=".5" stop-color="{GOLD}" stop-opacity="1"/>
  <stop offset="1" stop-color="{GOLD}" stop-opacity="0"/>
</linearGradient></defs>
<path d="M0 15 H{m-34}" stroke="url(#dg)" stroke-width="1.6"/>
<path d="M{m+34} 15 H{w}" stroke="url(#dg)" stroke-width="1.6"/>
<g transform="translate({m},15)">
  <path d="M0 -13 L13 0 L0 13 L-13 0 Z" fill="none" stroke="{GOLD}" stroke-width="1.8"/>
  <path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill="{GOLD}"/>
  <circle cx="-24" cy="0" r="2.6" fill="{GOLD}" opacity=".75"/>
  <circle cx="24" cy="0" r="2.6" fill="{GOLD}" opacity=".75"/>
</g></svg>'''


def crown(w=190):
    """כתר — לראש מודעת ההודיה. שלושה קמרונים, פנינים, ובסיס כפול."""
    return f'''<svg viewBox="0 0 190 108" width="{w}" xmlns="http://www.w3.org/2000/svg" fill="none">
<g stroke="{GOLD}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
  <path d="M22 84 L14 30 L52 58 L95 20 L138 58 L176 30 L168 84 Z" fill="{GOLD}" fill-opacity=".10"/>
  <path d="M18 90 H172" stroke-width="2.6"/>
  <path d="M26 99 H164" stroke-width="1.4" opacity=".6"/>
</g>
<g fill="{GOLD}">
  <circle cx="14" cy="27" r="5.5"/><circle cx="176" cy="27" r="5.5"/>
  <circle cx="95" cy="16" r="6.5"/>
  <circle cx="52" cy="61" r="3.6" opacity=".85"/><circle cx="138" cy="61" r="3.6" opacity=".85"/>
  <circle cx="95" cy="70" r="4.2" opacity=".9"/>
</g></svg>'''


def shofar(w=230):
    """שופר. שתי הגרסאות הקודמות נכשלו — הראשונה יצאה ככתם כהה,
    השנייה כשני קווים שנקראו כמו סהר. כאן מתאר סגור אחד: פייה צרה
    משמאל, התעבות הדרגתית, ופעמון פתוח כלפי מעלה מימין."""
    return f'''<svg viewBox="0 0 250 96" width="{w}" xmlns="http://www.w3.org/2000/svg">
<path d="M28 60
         C 58 40, 116 36, 158 45
         C 186 51, 200 38, 208 18
         C 210 12, 216 10, 222 13
         L 234 19
         C 239 22, 240 28, 237 33
         C 224 60, 200 78, 160 76
         C 116 74, 72 80, 46 76
         C 32 74, 25 68, 28 60 Z"
      fill="{GOLD}" fill-opacity=".13" stroke="{GOLD}" stroke-width="2.6"
      stroke-linejoin="round"/>
<g stroke="{GOLD}" fill="none" stroke-linecap="round" opacity=".55">
  <path d="M64 62 C 100 55, 138 56, 164 62" stroke-width="1.2"/>
  <path d="M176 62 C 196 58, 208 46, 214 32" stroke-width="1.2"/>
  <path d="M50 66 C 78 70, 112 70, 140 68" stroke-width="1" opacity=".7"/>
</g>
<path d="M28 60 C 24 63, 24 70, 30 73" stroke="{GOLD}" stroke-width="2.2"
      fill="none" stroke-linecap="round"/>
</svg>'''


def pomegranate(w=120):
    """רימון. הגרסה הראשונה נקראה כחיפושית — הקו האנכי במרכז והנקודות
    הסימטריות עשו את זה. כאן: כתר עלי גביע מפוצל למעלה, גוף אגסי,
    וקווי נפח לצדדים במקום נקודות."""
    return f'''<svg viewBox="0 0 130 148" width="{w}" xmlns="http://www.w3.org/2000/svg">
<path d="M65 40
         C 30 40, 18 66, 18 88
         C 18 118, 40 136, 65 136
         C 90 136, 112 118, 112 88
         C 112 66, 100 40, 65 40 Z"
      fill="{GOLD}" fill-opacity=".13" stroke="{GOLD}" stroke-width="2.6"/>
<g stroke="{GOLD}" stroke-width="2.4" fill="none"
   stroke-linecap="round" stroke-linejoin="round">
  <path d="M65 41 L65 26"/>
  <path d="M52 34 L44 12 L58 22 L65 4 L72 22 L86 12 L78 34"/>
</g>
<g stroke="{GOLD}" stroke-width="1.3" fill="none" opacity=".45" stroke-linecap="round">
  <path d="M40 66 C 31 80, 31 100, 40 116"/>
  <path d="M90 66 C 99 80, 99 100, 90 116"/>
</g>
</svg>'''


def bg_pattern():
    """דוגמת רקע — יהלומים דהויים מאוד. נותנת עומק בלי להתחרות בטקסט."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<g fill="none" stroke="{GOLD}" stroke-width=".7" opacity=".14">
  <path d="M32 6 L58 32 L32 58 L6 32 Z"/>
  <path d="M32 20 L44 32 L32 44 L20 32 Z"/>
  <circle cx="32" cy="32" r="2.4" fill="{GOLD}" stroke="none" opacity=".5"/>
</g></svg>'''


def rule_small(w=150):
    return f'''<svg viewBox="0 0 {w} 12" width="{w}" xmlns="http://www.w3.org/2000/svg" fill="none">
<path d="M0 6 H{w//2-13}" stroke="{GOLD}" stroke-width="1.3" opacity=".8"/>
<path d="M{w//2+13} 6 H{w}" stroke="{GOLD}" stroke-width="1.3" opacity=".8"/>
<path d="M{w//2} 0 L{w//2+7} 6 L{w//2} 12 L{w//2-7} 6 Z" fill="{GOLD}"/>
</svg>'''
