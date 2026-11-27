import { describe, expect, it } from 'vitest';
import { alcanceDe, rpcDelAlcance, sucursalesDeCiudad } from '../../lib/sucursales/alcance';

/** Alcance del tablero (docs/sucursales/19): México = las del usuario; ciudad = todas las de la ciudad. */
describe('alcance del tablero', () => {
  it('sin ciudad: las asignadas y configuradas; con Guadalajara: sus 11, aunque no tenga ninguna', () => {
    const pais = alcanceDe(new URLSearchParams(''), [513, 545, 99999]);
    expect(pais).toMatchObject({ tipo: 'pais' });
    expect('sucursales' in pais && pais.sucursales.map((s) => s.companyId)).toEqual([513, 545]);
    const gdl = alcanceDe(new URLSearchParams('ciudad=guadalajara'), [545]);
    expect(gdl).toMatchObject({ tipo: 'ciudad', clave: 'guadalajara', nombre: 'Guadalajara' });
    expect('sucursales' in gdl && gdl.sucursales).toEqual(sucursalesDeCiudad('guadalajara'));
    expect(sucursalesDeCiudad('guadalajara')).toHaveLength(11);
  });

  it('una ciudad sin tablero da 404 (ni siquiera «constructor»)', () => {
    expect(alcanceDe(new URLSearchParams('ciudad=monterrey'), [])).toEqual({
      error: 'Tablero no disponible.',
      status: 404,
    });
    expect(alcanceDe(new URLSearchParams('ciudad=constructor'), [])).toMatchObject({ status: 404 });
  });

  it('la RPC de la ciudad lleva p_ciudad; la de México no cambia', async () => {
    const llamadas: [string, Record<string, unknown>][] = [];
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (
        llamadas.push([fn, args]),
        { data: 1, error: null }
      ),
    };
    const pais = alcanceDe(new URLSearchParams(''), [513]);
    const gdl = alcanceDe(new URLSearchParams('ciudad=guadalajara'), []);
    if ('error' in pais || 'error' in gdl) throw new Error('alcance');
    await rpcDelAlcance(db, pais, 'sucursales_menu_nacional', { p_companias: [513] });
    await rpcDelAlcance(db, gdl, 'sucursales_tablero_hoy', { p_companias: [513], p_hoys: ['2026-11-27'] });
    expect(llamadas).toEqual([
      ['sucursales_menu_nacional', { p_companias: [513] }],
      [
        'sucursales_ciudad_tablero_hoy',
        { p_ciudad: 'guadalajara', p_companias: [513], p_hoys: ['2026-11-27'] },
      ],
    ]);
  });
});
