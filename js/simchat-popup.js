/* simchat-popup.js — פופ-אפ שמזכיר לרשום לסעודת שמחת תורה.
   מופיע לכל מבקר שנכנס לעמוד הראשי, פעם אחת. סגירה נשמרת ב-localStorage.
   פג תוקף אוטומטי אחרי שמחת תורה (04/10/2026) — לא צריך לתחזק ידנית. */
(function () {
  'use strict';

  var KEY   = 'mt-simchat-popup-v1';
  var UNTIL = new Date('2026-10-04T23:59:59');   // סוף שמחת תורה תשפ"ז
  var DELAY = 1400;                              // ms לפני שהפופ-אפ עולה

  if (Date.now() > UNTIL.getTime()) return;      // האירוע חלף — לא מציגים
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* ok */ }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function dismiss(root) {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    root.classList.add('sp-hide');
    setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 220);
  }

  function show() {
    if (document.getElementById('scPopupRoot')) return;

    var backdrop = el('div', { id: 'scPopupRoot', class: 'sp-backdrop', role: 'dialog',
                               'aria-modal': 'true', 'aria-labelledby': 'spTitle' });
    var card = el('div', { class: 'sp-card' });

    var closeBtn = el('button', { class: 'sp-close', 'aria-label': 'סגירה', type: 'button' });
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', function () { dismiss(backdrop); });

    var eyebrow = el('div', { class: 'sp-eyebrow' });
    eyebrow.textContent = 'שמחת תורה · תשפ״ז';

    var h = el('h3', { id: 'spTitle', class: 'sp-title' });
    h.textContent = 'סעודת שמחת תורה — יחד';

    var p = el('p', { class: 'sp-body' });
    p.textContent = 'המניין עורך סעודה משותפת בשמחת תורה. הרישום כאן עוזר לנו לתכנן ' +
                    'את כמות המנות. שתי דקות של מילוי — ותשמור לך מקום בשולחן.';

    var actions = el('div', { class: 'sp-actions' });
    var goBtn = el('a', { class: 'sp-btn sp-btn-p', href: 'simchat.html' });
    goBtn.textContent = 'לרישום לסעודה';
    goBtn.addEventListener('click', function () {
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    });

    var laterBtn = el('button', { class: 'sp-btn sp-btn-s', type: 'button' });
    laterBtn.textContent = 'לא עכשיו';
    laterBtn.addEventListener('click', function () { dismiss(backdrop); });

    actions.appendChild(goBtn);
    actions.appendChild(laterBtn);

    card.appendChild(closeBtn);
    card.appendChild(eyebrow);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(actions);
    backdrop.appendChild(card);

    /* לחיצה על הרקע = סגירה, אבל לא בתוך הכרטיס */
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) dismiss(backdrop);
    });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') {
        dismiss(backdrop);
        document.removeEventListener('keydown', esc);
      }
    });

    document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add('sp-show'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(show, DELAY); });
  } else {
    setTimeout(show, DELAY);
  }
})();
