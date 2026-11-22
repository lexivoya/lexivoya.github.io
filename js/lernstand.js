/* Lexivoya · Lernstand (nur im Browser dieses Geräts, localStorage) + gemeinsame Bausteine.
   Kein Server, keine Cookies, kein Tracking. Export/Import als Datei bleibt auf dem Gerät.
   Wiederholung in Abständen: Leitner-Boxen 0–5. Richtig (wenn fällig) → eine Box weiter; falsch → Box 1, heute wieder fällig.
   Tinte: Box 0 = neu · 1–2 = geübt · ≥ 3 = gefestigt (an drei verschiedenen Tagen richtig abgerufen). */
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
  const leer = () => ({ version: 1, woerter: {}, folgen: {}, ziel: { proWoche: null, pausen: [], einheiten: {} }, quizFehler: [] });
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
    einheit() { const w = woche(); S.ziel.einheiten[w] = (S.ziel.einheiten[w] || 0) + 1; sichern(); },
    ziel() { const w = woche(); return { proWoche: S.ziel.proWoche, diese: S.ziel.einheiten[w] || 0, pause: S.ziel.pausen.includes(w) }; },
    zielSetzen(n) { S.ziel.proWoche = n; sichern(); },
    pauseUmschalten() { const w = woche(); S.ziel.pausen = S.ziel.pausen.includes(w) ? S.ziel.pausen.filter(x => x !== w) : [...S.ziel.pausen, w]; sichern(); },
    exportieren() {
      const blob = new Blob([JSON.stringify({ app: 'lexivoya', exportiert: new Date().toISOString(), lernstand: S }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lexivoya-lernstand-${heute()}.json`;
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    importieren(datei) {
      return datei.text().then(t => {
        const d = JSON.parse(t), neu = d && d.app === 'lexivoya' ? d.lernstand : null;
        if (!neu || typeof neu.woerter !== 'object') throw new Error('Das ist keine Lexivoya-Lernstand-Datei.');
        S = Object.assign(leer(), neu); sichern();
      });
    },
    loeschen() { S = leer(); sichern(); },
    hatDaten() { return Object.keys(S.woerter).length > 0 || Object.keys(S.folgen).length > 0; }
  };
  window.Lernstand = L;

  // ---------------------------------------------------------------- Hell/Dunkel (nur eine Anzeige-Vorliebe im Browser)
  function thema(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  try { thema(localStorage.getItem(THEMA)); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.thema').forEach(b => b.addEventListener('click', () => {
      const dunkel = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      const neu = dunkel ? 'light' : 'dark'; thema(neu); try { localStorage.setItem(THEMA, neu); } catch (e) {}
    }));
  });

  // ---------------------------------------------------------------- Audio
  let laufend = null;
  L.abspielen = function (src, knopf) {
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
        <div class="zeile-knoepfe"><a class="btn btn-ghost btn-klein" href="/heft/">Zum Chinwag-Heft</a></div>`;
      opt.fertig && opt.fertig();
    }
    frage();
  };
})();
