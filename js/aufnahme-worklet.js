/* Lexivoya · Aufnahme-Worklet: reicht das Mikrofonsignal in Blöcken an die Seite weiter (nur Arbeitsspeicher, keine Datei). */
class Aufnahme extends AudioWorkletProcessor {
  constructor() {
    super(); this.puffer = new Float32Array(2048); this.n = 0;
    this.port.onmessage = () => { this.port.postMessage({ rest: this.puffer.slice(0, this.n) }); this.n = 0; };   // „Stopp": letzten Teilblock liefern
  }
  process(eingaenge) {
    const kanal = eingaenge[0] && eingaenge[0][0];
    if (kanal) for (let i = 0; i < kanal.length; i++) {
      this.puffer[this.n++] = kanal[i];
      if (this.n === this.puffer.length) { this.port.postMessage(this.puffer.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('lexivoya-aufnahme', Aufnahme);
