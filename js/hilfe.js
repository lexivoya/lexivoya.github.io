/* Lexivoya · Hilfe & Fragen (Andreas Reinert 2026-11-26).
   - Sprung auf eine Frage (/hilfe/#anki) klappt sie auf; ohne Skript funktionieren die Fragen trotzdem (<details>).
   - Anleitungsvideo: Vor dem Klick steht nur das Poster mit Play-Knopf auf der Seite; das <video> liegt in einem <template>
     (inert, kein Abruf, in keinem Browser: Playwright-WebKit lädt sonst trotz preload="none" das ganze MP4). Erst der Tipp setzt
     es ein und startet es. Es hat keine Tonspur, folgt aber den Ton-Regeln wie jede andere Quelle: nur direkt nach einer echten
     Nutzer-Aktion (L.tonErlaubt), angemeldet als Tonquelle (L.exklusiv beim Start), pausiert, wenn der Tab in den Hintergrund
     geht, und setzt sich nie von selbst fort. */
(function () {
  'use strict';
  const L = window.Lernstand;
  function aufklappen() {
    let ziel = null; try { ziel = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    if (ziel && ziel.tagName === 'DETAILS') ziel.open = true;
  }
  aufklappen(); addEventListener('hashchange', aufklappen);
  const knopf = document.querySelector('.anleitung-start'), vorlage = document.getElementById('anleitung-vorlage');
  if (!knopf || !vorlage) return;
  let v = null;
  const stopp = () => { if (v && !v.paused) v.pause(); };
  L.tonquelle('anleitung', stopp); L.beiStille(stopp);
  knopf.addEventListener('click', () => {
    if (!L.tonErlaubt()) return;                        // nur nach echtem Tipp (synthetische Klicks zählen nicht)
    v = vorlage.content.firstElementChild.cloneNode(true);
    v.addEventListener('play', () => {
      if (!L.tonErlaubt()) { v.pause(); return; }        // ohne Tipp direkt davor: nicht abspielen (Ton-Wache)
      L.exklusiv('anleitung');
    });
    knopf.replaceWith(v);
    L.exklusiv('anleitung');
    v.play().catch(() => {});                           // im Klick: iOS erlaubt den Start nur direkt aus der Nutzer-Aktion
  });
})();
