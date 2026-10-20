import type { ComponentProps } from 'react';
export function usePathname() {
  return '/productos';
}
export function useSearchParams() {
  return new URLSearchParams();
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
