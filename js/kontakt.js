/* Lexivoya · Kontakt-Seite: Adresse kopieren (Zwischenablage, sonst markieren). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), k = $('#mail-kopieren');
  k && k.addEventListener('click', () => {
    const m = $('#mail').textContent.trim();
    (navigator.clipboard ? navigator.clipboard.writeText(m) : Promise.reject()).then(() => { k.textContent = 'Kopiert ✓'; },
      () => { const r = document.createRange(); r.selectNodeContents($('#mail')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); k.textContent = 'Markiert — jetzt kopieren'; });
    setTimeout(() => { k.textContent = 'Adresse kopieren'; }, 2500);
  });
})();
