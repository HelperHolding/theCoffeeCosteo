import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';

vi.mock('server-only', () => ({}));
const invocar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sucursales-propias/funcion', () => ({ invocarPagos: invocar }));
import { ErrorCorrida, prepararCorrida } from '../../lib/sucursales-propias/corrida';
import type { PayloadCorrida } from '../../lib/sucursales-propias/planear';

// Recibo SPEI mínimo que entiende leerRecibo (datos ficticios).
const recibo = (alias: string, clabe: string, monto: string, rastreo: string) =>
  [
    'Tipo de Transferencia Mismo día hábil (SPEI)',
    `Cuenta Destino ${alias} - ${clabe}`,
    `$${monto} pesosCantidad a Transferir`,
    'Concepto de pago PAGO FACTURAS',
    rastreo,
    'Fecha de operación SPEI 20 noviembre 2026',
  ].join('\n');

const OH = recibo('OH LALA', '012535000000001111', '300.00', '058-20/11/2026/20-AAA1');
const PK = recibo('PINKBOOK', '012535000000002222', '150.00', '058-20/11/2026/20-BBB2');
// El mismo nombre de archivo en dos carpetas: cada llave debe subir SU PDF.
const ZIP = zipSync({ 'LOTE A/recibo.pdf': strToU8(OH), 'LOTE B/recibo.pdf': strToU8(PK) });
const extraer = async (b: Uint8Array) => new TextDecoder().decode(b);

function dbFalso(
  o: { previas?: { llave: string; corrida_id: number; estado: string }[]; fallaSubir?: string } = {},
) {
  const rpc = vi.fn(async (_n: string, { p }: { p: PayloadCorrida }) => ({
    data: {
      corrida_id: 9,
      rutas: p.transferencias.map((t, i) => ({ llave: t.llave, ruta: `9/r${i}.pdf` })),
    },
    error: null,
  }));
  const subidas: { ruta: string; texto: string }[] = [];
  const upload = vi.fn(async (ruta: string, pdf: Uint8Array) => {
    if (ruta === o.fallaSubir) return { error: { message: 'storage caído' } };
    subidas.push({ ruta, texto: new TextDecoder().decode(pdf) });
    return { error: null };
  });
  const actualizar = vi.fn();
  const db = {
    from(tabla: string) {
      if (tabla === 'suc_pago_transferencia')
        return { select: () => ({ in: async () => ({ data: o.previas ?? [], error: null }) }) };
      if (tabla === 'suc_proveedor_clabe') return { select: async () => ({ data: [], error: null }) };
      if (tabla === 'suc_pago_corrida')
        return {
          update: (cambios: unknown) => ({
            eq: (_c: string, id: number) => {
              actualizar(cambios, id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      throw new Error(`tabla inesperada ${tabla}`);
    },
    rpc,
    storage: { from: () => ({ upload }) },
  };
  return { db: db as never, rpc, upload, subidas, actualizar };
}

beforeEach(() => {
  invocar.mockReset();
  invocar.mockImplementation(async (_db: unknown, accion: string) =>
    accion === 'proveedores'
      ? {
          ok: true,
          datos: {
            proveedores: [
              { id: 'v-oh', nombre: 'OH LALA' },
              { id: 'v-pk', nombre: 'PINKBOOK' },
            ],
          },
        }
      : {
          ok: true,
          datos: {
            facturas: [
              {
                billId: 'b1',
                vendorId: 'v-oh',
                numero: 'A1',
                fecha: '2026-11-06',
                vencimiento: '2026-11-13',
                saldo: 300,
                ubicacion: 'DARIO',
                notas: '',
              },
            ],
          },
        },
  );
});

describe('prepararCorrida', () => {
  it('si todas las transferencias ya estaban registradas, no llama a Zoho ni a la RPC', async () => {
    const { db, rpc } = dbFalso({
      previas: [
        { llave: '058-20/11/2026/20-AAA1', corrida_id: 3, estado: 'aplicada' },
        { llave: '058-20/11/2026/20-BBB2', corrida_id: 3, estado: 'cuadra' },
      ],
    });
    const p = prepararCorrida(db, 'lote.zip', ZIP, extraer);
    await expect(p).rejects.toBeInstanceOf(ErrorCorrida);
    await expect(prepararCorrida(db, 'lote.zip', ZIP, extraer)).rejects.toThrow(
      /ya estaban registradas.*corrida #3/,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(invocar).not.toHaveBeenCalled();
  });

  it('registra la corrida con su payload y sube cada recibo (el PDF correcto) a la ruta que da la RPC', async () => {
    const { db, rpc, subidas, actualizar } = dbFalso();
    const r = await prepararCorrida(db, 'lote.zip', ZIP, extraer);
    expect(r.corridaId).toBe(9);
    expect(invocar).toHaveBeenCalledWith(db, 'facturas', { vendorIds: ['v-oh', 'v-pk'] });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nombre, { p }] = rpc.mock.calls[0];
    expect(nombre).toBe('suc_pagos_registrar_corrida');
    expect(p.archivo).toBe('lote.zip');
    expect(p.n_recibos).toBe(2);
    expect(p.total_recibos).toBe(450);
    expect(p.avisos).toEqual(r.avisos);
    expect(
      p.transferencias.map((t) => [t.llave, t.proveedor_zoho_id, t.estado, t.asignaciones.length]),
    ).toEqual(
      expect.arrayContaining([
        ['058-20/11/2026/20-AAA1', 'v-oh', 'cuadra', 1],
        ['058-20/11/2026/20-BBB2', 'v-pk', 'sin_facturas', 0],
      ]),
    );
    const ruta = Object.fromEntries(p.transferencias.map((t, i) => [t.llave, `9/r${i}.pdf`]));
    expect(subidas).toHaveLength(2);
    expect(subidas.find((s) => s.ruta === ruta['058-20/11/2026/20-AAA1'])!.texto).toBe(OH);
    expect(subidas.find((s) => s.ruta === ruta['058-20/11/2026/20-BBB2'])!.texto).toBe(PK);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('si falla subir un recibo, la corrida sigue, se avisa y se guardan los avisos', async () => {
    const { db, subidas, actualizar } = dbFalso({ fallaSubir: '9/r0.pdf' });
    const r = await prepararCorrida(db, 'lote.zip', ZIP, extraer);
    expect(r.corridaId).toBe(9);
    expect(subidas).toHaveLength(1);
    const aviso = r.avisos.find((a) => a.startsWith('No se pudo guardar el recibo de'));
    expect(aviso).toMatch(/al aplicar quedará sin adjunto/);
    expect(aviso).not.toMatch(/\d{18}/);
    expect(actualizar).toHaveBeenCalledWith({ avisos: r.avisos }, 9);
  });
});
