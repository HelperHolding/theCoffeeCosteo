import { describe, expect, it } from 'vitest';
import {
  aCentavos,
  cruzarTiendas,
  decodificar,
  fechaApertura,
  leerCsv,
  leerMetas,
  leerPuntoEquilibrio,
  normalizarNombre,
} from '@/lib/bi/metas';

const CSV_ZOHO =
  'Sucursal,Año,MesNum,MetaMensualVentas,MetaMensualTickets,MetaMensualTicketPromedio,FechaApertura\r\n' +
  'Aleden,2026,2,"$302,000.00",2169,139,\r\n' +
  'Cd. Juárez,2026,11,"$250,500.50",1800,139.5,12-02-2026\r\n';

describe('lib/bi/metas', () => {
  it('lee el export de Zoho: importes con $ y comas, mes AAAA-MM-01 y apertura dd-MM-yyyy', () => {
    expect(leerMetas(leerCsv(CSV_ZOHO))).toEqual([
      {
        sucursal: 'Aleden',
        mes: '2026-02-01',
        ventaCent: 30200000,
        tickets: 2169,
        ticketPromedioCent: 13900,
        fechaApertura: null,
      },
      {
        sucursal: 'Cd. Juárez',
        mes: '2026-11-01',
        ventaCent: 25050050,
        tickets: 1800,
        ticketPromedioCent: 13950,
        fechaApertura: '2026-02-12',
      },
    ]);
  });

  it('acepta el encabezado «Año» con la codificación rota', () => {
    const roto = CSV_ZOHO.replace('Año', 'A�o');
    expect(leerMetas(leerCsv(roto))).toHaveLength(2);
  });

  it('rechaza metas repetidas, importes o meses no válidos', () => {
    expect(() => leerMetas(leerCsv(CSV_ZOHO + 'aleden,2026,2,"$1.00",1,1,\r\n'))).toThrow(/repetida/);
    expect(() => aCentavos('')).toThrow(/no válido/);
    expect(() => aCentavos('N/A')).toThrow(/no válido/);
    expect(() => leerMetas(leerCsv(CSV_ZOHO.replace(',2026,2,', ',2026,13,')))).toThrow(/Mes no válido/);
    expect(() => fechaApertura('31-02-2026x')).toThrow(/no válida/);
  });

  it('cruza por nombre sin acentos ni puntos y reporta los que no cruzan', () => {
    const metas = leerMetas(leerCsv(CSV_ZOHO));
    const r = cruzarTiendas(metas, [
      { company_id: 1, nombre: 'Aleden' },
      { company_id: 2, nombre: 'Cd Juarez' },
    ]);
    expect(r.cruzadas.map((m) => m.companyId)).toEqual([1, 2]);
    expect(cruzarTiendas(metas, [{ company_id: 1, nombre: 'Aleden' }]).sinTienda).toEqual(['Cd. Juárez']);
    expect(normalizarNombre('  Vía  San Ángel Puebla ')).toBe('via san angel puebla');
    expect(() =>
      cruzarTiendas(metas, [
        { company_id: 1, nombre: 'A' },
        { company_id: 2, nombre: 'a' },
      ]),
    ).toThrow(/mismo nombre/);
  });

  it('lee el CSV de P.E. (tienda, mes AAAA-MM, pe)', () => {
    expect(leerPuntoEquilibrio(leerCsv('tienda,mes,pe\nAleden,2026-11,"$289,230.57"\n'))).toEqual([
      { sucursal: 'Aleden', mes: '2026-11-01', peCent: 28923057 },
    ]);
    expect(() => leerPuntoEquilibrio(leerCsv('tienda,mes,pe\nA,2026-11,1\nA,2026-11,2\n'))).toThrow(
      /repetido/,
    );
  });

  it('decodifica UTF-8 y, si no es válido, Windows-1252', () => {
    expect(decodificar(new TextEncoder().encode('Juárez'))).toBe('Juárez');
    expect(decodificar(new Uint8Array([0x4a, 0x75, 0xe1, 0x72, 0x65, 0x7a]))).toBe('Juárez');
  });
});
