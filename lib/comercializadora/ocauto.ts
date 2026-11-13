export interface LineaOcAuto {
  sku: string;
  nombre?: string;
  cantidad: number;
  costo?: number;
  monto?: number;
  disponible?: number;
  enCamino?: number;
  minimo?: number;
  maximo?: number;
  adelanto_cierre?: boolean;
  cierre_tarde?: boolean;
  bajo_minimo?: boolean;
}
export interface OcAutoFila {
  id: number;
  corrida_id: string;
  creada_at: string;
  fecha: string;
  origen: 'cron' | 'manual';
  modo: 'simulacion' | 'real';
  vendor_id: string | null;
  vendor_name: string | null;
  zoho_po_id: string | null;
  po_number: string | null;
  lineas: LineaOcAuto[];
  monto: number;
  estado: 'creada' | 'simulada' | 'error';
  error: string | null;
}
export interface Corrida {
  corrida_id: string;
  creada_at: string;
  fecha: string;
  origen: string;
  modo: string;
  ocs: OcAutoFila[];
  monto: number;
  errores: number;
}

/** Agrupa las OCs automáticas por corrida (renderComAuto), de la más reciente a la más vieja. */
export function corridasOcAuto(filas: OcAutoFila[]): Corrida[] {
  const g = new Map<string, Corrida>();
  for (const f of filas) {
    const c = g.get(f.corrida_id) ?? {
      corrida_id: f.corrida_id,
      creada_at: f.creada_at,
      fecha: f.fecha,
      origen: f.origen,
      modo: f.modo,
      ocs: [],
      monto: 0,
      errores: 0,
    };
    c.ocs.push(f);
    c.monto += Number(f.monto) || 0;
    if (f.estado === 'error') c.errores++;
    if (f.creada_at < c.creada_at) c.creada_at = f.creada_at;
    g.set(f.corrida_id, c);
  }
  return [...g.values()].sort((a, b) => b.creada_at.localeCompare(a.creada_at));
}
