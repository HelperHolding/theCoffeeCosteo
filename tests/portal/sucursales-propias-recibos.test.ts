import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { centavos, esResumen, leerRecibo, leerResumen, unir } from '../../lib/sucursales-propias/recibos';
import { ErrorCorrida, leerZip } from '../../lib/sucursales-propias/zip';

const SPEI = `Tipo de Transferencia Mismo día hábil (SPEI)
COMERCIALIZADORA MASTER SITRU S.A. DE C.V. - *0151Cuenta Origen
Cuenta Destino OH LALA - 012535000000001111
$27,367.54 pesosCantidad a Transferir
Concepto de pago PAGO FACTURAS CORRIDA 20NOV26
Le avisamos a
RFC XAXX010101000
correo@ejemplo.mx
Quien autoriza
Quien solicita
PERSONA AUTORIZA (Firma A)
PERSONA SOLICITA ( FIRMA )
Recibo de la transferencia
20 noviembre 2026 - 12:01 p. m.Fecha solicita
Banco BBVA MEXICO
UKz3TvlZVu - 20 noviembre 2026 - 01:08:09 p. m.
Si tienes dudas, llámanos al Centro de Atención a Clientes
058-20/11/2026/20-145AOXPA31
Verificador 5001935192085322112120902541012741092531022671062430972531022681005472165472215532212120
Tu clave de rastreo
Datos de tu operación
Fecha de operación SPEI 20 noviembre 2026`;

const BANREGIO = `Cuenta Origen
Cuenta Destino
Cantidad a Transferir
Descripcion
Si tienes dudas, llámanos al Centro de Atención a Clientes
COMERCIALIZADORA MASTER SITRU S.A. DE C.V. - *0151
PERSONA PROVEEDORA UNO - *5957
$2,700.00 pesos
PAGO FACTURAS CORRIDA 20NOV26
20-11-2026 13:08
Recibo de la transferencia
XAXX010101000
$0.00 pesosTipo de cambio
$2,700.00 pesosTu total a transferir
RFC
Datos de tu operación`;

const RESUMEN = `Recibo de Transferencia Masiva
Cuenta Origen
SUCUR 20 NOV.xlsxArchivo
cuenta 12 - *0151
Transacciones SPEI: 2 por $27467.54
Banregio: 1 por $2700.00
Número de Transferencias 3
Total $30167.54
Detalle de Transferencias
Secuencia Tipo Cuenta Destino Alias Referencia
Númerica
MontoDescripción
1 SPEI 012320000000002222 HIBRIDO DISEÑO
PERSONA DOS
APELLIDO
ETIQUETAS DE VIDA UTIL NOV $100.00
2 SPEI 012535000000001111 OH LALA PAGO FACTURAS CORRIDA
20NOV26
$27367.54
3 Banregio 058320000000005957 PERSONA PROVEEDORA
UNO
PAGO FACTURAS CORRIDA
20NOV26
$2700.00
Detalle de Transferencias con Error
Secuencia Tipo Cuenta Destino Alias Referencia
Númerica
MontoDescripción
Si tienes dudas, llámanos al Centro de Atención a Clientes`;

// Recibo de la solicitud (p. ej. a Banorte): destino solo con últimos 4, sin clave de rastreo ni fecha de operación.
const SOLICITUD = `Tipo de Transferencia Mismo día hábil (SPEI)
COMERCIALIZADORA MASTER SITRU S.A. DE C.V. - *0151Cuenta Origen
Cuenta Destino PROVEEDOR EJEMPLO SA DE CV - *3333
$6,612.00 pesosCantidad a Transferir
Concepto de pago MANTTO SUCURSAL EJEMPLO
Quien autoriza
Quien solicita
PERSONA AUTORIZA (Firma A)
PERSONA SOLICITA ( FIRMA )
Recibo de la solicitud
20 noviembre 2026 - 12:01 p. m.Fecha solicita
Banco BANORTE
UKz3TvlZUR - 20 noviembre 2026 - 01:08:12 p. m.
Datos de tu operación`;

describe('leerRecibo', () => {
  it('lee un recibo de solicitud SPEI (sin CLABE completa ni clave de rastreo)', () => {
    expect(leerRecibo(SOLICITUD)).toEqual({
      tipo: 'SPEI',
      alias: 'PROVEEDOR EJEMPLO SA DE CV',
      clabe: null,
      ultimos4: '3333',
      monto: 6612,
      concepto: 'MANTTO SUCURSAL EJEMPLO',
      fecha: '2026-11-20',
      claveRastreo: null,
    });
  });

  it('lee un recibo SPEI aunque las etiquetas vengan desordenadas', () => {
    expect(leerRecibo(SPEI)).toEqual({
      tipo: 'SPEI',
      alias: 'OH LALA',
      clabe: '012535000000001111',
      ultimos4: '1111',
      monto: 27367.54,
      concepto: 'PAGO FACTURAS CORRIDA 20NOV26',
      fecha: '2026-11-20',
      claveRastreo: '058-20/11/2026/20-145AOXPA31',
    });
  });

  it('lee un traspaso Banregio sin CLABE completa ni clave de rastreo', () => {
    expect(leerRecibo(BANREGIO)).toEqual({
      tipo: 'Banregio',
      alias: 'PERSONA PROVEEDORA UNO',
      clabe: null,
      ultimos4: '5957',
      monto: 2700,
      concepto: 'PAGO FACTURAS CORRIDA 20NOV26',
      fecha: '2026-11-20',
      claveRastreo: null,
    });
  });

  it('falla con un mensaje claro si no es un recibo', () => {
    expect(() => leerRecibo('hola')).toThrow(/monto/);
  });
});

describe('leerResumen', () => {
  it('lee totales y filas de varias líneas', () => {
    const r = leerResumen(RESUMEN);
    expect(esResumen(RESUMEN)).toBe(true);
    expect(esResumen(SPEI)).toBe(false);
    expect(r.archivo).toBe('SUCUR 20 NOV.xlsx');
    expect(r.numero).toBe(3);
    expect(r.total).toBe(30167.54);
    expect(r.conError).toBe(0);
    expect(r.filas.map((f) => [f.secuencia, f.tipo, f.clabe, f.monto])).toEqual([
      [1, 'SPEI', '012320000000002222', 100],
      [2, 'SPEI', '012535000000001111', 27367.54],
      [3, 'Banregio', '058320000000005957', 2700],
    ]);
    expect(r.filas[0].texto).toBe('HIBRIDO DISEÑO PERSONA DOS APELLIDO ETIQUETAS DE VIDA UTIL NOV');
  });

  it('cuenta las transferencias con error', () => {
    const conError = RESUMEN.replace(
      'Detalle de Transferencias con Error\n',
      'Detalle de Transferencias con Error\n9 SPEI 012320000000009999 OTRO PAGO $5.00\n',
    );
    expect(leerResumen(conError).conError).toBe(1);
  });
});

describe('unir', () => {
  const recibos = [
    { archivo: 'OH LALA - $27,367.54.pdf', recibo: leerRecibo(SPEI) },
    { archivo: 'PERSONA - $2,700.00.pdf', recibo: leerRecibo(BANREGIO) },
  ];

  it('toma la CLABE del resumen para el traspaso Banregio y arma su llave', () => {
    const { transferencias } = unir(leerResumen(RESUMEN), recibos);
    const brg = transferencias.find((t) => t.tipo === 'Banregio')!;
    expect(brg.clabe).toBe('058320000000005957');
    expect(brg.llave).toBe('BRG-2026-11-20-5957-2700.00');
    expect(brg.secuencia).toBe(3);
    expect(transferencias.find((t) => t.tipo === 'SPEI')!.llave).toBe('058-20/11/2026/20-145AOXPA31');
  });

  it('avisa la fila del resumen sin recibo y la diferencia de totales, sin mostrar la CLABE completa', () => {
    const { avisos } = unir(leerResumen(RESUMEN), recibos);
    expect(avisos.some((a) => a.includes('transferencia 1') && a.includes('…2222'))).toBe(true);
    expect(avisos.some((a) => a.includes('suman $30067.54') && a.includes('$30167.54'))).toBe(true);
    expect(avisos.join(' ')).not.toContain('012320000000002222');
  });

  it('sin resumen: el traspaso Banregio queda sin CLABE pero con llave determinista', () => {
    const { transferencias, avisos } = unir(null, recibos);
    const brg = transferencias.find((t) => t.tipo === 'Banregio')!;
    expect(brg.clabe).toBeNull();
    expect(brg.llave).toBe('BRG-2026-11-20-5957-2700.00');
    expect(avisos.some((a) => a.includes('no trae el resumen'))).toBe(true);
  });

  it('un recibo repetido en el ZIP se toma una sola vez', () => {
    const { transferencias, avisos } = unir(null, [recibos[0], { ...recibos[0], archivo: 'copia.pdf' }]);
    expect(transferencias).toHaveLength(1);
    expect(avisos.some((a) => a.includes('copia.pdf') && a.includes('repetido'))).toBe(true);
  });

  it('una solicitud SPEI y un traspaso Banregio con misma fecha, últimos 4 y monto no chocan', () => {
    const banregio = { ...leerRecibo(BANREGIO), ultimos4: '3333', monto: 6612 };
    const solicitud = leerRecibo(SOLICITUD);
    const { transferencias, avisos } = unir(null, [
      { archivo: 'brg.pdf', recibo: banregio },
      { archivo: 'sol.pdf', recibo: solicitud },
    ]);
    expect(transferencias.map((t) => t.llave).sort()).toEqual([
      'BRG-2026-11-20-3333-6612.00',
      'SOL-2026-11-20-3333-6612.00',
    ]);
    expect(avisos.some((a) => a.includes('repetido'))).toBe(false);
  });

  it('avisa que una solicitud SPEI sin clave de rastreo debe confirmarse, y completa su CLABE desde el resumen', () => {
    const resumen = leerResumen(
      RESUMEN.replace('3 Banregio 058320000000005957', '3 SPEI 012320000000003333').replaceAll(
        '$2700.00',
        '$6612.00',
      ),
    );
    const { transferencias, avisos } = unir(resumen, [{ archivo: 'sol.pdf', recibo: leerRecibo(SOLICITUD) }]);
    const aviso =
      'sol.pdf: es un recibo de solicitud sin clave de rastreo; confirma con Banregio que se ejecutó antes de aplicarlo.';
    expect(avisos).toContain(aviso);
    expect(aviso).not.toMatch(/\d{18}/);
    expect(transferencias[0].clabe).toBe('012320000000003333');
    expect(transferencias[0].secuencia).toBe(3);
  });

  it('centavos no arrastra errores de coma flotante', () => {
    expect(centavos(0.1 + 0.2)).toBe(30);
    expect(centavos(1088.5)).toBe(108850);
  });
});

describe('leerZip', () => {
  // El extractor falso devuelve el contenido del "PDF" tal cual: así se prueba el ZIP sin generar PDFs.
  const extraer = async (b: Uint8Array) => new TextDecoder().decode(b);

  it('separa resumen y recibos, ignora lo que no es PDF y avisa lo ilegible', async () => {
    const zip = zipSync({
      'SUCURSALES 20NOV26/RESUMEN.pdf': strToU8(RESUMEN),
      'SUCURSALES 20NOV26/OH LALA.pdf': strToU8(SPEI),
      'SUCURSALES 20NOV26/roto.pdf': strToU8('no es recibo'),
      'SUCURSALES 20NOV26/notas.txt': strToU8('x'),
      '__MACOSX/._OH LALA.pdf': strToU8('basura'),
    });
    const r = await leerZip(zip, extraer);
    expect(r.resumen?.numero).toBe(3);
    expect(r.recibos.map((x) => x.archivo)).toEqual(['OH LALA.pdf']);
    expect(r.avisos).toEqual(['No se pudo leer roto.pdf.']);
  });

  it('rechaza un archivo que no es ZIP o un ZIP sin recibos', async () => {
    await expect(leerZip(strToU8('hola'), extraer)).rejects.toBeInstanceOf(ErrorCorrida);
    await expect(leerZip(zipSync({ 'a.txt': strToU8('x') }), extraer)).rejects.toThrow(/no trae recibos/);
  });
});
