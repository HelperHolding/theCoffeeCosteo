import { NextResponse } from 'next/server';
import { autorizarFranq, json, SIN_CACHE } from '@/lib/franquiciatarios/rutas';
import { esFecha } from '@/lib/franquiciatarios/dia';
import type { FranqAviso } from '@/lib/franquiciatarios/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const celda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Evita fórmulas al abrir en Excel y escapa comillas.
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

/** CSV de avisos («No» vigentes e incidencias) para gerente, franquiciatario o admin de la sucursal. */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizarFranq(params, { soloGestor: true });
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const desde = q.get('desde');
  const hasta = q.get('hasta');
  if (!esFecha(desde) || !esFecha(hasta)) return json({ error: 'Periodo inválido' }, 400);
  const r = await a.db.rpc('franq_avisos', { p_company: a.cfg.companyId, p_desde: desde, p_hasta: hasta });
  if (r.error) return json({ error: 'No se pudieron leer los avisos' }, 400);
  const filas = (r.data ?? []) as FranqAviso[];
  const csv = [
    ['dia', 'tipo', 'seccion', 'punto', 'estandar', 'observacion', 'nombre', 'registrado_en'].join(','),
    ...filas.map((f) =>
      [
        f.dia,
        f.tipo === 'no' ? 'No' : 'Incidencia',
        f.seccion,
        f.punto,
        f.estandar,
        f.observacion,
        f.nombre,
        f.registrado_en,
      ]
        .map(celda)
        .join(','),
    ),
  ].join('\r\n');
  return new NextResponse(`﻿${csv}`, {
    headers: {
      ...SIN_CACHE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="avisos-${a.cfg.companyId}-${desde}-a-${hasta}.csv"`,
    },
  });
}
