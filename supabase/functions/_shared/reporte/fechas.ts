// Sin APIs de Deno: el portal también lo importa.
const DIA = 86_400_000;
const aUtc = (f: string) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const sumar = (f: string, n: number) => aIso(aUtc(f) + n * DIA);
export const dif = (desde: string, hasta: string) => Math.round((aUtc(hasta) - aUtc(desde)) / DIA);
const diaSemana = (f: string) => new Date(aUtc(f)).getUTCDay(); // 0 domingo … 6 sábado

export function esLunes(x: unknown): x is string {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(aUtc(x)) && aIso(aUtc(x)) === x && diaSemana(x) === 1;
}
export const lunesDe = (iso: string) => sumar(iso, -((diaSemana(iso) + 6) % 7));
export const finSemana = (lunes: string) => sumar(lunes, 6);
export const enRango = (iso: string, ini: string, fin: string) => !!iso && iso >= ini && iso <= fin;

/** Días hábiles (lun–vie) en (desde, hasta]. 0 si sale el mismo día o antes. */
export function diasHabiles(desde: string, hasta: string): number {
  let n = 0;
  for (let f = sumar(desde, 1); f <= hasta; f = sumar(f, 1)) { const d = diaSemana(f); if (d !== 0 && d !== 6) n++; }
  return n;
}
