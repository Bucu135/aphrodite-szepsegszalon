/* ============================================================
   Aphrodite — online foglaló (kliens)
   Menet: szakember → szolgáltatás(ok) → nap + időpont → adatok → kész.
   A 2. lépésben több tétel is kijelölhető (az idő és az ár összeadódik);
   a változatos tételek (1D…6D, gyanta-területek) lenyílnak. A kiválasztás
   kulcsai: 'pilla-toltes.3d,szemoldok-festes,gyanta.bajusz' — a szkript
   ugyanezekkel a szabályokkal ellenőriz (kosar_ a Code.gs-ben).
   Átütemezés: kapcsolat.html?sz=…&atut=<foglalás>&t=<aláírás>#foglalo
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
  var all = { sz: null, val: [], s: null, honap: null, datum: null, ido: null, napok: {}, atut: null };
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
  function lista() { return ADAT.szakemberek[all.sz].szolg; }
  function tetel(id) { return lista().filter(function (x) { return x.id === id; })[0]; }
  function sav(lista) { var mi = Math.min.apply(null, lista), ma = Math.max.apply(null, lista); return mi === ma ? String(mi) : mi + '–' + ma; }
  function arSzoveg(x) {
    if (x.valt) return sav(x.valt.map(function (v) { return v.ar; })) + ' RON';
    return x.ar != null ? x.ar + ' RON' : (x.arSz || '');
  }
  function percSzoveg(x) {
    if (x.valt && x.tobb) { var p = x.valt.map(function (v) { return v.perc; }); return sav(p) + T(' perc', ' min'); }
    return idotartam(x.perc);
  }
  /* a kiválasztott tételek összesítve — ugyanúgy, mint a szkript kosar_-ja */
  function kosar() {
    var sorok = [], perc = 0, ar = 0, vanAr = true, arSz = null;
    lista().forEach(function (x) {
      var t = all.val.filter(function (k) { return k.split('.')[0] === x.id; });
      if (!t.length) return;
      var nev = x.nev;
      if (x.valt) {
        var v = t.map(function (k) { var id = k.split('.')[1]; return x.valt.filter(function (y) { return y.id === id; })[0]; }).filter(Boolean);
        nev += (x.tobb ? ': ' : ' ') + v.map(function (y) { return x.tobb ? y.nev.toLowerCase() : y.nev; }).join(', ');
        v.forEach(function (y) { perc += y.perc; ar += y.ar; });
      } else {
        perc += x.perc;
        if (x.ar == null) { vanAr = false; arSz = x.arSz; } else ar += x.ar;
      }
      sorok.push(nev);
    });
    return { sorok: sorok, perc: perc, ar: vanAr ? ar + ' RON' : (sorok.length === 1 && arSz ? arSz : '') };
  }
  function idotartam(p) {
    var o = T(' óra', ' h'), m = T(' perc', ' min');
    return p < 60 ? p + m : (p % 60 ? Math.floor(p / 60) + o + ' ' + (p % 60) + m : (p / 60) + o);
  }
  function ma() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function utolsoNap() { var p = ADAT.utolsoNap.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }

  function api(params) {
    var u = API + (API.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(Object.assign({ nyelv: RO ? 'ro' : 'hu' }, params)).toString();
    return fetch(u, { method: 'GET', redirect: 'follow' }).then(function (r) { return r.json(); })
      .then(function (j) { if (j.hiba) throw new Error(j.hiba); return j; });
  }

  /* ── havi sávok: szakemberenként és hónaponként EGY kérés (m=savok), előre betöltve ──
     A szkript a „Dolgozom" és a foglalt sávokat adja (percben, szalon-idő szerint); a szabad
     napokat és időpontokat bármelyik szolgáltatásra itt számoljuk — így a szolgáltatás és a nap
     kiválasztása nem vár a szkriptre. A foglaláskor a szkript úgyis újraellenőriz.
     Ha a szkript még nem ismeri a savok-kérést (régi verzió), a régi napok/idopontok út megy. */
  var SAVOK = {};   // 'sz|honap' → Promise<{ savok, ma } | null>
  function savokKer(sz, honap) {
    var k = sz + '|' + honap;
    if (!SAVOK[k]) {
      SAVOK[k] = api({ m: 'savok', sz: sz, honap: honap })
        .then(function (j) { return j.savok ? j : null; })
        .catch(function () { delete SAVOK[k]; return null; });
    }
    return SAVOK[k];
  }
  function savokFelejt() { SAVOK = {}; all.havi = null; }
  // fal-óra percben a szalon időzónájában: napsorszám × 1440 + perc (a látogató időzónájától független)
  function falPerc(datum, perc) { var p = datum.split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]) / 60000 + perc; }
  function mostFal() {
    try {
      var r = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (x) { r[x.type] = x.value; });
      return falPerc(r.year + '-' + r.month + '-' + r.day, +r.hour * 60 + +r.minute);
    } catch (e) { var d = new Date(); return falPerc(datumStr(d), d.getHours() * 60 + d.getMinutes()); }
  }
  // ugyanaz a szabály, mint az idosavok.mjs szabadIdopontok-ja (a szkriptben), percekben, egy napra
  function szabadNap(nap, datum, hossz) {
    var hatar = mostFal() + ADAT.minElore, ki = [], ossz = [];
    nap.m.slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (s) {
      var u = ossz[ossz.length - 1];
      if (u && s[0] <= u[1]) u[1] = Math.max(u[1], s[1]); else ossz.push([s[0], s[1]]);
    });
    ossz.forEach(function (s) {
      for (var t = s[0]; t + hossz <= s[1]; t += ADAT.lepes) {
        if (falPerc(datum, t) < hatar) continue;
        if (nap.f.some(function (f) { return t < f[1] && t + hossz > f[0]; })) continue;
        ki.push(pad(Math.floor(t / 60)) + ':' + pad(t % 60));
      }
    });
    return ki;
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
    var sz = all.sz && ADAT.nevek[all.sz], k = all.sz && all.val.length && kosar();
    $('[data-o="sz"]').textContent = sz ? sz.nev : '—';
    $('[data-o="s"]').textContent = k ? k.sorok.join(' + ') + ' · ' + idotartam(k.perc) + (k.ar ? ' · ' + k.ar : '') : '—';
    $('[data-o="ido"]').textContent = all.datum && all.ido ? szepDatum(all.datum) + ', ' + all.ido : '—';
    // kérdés esetén a kiválasztott szakember saját száma (Bence, 10-09); amíg nincs választva, a szalon száma
    var kerdes = $('[data-o-kerdes]');
    if (kerdes.dataset.alap == null) kerdes.dataset.alap = kerdes.innerHTML;
    kerdes.innerHTML = sz
      ? T('A foglalás a szakember visszajelzésével válik véglegessé. Igyekszünk minél hamarabb visszajelezni a foglalásoddal kapcsolatban. Kérdés esetén keresd a szakembert telefonon vagy WhatsAppon: ',
          'Programarea devine definitivă după răspunsul specialistului. Ne străduim să îți răspundem cât mai curând. Pentru întrebări, contactează specialistul telefonic sau pe WhatsApp: ')
        + '<a class="link" href="tel:+' + sz.intl + '">' + sz.telefon + '</a> · <a class="link" href="https://wa.me/' + sz.intl + '?text='
        + encodeURIComponent(T('Szia ' + sz.becenev + '! Kérdésem lenne a foglalásommal kapcsolatban.', 'Bună, ' + sz.becenev + '! Am o întrebare despre programarea mea.'))
        + '" rel="noopener" target="_blank">WhatsApp</a>.'
      : kerdes.dataset.alap;
    $('[data-vissza="1"]').hidden = !all.sz;
    $('[data-vissza="2"]').hidden = !all.s;
    $('[data-vissza="3"]').hidden = !all.ido;
  }

  /* 1 · szakember */
  function szakemberValaszt(sz, fokusz, elore) {
    if (!ADAT.szakemberek[sz]) return;
    if (all.sz !== sz) { all.val = []; all.s = null; all.datum = null; all.ido = null; }
    all.sz = sz;
    if (elore) all.val = elore.filter(function (k) { return kulcsRendben(k); });
    $$('.fl-ember[data-sz]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sz') === sz)); });
    // a megjegyzés súgója: kozmetikusnál allergia/érzékenység, fodrásznál a haj
    if (ADAT.szakemberek[sz].megjTipp) urlap.elements.megj.placeholder = ADAT.szakemberek[sz].megjTipp;
    szolgRajzol();
    var l = lista();
    if (l.length === 1 && !l[0].valt && !elore) { all.val = [l[0].id]; tovabb(fokusz); }   // Kláránál egyetlen tétel: lépjünk tovább
    else lepes(2, fokusz);
  }
  $$('.fl-ember[data-sz]').forEach(function (b) {
    b.addEventListener('click', function () { szakemberValaszt(b.getAttribute('data-sz'), true); });
  });

  /* 2 · szolgáltatás(ok): jelölőnégyzetek; a változatos tételek lenyílnak */
  function kulcsRendben(k) {
    var r = k.split('.'), x = tetel(r[0]);
    if (!x) return false;
    return x.valt ? x.valt.some(function (v) { return v.id === r[1]; }) : r.length === 1;
  }
  function jelolo(kulcs, nev, perc, ar) {
    return '<label class="fl-szolg-sor">' +
      '<input type="checkbox" value="' + kulcs + '"' + (all.val.indexOf(kulcs) >= 0 ? ' checked' : '') + '>' +
      '<span class="nev">' + nev + '</span><span class="perc num">' + perc + '</span>' +
      (ar ? '<span class="ar num">' + ar + '</span>' : '<span class="ar"></span>') + '</label>';
  }
  function szolgRajzol() {
    $('[data-szolg-lista]').innerHTML = lista().map(function (x) {
      if (!x.valt) return jelolo(x.id, x.nev, idotartam(x.perc), arSzoveg(x));
      var nyitva = all.val.some(function (k) { return k.split('.')[0] === x.id; });
      return '<div class="fl-csop">' +
        '<button type="button" class="fl-szolg-sor fl-csop-fej" aria-expanded="' + nyitva + '" aria-controls="fl-v-' + x.id + '">' +
        '<span class="nev"><span class="fl-nyit" aria-hidden="true"></span>' + x.nev + '<span class="fl-csop-val" data-csop-val="' + x.id + '"></span></span>' +
        '<span class="perc num">' + percSzoveg(x) + '</span><span class="ar num">' + arSzoveg(x) + '</span></button>' +
        '<div class="fl-valt" id="fl-v-' + x.id + '" role="group" aria-label="' + x.nev + '"' + (nyitva ? '' : ' hidden') + '>' +
        '<p class="fl-valt-sugo">' + (x.tobb ? T('Több is választható.', 'Poți alege mai multe.') : T('Egyet válassz.', 'Alege una.')) + '</p>' +
        x.valt.map(function (v) { return jelolo(x.id + '.' + v.id, v.nev, x.tobb ? idotartam(v.perc) : '', v.ar + ' RON'); }).join('') +
        '</div></div>';
    }).join('');
    $$('.fl-csop-fej').forEach(function (b) {
      b.addEventListener('click', function () {
        var ki = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(ki));
        $('#' + b.getAttribute('aria-controls')).hidden = !ki;
      });
    });
    $$('[data-szolg-lista] input').forEach(function (i) { i.addEventListener('change', function () { jelolesValt(i); }); });
    kosarFrissit();
  }
  function jelolesValt(i) {
    var r = i.value.split('.'), x = tetel(r[0]);
    if (i.checked) {
      $$('[data-szolg-lista] input:checked').forEach(function (m) {
        if (m === i) return;
        var y = tetel(m.value.split('.')[0]);
        if (y === x && x.valt && !x.tobb) m.checked = false;              // a szempillából egy volumen
        if (y !== x && x.kizar && y.kizar === x.kizar) m.checked = false; // építés VAGY töltés VAGY lifting
      });
    }
    all.val = $$('[data-szolg-lista] input:checked').map(function (m) { return m.value; });
    kosarFrissit();
  }
  function kosarFrissit() {
    $$('[data-szolg-lista] input').forEach(function (m) { m.closest('.fl-szolg-sor').classList.toggle('on', m.checked); });
    lista().forEach(function (x) {
      if (!x.valt) return;
      var hely = $('[data-csop-val="' + x.id + '"]'), db = all.val.filter(function (k) { return k.split('.')[0] === x.id; });
      hely.textContent = db.length ? (x.tobb ? ' · ' + db.length + T(' kijelölve', ' alese') : ' · ' + tetel(x.id).valt.filter(function (v) { return x.id + '.' + v.id === db[0]; })[0].nev) : '';
    });
    var k = kosar(), gomb = $('[data-tovabb]');
    gomb.disabled = !all.val.length;
    $('[data-kosar]').textContent = all.val.length
      ? T('Összesen: ', 'Total: ') + idotartam(k.perc) + (k.ar ? ' · ' + k.ar : '')
      : T('Jelöld ki, amit szeretnél — több is választható.', 'Bifează ce dorești — poți alege mai multe.');
    osszegzes();
  }
  $('[data-tovabb]').addEventListener('click', function () { tovabb(true); });

  function tovabb(fokusz) {
    if (!all.val.length) return;
    var s = all.val.join(',');
    if (all.s !== s) { all.datum = null; all.ido = null; }
    all.s = s;
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
    all.havi = null;
    napokRajzol(true);
    savokRajzol();
    var hossz = kosar().perc;
    savokKer(all.sz, all.honap).then(function (j) {
      if (sajat !== keresSzam) return;
      if (!j) {   // régi szkript: a hónap napjait a szkript számolja
        api({ m: 'napok', sz: all.sz, s: all.s, honap: all.honap }).then(function (r) {
          if (sajat === keresSzam) napokKesz(r.napok || {});
        }).catch(hiba);
        return;
      }
      all.havi = j.savok;
      var napok = {};
      Object.keys(j.savok).forEach(function (d) { var db = szabadNap(j.savok[d], d, hossz).length; if (db) napok[d] = db; });
      napokKesz(napok);
    });
  }

  function napokKesz(napok) {
    all.napok = napok;
    napokRajzol(false);
    // ha a hónapban nincs szabad nap, mondjuk meg, és kínáljuk a következőt
    if (!Object.keys(all.napok).length) {
      $('[data-savok-cim]').textContent = T('Ebben a hónapban nincs szabad időpont', 'În această lună nu mai sunt ore libere') + (all.honap < honapStr(utolsoNap()) ? T(' — nézd meg a következőt.', ' — vezi luna următoare.') : '.');
    }
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
    if (all.havi) { savokRajzol(all.havi[all.datum] ? szabadNap(all.havi[all.datum], all.datum, kosar().perc) : []); return; }
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
    if (all.atut) { torzs.atut = all.atut.id; torzs.atutT = all.atut.t; }
    fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(torzs) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        kuldGomb.disabled = false; kuldGomb.textContent = T('Foglalási kérés elküldése', 'Trimite cererea de programare');
        if (j.hiba) {
          // közben elkelt az időpont: friss sávok a szkriptből, és a nap újra
          if (j.frissit) {
            var nap = all.datum; all.ido = null; savokFelejt(); lepes(3, true); honapBetolt();
            var uzen = j.hiba;
            savokKer(all.sz, all.honap).then(function () { all.datum = nap; savokBetolt(); $('[data-savok-cim]').textContent = uzen; });
            return;
          }
          if (j.atutHiba) atutVege(j.hiba);
          jelez(j.hiba); return;
        }
        var sz = ADAT.nevek[all.sz];
        $('[data-kesz-szoveg]').textContent = T('A kérésed foglalja az időpontot ' + sz.nev + ' naptárában (' + szepDatum(all.datum) + ', ' + all.ido +
          '). A foglalás a szakember visszajelzésével válik véglegessé. Igyekszünk minél hamarabb visszajelezni a foglalásoddal kapcsolatban — a visszajelzést a(z) ' + torzs.email + ' címre küldjük.' +
          (all.atut ? ' A korábbi időpontod addig érvényes, amíg az újat vissza nem igazoljuk.' : ''),
          'Cererea ta rezervă ora în calendarul lui ' + sz.nev + ' (' + szepDatum(all.datum) + ', ' + all.ido +
          '). Programarea devine definitivă după răspunsul specialistului. Ne străduim să îți răspundem cât mai curând — răspunsul îl trimitem la adresa ' + torzs.email + '.' +
          (all.atut ? ' Ora ta anterioară rămâne valabilă până confirmăm noua oră.' : ''));
        atutVege();
        savokFelejt();   // a most foglalt időpont már ne látsszon szabadnak
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
    all.val = []; all.s = null; all.datum = null; all.ido = null;
    if (all.sz) szolgRajzol();
    lepes(1, true);
  });
  $$('[data-vissza]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = +b.getAttribute('data-vissza');
      if (n === 1) lepes(1, true);
      if (n === 2) lepes(lista().length === 1 && !lista()[0].valt ? 1 : 2, true);
      if (n === 3) { lepes(3, true); honapBetolt(); }
    });
  });

  function hiba() {
    $('[data-savok-cim]').textContent = T('Az időpontokat most nem sikerült betölteni. Próbáld újra, vagy hívd a szakembert.', 'Orele nu au putut fi încărcate. Încearcă din nou sau sună specialistul.');
  }

  /* előtöltés + automatikus bekapcsolás: mindenki e havi (és ha belefér, a következő havi) sávjai már az
     oldal betöltésekor elindulnak. Akinél ebben a két hónapban van „[Név] Dolgozom” bejegyzés, annak a
     gombja kattinthatóvá válik; akinél nincs (vagy a lekérdezés nem sikerült), a helyére a telefonos
     kártya kerül. Így egy lány akkor válik foglalhatóvá, amikor beírja a naptárába, mikor dolgozik. */
  var AKTIV = {};   // sz → Promise<boolean>
  (function () {
    var most = honapStr(ma()), kov = new Date(ma()); kov.setDate(1); kov.setMonth(kov.getMonth() + 1);
    Object.keys(ADAT.szakemberek).forEach(function (sz) {
      var kerek = [savokKer(sz, most)];
      if (honapStr(kov) <= honapStr(utolsoNap())) kerek.push(savokKer(sz, honapStr(kov)));
      AKTIV[sz] = Promise.all(kerek).then(function (js) {
        return js.some(function (j) {
          return j && Object.keys(j.savok).some(function (d) { return j.savok[d].m && j.savok[d].m.length; });
        });
      });
      AKTIV[sz].then(function (van) {
        var b = $('.fl-ember[data-sz="' + sz + '"]');
        if (!b) return;
        if (van) { b.disabled = false; b.classList.remove('fl-ember-tolt'); return; }
        var t = $('[data-tel-sz="' + sz + '"]');
        if (t && all.sz !== sz) b.parentNode.replaceChild(t, b);
      });
    });
  })();

  /* átütemezés: a visszaigazoló levél „Új időpontot kérek” linkje (kapcsolat.html?sz=…&atut=…&t=…#foglalo).
     A szkript az aláírt link alapján visszaadja a vendég adatait és a régi szolgáltatásokat: előre kitöltjük.
     A régi időpont addig érvényes, amíg a szakember az újat el nem fogadja. */
  function atutVege(szoveg) {
    all.atut = null;
    var b = $('[data-atut]');
    if (szoveg) { b.hidden = false; b.textContent = szoveg; } else b.hidden = true;
  }
  var sz0 = q.get('sz') && ADAT.szakemberek[q.get('sz')] ? q.get('sz') : null;
  if (sz0 && q.get('atut') && q.get('t')) {
    all.atut = { id: q.get('atut'), t: q.get('t') };
    var b = $('[data-atut]');
    b.hidden = false; b.textContent = T('Átütemezés betöltése…', 'Se încarcă reprogramarea…');
    szakemberValaszt(sz0, false, []);
    api({ m: 'atut', sz: sz0, id: all.atut.id, t: all.atut.t }).then(function (j) {
      if (!j.ok) throw new Error();
      var f = urlap.elements;
      f.nev.value = j.nev || ''; f.tel.value = j.tel || ''; f.email.value = j.email || '';
      b.innerHTML = '';
      var e = document.createElement('b'); e.textContent = T('Átütemezés', 'Reprogramare');
      b.appendChild(e);
      b.appendChild(document.createTextNode(' — ' + T('a jelenlegi időpontod: ', 'programarea ta actuală: ') + j.mikor + ' (' + j.szolg + '). ' +
        T('Válassz új időpontot; a mostani addig érvényes, amíg ' + ADAT.nevek[sz0].nev + ' vissza nem igazolja az újat.',
          'Alege o nouă oră; cea actuală rămâne valabilă până când ' + ADAT.nevek[sz0].nev + ' o confirmă pe cea nouă.')));
      szakemberValaszt(sz0, false, String(j.s || '').split(','));
    }).catch(function () {
      atutVege(T('Ez az átütemezési link már nem érvényes (a foglalást közben lemondták vagy lezajlott). Foglalhatsz új időpontot.',
        'Acest link de reprogramare nu mai este valabil (programarea a fost anulată sau a avut loc). Poți face o programare nouă.'));
    });
  }
  /* előre kiválasztott szakember: kapcsolat.html?sz=barbi#foglalo — csak ha nála van „Dolgozom” bejegyzés;
     különben az 1. lépés marad, ahol a telefonos kártyája látszik */
  else {
    lepes(1);
    if (sz0) AKTIV[sz0].then(function (van) { if (van && !all.sz) szakemberValaszt(sz0, false); });
  }
})();
