import { describe, expect, it } from 'vitest';
import {
  areaDe,
  inventarioMarkdown,
  redactar,
  registrarUsos,
  type Usos,
} from '../../scripts/migracion-legado/inventario-lib';

describe('registrarUsos', () => {
  it('distingue lecturas de escrituras y acepta cadenas en varias líneas y comillas dobles', () => {
    const usos: Usos = new Map();
    registrarUsos(usos, `sb.from('pedidos').select('id'); sb.from('pedidos')\n  .update({a:1})`, 'app');
    registrarUsos(usos, `db.from("com_minmax").upsert(filas)`, 'edge:com-minmax');
    expect([...usos.get('pedidos')!.lee]).toEqual(['app']);
    expect([...usos.get('pedidos')!.escribe]).toEqual(['app']);
    expect([...usos.get('com_minmax')!.escribe]).toEqual(['edge:com-minmax']);
  });
});

describe('areaDe', () => {
  it('asigna área por nombre y deja "Por asignar" lo desconocido', () => {
    expect(areaDe('com_catalogo')).toBe('Comercializadora');
    expect(areaDe('pedidos_apertura')).toBe('Aperturas');
    expect(areaDe('pedido_incidencias')).toBe('Pedidos');
    expect(areaDe('tabla_rara')).toBe('Por asignar');
  });
});

describe('inventarioMarkdown', () => {
  it('ordena por área, marca tablas sin RLS y lista referencias sin tabla', () => {
    const usos: Usos = new Map([
      ['com_catalogo', { lee: new Set(['app']), escribe: new Set(['edge:zoho-sync']) }],
      ['tabla_borrada', { lee: new Set(['app']), escribe: new Set() }],
    ]);
    const md = inventarioMarkdown(
      [
        { tabla: 'pedidos', filas: 10, rls: false },
        { tabla: 'com_catalogo', filas: 3, rls: true },
      ],
      usos,
      '2026-11-12',
    );
    const filas = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Área') && !l.startsWith('| ---'));
    expect(filas).toEqual([
      '| Comercializadora | `com_catalogo` | 3 | sí | app | edge:zoho-sync |  |',
      '| Pedidos | `pedidos` | 10 | **no** | — | — |  |',
    ]);
    expect(md).toContain('## Referencias en el código sin tabla en la base');
    expect(md).toContain('- `tabla_borrada`');
  });
});

describe('redactar', () => {
  it('quita JWT, llaves con prefijo y Bearer de las definiciones', () => {
    const def = `headers := '{"Authorization":"Bearer abc.def-123"}'; k := 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJh'; s := 'sk_live_51Hxyz'`;
    const r = redactar(def);
    expect(r).not.toMatch(/abc\.def-123|eyJhbGci|sk_live_51Hxyz/);
    expect(r.match(/\[REDACTADO\]/g)).toHaveLength(3);
  });
  it('no toca texto normal', () => {
    expect(redactar('select * from com_catalogo')).toBe('select * from com_catalogo');
  });
});
