/* admin-ads.js — עורך מודעות WYSIWYG לפאנל הניהול של מניין הצעירים.
 *
 * מודל נתונים:
 *   canvas: { w, h, bg }
 *   elements: [{ id, type: 'text'|'image', x,y,w,h, rotation,
 *                text?, font?, size?, weight?, color?, align?, line?,
 *                src? }]
 *   כל הקואורדינטות בפיקסלים של הקנבס הטבעי (למשל 1240x1754 עבור A4@300dpi).
 *
 * ייצוא PNG: רינדור נטיב לקנבס. ייצוא PDF: jsPDF (vendor).
 * מייל: mailto + הורדה, המשתמש גורר את הקבצים לחלון המייל.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ── מצב ────────────────────────────────────────────────────── */
  var state = {
    canvas: { w: 1240, h: 1754, bg: '#F6F1E5' },
    elements: [],
    selectedId: null,
    scale: 1,
    templates: [],
    history: [],
    hIdx: -1,
    inited: false
  };

  var STORAGE_KEY = 'mt-ads-draft-v1';

  /* ── עזרים ─────────────────────────────────────────────────── */
  function newId() { return 'el-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hint(msg, cls) {
    var el = $('#aeHint'); if (!el) return;
    el.textContent = msg || '';
    el.className = 'ae-hint' + (cls ? ' ' + cls : '');
  }

  function pushHistory() {
    var snap = clone({ canvas: state.canvas, elements: state.elements });
    state.history = state.history.slice(0, state.hIdx + 1);
    state.history.push(snap);
    if (state.history.length > 60) state.history.shift();
    state.hIdx = state.history.length - 1;
    saveDraft();
  }
  function undo() {
    if (state.hIdx <= 0) return;
    state.hIdx--;
    var s = clone(state.history[state.hIdx]);
    state.canvas = s.canvas; state.elements = s.elements;
    state.selectedId = null;
    render(); renderProps();
    hint('בוטל שינוי אחרון.');
  }
  function redo() {
    if (state.hIdx >= state.history.length - 1) return;
    state.hIdx++;
    var s = clone(state.history[state.hIdx]);
    state.canvas = s.canvas; state.elements = s.elements;
    render(); renderProps();
    hint('בוצע מחדש.');
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        canvas: state.canvas, elements: state.elements, t: Date.now()
      }));
    } catch (e) { /* מצב פרטי / מלא */ }
  }
  function loadDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !d.canvas || !Array.isArray(d.elements)) return false;
      state.canvas = d.canvas; state.elements = d.elements;
      state.elements.forEach(function (e) { if (!e.id) e.id = newId(); });
      return true;
    } catch (e) { return false; }
  }

  /* ── תבניות ────────────────────────────────────────────────── */
  function loadTemplates() {
    return fetch('data/ads-templates.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.templates = d.templates || [];
        var sel = $('#aeTpl');
        sel.innerHTML = '';
        state.templates.forEach(function (t) {
          var o = document.createElement('option');
          o.value = t.id; o.textContent = t.name;
          sel.appendChild(o);
        });
      })
      .catch(function (e) { hint('שגיאה בטעינת תבניות: ' + e.message, 'err'); });
  }
  function applyTemplate(id) {
    var t = state.templates.find(function (x) { return x.id === id; });
    if (!t) return;
    state.canvas = clone(t.canvas);
    state.elements = clone(t.elements).map(function (e) {
      e.id = newId();
      if (!e.rotation) e.rotation = 0;
      return e;
    });
    state.selectedId = null;
    resizeCanvas();
    render();
    renderProps();
    pushHistory();
    hint('נטענה תבנית: ' + t.name, 'ok');
  }

  /* ── קנבס: גדלים ═════════════════════════════════════════════ */
  var PAGE_SIZES = {
    A4:     { w: 1240, h: 1754 },
    A4L:    { w: 1754, h: 1240 },
    A5:     { w: 874,  h: 1240 },
    Square: { w: 1080, h: 1080 },
    Story:  { w: 1080, h: 1920 }
  };
  function setPageSize(code) {
    var s = PAGE_SIZES[code]; if (!s) return;
    state.canvas.w = s.w; state.canvas.h = s.h;
    resizeCanvas();
    render();
    pushHistory();
  }

  function resizeCanvas() {
    var wrap = $('#aeCanvasWrap');
    var cv = $('#aeCanvas');
    cv.style.width = state.canvas.w + 'px';
    cv.style.height = state.canvas.h + 'px';
    cv.style.background = state.canvas.bg;

    // סקייל אוטומטי כדי שיתאים לחלון (משאיר שוליים 40px)
    var wAvail = wrap.clientWidth - 48;
    var hAvail = Math.max(600, window.innerHeight - 260);
    var scale = Math.min(wAvail / state.canvas.w, hAvail / state.canvas.h, 1);
    state.scale = scale;
    cv.style.transform = 'scale(' + scale + ')';
    // גובה בפועל אחרי scale
    wrap.style.minHeight = (state.canvas.h * scale + 60) + 'px';
    var bg = $('#aeBgColor'); if (bg) bg.value = state.canvas.bg;
  }

  /* ── רינדור ═════════════════════════════════════════════════ */
  function render() {
    var cv = $('#aeCanvas');
    cv.innerHTML = '';
    state.elements.forEach(function (el) { cv.appendChild(buildElNode(el)); });
    highlightSelection();
  }

  function buildElNode(el) {
    var d = document.createElement('div');
    d.className = 'ae-el ' + el.type;
    d.dataset.id = el.id;
    d.style.left = el.x + 'px';
    d.style.top = el.y + 'px';
    d.style.width = el.w + 'px';
    d.style.height = el.h + 'px';
    if (el.rotation) d.style.transform = 'rotate(' + el.rotation + 'deg)';

    if (el.type === 'text') {
      d.style.fontFamily = el.font || 'Asst, sans-serif';
      d.style.fontSize = (el.size || 32) + 'px';
      d.style.fontWeight = el.weight || 400;
      d.style.color = el.color || '#12233F';
      d.style.textAlign = el.align || 'right';
      d.style.lineHeight = el.line || 1.3;
      var t = document.createElement('div');
      t.className = 'txt';
      t.textContent = el.text || '';
      d.appendChild(t);
    } else if (el.type === 'image') {
      var img = document.createElement('img');
      img.src = el.src || '';
      img.alt = '';
      d.appendChild(img);
    }

    // ידיות שינוי גודל
    ['tl','tr','bl','br','rot'].forEach(function (pos) {
      var h = document.createElement('div');
      h.className = 'ae-hnd ' + pos;
      h.dataset.hnd = pos;
      d.appendChild(h);
    });

    return d;
  }

  function highlightSelection() {
    $$('.ae-el', $('#aeCanvas')).forEach(function (n) {
      n.classList.toggle('sel', n.dataset.id === state.selectedId);
    });
  }

  /* ── הוספה / מחיקה / שכפול ═════════════════════════════════ */
  function addText() {
    var el = {
      id: newId(), type: 'text',
      x: Math.round(state.canvas.w * .1),
      y: Math.round(state.canvas.h * .4),
      w: Math.round(state.canvas.w * .8), h: 100,
      text: 'טקסט חדש', font: 'Frank, serif',
      size: 48, weight: 700, color: '#12233F', align: 'center', line: 1.3,
      rotation: 0
    };
    state.elements.push(el);
    state.selectedId = el.id;
    render(); renderProps(); pushHistory();
    hint('נוסף טקסט. לחיצה כפולה לעריכה.');
  }

  function addImage(src) {
    var el = {
      id: newId(), type: 'image',
      x: Math.round(state.canvas.w * .3),
      y: Math.round(state.canvas.h * .3),
      w: Math.round(state.canvas.w * .4),
      h: Math.round(state.canvas.w * .4),
      src: src || 'img/logo-h.svg', rotation: 0
    };
    state.elements.push(el);
    state.selectedId = el.id;
    render(); renderProps(); pushHistory();
    hint('נוספה תמונה.');
  }

  function delSelected() {
    if (!state.selectedId) return;
    state.elements = state.elements.filter(function (e) { return e.id !== state.selectedId; });
    state.selectedId = null;
    render(); renderProps(); pushHistory();
  }
  function dupSelected() {
    var el = getSel(); if (!el) return;
    var c = clone(el); c.id = newId(); c.x += 30; c.y += 30;
    state.elements.push(c); state.selectedId = c.id;
    render(); renderProps(); pushHistory();
  }
  function moveLayer(dir) {
    var i = state.elements.findIndex(function (e) { return e.id === state.selectedId; });
    if (i < 0) return;
    var j = i + (dir === 'up' ? 1 : -1);
    if (j < 0 || j >= state.elements.length) return;
    var tmp = state.elements[i]; state.elements[i] = state.elements[j]; state.elements[j] = tmp;
    render(); pushHistory();
  }

  function getSel() { return state.elements.find(function (e) { return e.id === state.selectedId; }); }

  /* ── פאנל תכונות ═════════════════════════════════════════════ */
  function renderProps() {
    var empty = $('.ae-props-empty');
    var panel = $('.ae-props-panel');
    var el = getSel();
    if (!el) {
      empty.hidden = false; panel.hidden = true;
      return;
    }
    empty.hidden = true; panel.hidden = false;

    // הצג/הסתר שדות טקסט
    var isText = el.type === 'text';
    $$('.ae-fld-text', panel).forEach(function (f) { f.hidden = !isText; });

    if (isText) {
      $('#aePropText').value = el.text || '';
      $('#aePropFont').value = el.font || 'Frank, serif';
      $('#aePropSize').value = el.size || 32;
      $('#aePropWeight').value = String(el.weight || 400);
      $('#aePropAlign').value = el.align || 'right';
      $('#aePropColor').value = el.color || '#12233F';
      $('#aePropLine').value = el.line || 1.3;
    }
    $('#aePropX').value = Math.round(el.x);
    $('#aePropY').value = Math.round(el.y);
    $('#aePropW').value = Math.round(el.w);
    $('#aePropH').value = Math.round(el.h);
    $('#aePropRot').value = el.rotation || 0;
  }

  function updateSelected(patch) {
    var el = getSel(); if (!el) return;
    Object.assign(el, patch);
    // עדכן רק את הצומת המתאים (לא רינדור מלא, כדי לא לאבד פוקוס)
    var node = $('.ae-el[data-id="' + el.id + '"]', $('#aeCanvas'));
    if (node) {
      node.style.left = el.x + 'px';
      node.style.top = el.y + 'px';
      node.style.width = el.w + 'px';
      node.style.height = el.h + 'px';
      node.style.transform = el.rotation ? 'rotate(' + el.rotation + 'deg)' : '';
      if (el.type === 'text') {
        node.style.fontFamily = el.font;
        node.style.fontSize = el.size + 'px';
        node.style.fontWeight = el.weight;
        node.style.color = el.color;
        node.style.textAlign = el.align;
        node.style.lineHeight = el.line;
        var t = node.querySelector('.txt'); if (t) t.textContent = el.text || '';
      } else if (el.type === 'image') {
        var img = node.querySelector('img'); if (img && patch.src) img.src = el.src;
      }
    }
    saveDraft();
  }

  /* ── אינטראקציה: גרירה + שינוי גודל ═════════════════════════ */
  function initInteraction() {
    var cv = $('#aeCanvas');
    var drag = null;

    cv.addEventListener('pointerdown', function (e) {
      var elNode = e.target.closest('.ae-el');
      if (!elNode || elNode === cv) {
        state.selectedId = null; highlightSelection(); renderProps();
        return;
      }
      var id = elNode.dataset.id;
      state.selectedId = id;
      highlightSelection(); renderProps();

      var el = state.elements.find(function (x) { return x.id === id; });
      var hnd = e.target.dataset.hnd;
      drag = {
        mode: hnd ? (hnd === 'rot' ? 'rotate' : 'resize') : 'move',
        hnd: hnd,
        startX: e.clientX, startY: e.clientY,
        origX: el.x, origY: el.y, origW: el.w, origH: el.h, origRot: el.rotation || 0
      };
      elNode.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var el = getSel(); if (!el) return;
      var dx = (e.clientX - drag.startX) / state.scale;
      var dy = (e.clientY - drag.startY) / state.scale;

      if (drag.mode === 'move') {
        el.x = Math.round(drag.origX + dx);
        el.y = Math.round(drag.origY + dy);
      } else if (drag.mode === 'resize') {
        var nx = drag.origX, ny = drag.origY, nw = drag.origW, nh = drag.origH;
        if (drag.hnd.indexOf('r') > -1) { nw = drag.origW + dx; }
        if (drag.hnd.indexOf('l') > -1) { nw = drag.origW - dx; nx = drag.origX + dx; }
        if (drag.hnd.indexOf('b') > -1) { nh = drag.origH + dy; }
        if (drag.hnd.indexOf('t') > -1) { nh = drag.origH - dy; ny = drag.origY + dy; }
        if (nw < 20) nw = 20;
        if (nh < 20) nh = 20;
        el.x = Math.round(nx); el.y = Math.round(ny);
        el.w = Math.round(nw); el.h = Math.round(nh);
      } else if (drag.mode === 'rotate') {
        var node = $('.ae-el[data-id="' + el.id + '"]', cv);
        var r = node.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var ang = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
        el.rotation = Math.round(ang);
      }
      updateSelected({ x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation });
      renderProps();
    });

    cv.addEventListener('pointerup', function () {
      if (drag) { drag = null; pushHistory(); }
    });

    // עריכת טקסט בלחיצה כפולה
    cv.addEventListener('dblclick', function (e) {
      var elNode = e.target.closest('.ae-el.text');
      if (!elNode) return;
      var id = elNode.dataset.id;
      var el = state.elements.find(function (x) { return x.id === id; });
      if (!el) return;
      var t = elNode.querySelector('.txt');
      t.contentEditable = 'true';
      elNode.classList.add('editing');
      t.focus();
      // בחר את כל הטקסט
      var rng = document.createRange(); rng.selectNodeContents(t);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      var blur = function () {
        t.removeEventListener('blur', blur);
        t.contentEditable = 'false';
        elNode.classList.remove('editing');
        el.text = t.textContent;
        renderProps();
        pushHistory();
      };
      t.addEventListener('blur', blur);
    });

    // קיצורי מקלדת
    document.addEventListener('keydown', function (e) {
      if ($('#adsSec').hidden) return;
      var tag = (e.target.tagName || '').toLowerCase();
      var editing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
                    (e.target.isContentEditable);
      if (editing) return;

      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' ||
          (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); dupSelected(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedId) { e.preventDefault(); delSelected(); return; }
      }
      var el = getSel(); if (!el) return;
      var step = e.shiftKey ? 20 : 2;
      var moved = true;
      if (e.key === 'ArrowLeft')  el.x -= step;
      else if (e.key === 'ArrowRight') el.x += step;
      else if (e.key === 'ArrowUp') el.y -= step;
      else if (e.key === 'ArrowDown') el.y += step;
      else moved = false;
      if (moved) {
        e.preventDefault();
        updateSelected({ x: el.x, y: el.y });
        renderProps();
      }
    });
  }

  /* ── ייצוא PNG ═════════════════════════════════════════════ */
  function renderToCanvas() {
    var W = state.canvas.w, H = state.canvas.h;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = state.canvas.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.direction = 'rtl';

    // המתן לגופנים לפני ציור
    return document.fonts.ready.then(function () {
      var promises = [];
      state.elements.forEach(function (el) {
        promises.push(drawElement(ctx, el));
      });
      return Promise.all(promises).then(function () { return cv; });
    });
  }

  function drawElement(ctx, el) {
    return new Promise(function (resolve) {
      ctx.save();
      // סיבוב סביב המרכז
      var cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      if (el.rotation) {
        ctx.translate(cx, cy);
        ctx.rotate(el.rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }

      if (el.type === 'image') {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          // שמור יחס — כמו object-fit: contain
          var iw = img.naturalWidth, ih = img.naturalHeight;
          var s = Math.min(el.w / iw, el.h / ih);
          var dw = iw * s, dh = ih * s;
          var dx = el.x + (el.w - dw) / 2, dy = el.y + (el.h - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();
          resolve();
        };
        img.onerror = function () { ctx.restore(); resolve(); };
        img.src = el.src;
      } else if (el.type === 'text') {
        var weight = el.weight || 400;
        var size = el.size || 32;
        var family = el.font || 'Asst, sans-serif';
        ctx.font = weight + ' ' + size + 'px ' + family;
        ctx.fillStyle = el.color || '#12233F';
        ctx.textAlign = el.align === 'center' ? 'center' :
                        el.align === 'left' ? 'left' : 'right';
        ctx.textBaseline = 'top';
        ctx.direction = 'rtl';
        var lineH = size * (el.line || 1.3);
        var lines = wrapLines(ctx, el.text || '', el.w - 12);
        var totalH = lines.length * lineH;
        // מרכז אנכית בתוך הקופסה
        var startY = el.y + Math.max(0, (el.h - totalH) / 2) + 4;
        var xAnchor = el.align === 'center' ? (el.x + el.w / 2) :
                      el.align === 'left' ? (el.x + 6) :
                      (el.x + el.w - 6);
        lines.forEach(function (ln, i) {
          ctx.fillText(ln, xAnchor, startY + i * lineH);
        });
        ctx.restore();
        resolve();
      } else {
        ctx.restore(); resolve();
      }
    });
  }

  function wrapLines(ctx, text, maxW) {
    var out = [];
    (text || '').split('\n').forEach(function (para) {
      var words = para.split(' ');
      var cur = '';
      words.forEach(function (w) {
        var trial = cur ? cur + ' ' + w : w;
        if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
        else { out.push(cur); cur = w; }
      });
      if (cur !== '') out.push(cur);
      if (para === '') out.push('');
    });
    return out;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportPng() {
    hint('מייצא PNG…');
    return renderToCanvas().then(function (cv) {
      return new Promise(function (res) {
        cv.toBlob(function (b) {
          download(b, filename('png'));
          hint('הורד PNG.', 'ok');
          res(b);
        }, 'image/png');
      });
    });
  }

  function exportPdf() {
    hint('מייצא PDF…');
    return renderToCanvas().then(function (cv) {
      var dataUrl = cv.toDataURL('image/jpeg', 0.92);
      // גודל דף PDF במ״מ, לפי יחס A4 / כל גודל אחר
      var W = state.canvas.w, H = state.canvas.h;
      var orient = W > H ? 'l' : 'p';
      // ננרמל למ״מ: 300dpi = 25.4/300 מ״מ לפיקסל
      var mmW = W * 25.4 / 300;
      var mmH = H * 25.4 / 300;
      var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      var doc = new jsPDF({ orientation: orient, unit: 'mm', format: [mmW, mmH] });
      doc.addImage(dataUrl, 'JPEG', 0, 0, mmW, mmH);
      doc.save(filename('pdf'));
      hint('הורד PDF.', 'ok');
    });
  }

  function filename(ext) {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return 'moda_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.' + ext;
  }

  /* ── שליחת מייל ═════════════════════════════════════════════ */
  function openMailModal() {
    $('#aeMailModal').hidden = false;
    setTimeout(function () { $('#aeMailTo').focus(); }, 50);
  }
  function closeMailModal() { $('#aeMailModal').hidden = true; }

  function sendMail() {
    var to = $('#aeMailTo').value.trim();
    var subj = $('#aeMailSubj').value.trim() || 'מודעה מהמניין';
    var body = $('#aeMailBody').value;
    if (!to) { $('#aeMailTo').focus(); return; }
    hint('מכין קבצים ופותח את תוכנת המייל…');
    // הורד PNG + PDF, ואז פתח mailto
    Promise.all([exportPng(), exportPdf()]).then(function () {
      var url = 'mailto:' + encodeURIComponent(to) +
        '?subject=' + encodeURIComponent(subj) +
        '&body=' + encodeURIComponent(body);
      window.location.href = url;
      closeMailModal();
      hint('המייל נפתח והקבצים הורדו. גרור אותם לחלון המייל.', 'ok');
    });
  }

  /* ── שמירה / פתיחה של קובץ פרויקט ═══════════════════════════ */
  function saveProject() {
    var data = { canvas: state.canvas, elements: state.elements };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    download(blob, 'moda_project_' + Date.now() + '.json');
    hint('הפרויקט נשמר לקובץ JSON.', 'ok');
  }

  /* ── תמיכה בהעלאת תמונה מהמשתמש ═════════════════════════════ */
  function handleUpload(file) {
    var reader = new FileReader();
    reader.onload = function (e) { addImage(e.target.result); };
    reader.readAsDataURL(file);
  }

  /* ── חיבור UI ═════════════════════════════════════════════ */
  function bind() {
    $('#aeLoadTpl').addEventListener('click', function () { applyTemplate($('#aeTpl').value); });
    $('#aeAddText').addEventListener('click', addText);
    $('#aeAddImg').addEventListener('click', function () { addImage(); });
    $('#aeUpload').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (f) handleUpload(f);
      e.target.value = '';
    });
    $('#aeUndo').addEventListener('click', undo);
    $('#aeRedo').addEventListener('click', redo);
    $('#aeSave').addEventListener('click', saveProject);
    $('#aeExportPng').addEventListener('click', exportPng);
    $('#aeExportPdf').addEventListener('click', exportPdf);
    $('#aeSendMail').addEventListener('click', openMailModal);
    $('#aeMailCancel').addEventListener('click', closeMailModal);
    $('#aeMailSend').addEventListener('click', sendMail);
    $('#aeBgColor').addEventListener('input', function (e) {
      state.canvas.bg = e.target.value;
      $('#aeCanvas').style.background = state.canvas.bg;
      saveDraft();
    });
    $('#aeBgColor').addEventListener('change', pushHistory);
    $('#aePageSize').addEventListener('change', function (e) { setPageSize(e.target.value); });

    // שדות פאנל
    $('#aePropText').addEventListener('input', function (e) { updateSelected({ text: e.target.value }); });
    $('#aePropText').addEventListener('change', pushHistory);
    $('#aePropFont').addEventListener('change', function (e) { updateSelected({ font: e.target.value }); pushHistory(); });
    $('#aePropSize').addEventListener('input', function (e) { updateSelected({ size: parseInt(e.target.value, 10) || 16 }); });
    $('#aePropSize').addEventListener('change', pushHistory);
    $('#aePropWeight').addEventListener('change', function (e) { updateSelected({ weight: parseInt(e.target.value, 10) }); pushHistory(); });
    $('#aePropAlign').addEventListener('change', function (e) { updateSelected({ align: e.target.value }); pushHistory(); });
    $('#aePropColor').addEventListener('input', function (e) { updateSelected({ color: e.target.value }); });
    $('#aePropColor').addEventListener('change', pushHistory);
    $('#aePropLine').addEventListener('input', function (e) { updateSelected({ line: parseFloat(e.target.value) || 1.3 }); });
    $('#aePropLine').addEventListener('change', pushHistory);
    ['X','Y','W','H','Rot'].forEach(function (k) {
      var input = $('#aeProp' + k);
      input.addEventListener('change', function (e) {
        var v = parseInt(e.target.value, 10) || 0;
        var key = k === 'Rot' ? 'rotation' : k.toLowerCase();
        var patch = {}; patch[key] = v;
        updateSelected(patch); pushHistory();
      });
    });
    $('#aeLayerUp').addEventListener('click', function () { moveLayer('up'); });
    $('#aeLayerDown').addEventListener('click', function () { moveLayer('down'); });
    $('#aeDup').addEventListener('click', dupSelected);
    $('#aeDel').addEventListener('click', delSelected);

    // סקייל מחדש בשינוי גודל חלון
    window.addEventListener('resize', function () {
      if (!$('#adsSec').hidden) resizeCanvas();
    });
  }

  /* ── אתחול ═════════════════════════════════════════════════ */
  function init() {
    if (state.inited) return;
    state.inited = true;
    bind();
    initInteraction();

    var restored = loadDraft();
    loadTemplates().then(function () {
      if (!restored) {
        applyTemplate('donation');  // ברירת מחדל = מודעת התרמה
      } else {
        resizeCanvas();
        render();
        pushHistory();
        hint('שוחזר טיוטה מקומית. בחר תבנית מהתפריט אם רוצים להתחיל מחדש.', 'ok');
      }
    });
  }

  // הפעל כשה-panel של המודעות נחשף
  function watchPanel() {
    var sec = $('#adsSec');
    if (!sec) return;
    var mo = new MutationObserver(function () {
      if (!sec.hidden && !state.inited) {
        // המתן טיפה ל-CSS ולפריסה
        setTimeout(init, 30);
      } else if (!sec.hidden) {
        setTimeout(resizeCanvas, 30);
      }
    });
    mo.observe(sec, { attributes: true, attributeFilter: ['hidden'] });
    // אם כבר מוצג (אחרי טעינה + sessionStorage)
    if (!sec.hidden) setTimeout(init, 60);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchPanel);
  } else {
    watchPanel();
  }
})();
