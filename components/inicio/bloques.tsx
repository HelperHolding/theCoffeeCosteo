import {
  resumenBi,
  resumenComercializadora,
  resumenCosteo,
  resumenCrm,
  resumenFranquiciatarios,
} from '@/lib/inicio/resumenes';
import type { IdModulo } from '@/lib/portal/modulos';
import { Bloque, FalloBloque } from './bloque';
import { VistaBi, VistaComercializadora, VistaCosteo, VistaCrm, VistaFranquiciatarios } from './vistas';

/** Bloques de servidor: leen su resumen (con el permiso de su módulo) y lo pintan. Cada uno va en su Suspense. */
function Fallo({ modulo, error }: { modulo: IdModulo; error: string }) {
  return (
    <Bloque modulo={modulo}>
      <FalloBloque texto={error} />
    </Bloque>
  );
}

export async function BloqueCosteo() {
  const r = await resumenCosteo();
  return r.ok ? <VistaCosteo d={r.datos} /> : <Fallo modulo="costeo" error={r.error} />;
}
export async function BloqueCrm() {
  const r = await resumenCrm();
  return r.ok ? <VistaCrm d={r.datos} /> : <Fallo modulo="crm" error={r.error} />;
}
export async function BloqueBi() {
  const r = await resumenBi();
  return r.ok ? <VistaBi d={r.datos} /> : <Fallo modulo="bi" error={r.error} />;
}
export async function BloqueComercializadora() {
  const r = await resumenComercializadora();
  return r.ok ? <VistaComercializadora d={r.datos} /> : <Fallo modulo="comercializadora" error={r.error} />;
}
export async function BloqueFranquiciatarios() {
  const r = await resumenFranquiciatarios();
  return r.ok ? <VistaFranquiciatarios d={r.datos} /> : <Fallo modulo="franquiciatarios" error={r.error} />;
}
