(function () {
  'use strict';
  var C = window.MealsCore, $ = C.$, esc = C.esc;
  var DATA = null;

  function render() {
    var d = DATA, up = $('urgent');
    // דחוף: משבצות פנויות היום ומחר בכל המשפחות
    if (d.families.length) {
      var days = [{ iso: d.today, lab: 'היום' }, { iso: d.tomorrow, lab: 'מחר' }];
      var html = '<h2>מה דחוף היום ומחר</h2><div class="sub">ארוחות שעדיין אף אחת לא לקחה. לחיצה אחת ואת רשומה.</div>';
      var any = false;
      days.forEach(function (dd) {
        var items = d.urgent.filter(function (u) { return u.day === dd.iso; });
        if (!items.length) return;
        any = true;
        html += '<div class="uday">' + dd.lab + ' · ' + esc(C.fmtFull(dd.iso)) + '</div><div class="uitems">' + items.map(function (u) {
          return '<button class="uitem" type="button" data-slug="' + esc(u.slug) + '" data-slot="' + u.slot_id + '"><span class="m">' + esc(u.short) + '</span><span class="n">' + esc(u.family) + ' · פנוי +</span></button>';
        }).join('') + '</div>';
      });
      if (!any) html += '<div class="uempty">היום ומחר הכול מסודר, תודה רבה לכולן!</div>';
      up.innerHTML = html; up.hidden = false;
    } else up.hidden = true;

    $('famHead').hidden = !d.families.length;
    $('fams').innerHTML = d.families.length ? d.families.map(function (f) {
      var tot = f.free + f.taken, pct = tot ? Math.round(f.taken * 100 / tot) : 0;
      return '<a class="fam" href="meals.html?e=' + encodeURIComponent(f.slug) + '"><div class="top"><h3>' + esc(f.family) + '</h3><span class="go">לדף המשפחה &larr;</span></div>' +
        '<div class="meta">' + esc(C.fmtShort(f.date_from)) + ' עד ' + esc(C.fmtShort(f.date_to)) + (f.next_free ? ' · הפנויה הקרובה: ' + esc(C.fmtShort(f.next_free)) : '') + '</div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="counts"><span class="cf">' + f.free + ' פנויות</span><span class="ct">' + f.taken + ' תפוסות</span></div></a>';
    }).join('') : '<div class="empty">כרגע אין משפחות שמחכות לעזרה. יהיו רק בשורות טובות!</div>';
  }

  function load() {
    return C.call({ action: 'home' }).then(function (d) {
      if (!d.ok) { $('fams').innerHTML = '<div class="err">לא הצלחנו לטעון. נסו לרענן.</div>'; return; }
      DATA = d; if (!C.isSignOpen()) render(); else DATA.stale = true;
    }).catch(function () { $('fams').innerHTML = '<div class="err">אין חיבור כרגע. נסו לרענן.</div>'; });
  }

  $('urgent').addEventListener('click', function (ev) {
    var b = ev.target.closest('.uitem'); if (!b) return;
    var slot = +b.getAttribute('data-slot'), u = DATA.urgent.filter(function (x) { return x.slot_id === slot; })[0]; if (!u) return;
    C.openSign({ slug: u.slug, slot_id: u.slot_id, title: u.label + ' · ' + C.fmtFull(u.day), sub: 'ל' + u.family, bring: u.bring,
      onDone: load, onClose: function () { if (DATA && DATA.stale) { DATA.stale = false; render(); } } });
  });

  C.init().then(load).then(function () { setInterval(load, 30000); })
    .catch(function () { $('fams').innerHTML = '<div class="err">אין חיבור. נסו לרענן.</div>'; });
})();
