/* motion.js — אנימציות כניסה, גלילה חלקה ומספרים שרצים.
 *
 * בלי ספריות חיצוניות: IntersectionObserver + CSS בלבד. ~2KB.
 * מכבד prefers-reduced-motion — מי שביקש פחות תנועה מקבל את הדף מיד,
 * בלי שום אנימציה, וכל התוכן גלוי.
 *
 * שימוש: להוסיף data-anim לאלמנט. אופציונלי data-anim-delay="120".
 */
(function () {
  'use strict';

  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var stopped = false;   /* רשת הביטחון עצרה את האנימציות */

  /* מפעילים את ההסתרה רק אם באמת נוכל להחזיר את התוכן */
  if (!reduce && 'IntersectionObserver' in window) root.classList.add('js-motion');

  /* רשת ביטחון: אם משהו נתקע — טאב ברקע, IntersectionObserver שלא נורה,
     rAF מושהה — אחרי 2 שניות הכול נחשף והמספרים מקבלים את ערכם הסופי.
     בלי זה מבקר עלול לראות דף ריק או מונה שתקוע על 0. */
  function failSafe() {
    stopped = true;
    document.querySelectorAll('[data-anim]:not(.in)').forEach(function (e) {
      e.classList.add('in');
    });
    /* גם מונה שכבר "נספר" אך נתקע על ערך חלקי — מקבל את הערך הסופי */
    document.querySelectorAll('[data-count]').forEach(function (e) {
      var want = (+e.dataset.count).toLocaleString('he-IL');
      if (e.textContent.trim() !== want) e.textContent = want;
      e.classList.add('counted');
    });
  }
  setTimeout(failSafe, 2000);
  /* וגם כשהמשתמש חוזר לטאב שהיה ברקע */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') setTimeout(failSafe, 700);
  });

  /* ── גלילה חלקה לעוגנים ─────────────────────────────────────── */
  if (!reduce) document.documentElement.style.scrollBehavior = 'smooth';

  /* ── כניסה בגלילה ───────────────────────────────────────────── */
  function markAll() {
    /* מקטעים, כרטיסים ובאנרים מקבלים אנימציה אוטומטית */
    var sel = 'section .head, .card, .promo, .shas-banner .wrap > *,' +
              '.seats-box, .give-box, .tbl-wrap, .facts .fact,' +
              '.stat, .seder, .track, .doc, .ms';
    var i = 0;
    document.querySelectorAll(sel).forEach(function (e) {
      if (e.hasAttribute('data-anim')) return;
      e.setAttribute('data-anim', '');
      /* השהיה מדורגת בתוך אותה שורה, מתאפסת בין קבוצות */
      var prev = e.previousElementSibling;
      i = (prev && prev.hasAttribute('data-anim')) ? Math.min(i + 1, 5) : 0;
      if (i) e.style.setProperty('--d', (i * 70) + 'ms');
    });
  }

  function observe() {
    var els = document.querySelectorAll('[data-anim]:not(.in)');
    if (!els.length) return;

    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ── מספרים שרצים ───────────────────────────────────────────── */
  function countUp(el, to, ms) {
    if (reduce) { el.textContent = to.toLocaleString('he-IL'); return; }
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / ms);
      /* easeOutCubic — מהיר בהתחלה ונרגע */
      var v = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (stopped) { el.textContent = to.toLocaleString('he-IL'); return; }
      el.textContent = v.toLocaleString('he-IL');
      if (p < 1) requestAnimationFrame(step);
    }
    /* מאפסים רק בתוך הפריים הראשון. אם rAF לא רץ כלל — הערך הסופי
       שכבר מוצג נשאר על המסך, במקום 0 תקוע. */
    requestAnimationFrame(function (t) { step(t); });
  }

  /* מפעיל ספירה על כל אלמנט עם data-count כשהוא נכנס למסך */
  function counters() {
    var els = document.querySelectorAll('[data-count]:not(.counted)');
    if (!els.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (e) {
        e.classList.add('counted');
        e.textContent = (+e.dataset.count).toLocaleString('he-IL');
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var e = en.target;
        e.classList.add('counted');
        countUp(e, +e.dataset.count, 900);
        io.unobserve(e);
      });
    }, { threshold: 0.4 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ── הפעלה ──────────────────────────────────────────────────── */
  var Motion = {
    refresh: function () { markAll(); observe(); counters(); }
  };
  window.Motion = Motion;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Motion.refresh);
  } else {
    Motion.refresh();
  }
  /* התוכן נבנה מ-JS אחרי טעינת ה-JSON — סורקים שוב כשהוא מוכן */
  window.addEventListener('load', Motion.refresh);
})();
