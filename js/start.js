/* Lexivoya · Startseite: Fortschritt aus dem Lernstand dieses Browsers.
   Der Abschnitt „Dein Fortschritt“ gehört zur aktuellen Serie der Startseite (CHINWAG); alle Kurse zeigt /kurse/. */
(function () {
  'use strict';
  const L = window.Lernstand, D = L.daten, $ = s => document.querySelector(s);
  const K = L.kurs('chinwag') || D.kurse[0], alle = L.kursWoerter(K.serie);
  function balken(sel, wert, max, text) {
    const b = $(sel); b.querySelector('.fill').style.width = (max ? Math.min(100, 100 * wert / max) : 0) + '%';
    b.querySelector('label span:last-child').textContent = text;
  }
  function zeigen() {
    const st = L.kursStand(K.serie);
    const imHeft = alle.filter(id => L.tinte(id) !== 'neu').length, faellig = L.faellige(alle).length;
    balken('#b-folgen', st.geschafft, st.geplant, `${st.geschafft} / ${st.geplant} Folgen`);
    balken('#b-heft', imHeft, alle.length, `${imHeft} von ${alle.length} aktiv`);
    balken('#b-heute', faellig, Math.max(faellig, 1), faellig === 1 ? '1 Wort' : `${faellig} Wörter`);
    $('#dash-note').textContent = L.hatDaten() ? 'Dein Stand — nur in diesem Browser gespeichert.' : `Noch leer: Starte mit ${L.folgeKontext(K.folgen[0])}.`;
  }
  zeigen();
})();
