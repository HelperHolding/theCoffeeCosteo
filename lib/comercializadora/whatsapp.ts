// Envío de OCs por WhatsApp (spec 2026-11-20-oc-whatsapp-proveedor-design.md §7): textos de la pantalla y bandera.
export type EnvioWhatsapp = {
  zoho_po_id: string;
  po_number: string;
  estado: string;
  error: string | null;
  enviado_at: string | null;
  leido_at: string | null;
};

const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Mexico_City',
      })
    : '';

export function etiquetaWhatsapp(e: EnvioWhatsapp | undefined): {
  texto: string;
  tono: 'ok' | 'bajo' | 'neutro';
  reintentable: boolean;
} {
  if (!e) return { texto: '—', tono: 'neutro', reintentable: false };
  switch (e.estado) {
    case 'enviado':
      return { texto: `Enviado ${hora(e.enviado_at)}`.trim(), tono: 'ok', reintentable: false };
    case 'entregado':
      return { texto: 'Entregado', tono: 'ok', reintentable: false };
    case 'leido':
      return { texto: `Leído ${hora(e.leido_at)}`.trim(), tono: 'ok', reintentable: false };
    case 'reservado':
      return { texto: 'Enviando…', tono: 'neutro', reintentable: false };
    case 'fallido':
      return { texto: `Falló${e.error ? `: ${e.error}` : ''}`, tono: 'bajo', reintentable: true };
    case 'sin_numero':
      return { texto: 'Sin número', tono: 'bajo', reintentable: true };
    default:
      return { texto: `No se mandó${e.error ? ` (${e.error})` : ''}`, tono: 'neutro', reintentable: true };
  }
}

export function leerBanderaWhatsapp(cfg: unknown): { activo: boolean; solo_vendor_ids: string[] } {
  const w = (cfg as { whatsapp?: { activo?: unknown; solo_vendor_ids?: unknown } } | null)?.whatsapp ?? {};
  const lista = Array.isArray(w.solo_vendor_ids)
    ? w.solo_vendor_ids.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  return { activo: w.activo === true, solo_vendor_ids: lista };
}
