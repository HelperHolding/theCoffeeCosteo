import type { ComponentProps } from 'react';
import * as flujo from './flujo';
import { GRABAR as GRABAR_FRANQ } from './franq-real';

// Videos de Franquiciatarios (?franquiciatarios&grabar): /franquiciatarios/514/<pantalla> → vista del arnés.
const PF = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
function rutaFranq(href: string): string | null {
  if (!GRABAR_FRANQ) return null;
  const u = new URL(href, 'http://x');
  const m = /^\/franquiciatarios(?:\/(\d+)(?:\/([a-z-]+))?)?\/?$/.exec(u.pathname);
  if (!m) return null;
  const q = new URLSearchParams();
  q.set('franquiciatarios', '');
  q.set('grabar', '');
  q.set('rol', PF.get('rol') ?? 'barista');
  q.set('vista', m[1] ? (m[2] ?? 'hoy') : 'sucursales');
  u.searchParams.forEach((v, k) => q.set(k, v));
  return `/?${q.toString().replace(/=(&|$)/g, '$1')}`;
}
// ?ruta=/crm/pendientes simula la página (p. ej. para las sugerencias del agente); con ?grabar, Mis pendientes.
export function usePathname() {
  const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  if (GRABAR_FRANQ) {
    const v = p.get('vista') ?? 'hoy';
    return v === 'sucursales' ? '/franquiciatarios' : `/franquiciatarios/514${v === 'hoy' ? '' : `/${v}`}`;
  }
  return p.get('ruta') ?? (p.has('grabar') ? '/crm/pendientes' : '/productos');
}
export function useSearchParams() {
  return new URLSearchParams();
}
export function redirect(_: string): never {
  throw new Error('redirect en la vista de prueba');
}
export function notFound(): never {
  throw new Error('notFound en la vista de prueba');
}
// Con ?grabar, refresh recarga (el estado del video vive en sessionStorage) y push navega dentro del arnés.
export function useRouter() {
  if (GRABAR_FRANQ)
    return {
      push: (href: string) => window.location.assign(rutaFranq(href) ?? href),
      refresh: () => window.dispatchEvent(new Event('franq-cambio')),
    };
  if (!flujo.GRABANDO) return { push: () => {}, refresh: () => {} };
  return {
    push: (href: string) => window.location.assign(flujo.mapear(href)),
    refresh: () => window.location.reload(),
  };
}
export default function Link(props: ComponentProps<'a'>) {
  const franq = typeof props.href === 'string' ? rutaFranq(props.href) : null;
  if (franq)
    return (
      <a
        {...props}
        href={franq}
        onClick={(e) => {
          props.onClick?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          window.location.assign(franq);
        }}
      />
    );
  if (!flujo.GRABANDO || typeof props.href !== 'string' || !props.href.startsWith('/crm'))
    return <a {...props} />;
  const destino = flujo.mapear(props.href);
  return (
    <a
      {...props}
      href={destino}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        window.location.assign(destino);
      }}
    />
  );
}
/** Cliente de Supabase en el navegador: en la vista de prueba la subida a Storage siempre funciona. */
export function cliente() {
  return { storage: { from: () => ({ upload: async () => ({ error: null }) }) } };
}
export async function guardarReceta(_: unknown) {
  return { error: 'Vista de prueba: los datos se conservan en pantalla y no se escriben en una base.' };
}
export async function guardarRegistro(..._: unknown[]) {
  return { error: 'Vista de prueba: no se escriben datos.' };
}
export async function salir() {}
// Acciones del CRM en la vista de prueba: mueven en pantalla y no escriben en ninguna base.
// Con ?grabar (videos por rol) las acciones responden como si se hubieran guardado; el video muestra el resultado.
const grabando = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('grabar');
const sinBase = async (..._: unknown[]) =>
  grabando ? {} : { error: 'Vista de prueba: no se escriben datos.' };
export async function moverTienda(..._: unknown[]) {
  return { version: 2, posicion: 1, renumerada: false };
}
export const crearTienda = sinBase;
export const guardarTienda = sinBase;
export const archivarTienda = sinBase;
export const agregarNota = sinBase;
export const crearActividad = sinBase;
export const cambiarEstadoActividad = sinBase;
export const crearChecklist = sinBase;
export const agregarElemento = sinBase;
export const marcarElemento = sinBase;
export const prepararArchivo = sinBase;
export const confirmarArchivo = sinBase;
export const archivarArchivo = sinBase;
export const enlaceArchivo = sinBase;
export const cambiarEtapaProspecto = sinBase;
// CRM Unificado: avanzar responde como la base cuando falta un requisito (para ver el rollback).
export async function avanzarCard(...a: unknown[]) {
  if (flujo.FLUJO)
    return flujo.mover(
      a[0] as string,
      a[1] as string,
      a[2] as string,
      a[4] as string | null,
      a[5] as string | null,
    );
  if (grabando) return {};
  return { error: 'Bloqueada: faltan 2 requisito(s) de esta etapa (vista de prueba)' };
}
export async function cumplirRequisito(...a: unknown[]) {
  if (flujo.FLUJO) return flujo.cumplir(a[1] as string, a[2] as string, a[3] as Record<string, unknown>);
  return sinBase();
}
export const validarRequisito = sinBase;
export const revertirRequisito = sinBase;
export const liberarCandado = sinBase;
export const cancelarEnCascada = sinBase;
export async function crearFranquiciatario(datos: Record<string, unknown>) {
  if (flujo.FLUJO) return flujo.crearLead(datos);
  return sinBase();
}
export async function guardarCard(...a: unknown[]) {
  if (flujo.FLUJO) return flujo.guardarDatos(a[0] as string, a[3] as Record<string, unknown>);
  return sinBase();
}
export const reasignarVendedor = sinBase;
export const crearSucursal = sinBase;
export async function prepararDocumento(...a: unknown[]) {
  if (flujo.FLUJO)
    return flujo.prepararArchivo(a[1] as string, (a[2] as { nombre: string }).nombre, a[3] as string);
  return grabando ? { id: 'doc-prueba', ruta: 'video/doc-prueba' } : sinBase();
}
export const retirarDocumento = sinBase;
export async function atenderAviso(id: string) {
  if (flujo.FLUJO) return flujo.atender(id);
  return sinBase();
}
export const guardarMembresia = sinBase;
export const quitarMembresia = sinBase;
export const agregarFestivo = sinBase;
export const quitarFestivo = sinBase;
export const editarRequisito = sinBase;
