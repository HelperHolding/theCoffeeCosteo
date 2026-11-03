import { NextResponse, type NextRequest } from 'next/server';
import { sesionCrm } from '@/lib/supabase/sesion';
import type { Historial } from '@/lib/crm/tipos';

const MAXIMO = 20_000;
const celda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Evita que Excel interprete fórmulas en celdas que empiezan con = + - @.
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${seguro.replace(/"/g, '""')}"`;
};
const fechaMx = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Mexico_City',
});

/** Exporta la bitácora filtrada (mismos filtros que la pantalla) como CSV para Excel. */
export async function GET(req: NextRequest) {
  let db;
  try {
    ({ db } = await sesionCrm(false));
  } catch {
    return new NextResponse('Sin acceso al CRM', { status: 403 });
  }
  const p = req.nextUrl.searchParams;
  let q = db
    .from('crm_historial')
    .select('*')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (p.get('actor')) q = q.eq('actor_id', p.get('actor')!);
  if (p.get('accion')) q = q.eq('accion', p.get('accion') as Historial['accion']);
  if (p.get('area')) q = q.ilike('actor_area', `%${p.get('area')}%`);
  if (p.get('desde')) q = q.gte('fecha', `${p.get('desde')}T00:00:00-06:00`);
  if (p.get('hasta')) q = q.lte('fecha', `${p.get('hasta')}T23:59:59-06:00`);
  if (p.get('q')) q = q.ilike('resumen', `%${p.get('q')!.replace(/[%_,()"]/g, ' ')}%`);
  if (p.get('muestra') !== '1') q = q.not('origen', 'in', '(importacion,zoho)');
  const filas: Historial[] = [];
  for (let desde = 0; desde < MAXIMO; desde += 1000) {
    const r = await q.range(desde, desde + 999);
    if (r.error) return new NextResponse('No se pudo exportar. Intenta de nuevo.', { status: 500 });
    filas.push(...(r.data as Historial[]));
    if (r.data.length < 1000) break;
  }
  const encabezado = [
    'Fecha y hora (CDMX)',
    'Persona',
    'Área',
    'Acción',
    'Resumen',
    'Motivo',
    'Origen',
    'Franquiciatario',
    'Sucursal',
  ];
  const lineas = [
    encabezado.map(celda).join(','),
    ...filas.map((h) =>
      [
        fechaMx.format(new Date(h.fecha)),
        h.actor_nombre ?? (h.origen === 'zoho' ? 'Zoho' : 'Sistema'),
        h.actor_area,
        h.accion,
        h.resumen,
        h.motivo,
        h.origen,
        h.franquiciatario_id,
        h.tienda_id,
      ]
        .map(celda)
        .join(','),
    ),
  ];
  return new NextResponse(`﻿${lineas.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bitacora-crm-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
