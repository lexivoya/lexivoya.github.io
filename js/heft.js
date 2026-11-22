/* Lexivoya · Chinwag-Heft: Wörter mit Tintenstärke, Wiederholung, Stempel, Wochenziel, Kompetenzen, Lernstand sichern. */
(function () {
  'use strict';
  const L = window.Lernstand, D = L.daten, $ = s => document.querySelector(s);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const alle = D.folgen.flatMap(f => f.woerter);
  const datum = s => new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  function heft() {
    const n = { neu: 0, geuebt: 0, fest: 0 };
    $('#heft').innerHTML = alle.map(id => { const t = L.tinte(id); n[t]++; const w = D.woerter[id];
      return `<li class="tinte-${t}"><span class="w" lang="en">${esc(w.en)}</span><span class="d">${esc(w.de)}</span></li>`; }).join('');
    $('#heft-zahlen').textContent = `${n.fest} gefestigt · ${n.geuebt} geübt · ${n.neu} noch neu`;
  }

  function wiederholung() {
    const faellig = L.faellige(alle), box = $('#wiederholung');
    if (faellig.length) {
      box.innerHTML = `<p><b>${faellig.length} Wort${faellig.length > 1 ? 'e' : ''}</b> ${faellig.length > 1 ? 'sind' : 'ist'} heute zur Wiederholung dran.</p>
        <div class="zeile-knoepfe"><button class="btn btn-primary" type="button">Wiederholung starten</button></div>`;
      box.querySelector('button').addEventListener('click', () => L.schreibtest(box, faellig, { fertig: alles }));
    } else {
      const naechste = L.naechsteFaelligkeit(alle), neu = alle.filter(id => L.tinte(id) === 'neu');
      box.innerHTML = `<p>${naechste ? `Heute ist nichts fällig. Die nächste Wiederholung ist am <b>${datum(naechste)}</b> dran.` :
        'Noch nichts zu wiederholen. Mach zuerst den Schreibtest auf der Lektionsseite — dann plant das Heft deine Wiederholungen.'}</p>
        <div class="zeile-knoepfe">${neu.length ? `<a class="btn btn-primary btn-klein" href="${D.folgen[0].url}#ueben">Neue Wörter üben</a>` : ''}
        <button class="btn btn-ghost btn-klein" type="button">Trotzdem üben</button></div>
        <p class="hinweis">„Trotzdem üben" ist freies Training: Es zählt nicht für die Wiederholung, die Tinte bleibt, wie sie ist.</p>`;
      box.querySelector('button').addEventListener('click', () => L.schreibtest(box, alle, { wertet: false, fertig: alles }));
    }
  }

  function stempel() {
    const geplant = D.kurs.folgen;
    $('#stempel').innerHTML = Array.from({ length: geplant }, (_, i) => {
      const f = D.folgen[i], s = f && L.folge(f.id).stempel;
      return s ? `<span class="stempel" title="am ${datum(s)}">Folge ${i + 1}<small>geschafft</small></span>`
        : `<span class="stempel leer">Folge ${i + 1}${f ? '' : '<small>kommt bald</small>'}</span>`;
    }).join('');
  }

  function ziel() {
    const z = L.ziel(), box = $('#ziel');
    box.querySelector('.ziel-wahl').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n => `<button type="button" aria-pressed="${z.proWoche === n}">${n}</button>`).join('');
    box.querySelectorAll('.ziel-wahl button').forEach((b, i) => b.addEventListener('click', () => { L.zielSetzen(i + 1); }));
    const stand = box.querySelector('.stand');
    if (!z.proWoche) stand.innerHTML = '<p class="muted">Wähle, wie viele Lerneinheiten du dir pro Woche vornimmst. Eine Einheit ist eine Folge, ein Quiz, ein Schreibtest oder eine Wiederholung.</p>';
    else if (z.pause) stand.innerHTML = '<p>Diese Woche ist Pause. Dein Ziel wartet einfach auf nächste Woche — es geht nichts verloren.</p>';
    else stand.innerHTML = `<div class="punkte" aria-hidden="true">${Array.from({ length: z.proWoche }, (_, i) => `<i class="${i < z.diese ? 'voll' : ''}"></i>`).join('')}</div>
      <p>${z.diese >= z.proWoche ? `Wochenziel erreicht: ${z.diese} Einheiten. Alles darüber ist Zugabe.` : `Diese Woche: ${z.diese} von ${z.proWoche} Einheiten.`}</p>`;
    box.querySelector('.pause').textContent = z.pause ? 'Pause beenden' : 'Diese Woche pausieren';
    box.querySelector('.pause').hidden = !z.proWoche;
  }

  function kompetenzen() {
    $('#kompetenzen').innerHTML = D.kompetenzen.map(k => {
      const fest = k.woerter.filter(id => L.tinte(id) === 'fest').length, alleFest = fest === k.woerter.length;
      const offen = k.woerter.filter(id => L.tinte(id) !== 'fest').map(id => D.woerter[id].en);
      return `<li class="${alleFest ? 'ja' : ''}">${esc(alleFest ? k.kannst : k.ziel)}
        <small>${alleFest ? `Alle ${k.woerter.length} Wörter dazu hast du an mindestens drei verschiedenen Tagen richtig geschrieben.`
          : `${fest} von ${k.woerter.length} Wörtern gefestigt · noch offen: ${esc(offen.join(', '))}`}</small></li>`;
    }).join('');
  }

  function aussprache() {                               // „Noch mal üben“ aus der Aussprache-Übung (nur die Einschätzung, kein Audio)
    const liste = L.ausspracheUeben().filter(id => D.woerter[id]), el = $('#aussprache-merk');
    el.innerHTML = liste.length ? `<p><b>Aussprache üben:</b> ${liste.map(id => {
      const f = D.folgen.find(x => x.woerter.includes(id));
      return `<a href="${f.url}?wort=${encodeURIComponent(id)}#aussprache" lang="en">${esc(D.woerter[id].en)}</a>`; }).join(' · ')}</p>
      <p class="hinweis">Diese Wörter hast du zum Sprechen vorgemerkt. Sie bleiben hier, bis du sie mit „Klang gut“ abhakst.</p>` : '';
  }
  function alles() { heft(); stempel(); ziel(); kompetenzen(); aussprache(); }
  $('#ziel .pause').addEventListener('click', () => L.pauseUmschalten());
  $('#export').addEventListener('click', () => L.exportieren());
  $('#import').addEventListener('change', e => {
    const d = e.target.files[0]; if (!d) return;
    if (L.hatDaten() && !window.confirm('Der Lernstand in diesem Browser wird durch die Datei ersetzt. Fortfahren?')) { e.target.value = ''; return; }
    L.importieren(d).then(() => { $('#import-meldung').textContent = 'Lernstand geladen.'; wiederholung(); alles(); })
      .catch(err => { $('#import-meldung').textContent = err.message || 'Die Datei konnte nicht gelesen werden.'; });
    e.target.value = '';
  });
  $('#loeschen').addEventListener('click', () => {
    if (!window.confirm('Deinen ganzen Lernstand in diesem Browser löschen? Das lässt sich nicht rückgängig machen (außer mit einer gesicherten Datei).')) return;
    L.loeschen(); $('#import-meldung').textContent = 'Lernstand gelöscht.'; wiederholung(); alles();
  });
  document.addEventListener('lernstand', () => { ziel(); stempel(); });
  if (!L.speicherOk) $('#speicher-hinweis').hidden = false;
  wiederholung(); alles();
})();
