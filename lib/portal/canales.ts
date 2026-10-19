import type { Resumen } from '../supabase/database.types';

// Mostrador y App propia venden al mismo precio. Cuando sus números coinciden se muestran como un
// solo canal; si un día difieren (precio manual, comisión o envase distintos) se muestran por separado.
export const MOSTRADOR = 'Mostrador';
export const APP_PROPIA = 'App propia';
export const FUSIONADO = 'App propia/Mostrador';

type Campo = 'precio_canal' | 'precio_calculado' | 'precio_manual' | 'margen' | 'margen_bruto';
const TODOS: Campo[] = ['precio_canal', 'precio_calculado', 'precio_manual', 'margen', 'margen_bruto'];

const igual = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.005;

export const coinciden = (a: Pick<Resumen, Campo>, b: Pick<Resumen, Campo>, campos: Campo[] = TODOS) =>
  campos.every((c) => igual(a[c], b[c]));

/** El canal de la fila incluye `canal` (sirve para filtros y enlaces que usan "Mostrador" o "App propia"). */
export const esCanal = (fila: string, canal: string) => fila === canal || fila.split('/').includes(canal);

/**
 * Une Mostrador y App propia de cada producto × tamaño en una fila "App propia/Mostrador" con los
 * números del Mostrador. `unir` agrega campos propios del llamador (p. ej. la alerta de ambos canales).
 */
export function fusionarCanales<T extends Resumen>(
  filas: T[],
  opciones: { campos?: Campo[]; unir?: (mostrador: T, app: T) => Partial<T> } = {},
): T[] {
  const clave = (f: T) => `${f.producto_id}:${f.tamano_id}`;
  const apps = new Map(filas.filter((f) => f.canal === APP_PROPIA).map((f) => [clave(f), f]));
  const unidas = new Set<T>();
  const salida: T[] = [];
  for (const f of filas) {
    if (f.canal === MOSTRADOR) {
      const app = apps.get(clave(f));
      if (app && coinciden(f, app, opciones.campos)) {
        unidas.add(app);
        salida.push({ ...f, ...opciones.unir?.(f, app), canal: FUSIONADO });
        continue;
      }
    }
    salida.push(f);
  }
  return salida.filter((f) => !unidas.has(f));
}
