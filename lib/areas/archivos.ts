import type { Exportacion } from './armar';
import type { Articulo } from './catalogo';
import { FORMAS_PAGO } from './pagos';
import { COD_TPV } from './tipos';

export type Fila = (string | number | null)[];

/** Formato de «Carga Art TPVs Externos.xlsx» de Areas. */
export function filasArticulos(articulos: Articulo[]): Fila[] {
  return [
    ['TIPO DE SOLICITUD', null, 'A', 'ALTA DE CODIGOS', null, null, 'COMENTARIOS'],
    [null, null, null, null, null, null, 'ALTA DE CODIGOS. ASOCIAR A GAMA Y TARIFA DE PRECIO.'],
    ['CÓDIGO', 'DESCRIPCIÓN', 'CODIGO DE FAMILIA 3', 'FAMILIA 3', 'IVA', 'TIPO', 'PRECIO VENTA'],
    ...articulos.map((a): Fila => [a.cod_art, a.descripcion, 0, null, '16%', null, a.precio]),
  ];
}

/**
 * Formato de «Formas de Pago y Monedas.xlsx». Solo informamos las columnas A y B (nuestro código y descripción);
 * Areas relaciona cada una con su forma de pago y llena el resto (correo de Areas, 2026-11-09).
 */
export function filasPagos(): Fila[] {
  return [
    ['CODFPTPVEXT', 'DESCFPTPVEXT', 'CODFPAREAS', 'DESCFAREAS', 'FechaRegistro'],
    ...FORMAS_PAGO.map((f): Fila => [f.codigo, f.descripcion, null, null, null]),
  ];
}

const SIN_MAPEO = 'Forma de pago sin mapeo: ';
const m = (x: number | null) => (x === null ? '—' : x.toFixed(2));

export function reporte(
  e: Exportacion,
  x: {
    desde: string;
    hasta: string;
    estado: 'completa' | 'parcial' | 'error';
    avisos: string[];
    nuevos: Articulo[];
    /** Días con lectura incompleta. Si falta y la lectura no está completa, se marcan todos. */
    incompletos?: string[];
  },
): string {
  const incompletos = new Set(x.incompletos ?? (x.estado === 'completa' ? [] : e.dias.map((d) => d.fecha)));
  const sinMapeo = [
    ...new Set(
      e.descartados
        .filter((d) => d.motivo.startsWith(SIN_MAPEO))
        .map((d) => d.motivo.slice(SIN_MAPEO.length)),
    ),
  ];
  const l: string[] = [`# Exportación Areas · ${COD_TPV} · ${x.desde} a ${x.hasta}`, ''];
  if (x.estado !== 'completa' || incompletos.size)
    l.push(
      `> **LECTURA INCOMPLETA (${x.estado}).** No mandar como completos estos días: ${[...incompletos].sort().join(', ') || 'sin detalle por día'}.`,
      '',
    );
  if (x.avisos.length) l.push('## Avisos de la lectura', '', ...x.avisos.map((a) => `- ${a}`), '');
  l.push(
    '## Por día',
    '',
    '| Fecha | Leídos | Válidos | Descartados | Monto | Lectura |',
    '|---|---|---|---|---|---|',
    ...e.dias.map(
      (d) =>
        `| ${d.fecha} | ${d.leidos} | ${d.validos} | ${d.descartados} | ${m(d.monto)} | ${incompletos.has(d.fecha) ? 'INCOMPLETA' : 'completa'} |`,
    ),
    '',
    `Total: ${e.tickets.length} tickets y ${e.arqueos.length} arqueos.`,
    '',
    `Rappi no se manda a Areas: ${e.rappiExcluidos} pedidos excluidos.`,
    '',
    '## Descartados',
    '',
  );
  if (e.descartados.length)
    l.push(
      '| Pedido | Momento | Motivo |',
      '|---|---|---|',
      ...e.descartados.map((d) => `| ${d.id} | ${d.fecha} ${d.hora} | ${d.motivo} |`),
    );
  else l.push('Ninguno.');
  l.push(
    '',
    '## Formas de pago sin mapeo',
    '',
    ...(sinMapeo.length ? sinMapeo.map((s) => `- ${s}`) : ['Ninguna.']),
    '',
  );
  l.push('## Artículos nuevos en el catálogo', '');
  if (x.nuevos.length)
    l.push(
      '| COD_ART | Código POS | Descripción | Precio |',
      '|---|---|---|---|',
      ...x.nuevos.map((a) => `| ${a.cod_art} | ${a.codigo} | ${a.descripcion} | ${m(a.precio)} |`),
    );
  else l.push('Ninguno.');
  return l.join('\n') + '\n';
}
