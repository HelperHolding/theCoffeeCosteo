// lib/comercializadora/compras/sync.ts
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function estadoSync(ultima: string | null, ahora: Date): { texto: string; viejo: boolean; nunca: boolean } {
  if (!ultima) return { texto: 'Sin sincronizar todavía', viejo: true, nunca: true };
  const t = new Date(ultima);
  const min = Math.max(0, Math.round((ahora.getTime() - t.getTime()) / 60_000));
  const viejo = min > 36 * 60;
  if (min < 60) return { texto: `Sincronizado hace ${min} min`, viejo, nunca: false };
  if (min < 24 * 60) return { texto: `Sincronizado hace ${Math.round(min / 60)} h`, viejo, nunca: false };
  const cdmx = new Date(t.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const hh = `${cdmx.getHours()}`.padStart(2, '0'), mm = `${cdmx.getMinutes()}`.padStart(2, '0');
  return { texto: `Sincronizado el ${cdmx.getDate()} ${MES[cdmx.getMonth()]} a las ${hh}:${mm}`, viejo, nunca: false };
}

export function mensajeSync(d: { omitida?: string; ocs?: number; recepciones?: number; facturas?: number; pendientes?: boolean }): string {
  if (d.omitida) return 'Se sincronizó hace menos de 10 minutos; intenta más tarde.';
  const base = `Listo: ${d.ocs ?? 0} OCs, ${d.recepciones ?? 0} recepciones y ${d.facturas ?? 0} facturas leídas de Zoho`;
  return d.pendientes ? `${base}; aún faltan documentos por leer, el siguiente ciclo sigue.` : `${base}.`;
}
