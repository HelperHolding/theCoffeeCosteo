const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtCdmx = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día de hoy en Ciudad de México (YYYY-MM-DD), como _cieHoy/hoyCdmx del sitio viejo. */
export const hoyCdmx = (ahora: Date = new Date()) => fmtCdmx.format(ahora);

const aUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const masDias = (iso: string, n: number) => aIso(aUtc(iso) + n * 864e5);
export const difDias = (a: string, b: string) => Math.round((aUtc(b) - aUtc(a)) / 864e5);
export const fechaCorta = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
export const nombreMes = (m: number) => MESES[m];
export const isoUtc = aIso;
export const msUtc = aUtc;
