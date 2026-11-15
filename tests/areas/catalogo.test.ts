import { describe, expect, it } from 'vitest';
import { Catalogo, codigoNormal } from '../../lib/areas/catalogo';

describe('codigoNormal', () => {
  it('como bi_codigo: mayúsculas, sin orillas y espacios internos (también U+00A0) colapsados', () => {
    expect(codigoNormal('  crea tu the   coffee ')).toBe('CREA TU THE COFFEE');
  });
});

describe('Catalogo', () => {
  it('asigna desde 1001 en el orden en que aparecen', () => {
    const c = new Catalogo();
    expect(c.codArt('LAT', 'Latte')).toBe(1001);
    expect(c.codArt('CRO', 'Croissant')).toBe(1002);
    expect(c.nuevos().map((a) => a.cod_art)).toEqual([1001, 1002]);
  });
  it('un código existente conserva su número aunque cambie de escritura', () => {
    const c = new Catalogo([
      { cod_art: 1007, codigo: 'CREA TU THE COFFEE', descripcion: 'Crea tu', precio: 90 },
    ]);
    expect(c.codArt('crea tu  the coffee', 'Crea Tu The Coffee')).toBe(1007);
    expect(c.nuevos()).toEqual([]);
  });
  it('los nuevos siguen al mayor existente y nunca reutilizan números', () => {
    const c = new Catalogo([
      { cod_art: 1001, codigo: 'A', descripcion: 'A', precio: null },
      { cod_art: 1005, codigo: 'B', descripcion: 'B', precio: null },
    ]);
    expect(c.codArt('C', 'C')).toBe(1006);
  });
  it('la descripción se actualiza al nombre más reciente', () => {
    const c = new Catalogo();
    c.codArt('LAT', 'Latte');
    c.codArt('LAT', 'Latte Grande');
    expect(c.lista()[0].descripcion).toBe('Latte Grande');
  });
  it('precioDe y fijarPrecio', () => {
    const c = new Catalogo();
    expect(c.precioDe('LAT')).toBeNull();
    const n = c.codArt('LAT', 'Latte');
    c.fijarPrecio(n, 65);
    expect(c.precioDe('lat')).toBe(65);
  });
  it('lista ordenada por cod_art', () => {
    const c = new Catalogo([{ cod_art: 1003, codigo: 'Z', descripcion: 'Z', precio: null }]);
    c.codArt('A', 'A');
    expect(c.lista().map((a) => a.cod_art)).toEqual([1003, 1004]);
  });
});
