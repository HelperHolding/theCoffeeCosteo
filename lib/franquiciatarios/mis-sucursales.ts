import 'server-only';
import { clienteServicio } from '../sucursales/corte-servidor';
import { diaOperacion } from './dia';
import { leerDia, type Db } from './servidor';
import type { SeccionClave } from './tipos';

/** Hasta cuántas sucursales se leen con su detalle del día (más, como el admin con todas, va solo la lista). */
export const MAX_DETALLE = 20;

export interface ResumenSucursalHoy {
  companyId: number;
  secciones: { clave: SeccionClave; nombre: string; avance: number; estado: string }[];
  /** «No» vigentes del día más incidencias: lo que la gerencia tiene que atender. */
  avisos: number;
  /** Venta de hoy (POS + Rappi neto, la misma del Tablero y Sucursales); null sin lectura todavía. */
  ventaCent: number | null;
  /** Hora local hasta la que llega la venta (segundos desde la medianoche). */
  corteSegundo: number | null;
}

type Origenes = Record<string, { venta_cent?: number }>;

/**
 * Resumen del día de cada sucursal para «Mis sucursales»: checklists, avisos (RLS del usuario) y la venta de hoy del
 * resumen que ya calcula el corte de Sucursales. La venta se lee con la llave de servicio SOLO para las sucursales que
 * la sesión ya autorizó (las que llegan en `ids`).
 */
export async function leerMisSucursales(db: Db, ids: number[]): Promise<Map<number, ResumenSucursalHoy>> {
  const dia = diaOperacion();
  const servicio = clienteServicio();
  const [dias, ventas] = await Promise.all([
    Promise.all(ids.map((id) => leerDia(db, id, dia).catch(() => null))),
    servicio && ids.length
      ? servicio
          .from('sucursales_resumen_dia')
          .select('company_id,origenes,corte_segundo')
          .eq('fecha', dia)
          .in('company_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const venta = new Map(
    ((ventas.data ?? []) as { company_id: number; origenes: Origenes; corte_segundo: number }[]).map((v) => [
      v.company_id,
      {
        cent: Object.values(v.origenes ?? {}).reduce((s, o) => s + Number(o?.venta_cent ?? 0), 0),
        corte: v.corte_segundo,
      },
    ]),
  );
  return new Map(
    ids.map((id, i) => {
      const d = dias[i];
      return [
        id,
        {
          companyId: id,
          secciones: (d?.secciones ?? []).map((s) => ({
            clave: s.clave,
            nombre: s.nombre,
            avance: s.puntos.length ? Math.min(1, s.respondidos / s.puntos.length) : 0,
            estado: s.estado,
          })),
          avisos: (d?.secciones ?? []).reduce((s, x) => s + x.noes, 0) + (d?.incidencias.length ?? 0),
          ventaCent: venta.get(id)?.cent ?? null,
          corteSegundo: venta.get(id)?.corte ?? null,
        },
      ];
    }),
  );
}
