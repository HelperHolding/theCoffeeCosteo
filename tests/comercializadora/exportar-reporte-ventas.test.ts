// tests/comercializadora/exportar-reporte-ventas.test.ts
import { describe, expect, it } from 'vitest';
import { archivoVentas, htmlReporteVentas } from '@/lib/comercializadora/exportar/reporteVentas';
import type { Reporte } from '../../supabase/functions/_shared/reporte/reporte.ts';

const ind = (valor: number | null, meta: number, cumple: boolean | null) => ({ valor, meta, cumple });
const base = (): Reporte => ({
  lunes: '2026-11-16', fin: '2026-11-22', corte: '2026-11-25', leidoEn: '2026-11-25T17:00:00Z', sinClasificar: [],
  ventas: { ok: true, datos: {
    total: 1193333.39, sinIva: 1028735.68, pedidos: 97, promedio: 1218378.9, vsPromedio: -0.021,
    difAnterior: -73601.84, vsAnterior: -0.058, difAnteriorOrdinario: -24657.99, vsAnteriorOrdinario: -0.023,
    top: Array.from({ length: 9 }, (_, i) => ({ nombre: `Cliente ${i + 1}`, sucursales: ['Suc A'], total: 1000 - i })),
    semanas: [{ lunes: '2026-11-16', total: 1193333.39, porTipo: { Ordinario: 1053000, 'Llenado de canal': 6000, Apertura: 134333.39 } }],
  } },
  surtido: { ok: true, datos: {
    enviados: 71, conFaltante: 35, incidenciasTotal: 36, casos: { stock: 29, pickeo: 6, paqueteria: 1, otro: 0 },
    fill: ind(0.507, 98, false), stock: ind(0.408, 1, false), pickeo: ind(0.915, 98, false), fisica: ind(0.014, 1, false),
    envio: { ...ind(1, 100, true), universo: 54, enMeta: 54, buckets: [8, 24, 22, 0], fuera: [] },
    incidencias: [{ ov: 'COM-OV-04809', sucursal: 'Marina Vallarta', cliente: 'MOP', origen: 'paqueteria', tipo: 'Derrame', resolucion: 'Resuelto' }],
  } },
  atencion: { ok: true, datos: {
    propias: { abiertas: 0, resueltasSemana: 0, semanas: [] },
    externos: { abiertas: 1, resueltasSemana: 0, semanas: [{ lunes: '2026-11-16', casos: [
      { ov: 'COM-OV-04883', fecha: '2026-11-17', sucursal: 'Ávila Camacho', cliente: 'Virtuo <MKT>', tipo: 'Pedido Incompleto', resolucion: 'En Proceso', resuelto: false, descripcion: 'Falta vaso\n12 oz' },
    ] }] },
  } },
  notas: { ok: false, error: 'Zoho no respondió: 429' },
  sucursales: { ok: true, datos: { anio: 2026, total: 30, dentro: 10, fueraAnio: 20, anteriores: 0, facturas: 2, filas: [{ sucursal: 'Ventura', dentro: 10, fueraAnio: 20, anteriores: 0, facturas: 2 }] } },
  externos: { ok: true, datos: {
    filas: [{ cliente: 'Tandem', nota: '', masAntigua: '2026-10-13', dias: 43, saldo: 100, llenado: 100 }], subtotal: 100,
    creditos: [{ cliente: 'Tandem', nota: 'Patio Santa Fe · crédito', masAntigua: '2026-06-29', dias: 149, saldo: 50, llenado: 0 }], subtotalCreditos: 50,
    total: 150, interna: [{ cliente: 'Marketing', nota: '', masAntigua: '2026-04-21', dias: 218, saldo: 70, llenado: 0 }], totalInterna: 70,
    excluidos: [{ cliente: 'Dodo Pizza', saldo: 22 }], anterior: 266433.05,
  } },
  aperturas: { ok: true, datos: [{ ov: 'COM-OV-05069', fecha: '2026-11-24', sucursal: 'Plaza Sania', cliente: 'Jorge Montelongo', envio: null, estadoEnvio: '' }] },
});

describe('HTML del Reporte semanal', () => {
  const h = htmlReporteVentas(base(), { excluidasSucursales: ['Polanco'], aviso: null });

  it('trae las seis secciones y el encabezado con la semana', () => {
    for (const t of ['Ventas de la semana', 'Calidad de surtido', 'Atención al cliente', 'Notas de crédito', 'Saldos de sucursales propias', 'Saldos pendientes · clientes externos', 'Aperturas'])
      expect(h).toContain(t);
    expect(h).toContain('16 nov – 22 nov');
    expect(h).toContain('$1,193,333.39');
  });
  it('listas completas: los 9 clientes del top y todas las filas de saldos', () => {
    expect(h).toContain('Cliente 9');
    expect(h).toContain('Marketing');
    expect(h).toContain('Patio Santa Fe · crédito');
    expect(h).toContain('era $266,433.05 la semana pasada');
  });
  it('escapa el texto de Zoho y conserva saltos de línea de las descripciones', () => {
    expect(h).toContain('Virtuo &lt;MKT&gt;');
    expect(h).not.toContain('Virtuo <MKT>');
    expect(h).toContain('Falta vaso\n12 oz');
  });
  it('una sección fallida sale como error y las demás siguen', () => {
    expect(h).toContain('No se pudo leer esta sección: Zoho no respondió: 429');
    expect(h).toContain('Plaza Sania');
  });
  it('incluye el aviso y los valores sin clasificar cuando existen', () => {
    const r = base(); r.sinClasificar = ['Tipo de envío: Raro'];
    const h2 = htmlReporteVentas(r, { excluidasSucursales: [], aviso: 'Datos de hace 20 min; Zoho no respondió' });
    expect(h2).toContain('Datos de hace 20 min');
    expect(h2).toContain('Tipo de envío: Raro');
  });
  it('sin scripts y con gráfica SVG', () => {
    expect(h).not.toContain('<script');
    expect(h).toContain('<svg');
  });
  it('solo usa símbolos que tiene Open Sans (la fuente de Chromium en Vercel): sin ▲ ▼ ≥ ≤ →', () => {
    const r = base();
    if (!r.surtido.ok) throw new Error('base sin surtido');
    r.surtido = { ok: true, datos: { ...r.surtido.datos,
      envio: { valor: 0.5, meta: 100, cumple: false, universo: 2, enMeta: 1, buckets: [0, 1, 0, 1],
        fuera: [{ ov: 'COM-OV-1', sucursal: 'Durango', fecha: '2026-11-12', envio: '2026-11-18', dias: 4 }] } } };
    const h2 = htmlReporteVentas(r, { excluidasSucursales: [], aviso: null });
    expect(h2).not.toMatch(/[▲▼≥≤→]/);
    expect(h2).toContain('-5.8%');
    expect(h2).toContain('Meta: 98% o más');
    expect(h2).toContain('Meta: 1% o menos');
    expect(h2).toContain('12 nov a 18 nov');
  });
  it('nombre de archivo', () => {
    expect(archivoVentas('2026-11-16', 'pdf')).toBe('reporte-ventas-2026-11-16.pdf');
  });
});
