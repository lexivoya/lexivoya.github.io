/* Lexivoya · Kurse: persönlicher Fortschritt je Kurs („3 von 8 Folgen geschafft“) und Stand je Folge.
   Die Weiter-Knöpfe je Kurs setzt lernstand.js (data-weiter-kurs), gleiche Logik wie „Weiterlernen“ im Menü. */
(function () {
  'use strict';
  const L = window.Lernstand;
  function zeigen() {
    document.querySelectorAll('[data-fortschritt]').forEach(b => {
      const st = L.kursStand(b.dataset.fortschritt);
      b.querySelector('.fill').style.width = Math.min(100, 100 * st.geschafft / st.geplant) + '%';
      b.querySelector('label span:last-child').textContent = `${st.geschafft} von ${st.geplant} Folgen geschafft`;
    });
    document.querySelectorAll('.folge-status[data-folge]').forEach(s => {
      const f = L.folge(s.dataset.folge), q = Object.keys(f.quiz || {}).length;
      s.textContent = f.stempel ? '✓ geschafft' : f.gesehen || q ? 'angefangen' : '';
      s.className = 'folge-status' + (f.stempel ? ' fertig' : '');
    });
  }
  zeigen();
  document.addEventListener('lernstand', zeigen);
})();
