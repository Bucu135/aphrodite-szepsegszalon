/* ============================================================
   Aphrodite — foglalás kezelése (foglalas.html)
   A levelek gombjai ide visznek: ?m=jovahagy|elutasit|lemond&sz=…&id=…&t=…
   A szkriptet JSON-ban kérdezzük (f=json): először csak az adatokat
   kérjük le, a műveletet a gomb megnyomása hajtja végre (&ok=1).
   A szakember oldala magyar; a vendég lemondása az ő nyelvén (/ro/).
   ============================================================ */
(function () {
  'use strict';
  var gy = document.querySelector('[data-kezelo]');
  if (!gy) return;
  var $ = function (s) { return gy.querySelector(s); };
  var RO = document.documentElement.lang === 'ro';
  var T = function (hu, ro) { return RO ? ro : hu; };
  var q = new URLSearchParams(location.search);
  var API = gy.getAttribute('data-api');
  if (q.get('api') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = q.get('api');
  var P = { m: q.get('m'), sz: q.get('sz'), id: q.get('id'), t: q.get('t') };
  var cim = $('[data-k-cim]'), torzs = $('[data-k-torzs]'), gombok = $('[data-k-gombok]');
  var vendeg = P.m === 'lemond';
  var foglaloUrl = 'kapcsolat.html#foglalo';

  var SZ = {
    jovahagy: { cim: 'Foglalás elfogadása', gomb: 'Elfogadom', kesz: 'Elfogadva ✓',
      keszSz: 'A bejegyzés zöldre váltott a naptárban, a vendég megkapta a visszaigazolást.' },
    elutasit: { cim: 'Foglalás elutasítása', gomb: 'Elutasítom', kesz: 'Elutasítva',
      keszSz: 'Az időpont felszabadult, a vendéget e-mailben értesítettük.' },
    lemond: { cim: T('Időpont lemondása', 'Anularea programării'), gomb: T('Igen, lemondom', 'Da, anulez'), kesz: T('Lemondtad az időpontot', 'Ai anulat programarea'),
      keszSz: T('Köszönjük, hogy jelezted. Ha új időpontot szeretnél, a weboldalon bármikor foglalhatsz.', 'Îți mulțumim că ne-ai anunțat. Dacă vrei o nouă programare, te poți programa oricând pe site.') },
  }[P.m];

  function api(extra) {
    var p = new URLSearchParams(Object.assign({ f: 'json' }, P, extra || {}));
    return fetch(API + (API.indexOf('?') < 0 ? '?' : '&') + p.toString(), { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); });
  }
  function el(tag, osztaly, szoveg) {
    var e = document.createElement(tag);
    if (osztaly) e.className = osztaly;
    if (szoveg != null) e.textContent = szoveg;
    return e;
  }
  function gomb(szoveg, sotet, katt) {
    var b = el('button', 'btn' + (sotet ? ' btn-solid' : ''), szoveg);
    b.type = 'button'; b.addEventListener('click', katt);
    return b;
  }
  function link(szoveg, href, sotet) { var a = el('a', 'btn' + (sotet ? ' btn-solid' : ''), szoveg); a.href = href; return a; }
  function uzen(c, szovegek, gombLista) {
    cim.textContent = c;
    torzs.innerHTML = '';
    szovegek.forEach(function (s) { if (s) torzs.appendChild(typeof s === 'string' ? el('p', 'lead', s) : s); });
    gombok.innerHTML = '';
    (gombLista || []).forEach(function (g) { gombok.appendChild(g); });
    cim.focus({ preventScroll: true });
  }

  // a foglalás adatai: szolgáltatás, időpont, és a szerep szerint szakember vagy vendég
  function adatok(j) {
    var dl = el('dl', 'kezelo-adatok');
    var sor = function (k, v) { if (!v) return; var d = el('div'); d.appendChild(el('dt', null, k)); d.appendChild(el('dd', null, v)); dl.appendChild(d); };
    if (!vendeg) sor('Vendég', j.vendeg + (j.ro ? ' (románul foglalt)' : ''));
    if (!vendeg) sor('Telefon', j.tel);
    sor(T('Szolgáltatás', 'Serviciu'), j.szolg + (j.ar ? ' · ' + j.ar : ''));
    sor(T('Időpont', 'Data și ora'), j.mikor);
    if (vendeg) sor(T('Szakember', 'Specialist'), j.szakember);
    if (!vendeg && j.regiMikor) sor('Átütemezés — eredeti időpont', j.regiMikor);
    return dl;
  }

  function hibaUzenet(j) {
    var h = j && j.hiba;
    if (h === 'link') return uzen(T('Érvénytelen link', 'Link invalid'), [T('Ez a link nem érvényes. Ha kérdésed van, hívd a szalont.', 'Acest link nu este valid. Dacă ai întrebări, sună la salon.')]);
    if (h === 'nincs') return uzen(T('Már nincs ilyen foglalás', 'Programarea nu mai există'),
      [T('Ezt a foglalást időközben lemondták vagy törölték.', 'Această programare a fost între timp anulată sau ștearsă.')],
      vendeg ? [link(T('Új időpont foglalása', 'Programare nouă'), foglaloUrl, true)] : []);
    if (h === 'mult') return uzen(T('Ez az időpont már elmúlt', 'Această oră a trecut deja'), [j.szolg ? j.szolg + ' · ' + j.mikor : '']);
    if (h === 'mar') return uzen('Ezt már elintézted', [adatok(j), j.allapot === 'elfogadva' ? 'Ezt a foglalást már elfogadtad — a vendég megkapta a visszaigazolást.' : 'Erről a kérésről már döntöttél.']);
    uzen(T('Most nem sikerült betölteni', 'Nu s-a putut încărca'), [T('Kérjük, próbáld újra pár perc múlva.', 'Te rugăm să încerci din nou peste câteva minute.')],
      [gomb(T('Újra', 'Din nou'), true, betolt)]);
  }

  function betolt() {
    if (!SZ || !P.id || !P.t || !API) return hibaUzenet({ hiba: 'link' });
    torzs.innerHTML = ''; torzs.appendChild(el('p', 'lead', T('Betöltés…', 'Se încarcă…'))); gombok.innerHTML = '';
    api().then(function (j) {
      if (!j.ok || j.hiba) return hibaUzenet(j);
      var megj = null;
      if (P.m === 'lemond') megj = T('Biztosan lemondod ezt az időpontot?', 'Sigur vrei să anulezi această programare?');
      if (P.m === 'elutasit') megj = j.regiMikor ? 'A vendég eredeti időpontja (' + j.regiMikor + ') érvényben marad, erről levelet kap.' : 'A vendég udvarias levelet kap, hogy válasszon másik időpontot.';
      if (P.m === 'jovahagy' && j.regiMikor) megj = 'Elfogadáskor a vendég eredeti időpontja törlődik a naptárból.';
      uzen(SZ.cim, [adatok(j), megj], [gomb(SZ.gomb, true, vegrehajt)]);
    }).catch(function () { hibaUzenet(null); });
  }

  function vegrehajt(e) {
    var b = e.currentTarget;
    b.disabled = true; b.textContent = T('Folyamatban…', 'Se procesează…');
    api({ ok: '1' }).then(function (j) {
      if (!j.ok || j.hiba || !j.kesz) return hibaUzenet(j);
      uzen(SZ.kesz, [adatok(j), SZ.keszSz], vendeg ? [link(T('Új időpont foglalása', 'Programare nouă'), foglaloUrl, false)] : []);
    }).catch(function () {
      b.disabled = false; b.textContent = SZ.gomb;
      torzs.appendChild(el('p', 'kezelo-hiba', T('Nem sikerült — kérjük, próbáld újra.', 'Nu a reușit — te rugăm să încerci din nou.')));
    });
  }

  if (SZ) cim.textContent = SZ.cim;
  betolt();
})();
