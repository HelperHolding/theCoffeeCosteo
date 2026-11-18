/**
 * Plan 4 · Paridad diaria de Comercializadora (spec, Cutover paso 2). Funciones puras: comparan lo que leyó
 * paridad-comercializadora-datos.ts de los dos lados. Sin E/S.
 */

export interface FilaMinmax {
  sku: string;
  minimo: number | null;
  maximo: number | null;
  calculado_at: string | null;
}
export interface OcLado {
  vendor_id: string | null;
  vendor_name: string | null;
  lineas: { sku: string; cantidad: number }[];
}
export interface Corrida {
  proceso: string;
  ok: boolean | null;
}
/** Lo de un lado (viejo o portal) para un día de CDMX. Las firmas resumen las entradas que el motor usa. */
export interface Lado {
  minmax: FilaMinmax[];
  ocs: OcLado[];
  corridas: Corrida[];
  firmasSku: Record<string, string>;
  firmasProv: Record<string, string>;
  firmaGlobal: string;
}
/** Una fila de public.com_ov_plan (migración 50). */
export interface AccionOv {
  accion: 'insertar' | 'avanzar' | 'reabierto' | 'ambiguo';
  folio: string;
  sku: string | null;
  estado_antes: string | null;
  estado: string | null;
}
export type Causa = 'motor' | 'entrada' | 'explicada';
export interface Diferencia {
  clave: string;
  seccion: 'minmax' | 'oc' | 'ov';
  detalle: string;
  viejo: number | string | null;
  portal: number | string | null;
  causa: Causa;
  motivo?: string;
}
export interface Explicada {
  clave: string;
  motivo: string;
}
export interface ResultadoDia {
  fecha: string;
  completo: boolean;
  faltan: string[];
  verde: boolean;
  /** proveedoresViejo: los que tuvieron OC en el viejo ese día (regla de salida de la ventana, Tarea 9). */
  conteos: { skus: number; proveedores: number; proveedoresViejo: number; folios: number };
  diferencias: Diferencia[];
}

export const TOLERANCIA = 0.01;
const PROCESOS = ['com-minmax', 'zoho-generar-oc'] as const;

const distinto = (a: number | null, b: number | null) =>
  a == null || b == null ? a !== b : Math.abs(a - b) > TOLERANCIA;

export function compararMinmax(v: Lado, p: Lado): Diferencia[] {
  const mv = new Map(v.minmax.map((f) => [f.sku, f]));
  const mp = new Map(p.minmax.map((f) => [f.sku, f]));
  const skus = [...new Set([...mv.keys(), ...mp.keys()])].sort();
  const out: Diferencia[] = [];
  for (const sku of skus) {
    const a = mv.get(sku);
    const b = mp.get(sku);
    const causa: Causa = v.firmasSku[sku] === p.firmasSku[sku] ? 'motor' : 'entrada';
    if (!a || !b) {
      out.push({
        clave: `minmax:${sku}:falta`,
        seccion: 'minmax',
        detalle: a ? 'solo en el viejo' : 'solo en el portal',
        viejo: a ? a.minimo : null,
        portal: b ? b.minimo : null,
        causa,
      });
      continue;
    }
    for (const campo of ['minimo', 'maximo'] as const)
      if (distinto(a[campo], b[campo]))
        out.push({
          clave: `minmax:${sku}:${campo}`,
          seccion: 'minmax',
          detalle: campo,
          viejo: a[campo],
          portal: b[campo],
          causa,
        });
  }
  return out;
}

const llaveProv = (o: OcLado) => o.vendor_id ?? o.vendor_name ?? '?';

function porProveedor(ocs: OcLado[]): Map<string, { nombre: string; skus: Map<string, number> }> {
  const m = new Map<string, { nombre: string; skus: Map<string, number> }>();
  for (const o of ocs) {
    const k = llaveProv(o);
    const g = m.get(k) ?? { nombre: o.vendor_name ?? k, skus: new Map<string, number>() };
    for (const l of o.lineas) g.skus.set(l.sku, (g.skus.get(l.sku) ?? 0) + Number(l.cantidad));
    m.set(k, g);
  }
  return m;
}

export function compararOcs(v: Lado, p: Lado): Diferencia[] {
  const gv = porProveedor(v.ocs);
  const gp = porProveedor(p.ocs);
  const out: Diferencia[] = [];
  for (const k of [...new Set([...gv.keys(), ...gp.keys()])].sort()) {
    const a = gv.get(k);
    const b = gp.get(k);
    const nombre = (a ?? b)!.nombre;
    for (const sku of [...new Set([...(a?.skus.keys() ?? []), ...(b?.skus.keys() ?? [])])].sort()) {
      const x = a?.skus.get(sku) ?? 0;
      const y = b?.skus.get(sku) ?? 0;
      if (Math.abs(x - y) <= TOLERANCIA) continue;
      const entrada = v.firmasProv[k] !== p.firmasProv[k] || v.firmasSku[sku] !== p.firmasSku[sku];
      out.push({
        clave: `oc:${k}:${sku}`,
        seccion: 'oc',
        detalle: `${nombre} · ${sku}`,
        viejo: x,
        portal: y,
        causa: entrada ? 'entrada' : 'motor',
      });
    }
  }
  return out;
}

/** Lo que la derivación haría sobre las filas del viejo: en paridad perfecta, nada. */
export function diferenciasOv(acciones: AccionOv[]): Diferencia[] {
  const vistas = new Map<string, Diferencia>();
  for (const a of acciones) {
    const cola =
      a.accion === 'insertar' ? `:${a.sku}` : a.accion === 'avanzar' ? `:${a.estado_antes}>${a.estado}` : '';
    const clave = `ov:${a.accion}:${a.folio}${cola}`;
    if (vistas.has(clave)) continue;
    const detalle = {
      insertar: `el viejo no tiene la OV de ${a.sku} (${a.estado})`,
      avanzar: `el viejo la tiene en ${a.estado_antes}; el pedido dice ${a.estado}`,
      reabierto: `cancelada en el viejo; el pedido volvió a ${a.estado}`,
      ambiguo: 'dos pedidos con el mismo folio',
    }[a.accion];
    vistas.set(clave, {
      clave,
      seccion: 'ov',
      detalle: `${a.folio}: ${detalle}`,
      viejo: a.estado_antes,
      portal: a.estado,
      causa: 'motor',
    });
  }
  return [...vistas.values()];
}

export function evaluarDia(
  fecha: string,
  viejo: Lado,
  portal: Lado,
  acciones: AccionOv[],
  explicadas: Explicada[],
): ResultadoDia {
  const faltan: string[] = [];
  for (const [nombre, lado] of [
    ['viejo', viejo],
    ['portal', portal],
  ] as const)
    for (const proc of PROCESOS)
      if (!lado.corridas.some((c) => c.proceso === proc && c.ok === true))
        faltan.push(`${nombre}: sin ${proc} correcto ese día`);
  if (viejo.firmaGlobal !== portal.firmaGlobal)
    faltan.push('configuración, parámetros o mapeo distintos (copiar editables)');
  const motivo = new Map(explicadas.map((e) => [e.clave, e.motivo]));
  const diferencias = [
    ...compararMinmax(viejo, portal),
    ...compararOcs(viejo, portal),
    ...diferenciasOv(acciones),
  ].map((d) =>
    motivo.has(d.clave) ? { ...d, causa: 'explicada' as const, motivo: motivo.get(d.clave) } : d,
  );
  const completo = faltan.length === 0;
  return {
    fecha,
    completo,
    faltan,
    verde: completo && !diferencias.some((d) => d.causa === 'motor'),
    conteos: {
      skus: new Set([...viejo.minmax, ...portal.minmax].map((f) => f.sku)).size,
      proveedores: new Set([...viejo.ocs, ...portal.ocs].map(llaveProv)).size,
      proveedoresViejo: new Set(viejo.ocs.map(llaveProv)).size,
      folios: new Set(acciones.map((a) => a.folio)).size,
    },
    diferencias,
  };
}

/** Días verdes seguidos (de calendario) que terminan en `hasta`. Un día que falta o no es verde corta la racha. */
export function racha(dias: { fecha: string; verde: boolean }[], hasta: string): number {
  const verde = new Map(dias.map((d) => [d.fecha, d.verde]));
  const fechas = [...verde.keys()].filter((f) => f <= hasta).sort();
  let n = 0;
  let esperado = hasta;
  for (let i = fechas.length - 1; i >= 0; i--) {
    if (fechas[i] !== esperado || !verde.get(fechas[i])) break;
    n++;
    const d = new Date(`${esperado}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    esperado = d.toISOString().slice(0, 10);
  }
  return n;
}

export const DIAS_REQUERIDOS = 3;

export function reporteParidad(r: ResultadoDia, rachaDias: number): string {
  const lineas = [
    `Paridad Comercializadora ${r.fecha}: ${r.verde ? 'VERDE' : r.completo ? 'CON DIFERENCIAS' : 'INCOMPLETO'}`,
    `Comparados: ${r.conteos.skus} SKUs de mín/máx, ${r.conteos.proveedores} proveedores con OC (${r.conteos.proveedoresViejo} del viejo), ${r.conteos.folios} folios con acción de OV.`,
    ...r.faltan.map((f) => `  falta: ${f}`),
  ];
  for (const causa of ['motor', 'entrada', 'explicada'] as const) {
    const ds = r.diferencias.filter((d) => d.causa === causa);
    if (!ds.length) continue;
    lineas.push(
      {
        motor: `Diferencias sin explicar (${ds.length}):`,
        entrada: `Entradas distintas, no comparables (${ds.length}):`,
        explicada: `Explicadas (${ds.length}):`,
      }[causa],
    );
    for (const d of ds)
      lineas.push(
        `  ${d.clave}  viejo=${d.viejo ?? '—'} portal=${d.portal ?? '—'}  ${d.detalle}${d.motivo ? ` · ${d.motivo}` : ''}`,
      );
  }
  lineas.push(`Racha: ${rachaDias} de ${DIAS_REQUERIDOS} días seguidos sin diferencias.`);
  return lineas.join('\n');
}
