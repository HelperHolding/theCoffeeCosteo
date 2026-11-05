export interface FilaCotejo {
  company_id: number;
  store_id: number;
  nombre: string;
  fecha: string;
  fuente: string;
  canal: string;
  etiqueta_pago: string;
  venta_cent: number;
  tickets: number;
  lineas: number;
}

interface LineaCotejo {
  company_id: number;
  fecha: string;
  fuente: string;
  pedido: string;
  canal: string;
  metodo_pago: string;
  tipo_pago: string;
  smartphone: boolean;
  importe_cent: number;
}

/** Totales por tienda × fecha × fuente × canal × etiqueta de pago. Un pago sin mapear cae al método crudo. */
export function totalesPorDia(
  filas: LineaCotejo[],
  mapeo: { metodo_pos: string; tipo_pos: string; smartphone: boolean; etiqueta: string }[],
  tiendas: { company_id: number; store_id: number; nombre: string }[],
): FilaCotejo[] {
  const etiquetas = new Map(mapeo.map((m) => [`${m.metodo_pos}|${m.tipo_pos}|${m.smartphone}`, m.etiqueta]));
  const porTienda = new Map(tiendas.map((t) => [t.company_id, t]));
  const grupos = new Map<string, { fila: FilaCotejo; pedidos: Set<string> }>();
  for (const l of filas) {
    const etiqueta = etiquetas.get(`${l.metodo_pago}|${l.tipo_pago}|${l.smartphone}`) ?? l.metodo_pago;
    const clave = JSON.stringify([l.company_id, l.fecha, l.fuente, l.canal, etiqueta]);
    let g = grupos.get(clave);
    if (!g) {
      const t = porTienda.get(l.company_id);
      g = {
        fila: {
          company_id: l.company_id,
          store_id: t?.store_id ?? 0,
          nombre: t?.nombre ?? '',
          fecha: l.fecha,
          fuente: l.fuente,
          canal: l.canal,
          etiqueta_pago: etiqueta,
          venta_cent: 0,
          tickets: 0,
          lineas: 0,
        },
        pedidos: new Set(),
      };
      grupos.set(clave, g);
    }
    g.fila.venta_cent += l.importe_cent;
    g.fila.lineas += 1;
    g.pedidos.add(l.pedido);
  }
  return [...grupos.values()]
    .map(({ fila, pedidos }) => ({ ...fila, tickets: pedidos.size }))
    .sort(
      (a, b) =>
        a.company_id - b.company_id ||
        a.fecha.localeCompare(b.fecha) ||
        a.fuente.localeCompare(b.fuente) ||
        a.canal.localeCompare(b.canal) ||
        a.etiqueta_pago.localeCompare(b.etiqueta_pago),
    );
}

const COLUMNAS: (keyof FilaCotejo)[] = [
  'company_id', 'store_id', 'nombre', 'fecha', 'fuente', 'canal', 'etiqueta_pago', 'venta_cent', 'tickets', 'lineas',
];

const celda = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function aCsv(filas: FilaCotejo[]): string {
  return [COLUMNAS.join(','), ...filas.map((f) => COLUMNAS.map((c) => celda(f[c])).join(','))].join('\n') + '\n';
}
