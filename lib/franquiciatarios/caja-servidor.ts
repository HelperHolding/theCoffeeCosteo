import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { ConfigSucursal } from '../sucursales/config';
import { hoyLocal, leerDias } from '../sucursales/datos';
import { enZona } from '../sucursales/tiempo';
import { sumarDias } from './dia';
import {
  efectivoHasta,
  gastosEfectivoHasta,
  gastosVigentes,
  resumenArqueo,
  type ResumenArqueo,
} from './caja';
import type { FranqArqueo, FranqCajaConfig, FranqGasto, MomentoArqueo } from './tipos';

type Db = Awaited<ReturnType<typeof servidor>>;

export interface FilaArqueo {
  momento: MomentoArqueo;
  arqueo: Pick<FranqArqueo, 'id' | 'contado' | 'observacion' | 'nombre' | 'registrado_en' | 'corrige_id'>;
  /** null si no se pudo leer el POS (el contado sí se muestra). */
  resumen: ResumenArqueo | null;
}
export interface CajaDia {
  config: Pick<FranqCajaConfig, 'fondo' | 'tolerancia'> | null;
  arqueos: FilaArqueo[];
  gastos: FranqGasto[];
  /** Total de gastos vigentes del día, en pesos (efectivo y no efectivo). */
  totalGastos: number;
  posOk: boolean;
}

/**
 * Caja de un día de operación para la gerencia (RLS: solo gestores leen arqueos, gastos y configuración). El esperado
 * de cada arqueo = fondo + efectivo del POS hasta la hora del arqueo − gastos en efectivo registrados hasta esa hora.
 */
export async function leerCaja(db: Db, cfg: ConfigSucursal, dia: string): Promise<CajaDia> {
  const hoy = hoyLocal(cfg).fecha;
  const siguiente = sumarDias(dia, 1);
  const [config, arqueos, gastos, pos] = await Promise.all([
    db.from('franq_caja_config').select('fondo,tolerancia').eq('company_id', cfg.companyId).maybeSingle(),
    db.from('franq_arqueos').select('*').eq('company_id', cfg.companyId).eq('dia', dia),
    db.from('franq_gastos').select('*').eq('company_id', cfg.companyId).eq('dia', dia),
    // El día de operación va de las 4:00 a las 4:00: se lee también el día siguiente (cierres de madrugada).
    // (sin pedir al POS un día que todavía no empieza).
    leerDias(cfg, dia, siguiente <= hoy ? siguiente : dia).catch(() => null),
  ]);
  if (config.error || arqueos.error || gastos.error)
    throw new Error('No se pudo leer la caja. Intenta de nuevo.');
  const fondo = Number(config.data?.fondo ?? 0);
  const tolerancia = Number(config.data?.tolerancia ?? 20);
  const todos = (gastos.data ?? []) as FranqGasto[];
  const posOk = Boolean(pos && pos.estado !== 'error');
  const pedidos = posOk ? pos!.pedidos : [];
  const corregidos = new Set((arqueos.data ?? []).map((a) => a.corrige_id).filter((x) => x !== null));
  const filas: FilaArqueo[] = (arqueos.data ?? [])
    .filter((a) => !corregidos.has(a.id))
    .sort((a, b) => (a.momento === b.momento ? 0 : a.momento === 'medio' ? -1 : 1))
    .map((a) => ({
      momento: a.momento,
      arqueo: {
        id: a.id,
        contado: Number(a.contado),
        observacion: a.observacion,
        nombre: a.nombre,
        registrado_en: a.registrado_en,
        corrige_id: a.corrige_id,
      },
      resumen: posOk
        ? resumenArqueo({
            contado: Number(a.contado),
            fondo,
            tolerancia,
            efectivoCent: efectivoHasta(pedidos, dia, enZona(new Date(a.registrado_en), cfg.zona)),
            gastos: gastosEfectivoHasta(todos, a.registrado_en),
          })
        : null,
    }));
  return {
    config: config.data ? { fondo, tolerancia } : null,
    arqueos: filas,
    gastos: todos.sort((a, b) => b.registrado_en.localeCompare(a.registrado_en)),
    totalGastos: gastosVigentes(todos).reduce((s, g) => s + Number(g.monto ?? 0), 0),
    posOk,
  };
}
