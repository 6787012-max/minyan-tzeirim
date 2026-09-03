# -*- coding: utf-8 -*-
"""arch.py — מסגרת השער: עמודים, קשת ובסיס.

הגרסאות הקודמות היו קווי זהב דקים על קרם — נקי, אבל בשפה של הזמנה
אירופית ולא של מודעת בית כנסת. אחרי מעבר על תבניות מסחריות בקטגוריית
בתי כנסת ברור מה חסר: **נפח**. שם המסגרת היא עמודים קורינתיים ותבליט
מוזהב על רקע כהה, עם פנל בהיר במרכז שנושא את הטקסט.

תלת-ממד פוטוריאליסטי הוא לא משהו שאפשר לייצר כאן, אבל את שלושת
הדברים שעושים את הרושם — **רקע כהה עם ויניטה, פנל בהיר מוגבה,
ועמודים מוצללים** — אפשר לצייר ב-SVG, והם נושאים את רוב האפקט.
"""

GOLD = "#B08D3E"
GOLD_L = "#EAD49A"
GOLD_M = "#C9A455"
GOLD_D = "#7A5C1C"
NAVY = "#0B1526"
NAVY_M = "#16294A"


def _gold_grad(gid):
    """מדרג זהב שמדמה תבליט: אור למעלה-שמאל, צל למטה-ימין."""
    return f'''<linearGradient id="{gid}" x1="0" y1="0" x2=".35" y2="1">
  <stop offset="0" stop-color="{GOLD_L}"/>
  <stop offset=".32" stop-color="{GOLD_M}"/>
  <stop offset=".62" stop-color="{GOLD}"/>
  <stop offset="1" stop-color="{GOLD_D}"/>
</linearGradient>'''


def column(w=120, h=760, side="right"):
    """עמוד: כותרת קורינתית מסוגננת, גוף מחורץ, ובסיס מדורג.
    החריצים הם מה שנותן את תחושת הגליל — בלעדיהם זה מלבן."""
    flutes = "".join(
        f'<path d="M{28 + i*13} 150 V{h-140}" stroke="{GOLD_D}" stroke-width="1.1" opacity=".33"/>'
        for i in range(5)
    )
    hi = "".join(
        f'<path d="M{33 + i*13} 150 V{h-140}" stroke="{GOLD_L}" stroke-width="1.6" opacity=".28"/>'
        for i in range(5)
    )
    return f'''<svg viewBox="0 0 {w} {h}" width="{w}" xmlns="http://www.w3.org/2000/svg">
<defs>{_gold_grad("cg")}
<linearGradient id="shaft" x1="0" x2="1">
  <stop offset="0" stop-color="{GOLD_D}"/><stop offset=".22" stop-color="{GOLD_M}"/>
  <stop offset=".5" stop-color="{GOLD_L}"/><stop offset=".8" stop-color="{GOLD}"/>
  <stop offset="1" stop-color="{GOLD_D}"/>
</linearGradient></defs>

<!-- כותרת -->
<path d="M8 96 H112 L104 128 H16 Z" fill="url(#cg)"/>
<path d="M14 62 Q22 92 60 96 Q98 92 106 62 Q98 78 84 74 Q70 70 60 82
         Q50 70 36 74 Q22 78 14 62 Z" fill="url(#cg)"/>
<path d="M4 44 H116 L110 62 H10 Z" fill="url(#cg)"/>
<circle cx="60" cy="76" r="6.5" fill="{GOLD_L}" opacity=".9"/>
<path d="M30 52 Q60 40 90 52" stroke="{GOLD_L}" stroke-width="1.6" fill="none" opacity=".55"/>

<!-- גוף -->
<rect x="22" y="128" width="76" height="{h-128-96}" fill="url(#shaft)"/>
<g stroke-linecap="round">{flutes}{hi}</g>

<!-- בסיס -->
<path d="M14 {h-96} H106 L112 {h-72} H8 Z" fill="url(#cg)"/>
<rect x="8" y="{h-72}" width="104" height="34" fill="url(#cg)"/>
<path d="M2 {h-38} H118 L118 {h-8} H2 Z" fill="url(#cg)"/>
<path d="M40 {h-64} H80 M40 {h-52} H80" stroke="{GOLD_D}" stroke-width="1.2" opacity=".4"/>
</svg>'''


def arch(w=900, h=420):
    """קשת עליונה. בגרסה הראשונה הקווים פשוט נעצרו בקצה ה-viewBox
    והקשת נראתה חתוכה באוויר. כאן לרגליים יש המשך אנכי שנכנס מאחורי
    ראשי העמודים, וקצה מעוגל שסוגר את הצורה."""
    m = w // 2
    foot = h - 6
    return f'''<svg viewBox="0 0 {w} {h}" width="{w}" xmlns="http://www.w3.org/2000/svg" fill="none">
<defs>{_gold_grad("ag")}</defs>
<g stroke="url(#ag)" stroke-linecap="round" stroke-linejoin="round">
  <path d="M26 {foot} L26 150 Q26 52 {m} 40 Q{w-26} 52 {w-26} 150 L{w-26} {foot}"
        stroke-width="9"/>
  <path d="M46 {foot} L46 158 Q46 74 {m} 62 Q{w-46} 74 {w-46} 158 L{w-46} {foot}"
        stroke-width="2.4" opacity=".55"/>

  <path d="M{m-152} 60 Q{m-112} 22 {m-74} 48 Q{m-54} 62 {m-72} 74
           Q{m-94} 84 {m-98} 60" stroke-width="4.4"/>
  <path d="M{m+152} 60 Q{m+112} 22 {m+74} 48 Q{m+54} 62 {m+72} 74
           Q{m+94} 84 {m+98} 60" stroke-width="4.4"/>
  <path d="M{m-60} 44 Q{m} 10 {m+60} 44" stroke-width="3.6"/>
</g>
<g transform="translate({m},40)">
  <path d="M0 -28 L28 0 L0 28 L-28 0 Z" fill="url(#ag)"/>
  <path d="M0 -14 L14 0 L0 14 L-14 0 Z" fill="{NAVY}" opacity=".6"/>
</g>
<g fill="url(#ag)">
  <circle cx="{m-152}" cy="60" r="7.5"/><circle cx="{m+152}" cy="60" r="7.5"/>
</g>
</svg>'''


def base_orn(w=560, h=90):
    """עיטור בסיס — סלסול סימטרי עם מניפה במרכז, כמו בתחתית שער."""
    m = w // 2
    return f'''<svg viewBox="0 0 {w} {h}" width="{w}" xmlns="http://www.w3.org/2000/svg" fill="none">
<defs>{_gold_grad("bg2")}</defs>
<g stroke="url(#bg2)" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.4">
  <path d="M{m-40} 46 Q{m-110} 46 {m-140} 22 Q{m-166} 0 {m-200} 14
           Q{m-226} 26 {m-214} 52 Q{m-204} 72 {m-178} 66"/>
  <path d="M{m+40} 46 Q{m+110} 46 {m+140} 22 Q{m+166} 0 {m+200} 14
           Q{m+226} 26 {m+214} 52 Q{m+204} 72 {m+178} 66"/>
  <path d="M{m-30} 60 Q{m-16} 26 {m} 16 Q{m+16} 26 {m+30} 60" stroke-width="4"/>
  <path d="M{m-14} 58 Q{m} 34 {m+14} 58" stroke-width="2.4" opacity=".7"/>
</g>
<g fill="url(#bg2)">
  <circle cx="{m}" cy="12" r="8"/>
  <circle cx="{m-200}" cy="14" r="5.5" opacity=".85"/>
  <circle cx="{m+200}" cy="14" r="5.5" opacity=".85"/>
</g>
</svg>'''
