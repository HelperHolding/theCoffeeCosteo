import { describe, expect, it } from 'vitest';
import { generarSemillas } from '../../scripts/bi/semillas';

const TIENDAS = [
  'store_id|nombre_de_tienda|franquiciatario|franquicia_o_propia|primera_venta_zoho|pedidos_pos',
  '301|Ventura|Guadalajara|Sucursales Propias|2024-01-02|71322',
  "999|Tienda D'Prueba|Nadie|Franquicia|2025-01-01|10",
].join('\n');

const PRODUCTOS = [
  'default_code|product|categoria_master|comida_bebida_combo_merch|contiene_cafe|promocion|primera|ultima|unidades',
  "KC1|King's Cake|Panadería Dulce|Comida|No|Producto regular|2025-01-06|2026-01-06|10",
  '|Cold  brew |Bebida Fría|Bebida|Sí|Producto regular|2025-03-03|2026-11-04|2613',
  'SAL|Salted Caramel Frap|Fraps|Bebida|Sí|Producto regular|2026-09-01|2026-11-04|4242',
  'SAL|Salted Caramel Frappé|Bebida Fría|Bebida|Sí|Producto regular|2026-08-21|2026-08-31|768',
  '5IL|Iced Latte|Bebida Fría|Bebida|Sí|Producto regular|2024-01-02|2026-11-04|100',
  '5IL|Latte Frío|Bebida Fría|Bebida|Sí|Producto regular|2025-01-02|2026-11-04|50',
  'ND1|Sin definir|Otros|Otros|No definido|Producto regular|2025-01-01|2025-02-01|3',
  '||||||||',
].join('\n');

const PAGOS = {
  mapeo: [
    { metodo_pos: 'VIRTUAL_WALLET', tipo_pos: 'WALLET', smartphone: true, etiqueta: 'APP - CARD' },
    { metodo_pos: 'CARTAO', tipo_pos: 'EMV', smartphone: false, etiqueta: 'TABLET - CARD' },
  ],
};

const base = {
  tiendas: TIENDAS,
  productos: PRODUCTOS,
  pagos: PAGOS,
  configuradas: [
    { companyId: 384, lookerStoreId: 301 },
    { companyId: 700, lookerStoreId: 555 },
  ],
};

describe('generarSemillas', () => {
  const r = generarSemillas(base);

  it('tiendas: configurada con fila, sin config y config sin Zoho en listas', () => {
    expect(r.sql).toContain(
      'insert into public.bi_tiendas (company_id, store_id, nombre, franquiciatario, tipo, fecha_apertura, origen_apertura)',
    );
    expect(r.sql).toContain("(384, 301, 'Ventura', 'Guadalajara', 'Sucursales Propias', '2024-01-02', 'zoho')");
    expect(r.sql).not.toContain('999');
    expect(r.tiendasSinConfig).toEqual([999]);
    expect(r.configSinZoho).toEqual([700]);
  });

  it('productos: apóstrofo escapado y código vacío usa el nombre exacto', () => {
    expect(r.sql).toContain("('KC1', '2024-01-01', 'Panadería Dulce', 'Comida', 'No', 'Producto regular', 'zoho-2026-11-05')");
    expect(r.sql).toContain("('Cold  brew ', '2024-01-01', 'Bebida Fría', 'Bebida', 'Sí', 'Producto regular', 'zoho-2026-11-05')");
    const otro = PRODUCTOS.replace('KC1', "K'1");
    expect(generarSemillas({ ...base, productos: otro }).sql).toContain("('K''1',");
  });

  it('dos clasificaciones en fechas distintas dan dos versiones', () => {
    expect(r.sql).toContain("('SAL', '2024-01-01', 'Bebida Fría', 'Bebida', 'Sí', 'Producto regular', 'zoho-2026-11-05')");
    expect(r.sql).toContain("('SAL', '2026-09-01', 'Fraps', 'Bebida', 'Sí', 'Producto regular', 'zoho-2026-11-05')");
  });

  it('misma clasificación con distintos nombres da una sola fila; No definido es null', () => {
    expect(r.sql.match(/\('5IL',/g)).toHaveLength(1);
    expect(r.sql).toContain("('ND1', '2024-01-01', 'Otros', 'Otros', null, 'Producto regular', 'zoho-2026-11-05')");
  });

  it('pagos y orden determinista', () => {
    expect(r.sql).toContain("('CARTAO', 'EMV', false, 'TABLET - CARD')");
    expect(r.sql).toContain("('VIRTUAL_WALLET', 'WALLET', true, 'APP - CARD')");
    expect(r.sql.indexOf("('CARTAO'")).toBeLessThan(r.sql.indexOf("('VIRTUAL_WALLET'"));
    expect(r.sql.indexOf("('5IL'")).toBeLessThan(r.sql.indexOf("('KC1'"));
    expect(r.sql).toContain('on conflict do nothing');
    expect(generarSemillas(base).sql).toBe(r.sql);
  });

  it('resumen y conflictos', () => {
    expect(r.resumen).toEqual({ tiendas: 1, clasificaciones: 6, codigos: 5, pagos: 2 });
    expect(r.conflictos).toEqual([]);
    const c = generarSemillas({
      ...base,
      productos: [
        PRODUCTOS.split('\n')[0],
        'X|a|A|Bebida|No|Producto regular|2025-01-01|2025-02-01|5',
        'X|b|B|Bebida|No|Producto regular|2025-01-01|2025-02-01|9',
      ].join('\n'),
    });
    expect(c.sql).toContain("('X', '2024-01-01', 'B',");
    expect(c.sql).not.toContain("('X', '2024-01-01', 'A',");
    expect(c.conflictos).toHaveLength(1);
  });
});
