/* Lexivoya · Lektionsseite: Video (erst nach Klick, youtube-nocookie), Quiz an den Zeitmarken, Vokabeln, Schreibtest.
   Menü-Konzept v2: Jede Bearbeitung merkt Kurs, Folge und Abschnitt (L.aktivitaet) für „Weiterlernen“; das Video setzt an
   der zuletzt gesehenen Stelle fort. */
(function () {
  'use strict';
  const L = window.Lernstand, D = L.daten, $ = s => document.querySelector(s);
  const F = D.folgen.find(f => f.id === document.body.dataset.folge);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let player = null, uhr = null, gefragt = new Set(), maxZeit = 0;

  // ---------------------------------------------------------------- Video: Klick zum Laden
  const box = $('#player');
  function laden(start) {
    if (player) { start != null && (player.seekTo(start, true), player.playVideo()); return; }
    box.innerHTML = '<div id="yt"></div>';
    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player('yt', {
        host: 'https://www.youtube-nocookie.com', videoId: F.youtube,
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, start: Math.floor(start || 0) },
        events: { onReady: e => e.target.playVideo(),
          onStateChange: e => { if (e.data === 1) { L.exklusiv('video'); laufen(); } else stopp(); } }   // Video startet → Übungs-Audio stoppt
      });
    };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
  }
  const gemerkt = L.videoZeit(F.id), fortsetzen = gemerkt > 15 && gemerkt < (F.dauer || 1e9) * .95;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  if (fortsetzen) box.querySelector('.laden .knopf').textContent = `Weiter ab ${mmss(gemerkt)}`;
  box.querySelector('.laden').addEventListener('click', () => laden(fortsetzen ? gemerkt : 0));
  // Eine-Tonquelle-Regel: Das Video pausiert, sobald eine andere Quelle startet (Aufnahme, Vorbild, Wort). Das Promise löst
  // sich erst, wenn der Player wirklich steht (höchstens 800 ms), damit kein Video-Ton in eine Aufnahme läuft.
  L.tonquelle('video', () => new Promise(fertig => {
    const st = () => (player && player.getPlayerState ? player.getPlayerState() : -1);
    if (!player || !player.pauseVideo || (st() !== 1 && st() !== 3)) return fertig();
    player.pauseVideo(); const t0 = Date.now();
    const uhr = setInterval(() => { if ((st() !== 1 && st() !== 3) || Date.now() - t0 > 800) { clearInterval(uhr); fertig(); } }, 40);
  }));
  document.querySelectorAll('[data-zeit]').forEach(b => b.addEventListener('click', () => { laden(+b.dataset.zeit); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  let gemerktUm = 0;
  function laufen() { stopp(); uhr = setInterval(pruefeZeit, 250); L.aktivitaet(F.id, 'player'); }
  function stopp() { clearInterval(uhr); uhr = null; }
  function pruefeZeit() {
    const t = player.getCurrentTime(), dur = player.getDuration() || F.dauer;
    if (Math.abs(t - gemerktUm) >= 5) { gemerktUm = t; L.videoMerken(F.id, t >= dur * .97 ? 0 : t); }
    if (t > maxZeit && t - maxZeit < 2) maxZeit = t;      // nur zusammenhängend Gesehenes zählt (kein Vorspulen ans Ende)
    for (const q of F.quiz) {
      if (t < q.t - 5) gefragt.delete(q.id);             // zurückgespult: Frage darf wieder kommen
      if (!gefragt.has(q.id) && t >= q.t && t < q.t + 4) { gefragt.add(q.id); player.pauseVideo(); zeigeFrage(q, () => { qbox.hidden = true; player.playVideo(); }, null, 'Weiter im Video'); return; }
    }
    if (dur && maxZeit >= dur * .9 && !L.folge(F.id).gesehen) { const f = L.folge(F.id); f.gesehen = true; L.folgeSetzen(F.id, f); L.einheit(); stempelZeigen(); }
  }

  // ---------------------------------------------------------------- Quiz
  const qbox = $('#quiz');
  function zeigeFrage(q, weiter, info, knopf) {
    qbox.hidden = false;
    qbox.innerHTML = `<p class="nr">${info || `Quiz · Frage ${F.quiz.indexOf(q) + 1} von ${F.quiz.length}`}</p><p class="frage">${esc(q.frage)}</p>
      <div class="optionen">${q.optionen.map((o, i) => `<button type="button" data-i="${i}"><b>${'ABC'[i]}</b><span>${esc(o)}</span></button>`).join('')}</div>
      <div class="rueckmeldung" aria-live="polite"></div>`;
    qbox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    qbox.querySelectorAll('.optionen button').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i, ok = i === q.richtig;
      L.quizAntwort(F.id, q.id, ok); L.aktivitaet(F.id, 'quiz-abschnitt');
      qbox.querySelectorAll('.optionen button').forEach((x, j) => { x.disabled = true; if (j === q.richtig) x.classList.add('richtig'); else if (j === i) x.classList.add('falsch'); });
      qbox.querySelector('.rueckmeldung').innerHTML = (ok ? '<span class="gut">Richtig!</span> ' : '<span class="schlecht">Nicht ganz.</span> Diese Frage kommt später noch einmal. ') +
        esc(q.erklaerung) + `<div class="zeile-knoepfe"><button class="btn btn-primary btn-klein" type="button">${knopf || 'Weiter'}</button></div>`;
      const wb = qbox.querySelector('.rueckmeldung button'); wb.focus();
      wb.addEventListener('click', () => { if (typeof weiter === 'function') weiter(); else { qbox.hidden = true; } quizStand(); stempelZeigen(); });
    }));
  }
  // Quiz ohne Video, und Wiederholung falsch beantworteter Fragen (bis sie sitzen)
  function runde(fragen, titel) {
    let i = 0;
    const naechste = () => { if (i >= fragen.length) { qbox.hidden = true; L.einheit(); quizStand(); stempelZeigen(); return; }
      const q = fragen[i++]; zeigeFrage(q, naechste, `${titel} · ${i} von ${fragen.length}`); };
    naechste();
  }
  $('#quiz-ohne-video').addEventListener('click', () => runde(F.quiz, 'Quiz'));
  $('#quiz-wiederholen').addEventListener('click', () => runde(L.quizFehler(F.id).map(id => F.quiz.find(q => q.id === id)), 'Wiederholung'));
  function quizStand() {
    const f = L.folge(F.id), beantwortet = F.quiz.filter(q => f.quiz[q.id]).length, fehler = L.quizFehler(F.id).length;
    $('#quiz-stand').textContent = beantwortet ? `${beantwortet} von ${F.quiz.length} Fragen beantwortet` + (fehler ? ` · ${fehler} zum Wiederholen` : ' · alle zuletzt richtig') : 'Noch keine Frage beantwortet.';
    $('#quiz-wiederholen').hidden = !fehler;
  }

  // ---------------------------------------------------------------- Folge gesehen / Stempel
  $('#gesehen').addEventListener('click', () => { L.aktivitaet(F.id, 'quiz-abschnitt'); const f = L.folge(F.id); if (!f.gesehen) { f.gesehen = true; L.folgeSetzen(F.id, f); L.einheit(); } stempelZeigen(); });
  function stempelZeigen() {
    const f = L.folge(F.id), el = $('#stempel-stand');
    if (f.stempel) el.innerHTML = `<span class="stempel">Folge ${F.nr}<small>geschafft</small></span>`;
    else el.innerHTML = `<p class="muted">Für den Stempel in deinem Heft: Folge ansehen${f.gesehen ? ' ✓' : ''} und alle ${F.quiz.length} Quizfragen beantworten${F.quiz.every(q => f.quiz[q.id]) ? ' ✓' : ''}.</p>`;
    $('#gesehen').hidden = f.gesehen;
  }

  // ---------------------------------------------------------------- Vokabeln anhören, Schreibtest
  document.querySelectorAll('.hoeren[data-src]').forEach(b => b.addEventListener('click', () => L.abspielen(b.dataset.src, b)));
  $('#schreibtest-start').addEventListener('click', () => { L.aktivitaet(F.id, 'ueben'); L.schreibtest($('#schreibtest'), F.woerter); });

  quizStand(); stempelZeigen();
  if (!L.speicherOk) $('#speicher-hinweis').hidden = false;
})();
