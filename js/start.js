/* Lexivoya · Startseite: Fortschritt aus dem Lernstand dieses Browsers, E-Mail kopieren. */
(function () {
  'use strict';
  const L = window.Lernstand, D = L.daten, $ = s => document.querySelector(s);
  const alle = D.folgen.flatMap(f => f.woerter);
  function balken(sel, wert, max, text) {
    const b = $(sel); b.querySelector('.fill').style.width = (max ? Math.min(100, 100 * wert / max) : 0) + '%';
    b.querySelector('label span:last-child').textContent = text;
  }
  function zeigen() {
    const geschafft = D.folgen.filter(f => L.folge(f.id).stempel).length;
    const imHeft = alle.filter(id => L.tinte(id) !== 'neu').length, faellig = L.faellige(alle).length;
    balken('#b-folgen', geschafft, D.kurs.folgen, `${geschafft} / ${D.kurs.folgen} Folgen`);
    balken('#b-heft', imHeft, alle.length, `${imHeft} von ${alle.length} aktiv`);
    balken('#b-heute', faellig, Math.max(faellig, 1), faellig === 1 ? '1 Wort' : `${faellig} Wörter`);
    $('#dash-note').textContent = L.hatDaten() ? 'Dein Stand — nur in diesem Browser gespeichert.' : 'Noch leer: Starte mit Lektion 1.';
  }
  zeigen();
  const k = $('#mail-kopieren');
  k && k.addEventListener('click', () => {
    const m = $('#mail').textContent.trim();
    (navigator.clipboard ? navigator.clipboard.writeText(m) : Promise.reject()).then(() => { k.textContent = 'Kopiert ✓'; },
      () => { const r = document.createRange(); r.selectNodeContents($('#mail')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); k.textContent = 'Markiert — jetzt kopieren'; });
    setTimeout(() => { k.textContent = 'Adresse kopieren'; }, 2500);
  });
})();
