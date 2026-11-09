import { describe, expect, it } from 'vitest';
import { Catalogo } from '../../lib/areas/catalogo';
import { aTicket } from '../../lib/areas/ticket';
import { validarTicket } from '../../lib/areas/validar';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';

const linea = (codigo: string, importeCent: number, extra: Partial<LineaNormal> = {}): LineaNormal => ({
  codigo, nombre: `Producto ${codigo}`, importeCent, descuentoPct: 0, customs: [], ...extra,
});
const pedido = (extra: Partial<PedidoNormal> = {}): PedidoNormal => ({
  id: 32235824, fecha: '2026-11-09', segundo: 36900, hora: '10:15:00', origen: 'mostrador', ventaCent: 0,
  netoCent: null, descuentoCent: 0, metodo: 'CARTAO', tipo: 'EMV', lineas: [], numeroPedidoRappi: null,
  cuadra: true, ...extra,
});
const ok = (r: ReturnType<typeof aTicket>) => {
  if (!r.ok) throw new Error(r.motivo);
  return r.ticket;
};

describe('aTicket', () => {
  it('como el ejemplo del documento: precio antes del descuento, IVA sobre PRE_FIN y IMP_DTG = Σ IMP_DTO', () => {
    // Línea 1: lista $348 con 20/348 de descuento → cobrado $328. Línea 2: $100 sin descuento.
    const p = pedido({
      lineas: [linea('LAT', 32800, { descuentoPct: (20 / 348) * 100 }), linea('CRO', 10000)],
      ventaCent: 42800,
    });
    const t = ok(aTicket(p, new Catalogo()));
    expect(t.Cabecera).toEqual({
      COD_TPV: 'TC01', NUM_SES: 20261109, NUM_TIK: 32235824, TIP_OPE: 'V', MOM_OPE: '2026-11-09 10:15:00',
      IMP_VEN: 428, ID_MVO_DTO: 0, IMP_DTG: 20,
    });
    expect(t.Detalles[0]).toEqual({
      NUM_LIN: 1, COD_ART: 1001, DES_ART: 'Producto LAT', UNI_VEN: 1, PRE_UNI: 348, PRE_UNI_SIN_IVA: 300,
      PRE_UNI_SIN_IEPS: 300, PRE_FIN: 348, IMP_DTO: 20, POR_IVA: 16, BAS_IVA: 300, IMP_IVA: 48, POR_IEPS: 0,
      BAS_IEPS: 0, IMP_IEPS: 0,
    });
    expect(t.Detalles[1]).toMatchObject({ NUM_LIN: 2, COD_ART: 1002, PRE_FIN: 100, BAS_IVA: 86.21, IMP_IVA: 13.79 });
    expect(t.FormasDePago).toEqual([{ NUM_ORD: 1, COD_FPG: 102, COD_MON: 1, IMP_FPG: 428, IMP_DIV: 428, CAM_MON: 1 }]);
    expect(validarTicket(t, ['Rubén Darío'])).toEqual([]);
  });

  it('el importe de la línea incluye sus modificadores', () => {
    const p = pedido({
      lineas: [linea('LAT', 6000, { customs: [{ codigo: 'AVENA', nombre: 'Avena', importeCent: 1000, descuentoPct: 0 }] })],
      ventaCent: 7000,
    });
    expect(ok(aTicket(p, new Catalogo())).Detalles[0].PRE_FIN).toBe(70);
  });

  it('línea con 100% de descuento usa el precio del catálogo y, sin precio, va en 0', () => {
    const cat = new Catalogo([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 65 }]);
    const p = pedido({ lineas: [linea('LAT', 0, { descuentoPct: 100 }), linea('CRO', 4500)], ventaCent: 4500 });
    const t = ok(aTicket(p, cat));
    expect(t.Detalles[0]).toMatchObject({ PRE_FIN: 65, IMP_DTO: 65 });
    expect(t.Cabecera.IMP_DTG).toBe(65);
    const sinPrecio = ok(aTicket(pedido({ lineas: [linea('X', 0, { descuentoPct: 100 })], ventaCent: 0 }), new Catalogo()));
    expect(sinPrecio.Detalles[0]).toMatchObject({ PRE_FIN: 0, IMP_DTO: 0 });
  });

  it('un descuento de pedido (líneas suman más que lo cobrado) se suma a IMP_DTG', () => {
    const p = pedido({ lineas: [linea('LAT', 6000), linea('CRO', 4000)], ventaCent: 9000, cuadra: false });
    const t = ok(aTicket(p, new Catalogo()));
    expect(t.Cabecera.IMP_DTG).toBe(10);
    expect(validarTicket(t, [])).toEqual([]);
  });

  it('líneas que suman hasta $1 menos que lo cobrado pasan; más de $1, se descarta', () => {
    const casi = pedido({ lineas: [linea('LAT', 6000, { descuentoPct: 10 })], ventaCent: 6050, cuadra: false });
    expect(aTicket(casi, new Catalogo()).ok).toBe(true);
    const mal = pedido({ lineas: [linea('LAT', 6000)], ventaCent: 6200, cuadra: false });
    const r = aTicket(mal, new Catalogo());
    expect(r).toEqual({ ok: false, motivo: 'Las líneas suman $2.00 menos que lo cobrado' });
  });

  it('forma de pago sin mapeo descarta el ticket con su método y tipo', () => {
    const p = pedido({ metodo: 'IFOOD', tipo: 'CONTINGENCY', lineas: [linea('LAT', 6000)], ventaCent: 6000 });
    expect(aTicket(p, new Catalogo())).toEqual({ ok: false, motivo: 'Forma de pago sin mapeo: IFOOD / CONTINGENCY' });
  });

  it('pedido sin líneas se descarta', () => {
    expect(aTicket(pedido({ ventaCent: 5000 }), new Catalogo())).toEqual({ ok: false, motivo: 'Sin líneas' });
  });

  it('centavos con descuento porcentual impar pasan la validación', () => {
    // $49.90 con 15% → cobrado 4241.5 → 4242; tres líneas iguales.
    const l = linea('GAL', 4242, { descuentoPct: 15 });
    const p = pedido({ lineas: [l, { ...l }, { ...l }], ventaCent: 12726 });
    expect(validarTicket(ok(aTicket(p, new Catalogo())), [])).toEqual([]);
  });

  it('un número de Rappi de 10 dígitos se conserva en NUM_TIK', () => {
    const p = pedido({ id: 2485123456, metodo: 'RAPPI', tipo: 'RAPPI_PORTAL', lineas: [linea('LAT', 6000)], ventaCent: 6000 });
    const t = ok(aTicket(p, new Catalogo()));
    expect(t.Cabecera.NUM_TIK).toBe(2485123456);
    expect(t.FormasDePago[0].COD_FPG).toBe(105);
  });

  it('DES_ART se recorta a 150 caracteres', () => {
    const p = pedido({ lineas: [linea('L', 6000, { nombre: 'x'.repeat(200) })], ventaCent: 6000 });
    expect(ok(aTicket(p, new Catalogo())).Detalles[0].DES_ART).toHaveLength(150);
  });
});
