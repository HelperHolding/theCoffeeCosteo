import { fechaCorta } from './fechas';

export interface MinimoProveedor {
  vendor_id?: string;
  nombre?: string | null;
  minimo_compra?: number;
  minimo_origen?: string | null;
  minimo_editado_at?: string | null;
  minimo_pendiente?: boolean;
  minimo_error?: string | null;
}

export function estadoMinimo(p: MinimoProveedor): { k: 'ok' | 'pendiente' | 'error'; txt: string } {
  if (p.minimo_error) return { k: 'error', txt: `Error: ${p.minimo_error}` };
  if (p.minimo_pendiente) return { k: 'pendiente', txt: 'Pendiente de enviar' };
  return { k: 'ok', txt: 'Sincronizado' };
}

export function origenMinimo(p: MinimoProveedor): string {
  if (p.minimo_origen === 'migracion') return 'Migrado';
  const o = p.minimo_origen === 'zoho' ? 'Zoho' : p.minimo_origen === 'plataforma' ? 'Plataforma' : null;
  if (!o) return '—';
  const d = p.minimo_editado_at
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
        new Date(p.minimo_editado_at),
      )
    : null;
  return d ? `${o}, ${fechaCorta(d)}` : o;
}

/** _minValidar: "15000", "15,000.50", "$15,000" → número ≥ 0 con hasta 2 decimales; si no, null. */
export function validarMonto(txt: string): number | null {
  let t = String(txt ?? '').replace(/[\s$]/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
