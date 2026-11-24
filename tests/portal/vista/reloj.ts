// Reloj fijo para grabar los videos con datos reales: «ahora» es el momento en que se tomó la copia y avanza con el
// tiempo real (las animaciones y los «hace 2 min» siguen funcionando). Se importa ANTES que todo en main.tsx.
import { GRABAR, REAL } from './franq-real';

if (GRABAR && REAL) {
  const Real = Date;
  // El arranque se guarda en la pestaña: el reloj sigue de corrido entre pantallas (si no, cada recarga volvería al
  // inicio y lo registrado después quedaría con una hora anterior). &nuevo lo reinicia.
  const CLAVE = 'franq-video-reloj';
  if (new URLSearchParams(window.location.search).has('nuevo')) sessionStorage.removeItem(CLAVE);
  const guardado = Number(sessionStorage.getItem(CLAVE));
  const inicio = guardado > 0 ? guardado : Real.now();
  sessionStorage.setItem(CLAVE, String(inicio));
  const base = Date.parse(REAL.meta.generado) - 5 * 60_000;
  const ahora = () => base + (Real.now() - inicio);
  class Fija extends Real {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(ahora());
      else super(...(a as [string]));
    }
    static now() {
      return ahora();
    }
  }
  globalThis.Date = Fija as DateConstructor;
}
