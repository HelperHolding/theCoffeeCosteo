import type { EtapaGeneral, TipoCard } from './modelo';

// Destinos permitidos desde una etapa: el mismo orden que aplica crm_avanzar en la base (migración 32).
// La base vuelve a revisarlo todo (permisos, candados y versión); esto solo arma el menú «Mover a…» y
// decide cuándo pedir motivo antes de llamar.
export type TipoMovimiento =
  'siguiente' | 'omitir' | 'regresar' | 'standby' | 'volver' | 'cerrar' | 'proyectos';

export interface Destino {
  etapa: EtapaGeneral;
  tipo: TipoMovimiento;
  requiereMotivo: boolean;
  /** Al formalizar se crea la primera sucursal: se pide su nombre. */
  pideSucursal: boolean;
}

export function destinos(
  etapas: EtapaGeneral[],
  actual: EtapaGeneral,
  tipo: TipoCard,
  etapaPreviaId: string | null,
): Destino[] {
  const propias = etapas.filter((e) => e.card === null || e.card === tipo).sort((a, b) => a.orden - b.orden);
  const avance = propias.filter((e) => e.tipo === 'abierta' || e.tipo === 'ganada');
  const salida: Destino[] = [];
  const agregar = (etapa: EtapaGeneral, t: TipoMovimiento, requiereMotivo: boolean) =>
    salida.push({ etapa, tipo: t, requiereMotivo, pideSucursal: etapa.clave === 'formalizado' });

  if (actual.tipo === 'lateral') {
    const previa = etapas.find((e) => e.id === etapaPreviaId);
    if (previa) agregar(previa, 'volver', false);
  } else if (actual.tipo === 'abierta') {
    const siguiente = avance.find((e) => e.orden > actual.orden);
    if (siguiente) {
      agregar(siguiente, 'siguiente', false);
      if (siguiente.opcional) {
        const despues = avance.find((e) => e.orden > siguiente.orden);
        if (despues) agregar(despues, 'omitir', true);
      }
    }
    if (actual.provisional) {
      for (const e of avance)
        if (e.orden > actual.orden && e.id !== siguiente?.id && (e.provisional || e.clave === 'cof'))
          agregar(e, 'proyectos', false);
    }
    for (const e of avance.filter((x) => x.tipo === 'abierta' && x.orden < actual.orden).reverse())
      agregar(e, 'regresar', true);
    for (const e of propias.filter((x) => x.tipo === 'lateral')) agregar(e, 'standby', true);
  }
  if (actual.tipo === 'abierta' || actual.tipo === 'lateral')
    for (const e of propias.filter((x) => x.tipo === 'perdida')) agregar(e, 'cerrar', true);
  return salida;
}

export const textoMovimiento: Record<TipoMovimiento, string> = {
  siguiente: 'Avanzar a',
  omitir: 'Omitir la etapa opcional y pasar a',
  regresar: 'Regresar a',
  standby: 'Pausar en',
  volver: 'Reanudar en',
  cerrar: 'Cerrar como',
  proyectos: 'Pasar a',
};
