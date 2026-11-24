/* Lexivoya · Lernstand (nur im Browser dieses Geräts, localStorage) + gemeinsame Bausteine.
   Kein Server, keine Cookies, kein Tracking. Export/Import als Datei bleibt auf dem Gerät.
   Wiederholung in Abständen: Leitner-Boxen 0–5. Richtig (wenn fällig) → eine Box weiter; falsch → Box 1, heute wieder fällig.
   Tinte: Box 0 = neu · 1–2 = geübt · ≥ 3 = gefestigt (an drei verschiedenen Tagen richtig abgerufen).
   Menü-Konzept v2 (2026-11-24): „Weiterlernen“ = zuletzt genutzter, nicht abgeschlossener Kurs (S.kurse[serie].zuletzt),
   dort die erste Folge ohne Stempel, an der zuletzt bearbeiteten Stelle. Installierte App (Home-Bildschirm): eigener
   Speicher → einmaliger Hinweis mit dem Export/Import-Weg; Export dort über das Teilen-Menü. */
(function () {
  'use strict';
  const KEY = 'lexivoya.lernstand.v1', THEMA = 'lexivoya.thema';
  const INTERVALL = [0, 1, 2, 4, 8, 16];
  const DATEN = JSON.parse(document.getElementById('lexivoya-daten').textContent);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const heute = () => iso(new Date());
  const plusTage = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  function woche(d = new Date()) {                      // ISO-Kalenderwoche „2026-W47"
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const tag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - tag);
    const j = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - j) / 864e5 + 1) / 7))}`;
  }
  const leer = () => ({ version: 1, woerter: {}, folgen: {}, ziel: { proWoche: null, pausen: [], einheiten: {} }, quizFehler: [], aussprache: {}, kurse: {}, video: {} });
  const KURSE = DATEN.kurse, FOLGE = id => DATEN.folgen.find(f => f.id === id);
  // Installierte App vom Home-Bildschirm (iOS: navigator.standalone; sonst display-mode) — eigener Speicher, kein Zurück-Knopf
  const APP = (() => { try { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } })();
  if (APP) document.documentElement.dataset.app = 'standalone';
  let speicherOk = true;
  function laden() {
    try { const s = localStorage.getItem(KEY); return s ? Object.assign(leer(), JSON.parse(s)) : leer(); }
    catch (e) { speicherOk = false; return leer(); }
  }
  let S = laden();
  function sichern() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { speicherOk = false; }
    document.dispatchEvent(new CustomEvent('lernstand'));
  }

  const L = {
    daten: DATEN, heute, woche,
    get speicherOk() { return speicherOk; },
    wort(id) { return S.woerter[id] || { box: 0, faellig: null, richtig: 0, falsch: 0 }; },
    tinte(id) { const b = L.wort(id).box; return b >= 3 ? 'fest' : b >= 1 ? 'geuebt' : 'neu'; },
    istFaellig(id) { const w = S.woerter[id]; return !!w && w.box > 0 && w.faellig <= heute(); },
    faellige(ids) { return ids.filter(L.istFaellig); },
    naechsteFaelligkeit(ids) { const f = ids.map(id => S.woerter[id]).filter(w => w && w.box > 0).map(w => w.faellig).sort(); return f[0] || null; },
    antwort(id, ok) {
      const w = S.woerter[id] || (S.woerter[id] = { box: 0, faellig: null, richtig: 0, falsch: 0 });
      if (ok) {
        if (w.box === 0 || !w.faellig || w.faellig <= heute()) { w.box = Math.min(5, w.box + 1); w.faellig = plusTage(heute(), INTERVALL[w.box]); }
        w.richtig++;
      } else { if (w.box > 0) { w.box = 1; w.faellig = heute(); } w.falsch++; }
      w.zuletzt = heute(); sichern();
    },
    folge(id) { return S.folgen[id] || { gesehen: false, quiz: {}, stempel: null }; },   // nur lesen: legt nichts an
    folgeSetzen(id, f) { S.folgen[id] = f; L.stempelPruefen(id); sichern(); },
    stempelPruefen(id) {                                 // Stempel: Folge gesehen + jede Quizfrage beantwortet
      const f = S.folgen[id], fo = DATEN.folgen.find(x => x.id === id);
      if (f && !f.stempel && f.gesehen && fo && fo.quiz.every(q => f.quiz[q.id])) f.stempel = heute();
    },
    quizAntwort(folgeId, qid, ok) {
      const f = S.folgen[folgeId] || (S.folgen[folgeId] = { gesehen: false, quiz: {}, stempel: null }), q = f.quiz[qid] || (f.quiz[qid] = { versuche: 0, richtig: false });
      q.versuche++; q.richtig = ok; if (ok && !q.erstRichtig) q.erstRichtig = q.versuche === 1;
      const key = folgeId + ':' + qid; S.quizFehler = S.quizFehler.filter(k => k !== key); if (!ok) S.quizFehler.push(key);
      L.stempelPruefen(folgeId); sichern();
    },
    quizFehler(folgeId) { return S.quizFehler.filter(k => k.startsWith(folgeId + ':')).map(k => k.split(':')[1]); },
    // Aussprache: gespeichert wird nur die eigene Einschätzung mit Datum, nie eine Aufnahme.
    aussprache(id) { return S.aussprache[id] || null; },
    ausspracheMerken(id, urteil) {
      S.aussprache[id] = { urteil, datum: heute() };
      if (urteil === 'ueben' && S.woerter[id] && S.woerter[id].box > 0) S.woerter[id].faellig = heute();   // heute im Heft zur Wiederholung
      sichern();
    },
    ausspracheUeben() { return Object.keys(S.aussprache).filter(id => S.aussprache[id].urteil === 'ueben'); },
    einheit() { const w = woche(); S.ziel.einheiten[w] = (S.ziel.einheiten[w] || 0) + 1; sichern(); },
    ziel() { const w = woche(); return { proWoche: S.ziel.proWoche, diese: S.ziel.einheiten[w] || 0, pause: S.ziel.pausen.includes(w) }; },
    zielSetzen(n) { S.ziel.proWoche = n; sichern(); },
    pauseUmschalten() { const w = woche(); S.ziel.pausen = S.ziel.pausen.includes(w) ? S.ziel.pausen.filter(x => x !== w) : [...S.ziel.pausen, w]; sichern(); },
    exportieren() {
      const name = `lexivoya-lernstand-${heute()}.json`, inhalt = JSON.stringify({ app: 'lexivoya', exportiert: new Date().toISOString(), lernstand: S }, null, 1);
      const blob = new Blob([inhalt], { type: 'application/json' });
      // Installierte App (iOS): ein Datei-Download hat dort keinen sicheren Rückweg → Teilen-Menü („In Dateien sichern“)
      if (APP && typeof File === 'function' && navigator.canShare) {
        const datei = new File([inhalt], name, { type: 'application/json' });
        if (navigator.canShare({ files: [datei] })) return navigator.share({ files: [datei], title: 'Lexivoya-Lernstand' }).then(() => 'geteilt', e => (e && e.name === 'AbortError' ? 'abgebrochen' : Promise.reject(e)));
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return Promise.resolve('geladen');
    },
    importieren(datei) {
      return datei.text().then(t => {
        const d = JSON.parse(t), neu = d && d.app === 'lexivoya' ? d.lernstand : null;
        if (!neu || typeof neu.woerter !== 'object') throw new Error('Das ist keine Lexivoya-Lernstand-Datei.');
        S = Object.assign(leer(), neu); sichern();
      });
    },
    loeschen() { S = leer(); sichern(); },
    hatDaten() { return Object.keys(S.woerter).length > 0 || Object.keys(S.folgen).length > 0; },

    // ---------------------------------------------------------------- Kurse, Kurs-Kontext, Weiterlernen
    app: APP,
    kurs(serie) { return KURSE.find(k => k.serie === serie); },
    folgeKontext(id) { const f = FOLGE(id), k = L.kurs(f.kurs); return `${k.sprache} · ${k.niveau} · Folge ${f.nr}`; },
    folgeLabel(id) { return `${L.folgeKontext(id)} — ${FOLGE(id).titel}`; },
    kursWoerter(serie) { return L.kurs(serie).folgen.flatMap(id => FOLGE(id).woerter); },
    aktivitaet(folgeId, abschnitt) {                     // zuletzt bearbeitete Stelle: Kurs, Folge, Abschnitt (Anker)
      const f = FOLGE(folgeId); if (!f) return;
      S.kurse[f.kurs] = { zuletzt: new Date().toISOString(), folge: folgeId, abschnitt: abschnitt || null }; sichern();
    },
    videoZeit(folgeId) { return S.video[folgeId] || 0; },
    videoMerken(folgeId, t) { S.video[folgeId] = Math.floor(t); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { speicherOk = false; } },
    kursStand(serie) {
      const k = L.kurs(serie), ids = k.folgen, z = S.kurse[serie];
      const geschafft = ids.filter(id => L.folge(id).stempel).length, geplant = k.folgen_geplant || ids.length;
      const aktiv = !!z || ids.some(id => S.folgen[id]) || L.kursWoerter(serie).some(id => S.woerter[id]);
      return { geschafft, geplant, aktiv, fertig: geschafft >= geplant, offen: ids.find(id => !L.folge(id).stempel) || null, zuletzt: (z && z.zuletzt) || '' };
    },
    kursZiel(serie) {                                    // {wort, ziel, href, titel} für einen Kurs
      const k = L.kurs(serie), st = L.kursStand(serie), z = S.kurse[serie];
      const zu = (wort, id, anker) => ({ wort, ziel: `${k.sprache} · Folge ${FOLGE(id).nr}`, href: FOLGE(id).url + (anker ? '#' + anker : ''), titel: L.folgeLabel(id), folge: id });
      if (!st.aktiv) return zu('Loslegen', k.folgen[0]);
      if (st.offen) return zu('Weiter', st.offen, z && z.folge === st.offen ? z.abschnitt : null);
      if (L.faellige(L.kursWoerter(serie)).length) return { wort: 'Wiederholen', ziel: k.sprache, href: '/heft/#wiederholen', titel: `${k.sprache} · ${k.niveau}: Wörter wiederholen` };
      return zu('Weiter', (z && FOLGE(z.folge) && z.folge) || k.folgen[k.folgen.length - 1], z && z.abschnitt);
    },
    weiterlernen() {                                     // zuletzt genutzter, nicht abgeschlossener Kurs; sonst der erste neue
      const st = KURSE.map(k => ({ k, s: L.kursStand(k.serie) }));
      const aktiv = st.filter(x => x.s.aktiv && !x.s.fertig).sort((a, b) => b.s.zuletzt.localeCompare(a.s.zuletzt));
      const wahl = (aktiv[0] || st.find(x => !x.s.aktiv) || st.filter(x => x.s.aktiv).sort((a, b) => b.s.zuletzt.localeCompare(a.s.zuletzt))[0] || st[0]).k;
      return Object.assign({ kurs: wahl.serie }, L.kursZiel(wahl.serie));
    }
  };
  window.Lernstand = L;

  // ---------------------------------------------------------------- Hell/Dunkel (nur eine Anzeige-Vorliebe im Browser)
  function thema(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    // Statusleiste/Fensterfarbe folgt dem gewählten Thema (sonst dem System, über media in den theme-color-Tags)
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      if (!m.dataset.media) m.dataset.media = m.getAttribute('media') || '';
      if (t) { m.setAttribute('media', 'all'); m.setAttribute('content', t === 'dark' ? '#211b10' : '#f4ecda'); }
      else { m.setAttribute('media', m.dataset.media); m.setAttribute('content', /dark/.test(m.dataset.media) ? '#211b10' : '#f4ecda'); }
    });
  }
  try { thema(localStorage.getItem(THEMA)); } catch (e) {}
  // ---------------------------------------------------------------- Menü „Weiterlernen“ und Weiter-Knöpfe je Kurs
  function weiterZeigen() {
    const w = L.weiterlernen();
    document.querySelectorAll('a[data-weiter]').forEach(a => {
      a.href = w.href; a.title = w.titel;
      a.querySelector('small').textContent = w.wort + ':'; a.querySelector('span').textContent = w.ziel;
      const hier = location.pathname === w.href.split('#')[0];
      if (hier) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('a[data-weiter-kurs]').forEach(a => {
      const z = L.kursZiel(a.dataset.weiterKurs); a.href = z.href; a.title = z.titel; a.textContent = `${z.wort}: ${z.ziel}`;
    });
  }
  document.addEventListener('lernstand', () => { if (document.readyState !== 'loading') weiterZeigen(); });

  // ---------------------------------------------------------------- Installierte App: eigener Speicher (einmaliger Hinweis)
  const APP_HINWEIS = 'lexivoya.app-hinweis';
  function appHinweis() {
    let gesehen = false; try { gesehen = localStorage.getItem(APP_HINWEIS) === '1'; } catch (e) {}
    if (!APP || gesehen || L.hatDaten() || document.getElementById('app-hinweis')) return;
    const box = document.createElement('aside'); box.id = 'app-hinweis'; box.className = 'karte app-hinweis wrap-innen'; box.setAttribute('role', 'note');
    box.innerHTML = `<h2>Willkommen in der Lexivoya-App</h2>
      <p>Die App auf deinem Home-Bildschirm hat ihren <b>eigenen Speicher</b> — getrennt von Safari. Wenn du vorher schon in Safari gelernt hast, ist dein Stand hier deshalb noch nicht zu sehen. So nimmst du ihn mit:</p>
      <ol><li>Öffne <b>lexivoya.com</b> in Safari, tippe auf „Mein Heft“ und dort unter „Lernstand sichern“ auf <b>„Als Datei sichern“</b>. Die Datei landet in der App „Dateien“ (Ordner Downloads).</li>
        <li>Komm zurück in diese App, tippe auf „Mein Heft“ → <b>„Datei laden“</b> und wähle die Datei.</li></ol>
      <p class="hinweis">Danach lernst du am besten nur noch hier weiter: App und Safari gleichen sich nicht von selbst ab. Neu bei Lexivoya? Dann einfach auf „Verstanden“ tippen.</p>
      <div class="zeile-knoepfe"><a class="btn btn-primary btn-klein" href="/heft/#sichern">Zu „Datei laden“</a><button class="btn btn-ghost btn-klein" type="button">Verstanden</button></div>`;
    const zu = () => { try { localStorage.setItem(APP_HINWEIS, '1'); } catch (e) {} box.remove(); };
    box.querySelector('button').addEventListener('click', zu);
    box.querySelector('a').addEventListener('click', () => { if (location.pathname === '/heft/') zu(); });
    const main = document.querySelector('main'); main && main.prepend(box);
  }
  document.addEventListener('lernstand', () => { if (L.hatDaten()) { const b = document.getElementById('app-hinweis'); b && b.remove(); } });

  document.addEventListener('DOMContentLoaded', () => {
    weiterZeigen(); appHinweis();
    document.querySelectorAll('.thema').forEach(b => b.addEventListener('click', () => {
      const dunkel = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      const neu = dunkel ? 'light' : 'dark'; thema(neu); try { localStorage.setItem(THEMA, neu); } catch (e) {}
    }));
  });

  // ---------------------------------------------------------------- Audio + Ton-Wache
  // Regel (Andreas Reinert 2026-11-24): Die Website spielt NIE Ton ohne ausdrückliche Nutzer-Aktion. Jede Wiedergabe braucht
  // einen echten Klick/Tipp/Tastendruck unmittelbar davor (≤ TON_FENSTER ms); kein Autoplay, keine Schleife, kein erneutes
  // Abspielen nach Pause oder beim Zurückkehren in den Tab. Läuft der Tab in den Hintergrund, verstummt alles.
  const TON_FENSTER = 8000;                            // Puffer für Laden/Dekodieren eines kurzen Tonbeispiels nach dem Klick
  let letzteAktion = -Infinity;
  for (const t of ['pointerdown', 'touchstart', 'keydown', 'click'])
    addEventListener(t, e => { if (e.isTrusted) letzteAktion = performance.now(); }, true);
  L.tonErlaubt = () => document.visibilityState === 'visible' && performance.now() - letzteAktion <= TON_FENSTER;
  const stille = [];                                   // Verstummen-Funktionen aller Tonquellen (auch aussprache.js)
  L.beiStille = f => stille.push(f);
  const verstummen = () => stille.forEach(f => { try { f(); } catch (e) {} });
  document.addEventListener('visibilitychange', () => { if (document.hidden) verstummen(); });
  addEventListener('pagehide', verstummen);
  // Eine-Tonquelle-Regel (iPhone-Test Andreas Reinert 2026-11-24: das laufende Video spielte in eine Aufnahme hinein):
  // Auf einer Seite spielt bzw. nimmt immer nur EINE Quelle. Jede Quelle meldet sich mit einer Stopp-Funktion an
  // (Video, Wort-Audio, Übungs-Wiedergabe, Aufnahme, Spracherkennung). Wer startet, ruft L.exklusiv(name): alle anderen
  // stoppen bzw. pausieren. Nichts setzt sich danach von selbst fort. Das Promise löst sich, wenn alle still sind (das
  // Video pausiert asynchron) — die Aufnahme fragt das Mikrofon erst danach an.
  const quellen = new Map();
  L.tonquelle = (name, stopp) => { quellen.set(name, stopp); };
  L.exklusiv = name => Promise.all([...quellen].filter(([n]) => n !== name)
    .map(([, stopp]) => { try { return Promise.resolve(stopp()).catch(() => {}); } catch (e) { return Promise.resolve(); } }));
  let laufend = null;
  const wortStopp = () => { if (laufend) { laufend.a.pause(); laufend.k && laufend.k.classList.remove('spielt'); laufend = null; } };
  L.beiStille(wortStopp); L.tonquelle('wort', wortStopp);
  L.abspielen = function (src, knopf) {
    if (!L.tonErlaubt()) return Promise.resolve(false);  // ohne Klick davor: still (Ton-Wache)
    L.exklusiv('wort');                                  // Eine-Tonquelle-Regel: Video pausiert, Übung/Aufnahme stoppt
    if (laufend) { laufend.a.pause(); laufend.k && laufend.k.classList.remove('spielt'); }
    const a = new Audio(src); laufend = { a, k: knopf };
    knopf && knopf.classList.add('spielt');
    a.addEventListener('ended', () => knopf && knopf.classList.remove('spielt'));
    return a.play().catch(() => knopf && knopf.classList.remove('spielt'));
  };

  // ---------------------------------------------------------------- Antwort vergleichen
  const norm = s => s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[.,!?…;:"„“”«»]/g, ' ').replace(/\s+/g, ' ').trim();
  function abstand(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  L.vergleich = function (eingabe, soll) {
    const a = norm(eingabe), b = norm(soll);
    if (!a) return 'leer';
    if (a === b) return 'richtig';
    return b.length >= 4 && abstand(a, b) <= 1 ? 'fast' : 'falsch';
  };

  // ---------------------------------------------------------------- Schreibtest: hören → tippen → Auswertung
  // ids: Wörter der Runde. opt.wertet: false = freies Üben (zählt nicht für die Wiederholung). Falsche kommen am Ende noch einmal.
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  L.schreibtest = function (box, ids, opt = {}) {
    const W = DATEN.woerter, wertet = opt.wertet !== false;
    let reihe = ids.slice().sort(() => Math.random() - .5), nochmal = new Set(), ok = 0, gesamt = ids.length, pos = 0;
    function frage() {
      if (!reihe.length) return ende();
      const id = reihe[0], w = W[id]; pos++;
      box.innerHTML = `<p class="zaehler">Wort ${Math.min(pos, gesamt + nochmal.size)} · ${reihe.length} offen</p>
        <p>Hör zu und schreib auf Englisch, was du hörst.</p>
        <div class="reihe"><button class="hoeren" type="button" aria-label="Anhören"></button>
          <label class="sr-only" for="st-eingabe">Deine Antwort</label>
          <input id="st-eingabe" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en" placeholder="Was hörst du?"></div>
        <div class="zeile-knoepfe"><button class="btn btn-primary btn-klein" type="button" data-a="pruefen">Prüfen</button>
          <button class="btn btn-ghost btn-klein" type="button" data-a="weissnicht">Weiß ich nicht</button></div>
        <div class="rueckmeldung" aria-live="polite"></div>`;
      const hb = box.querySelector('.hoeren'), inp = box.querySelector('input'), rm = box.querySelector('.rueckmeldung');
      hb.addEventListener('click', () => L.abspielen(w.audio, hb));
      L.abspielen(w.audio, hb);
      const pruefen = weiss => {
        const v = weiss ? 'falsch' : L.vergleich(inp.value, w.en);
        if (v === 'leer') { rm.innerHTML = 'Schreib, was du hörst — oder tippe auf „Weiß ich nicht".'; inp.focus(); return; }
        const richtig = v !== 'falsch';
        if (wertet) L.antwort(id, richtig);
        if (richtig) ok++; else if (!nochmal.has(id)) { nochmal.add(id); reihe.push(id); }
        reihe.shift();
        rm.innerHTML = (v === 'richtig' ? '<span class="gut">Richtig!</span>' :
          v === 'fast' ? `<span class="gut">Fast!</span> So schreibt man es:` : `<span class="schlecht">${weiss ? 'Kein Problem.' : 'Noch nicht.'}</span> Richtig ist:`) +
          `<p class="loesung" lang="en">${esc(w.en)}</p><p class="muted">= ${esc(w.de)}</p>`;
        box.querySelector('.zeile-knoepfe').innerHTML = `<button class="btn btn-primary btn-klein" type="button">${reihe.length ? 'Weiter' : 'Fertig'}</button>`;
        const wb = box.querySelector('.zeile-knoepfe button'); wb.addEventListener('click', frage); wb.focus();
        inp.disabled = true;
      };
      box.querySelector('[data-a="pruefen"]').addEventListener('click', () => pruefen(false));
      box.querySelector('[data-a="weissnicht"]').addEventListener('click', () => pruefen(true));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pruefen(false); } });
      inp.focus({ preventScroll: true });
    }
    function ende() {
      if (wertet) L.einheit();
      box.innerHTML = `<p class="loesung">Geschafft.</p><p>${ok} von ${gesamt + nochmal.size} Antworten richtig${nochmal.size ? `; ${nochmal.size} Wort${nochmal.size > 1 ? 'e' : ''} hast du ein zweites Mal geübt` : ''}.</p>
        ${wertet ? '<p class="muted">Wörter, die du richtig hattest, kommen in ein paar Tagen zur Wiederholung — dann wird die Tinte im Heft kräftiger.</p>' : ''}
        <div class="zeile-knoepfe"><a class="btn btn-ghost btn-klein" href="/heft/">Zu „Mein Heft“</a></div>`;
      opt.fertig && opt.fertig();
    }
    frage();
  };
})();
