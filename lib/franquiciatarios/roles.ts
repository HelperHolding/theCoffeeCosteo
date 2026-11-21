import type { FranqAsignacion, FranqBarista, FranqPosicion, FranqTurno } from './tipos';
import { sumarDias } from './dia';

/**
 * Matriz de roles por posición (F6, migración 92): por día, turno y posición, los baristas asignados vigentes.
 * Vigente = no anulada y no corregida por otro renglón.
 */
export const vigentesAsignacion = (as: FranqAsignacion[]) => {
  const corregidas = new Set(as.map((a) => a.corrige_id).filter((x) => x !== null));
  return as.filter((a) => !a.anulada && !corregidas.has(a.id));
};

/** Lunes (ISO) de la semana de `dia`. */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return sumarDias(dia, -((d.getUTCDay() + 6) % 7));
}

export interface CeldaRol {
  turnoId: number;
  posicionId: number;
  baristas: { id: number; nombre: string }[];
}
export interface DiaRoles {
  dia: string;
  celdas: CeldaRol[];
  asignados: number;
}
export interface SemanaRoles {
  lunes: string;
  turnos: FranqTurno[];
  posiciones: FranqPosicion[];
  dias: DiaRoles[];
}

/** Semana de 7 días desde `lunes` con turnos y posiciones activos (y los inactivos que aún tengan gente asignada). */
export function armarSemana(
  lunes: string,
  turnos: FranqTurno[],
  posiciones: FranqPosicion[],
  asignaciones: FranqAsignacion[],
  baristas: Pick<FranqBarista, 'id' | 'nombre'>[],
): SemanaRoles {
  const vig = vigentesAsignacion(asignaciones);
  const nombre = new Map(baristas.map((b) => [b.id, b.nombre]));
  const usadosT = new Set(vig.map((a) => a.turno_id));
  const usadosP = new Set(vig.map((a) => a.posicion_id));
  const ts = turnos
    .filter((t) => t.activo || usadosT.has(t.id))
    .sort((a, b) => a.orden - b.orden || a.entrada.localeCompare(b.entrada));
  const ps = posiciones
    .filter((p) => p.activo || usadosP.has(p.id))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
  const dias = Array.from({ length: 7 }, (_, i) => {
    const dia = sumarDias(lunes, i);
    const delDia = vig.filter((a) => a.dia === dia);
    return {
      dia,
      asignados: new Set(delDia.map((a) => a.barista_id)).size,
      celdas: ts.flatMap((t) =>
        ps.map((p) => ({
          turnoId: t.id,
          posicionId: p.id,
          baristas: delDia
            .filter((a) => a.turno_id === t.id && a.posicion_id === p.id)
            .map((a) => ({ id: a.barista_id, nombre: nombre.get(a.barista_id) ?? 'Barista' }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        })),
      ),
    };
  });
  return { lunes, turnos: ts, posiciones: ps, dias };
}

/** «07:00:00» → «7:00». */
export const horaCorta = (h: string) => h.slice(0, 5).replace(/^0/, '');
