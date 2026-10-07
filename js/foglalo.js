/* ============================================================
   Aphrodite — online foglaló (kliens)
   Menet: szakember → szolgáltatás → nap + időpont → adatok → kész.
   A háttér a szalon Google Apps Scriptje (data-api). GET-tel kérdez
   (napok, időpontok), POST-tal foglal — text/plain törzzsel, hogy ne
   legyen CORS-előkérés (az Apps Script azt nem kezeli).
   ============================================================ */
(function () {
  'use strict';
  var gyoker = document.querySelector('[data-foglalo]');
  if (!gyoker) return;

  var $ = function (s, c) { return (c || gyoker).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || gyoker).querySelectorAll(s)); };
  var RO = document.documentElement.lang === 'ro';
  var T = function (hu, ro) { return RO ? ro : hu; };
  var ADAT = JSON.parse(gyoker.getAttribute('data-adat'));
  var API = gyoker.getAttribute('data-api');
  // helyi teszthez: ?api=… csak localhostról írhatja felül a címet
  var q = new URLSearchParams(location.search);
  if (q.get('api') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = q.get('api');

  if (!API) { nincs(); return; }

  var HONAPOK = RO
    ? ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
    : ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
  var NAPNEV = RO
    ? ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă']
    : ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  var all = { sz: null, s: null, honap: null, datum: null, ido: null, napok: {} };
  var keresSzam = 0;   // elavult válaszok eldobásához (gyors kattintgatásnál)

  /* ── segédek ── */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function datumStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function honapStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function datumbol(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function szepDatum(s) {
    var d = datumbol(s);
    return RO
      ? NAPNEV[d.getDay()] + ', ' + d.getDate() + ' ' + HONAPOK[d.getMonth()] + ' ' + d.getFullYear()
      : d.getFullYear() + '. ' + HONAPOK[d.getMonth()] + ' ' + d.getDate() + '., ' + NAPNEV[d.getDay()];
  }
  function szolg() { return ADAT.szakemberek[all.sz].szolg.filter(function (x) { return x.id === all.s; })[0]; }
  function idotartam(p) {
    var o = T(' óra', ' h'), m = T(' perc', ' min');
    return p < 60 ? p + m : (p % 60 ? Math.floor(p / 60) + o + ' ' + (p % 60) + m : (p / 60) + o);
  }
  function ma() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function utolsoNap() { var d = ma(); d.setDate(d.getDate() + ADAT.maxNap); return d; }

  function api(params) {
    var u = API + (API.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(Object.assign({ nyelv: RO ? 'ro' : 'hu' }, params)).toString();
    return fetch(u, { method: 'GET', redirect: 'follow' }).then(function (r) { return r.json(); })
      .then(function (j) { if (j.hiba) throw new Error(j.hiba); return j; });
  }

  function nincs() {
    $('.fl-lepesek').hidden = true;
    $('.fl-test').hidden = true;
    $('[data-nincs]').hidden = false;
  }

  /* ── lépések ── */
  function lepes(n, fokusz) {
    $$('[data-lepes]').forEach(function (el) { el.hidden = el.getAttribute('data-lepes') !== String(n); });
    $$('[data-jelzo]').forEach(function (li) {
      var j = +li.getAttribute('data-jelzo');
      li.classList.toggle('kesz', n === 'kesz' || j < n);
      if (j === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    osszegzes();
    if (fokusz) {
      var cel = $('[data-lepes="' + n + '"]');
      var leg = cel.querySelector('legend, h3') || cel;
      leg.setAttribute('tabindex', '-1'); leg.focus({ preventScroll: true });
      var y = gyoker.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  function osszegzes() {
    var sz = all.sz && ADAT.nevek[all.sz], sv = all.s && szolg();
    $('[data-o="sz"]').textContent = sz ? sz.nev : '—';
    $('[data-o="s"]').textContent = sv ? sv.nev + ' · ' + idotartam(sv.perc) : '—';
    $('[data-o="ido"]').textContent = all.datum && all.ido ? szepDatum(all.datum) + ', ' + all.ido : '—';
    $('[data-vissza="1"]').hidden = !all.sz;
    $('[data-vissza="2"]').hidden = !all.s;
    $('[data-vissza="3"]').hidden = !all.ido;
  }

  /* 1 · szakember */
  function szakemberValaszt(sz, fokusz) {
    if (!ADAT.szakemberek[sz]) return;
    if (all.sz !== sz) { all.s = null; all.datum = null; all.ido = null; }
    all.sz = sz;
    $$('.fl-ember[data-sz]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sz') === sz)); });
    var lista = ADAT.szakemberek[sz].szolg;
    $('[data-szolg-lista]').innerHTML = lista.map(function (x) {
      return '<button type="button" class="fl-szolg-sor" data-s="' + x.id + '" aria-pressed="' + (x.id === all.s) + '">' +
        '<span class="nev">' + x.nev + '</span><span class="perc num">' + idotartam(x.perc) + '</span>' +
        (x.ar ? '<span class="ar num">' + x.ar + '</span>' : '') + '</button>';
    }).join('');
    $$('.fl-szolg-sor').forEach(function (b) { b.addEventListener('click', function () { szolgValaszt(b.getAttribute('data-s')); }); });
    if (lista.length === 1) szolgValaszt(lista[0].id, fokusz);   // Kláránál egyetlen tétel: lépjünk tovább
    else lepes(2, fokusz);
  }
  $$('.fl-ember[data-sz]').forEach(function (b) {
    b.addEventListener('click', function () { szakemberValaszt(b.getAttribute('data-sz'), true); });
  });

  /* 2 · szolgáltatás */
  function szolgValaszt(s, fokusz) {
    if (all.s !== s) { all.datum = null; all.ido = null; }
    all.s = s;
    $$('.fl-szolg-sor').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-s') === s)); });
    all.honap = all.honap || honapStr(ma());
    lepes(3, fokusz !== false);
    honapBetolt();
  }

  /* 3 · naptár */
  function honapBetolt() {
    var h = datumbol(all.honap), sajat = ++keresSzam;
    $('[data-honap-cim]').textContent = RO ? HONAPOK[h.getMonth()] + ' ' + h.getFullYear() : h.getFullYear() + '. ' + HONAPOK[h.getMonth()];
    $('[data-honap="-1"]').disabled = all.honap <= honapStr(ma());
    $('[data-honap="1"]').disabled = all.honap >= honapStr(utolsoNap());
    napokRajzol(true);
    savokRajzol();
    api({ m: 'napok', sz: all.sz, s: all.s, honap: all.honap }).then(function (j) {
      if (sajat !== keresSzam) return;
      all.napok = j.napok || {};
      napokRajzol(false);
      // ha a hónapban nincs szabad nap, mondjuk meg, és kínáljuk a következőt
      if (!Object.keys(all.napok).length) {
        $('[data-savok-cim]').textContent = T('Ebben a hónapban nincs szabad időpont', 'În această lună nu mai sunt ore libere') + (all.honap < honapStr(utolsoNap()) ? T(' — nézd meg a következőt.', ' — vezi luna următoare.') : '.');
      }
    }).catch(hiba);
  }

  function napokRajzol(tolt) {
    var h = datumbol(all.honap), elso = (h.getDay() + 6) % 7, napok = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
    var html = '';
    for (var i = 0; i < elso; i++) html += '<span class="fl-nap ures"></span>';
    for (var d = 1; d <= napok; d++) {
      var ds = all.honap + '-' + pad(d), db = all.napok[ds];
      var szabad = !tolt && db > 0;
      html += '<button type="button" class="fl-nap' + (tolt ? ' tolt' : '') + (ds === all.datum ? ' aktiv' : '') + '" data-datum="' + ds + '"' +
        (szabad ? '' : ' disabled') + ' aria-label="' + szepDatum(ds) + (szabad ? ', ' + db + T(' szabad időpont', ' ore libere') : T(', nincs szabad időpont', ', nicio oră liberă')) + '">' +
        '<span class="num">' + d + '</span></button>';
    }
    $('[data-napok]').innerHTML = html;
    $$('.fl-nap[data-datum]:not([disabled])').forEach(function (b) {
      b.addEventListener('click', function () { napValaszt(b.getAttribute('data-datum')); });
    });
  }

  $$('[data-honap]').forEach(function (b) {
    b.addEventListener('click', function () {
      var h = datumbol(all.honap); h.setMonth(h.getMonth() + +b.getAttribute('data-honap'));
      all.honap = honapStr(h); all.datum = null; all.ido = null; all.napok = {};
      osszegzes();
      honapBetolt();
    });
  });

  function napValaszt(ds) {
    all.datum = ds; all.ido = null;
    $$('.fl-nap').forEach(function (b) { b.classList.toggle('aktiv', b.getAttribute('data-datum') === ds); });
    osszegzes();
    savokBetolt();
  }

  function savokBetolt() {
    var sajat = ++keresSzam;
    $('[data-savok-cim]').textContent = T('Szabad időpontok betöltése…', 'Se încarcă orele libere…');
    $('[data-savok]').innerHTML = '';
    api({ m: 'idopontok', sz: all.sz, s: all.s, datum: all.datum }).then(function (j) {
      if (sajat !== keresSzam) return;
      savokRajzol(j.idopontok || []);
    }).catch(hiba);
  }

  function savokRajzol(lista) {
    if (!lista) { $('[data-savok]').innerHTML = ''; $('[data-savok-cim]').textContent = T('Válassz egy napot a naptárban.', 'Alege o zi din calendar.'); return; }
    $('[data-savok-cim]').textContent = lista.length ? szepDatum(all.datum) + T(' — válassz kezdési időpontot:', ' — alege ora de început:') : T('Erre a napra már nincs szabad időpont.', 'Pentru această zi nu mai sunt ore libere.');
    $('[data-savok]').innerHTML = lista.map(function (t) {
      return '<button type="button" class="fl-sav num" data-ido="' + t + '">' + t + '</button>';
    }).join('');
    $$('.fl-sav').forEach(function (b) {
      b.addEventListener('click', function () {
        all.ido = b.getAttribute('data-ido');
        $$('.fl-sav').forEach(function (x) { x.classList.toggle('aktiv', x === b); });
        lepes(4, true);
      });
    });
  }

  /* 4 · adatok és küldés */
  var urlap = $('[data-urlap]'), uzenet = $('[data-uzenet]'), kuldGomb = $('[data-kuld]');
  function jelez(szoveg) { uzenet.hidden = false; uzenet.textContent = szoveg; }
  urlap.addEventListener('input', function () { uzenet.hidden = true; });   // javítás közben ne maradjon ott a régi hibaüzenet

  urlap.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = urlap.elements, hiany = [];
    if (f.nev.value.trim().length < 2) hiany.push(T('a neved', 'numele tău'));
    if (!/^[+\d][\d\s\-\/]{6,19}$/.test(f.tel.value.trim())) hiany.push(T('egy érvényes telefonszám', 'un număr de telefon valid'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) hiany.push(T('egy érvényes e-mail-cím', 'o adresă de e-mail validă'));
    if (!f.hozzajarul.checked) hiany.push(T('az adatkezelési hozzájárulás', 'acordul pentru prelucrarea datelor'));
    if (hiany.length) { jelez(T('Hiányzik még: ', 'Mai lipsește: ') + hiany.join(', ') + '.'); return; }
    uzenet.hidden = true;
    kuldGomb.disabled = true; kuldGomb.textContent = T('Küldés…', 'Se trimite…');

    var torzs = {
      sz: all.sz, s: all.s, datum: all.datum, ido: all.ido,
      nev: f.nev.value.trim(), tel: f.tel.value.trim(), email: f.email.value.trim(),
      megj: f.megj.value.trim(), hozzajarul: true, weboldal: f.weboldal.value,
      nyelv: RO ? 'ro' : 'hu',   // a vendégnek szóló levelek és hibaüzenetek nyelve
    };
    fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(torzs) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        kuldGomb.disabled = false; kuldGomb.textContent = T('Foglalási kérés elküldése', 'Trimite cererea de programare');
        if (j.hiba) {
          if (j.frissit) { all.ido = null; lepes(3, true); savokBetolt(); $('[data-savok-cim]').textContent = j.hiba; return; }
          jelez(j.hiba); return;
        }
        var sz = ADAT.nevek[all.sz];
        $('[data-kesz-szoveg]').textContent = T('A kérésed foglalja az időpontot ' + sz.nev + ' naptárában (' + szepDatum(all.datum) + ', ' + all.ido +
          '). Hamarosan visszaigazolja — a visszaigazolást a(z) ' + torzs.email + ' címre küldjük.',
          'Cererea ta rezervă ora în calendarul lui ' + sz.nev + ' (' + szepDatum(all.datum) + ', ' + all.ido +
          '). Îți va confirma în curând — confirmarea o trimitem la adresa ' + torzs.email + '.');
        lepes('kesz');
        var k = $('[data-lepes="kesz"]'); k.focus({ preventScroll: true });
        window.scrollTo({ top: gyoker.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
        urlap.reset();
      })
      .catch(function () {
        kuldGomb.disabled = false; kuldGomb.textContent = T('Foglalási kérés elküldése', 'Trimite cererea de programare');
        jelez(T('A kérés most nem ment át. Kérjük, próbáld újra pár perc múlva, vagy hívj minket.', 'Cererea nu a putut fi trimisă. Te rugăm să încerci din nou peste câteva minute sau să ne suni.'));
      });
  });

  $('[data-ujra]').addEventListener('click', function () {
    all.s = null; all.datum = null; all.ido = null;
    lepes(1, true);
  });
  $$('[data-vissza]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = +b.getAttribute('data-vissza');
      if (n === 1) lepes(1, true);
      if (n === 2) lepes(ADAT.szakemberek[all.sz].szolg.length === 1 ? 1 : 2, true);
      if (n === 3) { lepes(3, true); honapBetolt(); }
    });
  });

  function hiba() {
    $('[data-savok-cim]').textContent = T('Az időpontokat most nem sikerült betölteni. Próbáld újra, vagy hívd a szakembert.', 'Orele nu au putut fi încărcate. Încearcă din nou sau sună specialistul.');
  }

  /* előre kiválasztott szakember: kapcsolat.html?sz=barbi#foglalo */
  if (q.get('sz') && ADAT.szakemberek[q.get('sz')]) szakemberValaszt(q.get('sz'), false);
  else lepes(1);
})();
