import { type ConfigReporte, SIN_CLASIFICAR, tipoEnvio } from "./config.ts";
import { finSemana } from "./fechas.ts";
import { type Apertura, type Atencion, calcularAperturas, calcularAtencion, calcularNotas, type Notas } from "./atencion.ts";
import { calcularSaldosExternos, calcularSaldosSucursales, type Foto, type SaldosExternos, type SaldosSucursales } from "./saldos.ts";
import { calcularSurtido, origenIncidencia, type Surtido } from "./surtido.ts";
import type { Factura, NotaCredito, Ov, Paquete, Seccion } from "./tipos.ts";
import { calcularVentas, type Ventas } from "./ventas.ts";

export type Lectura = {
  facturas: Seccion<Factura[]>; paquetes: Seccion<Paquete[]>; ovs: Seccion<Ov[]>;
  descripciones: Seccion<Record<string, string>>; notas: Seccion<NotaCredito[]>; pendientes: Seccion<Factura[]>;
};
export type Reporte = {
  lunes: string; fin: string; corte: string; leidoEn: string;
  ventas: Seccion<Ventas>; surtido: Seccion<Surtido>; atencion: Seccion<Atencion>; notas: Seccion<Notas>;
  sucursales: Seccion<SaldosSucursales>; externos: Seccion<SaldosExternos & { anterior: number | null }>;
  aperturas: Seccion<Apertura[]>; sinClasificar: string[];
};

// deno-lint-ignore no-explicit-any
function con<T>(fuentes: Seccion<any>[], fn: () => T): Seccion<T> {
  const mal = fuentes.find((s) => !s.ok);
  if (mal && !mal.ok) return { ok: false, error: mal.error };
  try { return { ok: true, datos: fn() }; }
  catch (e) { return { ok: false, error: `No se pudo calcular: ${String((e as Error)?.message ?? e)}` }; }
}

export function calcularReporte(l: Lectura, cfg: ConfigReporte, lunes: string, corte: string, leidoEn: string, fotoAnterior: Foto | null): Reporte {
  const d = <T>(s: Seccion<T>) => (s.ok ? s.datos : ([] as unknown as T));
  const sin = new Set<string>();
  for (const f of d(l.facturas)) if (tipoEnvio(f.tipoEnvio) === SIN_CLASIFICAR) sin.add(`Tipo de envío: ${f.tipoEnvio.trim() || "(vacío)"}`);
  for (const o of d(l.ovs)) if (origenIncidencia(o.incidencia) === "otro") sin.add(`Tipo de incidencia: ${o.incidencia.trim()}`);
  return {
    lunes, fin: finSemana(lunes), corte, leidoEn,
    ventas: con([l.facturas], () => calcularVentas(d(l.facturas), cfg, lunes)),
    surtido: con([l.ovs, l.paquetes], () => calcularSurtido(d(l.ovs), d(l.paquetes), cfg, lunes)),
    atencion: con([l.ovs, l.descripciones], () => calcularAtencion(d(l.ovs), d(l.descripciones), cfg, lunes)),
    notas: con([l.notas], () => calcularNotas(d(l.notas), lunes)),
    sucursales: con([l.pendientes], () => calcularSaldosSucursales(d(l.pendientes), cfg, corte)),
    externos: con([l.pendientes], () => ({ ...calcularSaldosExternos(d(l.pendientes), cfg, corte), anterior: fotoAnterior?.externos ?? null })),
    aperturas: con([l.ovs, l.paquetes], () => calcularAperturas(d(l.ovs), d(l.paquetes), cfg, lunes)),
    sinClasificar: [...sin].sort(),
  };
}
