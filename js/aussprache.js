/* Lexivoya · Aussprache üben (Lektionsseite)
   Stufe 1 Selbstvergleich: Vorbild hören → aufnehmen → Vorbild / Deine Aufnahme im Wechsel → beide Wellenformen als Bild → selbst einschätzen.
   Die Aufnahme liegt nur im Arbeitsspeicher dieses Tabs (Float32-Daten, kein Blob, keine Datei), wird nie hochgeladen und nie gespeichert;
   beim Wechsel des Worts, bei neuer Aufnahme oder beim Verlassen der Seite ist sie weg. Das Mikrofon wird nach jeder Aufnahme wieder freigegeben.
   Über jeder Wellenform liegt die Sprachmelodie (melodie.js, im Browser berechnet, Halbtöne relativ zur eigenen mittleren Tonhöhe),
   damit tiefe und hohe Stimmen vergleichbar sind. Kein Score aus den Kurven: Sie sind ein Bild zum Selbstvergleich.
   Stufe 2 (freiwillig): Spracherkennung des Browsers (Web Speech API), nur wenn vorhanden und erst nach ausdrücklichem Klick. */
(function () {
  'use strict';
  const L = window.Lernstand, D = L.daten, $ = s => document.querySelector(s);
  const box = $('#aussprache-box'); if (!box) return;
  const F = D.folgen.find(f => f.id === document.body.dataset.folge), ids = F.woerter;
  const merken = () => L.aktivitaet && L.aktivitaet(F.id, 'aussprache');   // „Weiterlernen“ führt hierher zurück
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MAX_S = { wort: 6, satz: 10 };
  let i = 0, modus = 'wort', ctx = null, vorbild = null, aufnahme = null, quelle = null, laeuft = null, bewertet = new Set(), einheitGezaehlt = false;
  const PLATTFORM = (() => { const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    return /Android/.test(ua) ? 'android' : /Macintosh/.test(ua) ? 'mac' : 'andere'; })();
  const EINSTELLUNG = {
    ios: { mikrofon: L.app ? 'in den iPhone-Einstellungen bei Safari → Mikrofon. In der App vom Home-Bildschirm fragt iOS manchmal erneut, wenn du die App neu öffnest. Klappt es hier gar nicht, nimm die Übung in Safari auf lexivoya.com'
                            : 'unter Einstellungen → Safari → Mikrofon (oder über „aA“ in der Adressleiste → Website-Einstellungen)', erkennung: '' },   // Erkennung auf iOS ausgeblendet
    android: { mikrofon: 'beim Schloss-Symbol neben der Adresse → Berechtigungen',
      erkennung: 'in den Android-Einstellungen die Spracheingabe (Sprachdienste von Google) aktivieren' },
    mac: { mikrofon: 'beim Schloss-Symbol neben der Adresse bzw. in Safari unter Einstellungen → Websites → Mikrofon',
      erkennung: 'Systemeinstellungen → Tastatur → Diktierfunktion' },
    andere: { mikrofon: 'beim Schloss-Symbol neben der Adresse',
      erkennung: 'in den Geräte- bzw. Browser-Einstellungen die Spracherkennung oder Diktierfunktion aktivieren' } }[PLATTFORM];
  const vorbilder = new Map(), melodien = new WeakMap(), M = window.LexivoyaMelodie, HT = 9;   // ±9 Halbtöne Bildhöhe
  const FRAGE = { steigend: 'Achte auf das Ende — geht deine Stimme nach oben wie beim Vorbild?',
    fallend: 'Achte auf das Ende — geht deine Stimme nach unten wie beim Vorbild? Bei Fragen mit Fragewort (what, how …) ist das im Englischen üblich.' };

  // ---------------------------------------------------------------- Audio-Grundlagen
  const AC = window.AudioContext || window.webkitAudioContext;   // ohne Web Audio: Vorbild über <audio>, keine Aufnahme
  function kontext() {                                   // im Klick erzeugen/fortsetzen (iOS verlangt eine Nutzergeste)
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const dekodieren = (c, daten) => new Promise((ok, fehler) => { const p = c.decodeAudioData(daten, ok, fehler); if (p && p.then) p.then(ok, fehler); });
  async function vorbildLaden(src) {
    if (!vorbilder.has(src)) vorbilder.set(src, fetch(src).then(r => r.arrayBuffer()).then(b => dekodieren(kontext(), b)));
    return vorbilder.get(src);
  }
  L.beiStille(() => stoppeWiedergabe());               // Tab im Hintergrund / Seite verlassen: sofort still
  function stoppeWiedergabe() { if (quelle) { try { quelle.stop(); } catch (e) {} quelle = null; } box.querySelectorAll('.spielt').forEach(b => b.classList.remove('spielt')); }
  function spielen(buf, knopf) {
    if (!L.tonErlaubt()) return;                       // Ton-Wache (lernstand.js): nur direkt nach Klick/Tipp
    stoppeWiedergabe(); const c = kontext();
    quelle = c.createBufferSource(); quelle.buffer = buf; quelle.connect(c.destination);
    knopf && knopf.classList.add('spielt');
    quelle.onended = () => knopf && knopf.classList.remove('spielt');
    quelle.start();
  }
  function trimmen(daten, sr) {                          // Stille vor und nach dem Sprechen weg (−40 dB unter der Spitze, 80/150 ms Rand)
    let spitze = 0; for (const x of daten) spitze = Math.max(spitze, Math.abs(x));
    if (spitze < 1e-4) return { daten, spitze };
    const f = Math.round(sr * .01), schwelle = spitze * .01; let a = -1, b = -1;
    for (let k = 0; k + f <= daten.length; k += f) {
      let s = 0; for (let j = k; j < k + f; j++) s += daten[j] * daten[j];
      if (Math.sqrt(s / f) > schwelle) { if (a < 0) a = k; b = k + f; }
    }
    if (a < 0) return { daten, spitze };
    return { daten: daten.slice(Math.max(0, a - Math.round(sr * .08)), Math.min(daten.length, b + Math.round(sr * .15))), spitze };
  }

  // ---------------------------------------------------------------- Ansicht
  function ziel() { const w = D.woerter[ids[i]]; return modus === 'wort' ? { text: w.en, src: w.audio, de: w.de } : { text: w.beispiel, src: w.beispiel_audio, de: 'Beispiel aus der Folge' }; }
  function zeigen() {
    stoppeAufnahme(true); stoppeWiedergabe(); aufnahme = null;   // altes Material verwerfen
    const z = ziel();
    $('#as-wahl').value = String(i);
    box.querySelectorAll('[data-modus]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modus === modus)));
    $('#as-ziel').textContent = z.text; $('#as-de').textContent = '= ' + z.de;
    $('#as-vergleich').hidden = true; $('#as-meldung').innerHTML = ''; $('#as-urteil-meldung').textContent = '';
    $('#as-sr-ergebnis').innerHTML = '';
    const richtung = (D.woerter[ids[i]].melodie || {})[modus], fh = $('#as-melodie-hinweis');   // Kennzeichnung aus den Lektionsdaten
    fh.hidden = !FRAGE[richtung]; fh.textContent = FRAGE[richtung] || '';
    const merk = L.aussprache(ids[i]);
    $('#as-stand').textContent = merk ? (merk.urteil === 'gut' ? `Zuletzt: „Klang gut“ (${datum(merk.datum)})` : `Zum Üben vorgemerkt (${datum(merk.datum)})`) : '';
    vorbild = null; if (ctx) vorbildLaden(z.src).then(b => { if (ziel().src === z.src) vorbild = b; }).catch(() => {});   // Audio-Kontext erst nach der ersten Berührung
  }
  const datum = s => new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  function farbe(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2c2316'; }
  function zeichnen(canvas, buf, dauer, name) {
    const dpr = window.devicePixelRatio || 1, w = Math.max(200, canvas.clientWidth), h = canvas.clientHeight || 64;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = farbe('--line'); g.globalAlpha = .25; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); g.globalAlpha = 1;
    canvas.dataset.melodiePunkte = '0';
    if (!buf) return 0;
    const d = buf.getChannelData(0); let spitze = 0; for (const x of d) spitze = Math.max(spitze, Math.abs(x));
    const breite = Math.max(1, Math.round(w * buf.duration / dauer)), proSpalte = d.length / breite;
    g.fillStyle = farbe(name); g.globalAlpha = M ? .5 : 1;   // Welle etwas zurücknehmen, damit die Melodielinie lesbar bleibt
    for (let x = 0; x < breite; x++) {                 // je Spalte Minimum/Maximum, auf die eigene Spitze bezogen (Form, nicht Lautstärke)
      let lo = 0, hi = 0; const a = Math.floor(x * proSpalte), b = Math.min(d.length, Math.floor((x + 1) * proSpalte));
      for (let k = a; k < b; k++) { if (d[k] < lo) lo = d[k]; if (d[k] > hi) hi = d[k]; }
      const y0 = h / 2 - (hi / (spitze || 1)) * (h / 2 - 2), y1 = h / 2 - (lo / (spitze || 1)) * (h / 2 - 2);
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    g.globalAlpha = 1;
    return melodieZeichnen(g, buf, dauer, w, h, canvas);
  }
  function melodie(buf) {
    if (!M) return null;
    if (!melodien.has(buf)) melodien.set(buf, M.kurve(buf.getChannelData(0), buf.sampleRate));
    return melodien.get(buf);
  }
  function melodieZeichnen(g, buf, dauer, w, h, canvas) {   // dünne Linie, stimmlose Stellen als Lücke (Pfad unterbrochen)
    const k = melodie(buf); canvas.dataset.melodiePunkte = '0';
    if (!k || k.mitte == null) return 0;
    const pfad = new Path2D(); let n = 0, offen = false;
    for (let j = 0; j < k.st.length; j++) {
      const s = k.st[j]; if (s == null) { offen = false; continue; }
      const x = k.t[j] / dauer * w, y = h / 2 - Math.max(-HT, Math.min(HT, s)) / HT * (h / 2 - 5);
      if (offen) pfad.lineTo(x, y); else { pfad.moveTo(x, y); offen = true; }
      n++;
    }
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = farbe('--paper'); g.lineWidth = 4.5; g.stroke(pfad);   // heller bzw. dunkler Saum gegen die Welle
    g.strokeStyle = farbe('--accent'); g.lineWidth = 2; g.stroke(pfad);
    canvas.dataset.melodiePunkte = String(n);
    return n;
  }
  function vergleichZeigen() {
    $('#as-vergleich').hidden = false;
    const dauer = Math.max(vorbild ? vorbild.duration : 0, aufnahme ? aufnahme.duration : 0, .3);
    zeichnen($('#as-welle-vorbild'), vorbild, dauer, '--ink');
    const punkte = zeichnen($('#as-welle-du'), aufnahme, dauer, '--violet');
    $('#as-melodie-meldung').textContent = M && aufnahme && !punkte ? 'In deiner Aufnahme war keine Sprachmelodie zu erkennen. Sprich mit Stimme und etwas lauter, dann erscheint die Linie.' : '';
    $('#as-dauer').textContent = `Vorbild ${vorbild ? vorbild.duration.toFixed(1) : '–'} s · deine Aufnahme ${aufnahme.duration.toFixed(1)} s`;
  }

  // ---------------------------------------------------------------- Aufnahme
  async function aufnehmen() {
    const knopf = $('#as-aufnehmen');
    if (laeuft) { stoppeAufnahme(); return; }
    stoppeWiedergabe(); $('#as-meldung').innerHTML = '';
    if (!AC || !window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return meldung('Dieser Browser erlaubt hier keine Aufnahme. Sprich einfach laut mit dem Vorbild mit — das wirkt auch.');
    }
    const c = kontext();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return meldung(mikrofonFehler(e)); }
    merken();
    const daten = [], start = c.currentTime, max = MAX_S[modus === 'wort' ? 'wort' : 'satz'];
    const src = c.createMediaStreamSource(stream); let knoten, port = null;
    try {
      if (c.audioWorklet && window.AudioWorkletNode) {
        await c.audioWorklet.addModule('/js/aufnahme-worklet.js');
        knoten = new AudioWorkletNode(c, 'lexivoya-aufnahme'); port = knoten.port;
        port.onmessage = e => { if (e.data instanceof Float32Array) daten.push(e.data); else if (e.data && e.data.rest) { daten.push(e.data.rest); fertig(); } };
      } else {
        knoten = c.createScriptProcessor(4096, 1, 1);
        knoten.onaudioprocess = e => daten.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      }
    } catch (e) { stream.getTracks().forEach(t => t.stop()); return meldung('Die Aufnahme ließ sich in diesem Browser nicht starten.'); }
    const stumm = c.createGain(); stumm.gain.value = 0;  // Knoten muss am Graphen hängen, soll aber nichts hörbar ausgeben
    src.connect(knoten); knoten.connect(stumm); stumm.connect(c.destination);
    knopf.textContent = '■ Stopp'; knopf.classList.add('aufnahme-laeuft'); knopf.setAttribute('aria-pressed', 'true');
    const pegel = $('#as-pegel'); pegel.hidden = false;
    const uhr = setInterval(() => {
      const letzt = daten[daten.length - 1]; let s = 0; if (letzt) { for (const x of letzt) s += x * x; s = Math.sqrt(s / letzt.length); }
      pegel.querySelector('i').style.width = Math.min(100, s * 400) + '%';
      if (c.currentTime - start > max) stoppeAufnahme();
    }, 80);
    let erledigt = false;
    function fertig() {
      if (erledigt) return; erledigt = true;
      try { src.disconnect(); knoten.disconnect(); stumm.disconnect(); } catch (e) {}
      if (port) port.onmessage = null; else knoten.onaudioprocess = null;
      const n = daten.reduce((a, b) => a + b.length, 0), alle = new Float32Array(n); let o = 0;
      for (const b of daten) { alle.set(b, o); o += b.length; }
      daten.length = 0;
      const { daten: kurz, spitze } = trimmen(alle, c.sampleRate);
      if (!laeuft.verwerfen && kurz.length > c.sampleRate * .15) {
        aufnahme = c.createBuffer(1, kurz.length, c.sampleRate);
        if (aufnahme.copyToChannel) aufnahme.copyToChannel(kurz, 0); else aufnahme.getChannelData(0).set(kurz);
        vergleichZeigen();
        if (!vorbild) { const src = ziel().src; vorbildLaden(src).then(b => { if (ziel().src === src && aufnahme) { vorbild = b; vergleichZeigen(); } }).catch(() => {}); }
        if (spitze < .02) meldung('Das war sehr leise. Sprich etwas näher am Mikrofon und probier es noch einmal.');
        $('#as-du').focus();
      } else if (!laeuft.verwerfen) meldung('Da war nichts zu hören. Tippe auf „Aufnehmen“ und sprich dann.');
      laeuft = null;
    }
    laeuft = {
      verwerfen: false,
      stopp(verwerfen) {
        this.verwerfen = !!verwerfen; clearInterval(uhr);
        stream.getTracks().forEach(t => t.stop());       // Mikrofon sofort freigeben
        knopf.textContent = '● Aufnehmen'; knopf.classList.remove('aufnahme-laeuft'); knopf.setAttribute('aria-pressed', 'false'); pegel.hidden = true;
        if (port) { port.postMessage('stopp'); setTimeout(fertig, 400); } else fertig();
      }
    };
  }
  function stoppeAufnahme(verwerfen) { if (laeuft) laeuft.stopp(verwerfen); }
  function mikrofonFehler(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError')
      return `Kein Mikrofon-Zugriff — das ist in Ordnung. Wenn du aufnehmen möchtest, erlaube das Mikrofon für diese Seite ${EINSTELLUNG.mikrofon}. Ohne Aufnahme kannst du trotzdem das Vorbild hören und laut mitsprechen.`;
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return 'Es wurde kein Mikrofon gefunden. Mit einem Headset oder am Handy klappt es.';
    if (n === 'NotReadableError' || n === 'TrackStartError') return 'Das Mikrofon wird gerade von einer anderen App benutzt. Schließ sie und probier es noch einmal.';
    return 'Die Aufnahme ließ sich nicht starten. Hör dir das Vorbild an und sprich laut mit — das hilft auch.';
  }
  function meldung(t) { $('#as-meldung').innerHTML = `<p class="hinweis-box">${esc(t)}</p>`; }

  // ---------------------------------------------------------------- Selbsteinschätzung
  function urteil(u) {
    const id = ids[i]; L.ausspracheMerken(id, u); bewertet.add(id + modus);
    $('#as-urteil-meldung').textContent = u === 'gut' ? 'Notiert. Weiter zum nächsten Wort?' :
      (L.wort(id).box > 0 ? 'Vorgemerkt: Das Wort steht heute im Heft zur Wiederholung, und unter „Aussprache üben“.' : 'Vorgemerkt: Du findest das Wort im Heft unter „Aussprache üben“.');
    if (!einheitGezaehlt && bewertet.size >= 3) { einheitGezaehlt = true; L.einheit(); }
    $('#as-stand').textContent = u === 'gut' ? 'Zuletzt: „Klang gut“ (heute)' : 'Zum Üben vorgemerkt (heute)';
  }

  // ---------------------------------------------------------------- Stufe 2: Wurde ich verstanden? (Spracherkennung des Browsers)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const gross = /^[A-ZÀ-ÞÁÉÍÓÚÑ]/;
  function woerter(s) {
    return s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/\bi'm\b/g, 'i am').replace(/\bwhat's\b/g, 'what is').replace(/\bthat's\b/g, 'that is')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
  }
  function zielWoerter(text) {                         // Namen zählen nicht mit: groß geschrieben und nicht am Satzanfang (außer „I“, „I'm“),
    const out = [], roh = text.replace(/…/g, ' ').split(/\s+/).filter(Boolean); let satzanfang = true;   // am Satzanfang nur, wenn das nächste Wort
    for (let k = 0; k < roh.length; k++) {                                                              // auch groß ist („Cockburn Street?“)
      const r = roh[k], ich = /^I(['’]m)?\W*$/.test(r), folgtGross = k + 1 < roh.length && gross.test(roh[k + 1]) && !/[.?!,]["“”]?$/.test(r);
      const name = gross.test(r) && !ich && (!satzanfang || folgtGross);
      for (const t of woerter(r)) out.push({ t, name });
      satzanfang = /[.?!]["“”]?$/.test(r);
    }
    return out;
  }
  function aehnlich(a, b) {
    if (a === b) return true; if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
    const d = Array.from({ length: a.length + 1 }, (_, k) => [k]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let x = 1; x <= a.length; x++) for (let y = 1; y <= b.length; y++) d[x][y] = Math.min(d[x - 1][y] + 1, d[x][y - 1] + 1, d[x - 1][y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1));
    return d[a.length][b.length] <= 1;
  }
  function passt(gehoert, zielText) {                  // alle Nicht-Namen-Wörter des Ziels in Reihenfolge erkannt (tolerant)
    const soll = zielWoerter(zielText).filter(z => !z.name).map(z => z.t), ist = woerter(gehoert);
    let k = 0; for (const t of ist) if (k < soll.length && aehnlich(t, soll[k])) k++;
    return soll.length > 0 && k === soll.length;
  }
  window.LexivoyaAussprache = { passt, zielWoerter, plattform: PLATTFORM };  // für den Funktionstest
  let srErlaubt = false, srAktiv = null, srVerweigert = 0;
  const hinweis = t => `<p class="hinweis-box">${esc(t)}</p>`, NOCHMAL = 'Das hat nicht geklappt — versuch es noch einmal.';
  function srPruefen() {
    if (srAktiv) { srAktiv.abbrechen(); return; }
    stoppeWiedergabe(); stoppeAufnahme();
    if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend().catch(() => {});   // iOS: eigene Audio-Sitzung freigeben (Wiedergabe/Aufnahme wecken sie wieder)
    const z = ziel(), erg = $('#as-sr-ergebnis'), knopf = $('#as-sr-pruefen');
    let rec; try { rec = new SR(); } catch (e) { erg.innerHTML = hinweis('Die Spracherkennung ist in diesem Browser gerade nicht verfügbar.'); return; }
    rec.lang = 'en-GB'; rec.interimResults = false; rec.maxAlternatives = 5; rec.continuous = false;
    let fertig = false, waechter = null;
    function abschliessen(html) {                      // genau EIN Endzustand je Versuch: Knopf zurück, dann Ergebnis oder Hinweis; spätere Ereignisse zählen nicht
      if (fertig) return; fertig = true; clearTimeout(waechter);
      rec.onresult = rec.onerror = rec.onend = null;
      if (srAktiv === versuch) srAktiv = null;
      knopf.textContent = '🎙 Prüfen, ob man dich versteht'; knopf.classList.remove('aufnahme-laeuft');
      erg.innerHTML = html;
    }
    const versuch = { abbrechen() { abschliessen(hinweis('Abgebrochen.')); try { rec.abort(); } catch (e) {} } };
    rec.onresult = e => {
      const alt = Array.from(e.results[0]).map(a => a.transcript.trim()).filter(Boolean);
      const ok = alt.some(a => passt(a, z.text)), gezeigt = ok ? alt.find(a => passt(a, z.text)) : alt[0] || '';
      const namen = zielWoerter(z.text).some(x => x.name); srVerweigert = 0;
      abschliessen(`<p class="sr-ergebnis ${ok ? 'ok' : 'nein'}"><span aria-hidden="true">${ok ? '✓' : '✗'}</span> Verstanden: „<span lang="en">${esc(gezeigt)}</span>“</p>
        <p class="muted">${ok ? 'Das passt zum Ziel. Man hat dich verstanden.' : `Erwartet war „<span lang="en">${esc(z.text)}</span>“. Sprich langsam und deutlich und probier es noch einmal.`}
        ${namen ? ' Namen zählen beim Vergleich nicht mit.' : ''}</p>`);
      try { rec.stop(); } catch (x) {}
    };
    rec.onerror = e => {
      let t;
      if (e.error === 'service-not-allowed') {        // iOS meldet das auch bei eingeschaltetem Siri/Diktat (z. B. bei belegter Audio-Sitzung): erst beim Wiederholen Einstellungs-Hinweis
        srVerweigert++;
        t = srVerweigert < 2 ? NOCHMAL : `Das hat wieder nicht geklappt: Der Browser sagt, die Spracherkennung sei nicht erlaubt. Falls sie ausgeschaltet ist: ${EINSTELLUNG.erkennung}. Sonst hilft oft, die Seite neu zu laden.`;
      } else t = { 'not-allowed': `Kein Mikrofon-Zugriff für die Spracherkennung. Erlauben kannst du ihn ${EINSTELLUNG.mikrofon}.`,
        'no-speech': 'Es kam nichts an. Tippe noch einmal und sprich gleich los.', 'audio-capture': 'Es wurde kein Mikrofon gefunden.',
        'network': 'Die Spracherkennung deines Browsers braucht eine Internetverbindung und hat gerade keine.', 'aborted': 'Abgebrochen.' }[e.error] || NOCHMAL;
      abschliessen(hinweis(t));
    };
    rec.onend = () => abschliessen(hinweis('Nichts erkannt. Tippe noch einmal und sprich gleich los.'));
    waechter = setTimeout(() => { abschliessen(hinweis(NOCHMAL)); try { rec.abort(); } catch (e) {} }, 15000);   // falls der Browser nie antwortet
    srAktiv = versuch;
    knopf.textContent = '■ Hört zu … (antippen zum Abbrechen)'; knopf.classList.add('aufnahme-laeuft');
    erg.innerHTML = '<p class="muted">Sprich jetzt: <b lang="en">' + esc(z.text) + '</b></p>';
    try { rec.start(); } catch (e) { abschliessen(hinweis(NOCHMAL)); }
  }

  // ---------------------------------------------------------------- Verdrahtung
  $('#as-wahl').innerHTML = ids.map((id, k) => `<option value="${k}">${k + 1}. ${esc(D.woerter[id].en)}</option>`).join('');
  $('#as-wahl').addEventListener('change', e => { i = +e.target.value; zeigen(); });
  $('#as-zurueck').addEventListener('click', () => { i = (i + ids.length - 1) % ids.length; zeigen(); });
  $('#as-weiter').addEventListener('click', () => { i = (i + 1) % ids.length; zeigen(); });
  box.querySelectorAll('[data-modus]').forEach(b => b.addEventListener('click', () => { modus = b.dataset.modus; zeigen(); }));
  $('#as-vorbild-hoeren').addEventListener('click', async e => {
    const k = e.currentTarget;
    if (!kontext()) return L.abspielen(ziel().src, k);
    try { vorbild = await vorbildLaden(ziel().src); spielen(vorbild, k); } catch (err) { L.abspielen(ziel().src, k); }
  });
  $('#as-aufnehmen').addEventListener('click', aufnehmen);
  $('#as-vorbild').addEventListener('click', e => { kontext(); vorbild && spielen(vorbild, e.currentTarget); });
  $('#as-du').addEventListener('click', e => { kontext(); aufnahme && spielen(aufnahme, e.currentTarget); });
  $('#as-gut').addEventListener('click', () => urteil('gut'));
  $('#as-ueben').addEventListener('click', () => urteil('ueben'));
  window.addEventListener('resize', () => { if (!$('#as-vergleich').hidden && aufnahme) vergleichZeigen(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stoppeAufnahme(true); if (srAktiv) srAktiv.abbrechen(); } });
  window.addEventListener('pagehide', () => { stoppeAufnahme(true); aufnahme = null; });
  // iOS (iPhone/iPad, alle Browser dort mit Safari-Technik): Verstanden-Prüfung ausgeblendet. Im iPhone-Test 2026-11-22 scheiterte
  // jeder Versuch trotz Siri/Diktat, ein Knopf, der immer scheitert, frustriert nur. Stattdessen ein Einzeiler.
  if (PLATTFORM === 'ios') $('#as-sr-ios').hidden = false;
  else if (SR) {
    $('#as-sr').hidden = false;
    $('#as-sr-erlauben').addEventListener('click', () => { srErlaubt = true; $('#as-sr-zustimmung').hidden = true; $('#as-sr-aktiv').hidden = false; });
    $('#as-sr-pruefen').addEventListener('click', () => srErlaubt && srPruefen());
  }
  const anker = new URLSearchParams(location.search).get('wort');
  if (anker && ids.includes(anker)) i = ids.indexOf(anker);
  zeigen();
})();
