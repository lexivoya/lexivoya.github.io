/* Lexivoya · Sprachmelodie (Tonhöhenverlauf) für die Aussprache-Übung — rechnet nur im Browser, nichts verlässt das Gerät.
   YIN-Grundfrequenz (de Cheveigné & Kawahara 2002) auf ~8 kHz heruntergerechnet, 10-ms-Schritte, 60–500 Hz.
   Stimmlagen-unabhängig: Ergebnis in Halbtönen relativ zur mittleren (Median-)Tonhöhe des jeweiligen Sprechers.
   Stimmlose oder leise Abschnitte sind null (Lücke, keine Nulllinie). Kein Score: nur ein Bild zum Selbstvergleich. */
(function (g) {
  'use strict';
  const F_MIN = 60, F_MAX = 500, SCHRITT_S = .01, FENSTER_S = .04, SCHWELLE = .15, PEGEL_DB = -30, MIN_LAUF = 4;

  function vorbereiten(daten, sr) {                     // zweimal Tiefpass erster Ordnung (~1 kHz), dann ausdünnen auf ~8 kHz
    const f = Math.max(1, Math.round(sr / 8000)), a = 1 - Math.exp(-2 * Math.PI * 1000 / sr);
    const n = Math.floor(daten.length / f), out = new Float32Array(n); let y1 = 0, y2 = 0;
    for (let k = 0, o = 0; k < daten.length && o < n; k++) {
      y1 += a * (daten[k] - y1); y2 += a * (y1 - y2);
      if (k % f === f - 1) out[o++] = y2;
    }
    return { x: out, sr: sr / f };
  }
  function median(w) { const s = w.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  function kurve(daten, sr) {
    const { x, sr: r } = vorbereiten(daten, sr);
    const W = Math.round(FENSTER_S * r), hop = Math.round(SCHRITT_S * r), tMin = Math.floor(r / F_MAX), tMax = Math.ceil(r / F_MIN);
    const frames = Math.max(0, Math.floor((x.length - W - tMax) / hop) + 1);
    const hz = new Array(frames).fill(null), rms = new Float32Array(frames), d = new Float32Array(tMax + 2);
    for (let k = 0; k < frames; k++) {
      const s0 = k * hop; let e = 0; for (let j = 0; j < W; j++) e += x[s0 + j] * x[s0 + j]; rms[k] = Math.sqrt(e / W);
    }
    let spitze = 0; for (const v of rms) spitze = Math.max(spitze, v);
    const gate = spitze * Math.pow(10, PEGEL_DB / 20);
    for (let k = 0; k < frames; k++) {
      if (!(rms[k] > gate)) continue;
      const s0 = k * hop; let summe = 0; d[0] = 1; let tau = -1;
      for (let t = 1; t <= tMax; t++) {                 // Differenzfunktion, kumulativ normiert
        let s = 0; for (let j = 0; j < W; j++) { const u = x[s0 + j] - x[s0 + j + t]; s += u * u; }
        summe += s; d[t] = summe > 0 ? s * t / summe : 1;
      }
      for (let t = tMin; t < tMax; t++) if (d[t] < SCHWELLE) { while (t + 1 < tMax && d[t + 1] < d[t]) t++; tau = t; break; }
      if (tau < 0) continue;
      const a = d[tau - 1], b = d[tau], c = d[tau + 1], nenner = a + c - 2 * b;   // parabolische Verfeinerung
      const feiner = nenner > 0 ? tau + (a - c) / (2 * nenner) : tau;
      hz[k] = r / feiner;
    }
    // Ausreißer: Median über 5 Rahmen innerhalb stimmhafter Läufe, Oktavsprünge zur Sprecher-Mitte zurückfalten, kurze Läufe weg
    const glatt = hz.map((v, k) => { if (v == null) return null; const w = []; for (let j = k - 2; j <= k + 2; j++) if (hz[j] != null) w.push(hz[j]); return median(w); });
    const stimmhaft = glatt.filter(v => v != null);
    if (stimmhaft.length < MIN_LAUF) return { t: glatt.map((_, k) => (k * hop + W / 2) / r), st: glatt.map(() => null), mitte: null };
    const m0 = median(stimmhaft);
    for (let k = 0; k < glatt.length; k++) if (glatt[k] != null) { if (glatt[k] > m0 * 1.9) glatt[k] /= 2; else if (glatt[k] < m0 / 1.9) glatt[k] *= 2; }
    for (let k = 0; k < glatt.length;) {
      if (glatt[k] == null) { k++; continue; }
      let e = k; while (e < glatt.length && glatt[e] != null) e++;
      if (e - k < MIN_LAUF) for (let j = k; j < e; j++) glatt[j] = null;
      k = e;
    }
    const rest = glatt.filter(v => v != null), mitte = rest.length ? median(rest) : null;
    return { t: glatt.map((_, k) => (k * hop + W / 2) / r), st: glatt.map(v => v == null || !mitte ? null : 12 * Math.log2(v / mitte)), mitte };
  }

  // Richtung am Ende (für die Bau-Prüfung der Frage-Hinweise, nicht für die Anzeige): letzte 400 ms Stimme,
  // „steigend“ = Ende ≥ 2,5 HT über dem Tiefpunkt und über dem Mittel des Fensters, „fallend“ spiegelbildlich, sonst „eben“.
  function ende(k) {
    let e = k.st.length - 1; while (e >= 0 && k.st[e] == null) e--;
    if (e < 0) return { richtung: 'keine', hub: 0 };
    const fenster = [], ab = k.t[e] - .4; for (let j = e; j >= 0 && k.t[j] >= ab; j--) if (k.st[j] != null) fenster.push(k.st[j]);
    const schluss = fenster.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, fenster.length);
    const mittel = fenster.reduce((a, b) => a + b, 0) / fenster.length, tief = Math.min(...fenster), hoch = Math.max(...fenster);
    if (schluss - tief >= 2.5 && schluss > mittel) return { richtung: 'steigend', hub: +(schluss - tief).toFixed(1) };
    if (hoch - schluss >= 2.5 && schluss < mittel) return { richtung: 'fallend', hub: -(hoch - schluss).toFixed(1) };
    return { richtung: 'eben', hub: +(schluss - mittel).toFixed(1) };
  }

  const api = { kurve, ende };
  g.LexivoyaMelodie = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
