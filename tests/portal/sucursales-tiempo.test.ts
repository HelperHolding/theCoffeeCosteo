import { expect, it } from 'vitest';
import {
  diasEntre,
  enZona,
  fechaValida,
  frescura,
  momentoPedido,
  sumarDias,
} from '../../lib/sucursales/tiempo';
import { CacheTtl, semaforo } from '../../lib/sucursales/cache';

it('valida fechas reales y suma días cruzando meses', () => {
  expect(fechaValida('2026-02-29')).toBe(false);
  expect(fechaValida('2026-10-22')).toBe(true);
  expect(fechaValida('22-10-2026')).toBe(false);
  expect(sumarDias('2026-10-22', -7)).toBe('2026-10-15');
  expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  expect(diasEntre('2026-10-13', '2026-10-19')).toBe(6);
});

it('"hoy" de Ciudad Juárez respeta el horario estacional (UTC−6 en octubre, UTC−7 desde el 1-nov)', () => {
  const z = 'America/Ciudad_Juarez';
  expect(enZona(new Date('2026-10-22T18:03:01Z'), z)).toEqual({
    fecha: '2026-10-22',
    segundo: 12 * 3600 + 3 * 60 + 1,
  });
  expect(enZona(new Date('2026-11-02T18:00:00Z'), z).segundo).toBe(11 * 3600);
  // Medianoche local: a las 05:59Z del 23-oct todavía es 22-oct en Juárez.
  expect(enZona(new Date('2026-10-23T05:59:00Z'), z).fecha).toBe('2026-10-22');
  // No es la zona de Ciudad de México después del cambio.
  expect(enZona(new Date('2026-11-02T18:00:00Z'), 'America/Mexico_City').segundo).toBe(12 * 3600);
});

it('interpreta createdAt según el modo de la sucursal, sin doble conversión', () => {
  const z = 'America/Ciudad_Juarez';
  expect(momentoPedido('2026-10-21T21:55:14.000Z', 'local-etiquetada-z', z)).toEqual({
    fecha: '2026-10-21',
    segundo: 21 * 3600 + 55 * 60 + 14,
  });
  // Modo UTC real: 21:55Z = 15:55 en Juárez (UTC−6).
  expect(momentoPedido('2026-10-21T21:55:14.000Z', 'utc', z)).toEqual({
    fecha: '2026-10-21',
    segundo: 15 * 3600 + 55 * 60 + 14,
  });
  expect(momentoPedido('2026-10-21 21:55:14', 'local-etiquetada-z', z)).toBeNull();
  expect(momentoPedido('2026-10-21T25:00:00.000Z', 'local-etiquetada-z', z)).toBeNull();
});

it('frescura sin huecos: <120 s, 120–300 s, >300 s y error', () => {
  const t = 1_000_000;
  expect(frescura(t, t + 119_999, false)).toBe('actualizado');
  expect(frescura(t, t + 120_000, false)).toBe('pendiente');
  expect(frescura(t, t + 300_000, false)).toBe('pendiente');
  expect(frescura(t, t + 300_001, false)).toBe('retrasado');
  expect(frescura(t, t + 1000, true)).toBe('error');
  expect(frescura(null, t, false)).toBe('error');
});

it('caché: TTL, agrupación de peticiones simultáneas, recarga forzada con edad mínima y tope', async () => {
  let ahora = 0;
  const c = new CacheTtl<number>(2, () => ahora);
  let cargas = 0;
  const cargar = async () => ++cargas;
  const [a, b] = await Promise.all([c.obtener('k', cargar, () => 1000), c.obtener('k', cargar, () => 1000)]);
  expect([a, b, cargas]).toEqual([1, 1, 1]);
  ahora = 500;
  expect(await c.obtener('k', cargar, () => 1000, { forzar: true, edadMinima: 600 })).toBe(1);
  ahora = 700;
  expect(await c.obtener('k', cargar, () => 1000, { forzar: true, edadMinima: 600 })).toBe(2);
  ahora = 2000;
  expect(await c.obtener('k', cargar, () => 1000)).toBe(3);
  await c.obtener('x', cargar, () => 1000);
  await c.obtener('y', cargar, () => 1000);
  expect(c.tamano).toBe(2);
});

it('semáforo: nunca más de N tareas simultáneas', async () => {
  const limitar = semaforo(2);
  let activas = 0;
  let maximo = 0;
  const tarea = () =>
    limitar(async () => {
      activas++;
      maximo = Math.max(maximo, activas);
      await new Promise((r) => setTimeout(r, 5));
      activas--;
    });
  await Promise.all(Array.from({ length: 7 }, tarea));
  expect(maximo).toBe(2);
});
