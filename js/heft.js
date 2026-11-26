/* Lexivoya · Mein Heft: Wörter mit Tintenstärke, Wiederholung, Stempel, Wochenziel, Kompetenzen, Lernstand sichern.
   Menü-Konzept v2 (2026-11-24): Wörter, Kompetenzen und Stempel stehen je Kurs („Englisch · A1“), Verweise tragen Kurs + Niveau + Folge. */
(function () {
  'use strict';
  const L = window.Lernstand, D = L.daten, $ = s => document.querySelector(s);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // nur Wörter erschienener Folgen (Folgen nach Sendetermin, lernstand.js); neu berechnet, wenn ein Termin erreicht ist
  let alle = D.kurse.flatMap(k => L.kursWoerter(k.serie));
  const kursKopf = k => `<h3 class="kurs-titel">${esc(k.sprache)} · ${esc(k.niveau)} <small>${esc(k.name)}${k.staffel ? ' · ' + esc(k.staffel) : ''}</small></h3>`;
  const datum = s => new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  function heft() {
    const n = { neu: 0, geuebt: 0, fest: 0 };
    $('#heft').innerHTML = D.kurse.map(k => kursKopf(k) + '<ul class="heft-liste">' + L.kursWoerter(k.serie).map(id => { const t = L.tinte(id); n[t]++; const w = D.woerter[id];
      return `<li class="tinte-${t}"><span class="w" lang="en">${esc(w.en)}</span><span class="d">${esc(w.de)}</span></li>`; }).join('') + '</ul>').join('');
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
      const neuFolge = neu.length ? D.folgen.find(f => f.woerter.includes(neu[0])) : null;
      box.innerHTML = `<p>${naechste ? `Heute ist nichts fällig. Die nächste Wiederholung ist am <b>${datum(naechste)}</b> dran.` :
        'Noch nichts zu wiederholen. Mach zuerst den Schreibtest auf der Lektionsseite — dann plant das Heft deine Wiederholungen.'}</p>
        <div class="zeile-knoepfe">${neuFolge ? `<a class="btn btn-primary btn-klein" href="${neuFolge.url}#ueben" title="${esc(L.folgeLabel(neuFolge.id))}">Neue Wörter üben: ${esc(L.folgeKontext(neuFolge.id))}</a>` : ''}
        <button class="btn btn-ghost btn-klein" type="button">Trotzdem üben</button></div>
        <p class="hinweis">„Trotzdem üben" ist freies Training: Es zählt nicht für die Wiederholung, die Tinte bleibt, wie sie ist.</p>`;
      box.querySelector('button').addEventListener('click', () => L.schreibtest(box, alle, { wertet: false, fertig: alles }));
    }
  }

  function stempel() {
    $('#stempel').innerHTML = D.kurse.map(k => kursKopf(k) + '<div class="stempel-reihe">' +
      Array.from({ length: k.folgen_geplant || k.folgen.length }, (_, i) => {
        const id = k.folgen[i], s = id && L.folge(id).stempel, titel = id ? L.folgeLabel(id) : `${k.sprache} · ${k.niveau} · Folge ${i + 1}`;
        return s ? `<span class="stempel" title="${esc(titel)} — geschafft am ${datum(s)}">Folge ${i + 1}<small>geschafft</small></span>`
          : `<span class="stempel leer" title="${esc(titel)}">Folge ${i + 1}${id ? '' : '<small>kommt bald</small>'}</span>`;
      }).join('') + '</div>').join('');
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
    $('#kompetenzen').innerHTML = D.kurse.map(kurs => kursKopf(kurs) + '<ul class="kompetenzen">' + D.kompetenzen.filter(k => k.kurs === kurs.serie && L.erschienen(k.folge)).map(k => {
      const fest = k.woerter.filter(id => L.tinte(id) === 'fest').length, alleFest = fest === k.woerter.length;
      const offen = k.woerter.filter(id => L.tinte(id) !== 'fest').map(id => D.woerter[id].en);
      return `<li class="${alleFest ? 'ja' : ''}">${esc(alleFest ? k.kannst : k.ziel)}
        <small>${alleFest ? `Alle ${k.woerter.length} Wörter dazu hast du an mindestens drei verschiedenen Tagen richtig geschrieben.`
          : `${fest} von ${k.woerter.length} Wörtern gefestigt · noch offen: ${esc(offen.join(', '))}`}</small></li>`;
    }).join('') + '</ul>').join('');
  }

  function aussprache() {                               // „Noch mal üben“ aus der Aussprache-Übung (nur die Einschätzung, kein Audio)
    const liste = L.ausspracheUeben().filter(id => D.woerter[id]), el = $('#aussprache-merk');
    el.innerHTML = liste.length ? `<p><b>Aussprache üben:</b> ${liste.map(id => {
      const f = D.folgen.find(x => x.woerter.includes(id));
      return `<a href="${f.url}?wort=${encodeURIComponent(id)}#aussprache" lang="en" title="${esc(D.woerter[id].en)} — ${esc(L.folgeLabel(f.id))}">${esc(D.woerter[id].en)}</a>`; }).join(' · ')}</p>
      <p class="hinweis">Diese Wörter hast du zum Sprechen vorgemerkt. Sie bleiben hier, bis du sie mit „Klang gut“ abhakst.</p>` : '';
  }
  function alles() { alle = D.kurse.flatMap(k => L.kursWoerter(k.serie)); heft(); stempel(); ziel(); kompetenzen(); aussprache(); }
  $('#ziel .pause').addEventListener('click', () => L.pauseUmschalten());
  $('#export').addEventListener('click', () => {
    Promise.resolve(L.exportieren()).then(art => {
      $('#import-meldung').textContent = art === 'geteilt' ? 'Gesichert — die Datei liegt jetzt dort, wo du sie im Teilen-Menü abgelegt hast.'
        : art === 'abgebrochen' ? 'Nicht gesichert (abgebrochen).' : 'Die Datei wird heruntergeladen (lexivoya-lernstand-…json).';
    }, () => { $('#import-meldung').textContent = 'Sichern hat nicht geklappt. Versuch es noch einmal.'; });
  });
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
