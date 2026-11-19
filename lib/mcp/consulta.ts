import { z } from 'zod';

/** Una herramienta de solo lectura: el MCP (y el chat del portal, para las de recetas) la registran igual. */
export interface Consulta {
  nombre: string;
  descripcion: string;
  esquema: z.ZodObject;
  ejecutar: (entrada: unknown) => Promise<Record<string, unknown>>;
}

/** Error con un mensaje apto para quien pregunta: el MCP lo devuelve tal cual (los demás, con un texto genérico). */
export class ErrorConsulta extends Error {}

export function consulta<S extends z.ZodRawShape>(
  nombre: string,
  descripcion: string,
  esquema: z.ZodObject<S>,
  consultar: (entrada: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>,
): Consulta {
  return {
    nombre,
    descripcion,
    esquema,
    ejecutar: async (entrada) => {
      const r = esquema.safeParse(entrada);
      if (!r.success) throw new ErrorConsulta(r.error.issues.map((i) => i.message).join(' '));
      return consultar(r.data);
    },
  };
}

export function exigir<T>(r: { data: T | null; error: unknown }): NonNullable<T> {
  if (r.error || r.data === null) throw new Error('No se pudo consultar la base. Intenta de nuevo.');
  return r.data as NonNullable<T>;
}

export function resultadoPagina<T>(filas: T[], p: number, n: number) {
  return { datos: filas.slice(0, n), pagina: p, siguiente_pagina: filas.length > n ? p + 1 : null };
}

/** Centavos → pesos en todo el valor: `venta_cent: 12345` se publica como `venta: 123.45`. */
export function aPesos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(aPesos);
  if (valor && typeof valor === 'object')
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) =>
        k.endsWith('_cent') && typeof v === 'number' ? [k.slice(0, -5), Math.round(v) / 100] : [k, aPesos(v)],
      ),
    );
  return valor;
}

const DIA_MS = 86_400_000;
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

// new Date('2026-13-01…') es Invalid Date: se revisa antes de toISOString(), que lanzaría.
export const fecha = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, 'Fecha inválida: usa AAAA-MM-DD (por ejemplo 2026-11-19).');
export const pagina = z.number().int().min(1).max(10000).default(1);
export const limite = z.number().int().min(1).max(50).default(25);
export const listaSucursales = z.array(z.number().int().positive()).min(1).max(400).optional();
