// Plan 3f: "Exportar Excel" del Plan de abastos (seis hojas, como _planSemExportar del viejo).
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { filasConfigPlan, libroPlanAbastos } from '../../lib/comercializadora/excelPlan';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc, psemPasadas, type Inc } from '../../supabase/functions/_shared/planSem.ts';
import { datosSem, ZOHO_OC_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const R = datosSem();
const cfg = normalizarCfgMotor({
  zoho_oc: ZOHO_OC_SEM,
  eventos: [
    {
      nombre: 'Buen Fin',
      ini: '2026-11-13',
      fin: '2026-11-16',
      factor: 1.4,
      alcance: 'todos',
      activo: false,
    },
  ],
});
const c = planLocal(R, cfg);
const libro = (inc: Inc) =>
  libroPlanAbastos(
    planSemCalc(c, inc, 4, { cafe: () => cafeOrdenes(R, cfg), imp: () => impCorrer(R, cfg) }),
    c,
    psemPasadas(c, R),
    inc,
  );

describe('Excel del Plan de abastos', () => {
  it('seis hojas en el orden del viejo, con todas las semanas del plan aunque se vean 4', () => {
    const l = libro({ local: true, cafe: true, imp: true });
    expect(l.archivo).toBe('Plan_de_abastos_2026-11-13.xlsx');
    expect(l.hojas.map((h) => h.nombre)).toEqual([
      'Resumen por categoría ($)',
      'Por proveedor ($)',
      'Por artículo (piezas)',
      'Por artículo ($)',
      'Compras ya emitidas',
      'Configuración',
    ]);
    const [cats, provs, arts, artsM, emit] = l.hojas.map((h) => h.filas);
    expect(Object.keys(cats[0])).toEqual([
      'Categoría',
      'Incluida',
      'Hoy 13 nov',
      '20 nov',
      '27 nov',
      '4 dic',
      '11 dic',
      '18 dic',
      '25 dic',
      '1 ene',
      '8 ene',
      '15 ene',
      '22 ene',
      '29 ene',
      'Total $',
    ]);
    expect(cats.map((x) => x.Categoría)).toEqual(['Todo lo demás', 'Café', 'Importaciones']);
    const jar = provs.find((x) => x.Proveedor === 'Jarabes MX')!;
    expect([jar.Categoría, jar['Mínimo capturado'], jar['Hoy 13 nov']]).toEqual([
      'Todo lo demás',
      5000,
      5130,
    ]);
    const tis = artsM.find((x) => x.SKU === 'LOC-TIS-001')!;
    expect(tis['Hoy 13 nov']).toBe('sin costo');
    expect(arts.every((x) => (x['Total piezas'] as number) > 0)).toBe(true);
    expect(arts.find((x) => x.Categoría === 'Importaciones')?.['Disponible (inv.+OC)']).toBe('');
    expect(emit.map((x) => x['Semana (inicio)'])).toEqual([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
      '2026-11-07',
    ]);
  });

  it('lo no incluido sale como "no" en el resumen y no aparece por proveedor ni por artículo', () => {
    const l = libro({ local: true, cafe: false, imp: false });
    expect(l.hojas[0].filas.map((x) => x.Incluida)).toEqual(['sí', 'no', 'no']);
    expect(new Set(l.hojas[1].filas.map((x) => x.Categoría))).toEqual(new Set(['Todo lo demás']));
  });

  it('Configuración: un parámetro por fila, imp y café normalizados, eventos al final y sin la carga de Zoho', () => {
    const f = filasConfigPlan(cfg);
    const claves = f.map((x) => x.Parámetro as string);
    expect(claves).toContain('compra.prox_dias');
    expect(claves).toContain('imp.politica.meses_cobertura');
    expect(claves).toContain('cafe.anio');
    expect(claves.some((k) => k.startsWith('zoho_oc'))).toBe(false);
    expect(f.at(-1)).toEqual({
      Parámetro: 'evento: Buen Fin',
      Valor: '2026-11-13 a 2026-11-16 × 1.4 (todos) [inactivo]',
    });
  });

  it('SheetJS lo escribe y se vuelve a leer con los mismos valores', () => {
    const l = libro({ local: true, cafe: true, imp: true });
    const wb = XLSX.utils.book_new();
    for (const h of l.hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre);
    const leido = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(leido.SheetNames).toHaveLength(6);
    const p = XLSX.utils.sheet_to_json<Record<string, unknown>>(leido.Sheets['Por proveedor ($)']);
    expect(p.find((x) => x.Proveedor === 'Jarabes MX')?.['Hoy 13 nov']).toBe(5130);
  });
});
