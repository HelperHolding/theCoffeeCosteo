// Decide qué se registra de un ZIP y arma el payload de suc_pagos_registrar_corrida (spec §4 paso 1, §6). Puro.
import { centavos, type Resumen, type Transferencia } from './recibos';
import {
  empatar,
  sugerirProveedor,
  type Asignacion,
  type EstadoPrevio,
  type Factura,
  type Proveedor,
} from './empate';

export interface Previa {
  llave: string;
  corrida_id: number;
  estado: string;
}

export interface FilaAsignacion {
  bill_id: string;
  bill_numero: string;
  ubicacion: string;
  fecha: string | null;
  saldo: number;
  monto: number;
}

export interface PayloadCorrida {
  archivo: string;
  n_resumen: number | null;
  total_resumen: number | null;
  n_recibos: number;
  total_recibos: number;
  avisos: string[];
  transferencias: {
    llave: string;
    tipo: Transferencia['tipo'];
    clabe: string | null;
    alias: string;
    concepto: string;
    monto: number;
    fecha_operacion: string;
    proveedor_zoho_id: string | null;
    proveedor_nombre: string | null;
    sugerido: boolean;
    estado: EstadoPrevio;
    asignaciones: FilaAsignacion[];
  }[];
}

export function separarNuevas(
  transferencias: Transferencia[],
  previas: Previa[],
): { nuevas: Transferencia[]; avisos: string[] } {
  const ya = new Map(previas.map((p) => [p.llave, p]));
  const avisos: string[] = [];
  const nuevas = transferencias.filter((t) => {
    const p = ya.get(t.llave);
    if (p)
      avisos.push(
        `${t.alias} ($${t.monto.toFixed(2)}): ya registrada en la corrida #${p.corrida_id} (${p.estado}).`,
      );
    return !p;
  });
  return { nuevas, avisos };
}

export function proveedoresAConsultar(
  nuevas: Transferencia[],
  equivalencias: Map<string, Proveedor>,
  proveedores: Proveedor[],
): string[] {
  const ids = new Set<string>();
  for (const t of nuevas) {
    const p = (t.clabe ? equivalencias.get(t.clabe) : undefined) ?? sugerirProveedor(t.alias, proveedores);
    if (p) ids.add(p.id);
  }
  return [...ids];
}

export const aFila = (a: Asignacion): FilaAsignacion => ({
  bill_id: a.billId,
  bill_numero: a.numero,
  ubicacion: a.ubicacion,
  fecha: a.fecha || null,
  saldo: a.saldo,
  monto: a.monto,
});

export function armarCorrida(e: {
  archivo: string;
  resumen: Resumen | null;
  todas: Transferencia[];
  nuevas: Transferencia[];
  avisos: string[];
  equivalencias: Map<string, Proveedor>;
  proveedores: Proveedor[];
  facturas: Factura[];
}): PayloadCorrida {
  return {
    archivo: e.archivo,
    n_resumen: e.resumen?.numero ?? null,
    total_resumen: e.resumen?.total ?? null,
    n_recibos: e.todas.length,
    total_recibos: e.todas.reduce((s, t) => s + centavos(t.monto), 0) / 100,
    avisos: e.avisos,
    transferencias: e.nuevas.map((t) => {
      const m = empatar(t, e.equivalencias, e.proveedores, e.facturas);
      return {
        llave: t.llave,
        tipo: t.tipo,
        clabe: t.clabe,
        alias: t.alias,
        concepto: t.concepto,
        monto: t.monto,
        fecha_operacion: t.fecha,
        proveedor_zoho_id: m.proveedor?.id ?? null,
        proveedor_nombre: m.proveedor?.nombre ?? null,
        sugerido: m.sugerido,
        estado: m.estado,
        asignaciones: m.asignaciones.map(aFila),
      };
    }),
  };
}
