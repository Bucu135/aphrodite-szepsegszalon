/* ============================================================
   Aphrodite Szépségszalon — site.js
   Natív görgetés (nincs Lenis: statikus oldalon gyorsabb, és a
   scroll-behavior:smooth-szal nem dolgozik egymás ellen).
   Nincs egyedi kurzor, nincs mágneses gomb.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  // a román oldalakon (/ro/) román szövegek — a HTML-t a build fordítja, a JS-szövegeket ez
  var RO = root.lang === 'ro';
  var T = function (hu, ro) { return RO ? ro : hu; };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ── betöltő: a munkamenet első oldalán ~0,9 s, utána azonnal ── */
  function betoltve() {
    root.classList.add('betoltve');
    try { sessionStorage.setItem('aph-betoltve', '1'); } catch (e) {}
  }
  if (root.classList.contains('mar-jart') || reduce) betoltve();
  else window.addEventListener('load', function () { setTimeout(betoltve, 650); });
  setTimeout(betoltve, 2500);   // biztonsági háló: lassú képek mellett se ragadjon ott

  /* ── fejléc tömörödése görgetésre ── */
  var tomor = false;
  function fejlec() {
    var t = window.scrollY > 40;
    if (t !== tomor) { tomor = t; root.classList.toggle('tomor', t); }
  }
  window.addEventListener('scroll', fejlec, { passive: true });
  fejlec();

  /* ── mobilmenü ── */
  var menuBtn = $('.menu-btn'), menu = $('#mobil-menu');
  function menuAllapot(nyitva) {
    if (!menu) return;
    menuBtn.setAttribute('aria-expanded', String(nyitva));
    menuBtn.setAttribute('aria-label', nyitva ? T('Menü bezárása', 'Închide meniul') : T('Menü megnyitása', 'Deschide meniul'));
    menu.hidden = false;
    root.classList.toggle('menu-nyitva', nyitva);
    if (nyitva) { var elso = $('a', menu); if (elso) elso.focus({ preventScroll: true }); }
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () { menuAllapot(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { menuAllapot(false); }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('menu-nyitva')) { menuAllapot(false); menuBtn.focus(); }
    });
  }

  /* ── reveal: KÉT IRÁNYBA — ki- és begördüléskor is újra fut ── */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('in', e.isIntersecting); });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('.rv, .rule-rv').forEach(function (el) { io.observe(el); });
  } else {
    $$('.rv, .rule-rv').forEach(function (el) { el.classList.add('in'); });
  }

  /* ── számlálók: minden belépéskor újraszámolnak ── */
  function szamlal(el) {
    var cel = parseInt(el.getAttribute('data-cel'), 10), uto = el.getAttribute('data-utotag') || '';
    var t0 = null, dur = 1000;
    function lep(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1), v = Math.round(cel * (1 - Math.pow(1 - p, 3)));
      el.textContent = v.toLocaleString('hu-HU') + uto;
      if (p < 1) requestAnimationFrame(lep);
    }
    requestAnimationFrame(lep);
  }
  var szamlalok = $$('[data-szamlal]');
  szamlalok.forEach(function (el) { el.setAttribute('data-cel', el.textContent.replace(/\D/g, '')); });
  if ('IntersectionObserver' in window && !reduce && szamlalok.length) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) szamlal(e.target); });
    }, { threshold: 0.6 });
    szamlalok.forEach(function (el) { sio.observe(el); });
  }

  /* ── hero-medalionok parallaxa (csak ha egy sorban vannak és széles a kijelző) ── */
  var arches = $$('.arch'), sebesseg = [-6, -12, -6], rafVar = false;
  function parallax() {
    rafVar = false;
    var aktiv = !reduce && window.innerWidth > 1024, y = window.scrollY;
    arches.forEach(function (a, i) {
      a.style.transform = aktiv && y < 1000 ? 'translate3d(0,' + (y / 100 * sebesseg[i % 3]).toFixed(1) + 'px,0)' : '';
    });
  }
  if (arches.length) {
    window.addEventListener('scroll', function () { if (!rafVar) { rafVar = true; requestAnimationFrame(parallax); } }, { passive: true });
    window.addEventListener('resize', parallax);
    parallax();
  }

  /* ── bemutatkozó ablakok (natív <dialog>) ── */
  function dialogNyit(d, gomb) {
    if (!d || typeof d.showModal !== 'function') return false;
    d.showModal();
    d._gomb = gomb;
    return true;
  }
  $$('[data-bio]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      if (dialogNyit(document.getElementById(g.getAttribute('data-bio')), g)) e.preventDefault();
    });
  });
  $$('dialog.bio').forEach(function (d) {
    $$('[data-zar]', d).forEach(function (z) { z.addEventListener('click', function () { d.close(); }); });
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });   // a háttérre kattintás bezár
    d.addEventListener('close', function () { if (d._gomb) d._gomb.focus({ preventScroll: true }); });
  });

  /* ── árlista-fülek (Katalin / Gabi és Zsuzsa) — nyilakkal is ── */
  $$('[data-fulek]').forEach(function (blokk) {
    var fulek = $$('[role="tab"]', blokk);
    function valaszt(i, fokusz) {
      fulek.forEach(function (f, j) {
        var ez = i === j;
        f.setAttribute('aria-selected', String(ez));
        f.tabIndex = ez ? 0 : -1;
        document.getElementById(f.getAttribute('aria-controls')).hidden = !ez;
      });
      if (fokusz) fulek[i].focus();
    }
    fulek.forEach(function (f, i) {
      f.addEventListener('click', function () { valaszt(i); });
      f.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          valaszt((i + (e.key === 'ArrowRight' ? 1 : fulek.length - 1)) % fulek.length, true);
        }
      });
    });
  });

  /* ── galéria-szűrő ── */
  var szurok = $$('[data-szuro]');
  szurok.forEach(function (sz) {
    sz.addEventListener('click', function () {
      var kat = sz.getAttribute('data-szuro');
      szurok.forEach(function (x) { x.setAttribute('aria-pressed', String(x === sz)); });
      $$('[data-galeria] [data-kat]').forEach(function (el) {
        el.hidden = !(kat === '*' || el.getAttribute('data-kat') === kat);
      });
    });
  });

  /* ── lightbox ── */
  var lb, lbImg, lbCim, lbSzam, lista = [], hol = 0;
  function lbEpit() {
    lb = document.createElement('dialog');
    lb.className = 'lb';
    lb.setAttribute('aria-label', T('Kép nagyítva', 'Imagine mărită'));
    lb.innerHTML =
      '<div class="lb-stage"><img alt=""></div>' +
      '<div class="lb-bar"><span><span class="n num"></span><span class="lb-cim"></span></span><span class="lb-szam num"></span></div>' +
      '<button class="lb-btn lb-prev" type="button" aria-label="' + T('Előző kép', 'Imaginea anterioară') + '"></button>' +
      '<button class="lb-btn lb-next" type="button" aria-label="' + T('Következő kép', 'Imaginea următoare') + '"></button>' +
      '<button class="lb-close" type="button" aria-label="' + T('Bezárás', 'Închide') + '"></button>';
    document.body.appendChild(lb);
    lbImg = $('img', lb); lbCim = $('.lb-cim', lb); lbSzam = $('.lb-szam', lb);
    $('.lb-prev', lb).addEventListener('click', function () { lbMutat(hol - 1); });
    $('.lb-next', lb).addEventListener('click', function () { lbMutat(hol + 1); });
    $('.lb-close', lb).addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-stage')) lb.close(); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') lbMutat(hol + 1);
      if (e.key === 'ArrowLeft') lbMutat(hol - 1);
    });
    var x0 = null;   // húzás mobilon
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) lbMutat(hol + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  }
  function lbMutat(i) {
    hol = (i + lista.length) % lista.length;
    var fig = lista[hol], img = $('img', fig);
    lbImg.src = img.getAttribute('data-nagy') || img.currentSrc || img.src;
    lbImg.alt = img.alt;
    $('.n', lb).textContent = ($('.n', fig) || {}).textContent || '';
    lbCim.textContent = img.alt + (fig.getAttribute('data-ki') ? ' · ' + T(fig.getAttribute('data-ki') + ' munkája', 'lucrare de ' + fig.getAttribute('data-ki')) : '');
    lbSzam.textContent = (hol + 1) + ' / ' + lista.length;
  }
  function lbNyit(fig) {
    if (!lb) lbEpit();
    if (typeof lb.showModal !== 'function') return;
    var gal = fig.closest('[data-galeria]');
    lista = $$('.gal-item', gal).filter(function (f) { return !f.hidden; });
    lbMutat(lista.indexOf(fig));
    lb.showModal();
  }
  $$('.gal-item').forEach(function (fig) {
    fig.addEventListener('click', function () { lbNyit(fig); });
    fig.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lbNyit(fig); }
    });
  });

  /* ── videók: csak láthatóan töltődnek és játszanak, hang nélkül ── */
  var videok = $$('video[data-src]');
  if (videok.length && 'IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          if (!v.src) { v.src = v.getAttribute('data-src'); }
          if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.35 });
    videok.forEach(function (v) { v.muted = true; vio.observe(v); });
  }

  /* ── térkép: a Google csak kattintásra töltődik (adatvédelem, sebesség) ── */
  $$('[data-terkep-be]').forEach(function (g) {
    g.addEventListener('click', function () {
      var doboz = g.closest('[data-terkep]'), f = document.createElement('iframe');
      f.src = doboz.getAttribute('data-terkep');
      f.title = T('Az Aphrodite Szépségszalon a térképen', 'Salonul Aphrodite pe hartă');
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      doboz.appendChild(f);
    });
  });

  /* ── évszám a láblécben ── */
  $$('[data-ev]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
