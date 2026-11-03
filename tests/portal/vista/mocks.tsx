import type { ComponentProps } from 'react';
export function usePathname() {
  return '/productos';
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
export function useRouter() {
  return { push: () => {}, refresh: () => {} };
}
export default function Link(props: ComponentProps<'a'>) {
  return <a {...props} />;
}
export async function guardarReceta(_: unknown) {
  return { error: 'Vista de prueba: los datos se conservan en pantalla y no se escriben en una base.' };
}
export async function guardarRegistro(..._: unknown[]) {
  return { error: 'Vista de prueba: no se escriben datos.' };
}
export async function salir() {}
// Acciones del CRM en la vista de prueba: mueven en pantalla y no escriben en ninguna base.
const sinBase = async (..._: unknown[]) => ({ error: 'Vista de prueba: no se escriben datos.' });
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
export async function avanzarCard(..._: unknown[]) {
  return { error: 'Bloqueada: faltan 2 requisito(s) de esta etapa (vista de prueba)' };
}
export const cumplirRequisito = sinBase;
export const validarRequisito = sinBase;
export const revertirRequisito = sinBase;
export const liberarCandado = sinBase;
export const cancelarEnCascada = sinBase;
export const crearFranquiciatario = sinBase;
export const guardarCard = sinBase;
export const asignarVendedor = sinBase;
export const crearSucursal = sinBase;
export const prepararDocumento = sinBase;
export const retirarDocumento = sinBase;
export const atenderAviso = sinBase;
export const guardarMembresia = sinBase;
export const quitarMembresia = sinBase;
export const agregarFestivo = sinBase;
export const quitarFestivo = sinBase;
export const editarRequisito = sinBase;
