const DIA = 86_400_000;
const aUtc = (f: string) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));

export function difDias(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta.slice(0, 10)) - aUtc(desde.slice(0, 10))) / DIA);
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(aUtc(fecha.slice(0, 10)) + dias * DIA).toISOString().slice(0, 10);
}

export function hoyCdmx(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now);
}
