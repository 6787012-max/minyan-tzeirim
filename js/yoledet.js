(function () {
  'use strict';
  var C = window.MealsCore, $ = C.$, esc = C.esc;
  var DATA = null;

  function render() {
    var d = DATA, up = $('urgent');
    // מחכה לפינוק: משבצות פנויות היום ומחר בכל המשפחות
    if (d.families.length) {
      var days = [{ iso: d.today, lab: 'היום' }, { iso: d.tomorrow, lab: 'מחר' }];
      var html = '<h2>עוד מחכה לפינוק היום ומחר</h2><div class="sub">ארוחות שמחכות לך. לחיצה אחת ואת מפנקת.</div>';
      var any = false;
      days.forEach(function (dd) {
        var items = d.urgent.filter(function (u) { return u.day === dd.iso; });
        if (!items.length) return;
        any = true;
        html += '<div class="uday">' + dd.lab + ' · ' + esc(C.fmtFull(dd.iso)) + '</div><div class="uitems">' + items.map(function (u) {
          return '<button class="uitem" type="button" data-slug="' + esc(u.slug) + '" data-slot="' + u.slot_id + '"><span class="m">' + esc(u.short) + '</span><span class="n">' + esc(u.family) + ' · אני מפנקת</span></button>';
        }).join('') + '</div>';
      });
      if (!any) html += '<div class="uempty">היום ומחר כולן מפונקות. איזה כיף, תודה לכולן!</div>';
      up.innerHTML = html; up.hidden = false;
    } else up.hidden = true;

    $('famHead').hidden = !d.families.length;
    $('fams').innerHTML = d.families.length ? d.families.map(function (f) {
      var tot = f.free + f.taken, pct = tot ? Math.round(f.taken * 100 / tot) : 0;
      return '<a class="fam" href="meals.html?e=' + encodeURIComponent(f.slug) + '"><div class="top"><h3>' + esc(f.family) + '</h3><span class="go">לדף השמחה &larr;</span></div>' +
        '<div class="meta">' + esc(C.fmtShort(f.date_from)) + ' עד ' + esc(C.fmtShort(f.date_to)) + (f.next_free ? ' · הארוחה הקרובה שמחכה: ' + esc(C.fmtShort(f.next_free)) : '') + '</div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="counts"><span class="cf">' + f.free + ' מחכות לפינוק</span><span class="ct">' + f.taken + ' כבר מפונקות</span></div></a>';
    }).join('') : '<div class="empty">כרגע אין שמחה חדשה בלוח. יהיו רק בשורות טובות!</div>';
  }

  function load() {
    return C.call({ action: 'home' }).then(function (d) {
      if (!d.ok) { $('fams').innerHTML = '<div class="err">לא הצלחנו לטעון, נסו לרענן.</div>'; return; }
      DATA = d; if (!C.isSignOpen()) render(); else DATA.stale = true;
    }).catch(function () { $('fams').innerHTML = '<div class="err">אין חיבור כרגע, נסו לרענן.</div>'; });
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
