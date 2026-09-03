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


def corner(size=200):
    """פינה מעוטרת. הגרסה הראשונה הייתה קו זווית עם ספירלה קטנה —
    נקייה אבל דלה. כאן ערבסקה של ממש: קשת ראשית, קשת משנה, שני
    עלים נגדיים, סלסול פנימי, ופנינים לאורך. זה מה שנותן למודעה
    את המשקל של מסגרת מודפסת ולא של גבול CSS."""
    return f'''<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" xmlns="http://www.w3.org/2000/svg" fill="none">
<g stroke="{GOLD}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 {size-6} L6 54 Q6 6 54 6 L{size-6} 6" stroke-width="3"/>
  <path d="M17 {size-40} L17 58 Q17 17 58 17 L{size-40} 17" stroke-width="1.1" opacity=".5"/>

  <path d="M30 74 Q30 30 74 30" stroke-width="1.9" opacity=".9"/>

  <path d="M30 74 Q30 52 52 52 Q74 52 74 30" stroke-width="1.3" opacity=".6"/>

  <path d="M52 96 Q52 74 68 66 Q84 58 96 52" stroke-width="1.5" opacity=".8"/>
  <path d="M52 96 Q66 96 74 86 Q82 76 96 76 Q108 76 110 88"
        stroke-width="1.5" opacity=".75"/>

  <path d="M96 52 Q114 44 118 28 Q104 30 96 40 Q90 47 96 52 Z"
        fill="{GOLD}" fill-opacity=".16" stroke-width="1.3"/>
  <path d="M52 96 Q44 114 28 118 Q30 104 40 96 Q47 90 52 96 Z"
        fill="{GOLD}" fill-opacity=".16" stroke-width="1.3"/>

  <path d="M40 122 Q40 68 92 62" stroke-width=".9" opacity=".38"/>
</g>
<g fill="{GOLD}">
  <circle cx="58" cy="58" r="5.2"/>
  <circle cx="58" cy="58" r="9.4" fill="none" stroke="{GOLD}" stroke-width="1.1" opacity=".6"/>
  <circle cx="{size-34}" cy="17" r="2.8" opacity=".55"/>
  <circle cx="17" cy="{size-34}" r="2.8" opacity=".55"/>
  <circle cx="110" cy="90" r="2.4" opacity=".7"/>
  <circle cx="90" cy="110" r="2.4" opacity=".7"/>
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


def kos(w=130):
    """גביע קידוש. מחליף את הרימון במודעת הקידוש — רימון הוא סמל
    של ראש השנה בכלל, וגביע אומר בדיוק על מה המודעה."""
    return f'''<svg viewBox="0 0 130 168" width="{w}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="kg" x1="0" y1="0" x2=".4" y2="1">
  <stop offset="0" stop-color="{GOLD_L}"/><stop offset=".35" stop-color="{GOLD}"/>
  <stop offset=".7" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_D}"/>
</linearGradient></defs>
<g stroke="url(#kg)" stroke-width="2.8" fill="none"
   stroke-linecap="round" stroke-linejoin="round">
  <path d="M30 34 H100 L94 84 Q90 104 65 106 Q40 104 36 84 Z"
        fill="{GOLD}" fill-opacity=".12"/>
  <path d="M26 34 H104" stroke-width="3.6"/>
  <path d="M65 106 V128"/>
  <path d="M65 128 Q40 128 34 146 H96 Q90 128 65 128 Z"
        fill="{GOLD}" fill-opacity=".12"/>
  <path d="M28 152 H102" stroke-width="3.4"/>
  <path d="M44 50 Q65 58 86 50" stroke-width="1.4" opacity=".55"/>
  <path d="M48 66 Q65 72 82 66" stroke-width="1.1" opacity=".4"/>
</g>
<g fill="url(#kg)">
  <circle cx="65" cy="120" r="4.6"/>
  <circle cx="42" cy="24" r="3.4" opacity=".7"/>
  <circle cx="88" cy="24" r="3.4" opacity=".7"/>
  <circle cx="65" cy="18" r="4.4" opacity=".85"/>
</g>
</svg>'''


def pomegranate(w=120):
    """רימון — סימן של שנה טובה."""
    return f'''<svg viewBox="0 0 130 148" width="{w}" xmlns="http://www.w3.org/2000/svg">
<path d="M65 40 C 30 40, 18 66, 18 88 C 18 118, 40 136, 65 136
         C 90 136, 112 118, 112 88 C 112 66, 100 40, 65 40 Z"
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


def midpiece(w=120, vertical=False):
    """קרטוש אמצע-מסגרת. מסגרת מודפסת כמעט תמיד שוברת את הקו
    באמצע כל צלע — בלי זה המלבן נראה כמו border ולא כמו מסגרת."""
    rot = ' transform="rotate(90 60 18)"' if vertical else ''
    return f'''<svg viewBox="0 0 120 36" width="{w}" xmlns="http://www.w3.org/2000/svg" fill="none">
<g{rot} stroke="{GOLD}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M0 18 H30" stroke-width="1.4" opacity=".8"/>
  <path d="M90 18 H120" stroke-width="1.4" opacity=".8"/>
  <path d="M60 4 L74 18 L60 32 L46 18 Z" fill="{GOLD}" fill-opacity=".14" stroke-width="1.6"/>
  <path d="M60 11 L67 18 L60 25 L53 18 Z" fill="{GOLD}" stroke="none"/>
  <path d="M38 18 Q32 10 30 18 Q32 26 38 18" stroke-width="1.2" opacity=".7"/>
  <path d="M82 18 Q88 10 90 18 Q88 26 82 18" stroke-width="1.2" opacity=".7"/>
</g></svg>'''


def plaque_frame(w=760, h=250):
    """מסגרת פנימית ללוחית הכהה — קו זהב עם פינות קטומות."""
    c = 16
    return f'''<svg viewBox="0 0 {w} {h}" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" fill="none">
<path d="M{c} 4 H{w-c} L{w-4} {c} V{h-c} L{w-c} {h-4} H{c} L4 {h-c} V{c} Z"
      stroke="{GOLD_L}" stroke-width="1.4" opacity=".55"/>
</svg>'''


def on_dark(svg):
    """גרסת עיטור לרקע הכהה של הלוחית.
    המילוי החלקי שנראה טוב על שמנת הופך על כחול-כהה לכתם שחור —
    הרימון יצא ככדור אטום. כאן המילוי מוסר לגמרי והקו מתחלף לזהב
    בהיר, שהוא מה שקריא על רקע כהה."""
    return (svg
            .replace('fill-opacity=".13"', 'fill-opacity="0"')
            .replace('fill-opacity=".16"', 'fill-opacity="0"')
            .replace('fill-opacity=".10"', 'fill-opacity="0"')
            .replace('fill="%s" fill-opacity="0"' % GOLD, 'fill="none"')
            .replace('stroke="%s"' % GOLD, 'stroke="%s"' % GOLD_L)
            .replace('fill="%s"' % GOLD, 'fill="%s"' % GOLD_L))
