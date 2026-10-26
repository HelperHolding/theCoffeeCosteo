import type { Conexion } from './fase4';

export type Cierre = 'commit' | 'rollback' | 'fallida';

/**
 * Cierra la transacción y devuelve lo que realmente pasó; nunca da por hecho el COMMIT o el ROLLBACK.
 * - Antes de COMMIT comprueba que la transacción no esté abortada: Postgres responde a COMMIT con ROLLBACK, sin error,
 *   si una sentencia anterior falló.
 * - Si COMMIT o ROLLBACK fallan (red, servidor), el resultado es `fallida` con el error; tras un COMMIT fallido el
 *   estado es incierto y debe verificarse con una conexión nueva.
 */
export async function cerrarTransaccion(db: Pick<Conexion, 'query'>, fin: 'commit' | 'rollback') {
  const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
  if (fin === 'commit') {
    try {
      await db.query('select 1');
    } catch (e) {
      await db.query('rollback').catch(() => {});
      return {
        transaccion: 'fallida' as Cierre,
        error: `La transacción estaba abortada (${mensaje(e)}): no se confirmó nada`,
      };
    }
  }
  try {
    const r = (await db.query(fin)) as { command?: string };
    if (fin === 'commit' && r.command && r.command !== 'COMMIT')
      return {
        transaccion: 'fallida' as Cierre,
        error: `COMMIT respondió ${r.command}: no se confirmó nada`,
      };
    return { transaccion: fin as Cierre };
  } catch (e) {
    if (fin === 'commit') await db.query('rollback').catch(() => {});
    return {
      transaccion: 'fallida' as Cierre,
      error:
        fin === 'commit'
          ? `COMMIT falló (${mensaje(e)}): estado incierto, verificar con una conexión nueva`
          : `ROLLBACK falló (${mensaje(e)}): verificar con una conexión nueva que no quedó nada`,
    };
  }
}

/** Une el error del trabajo con el del cierre, sin perder ninguno. */
export const unirErrores = (...e: (string | undefined)[]) => e.filter(Boolean).join(' · ') || undefined;
