import { Marco } from '../../../components/portal/marco';
import { Encabezado, Tarjeta, Vacio } from '../../../components/portal/piezas';
import { MexicoResumen } from '../../../components/inicio/mexico';
import {
  VistaBi,
  VistaComercializadora,
  VistaCosteo,
  VistaCrm,
  VistaFranquiciatarios,
} from '../../../components/inicio/vistas';
import type { IdModulo } from '../../../lib/portal/modulos';

/**
 * Inicio y CRM con datos sintéticos: ?modulos (Inicio) o ?crm (panel del CRM).
 * Inicio: &ver=costeo,crm,… limita los módulos visibles (como los permisos); por omisión, todos. El Tablero México lee
 * /api/sucursales/tablero con el fetch falso de tablero-mexico.tsx.
 */
const TODOS: IdModulo[] = ['costeo', 'crm', 'sucursales', 'bi', 'comercializadora', 'franquiciatarios'];
const ver = new URLSearchParams(window.location.search).get('ver');
const visibles = ver ? TODOS.filter((m) => ver.split(',').includes(m)) : TODOS;

export function VistaModulos({ seccion }: { seccion: 'inicio' | 'crm' }) {
  return (
    <Marco perfil={{ nombre: 'Usuario Prueba', rol: 'admin' }} seccion={seccion} visibles={visibles}>
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      {seccion === 'inicio' ? (
        <div className="vitrina space-y-7">
          <Encabezado
            area="Hola, Usuario"
            titulo="Resumen de hoy"
            descripcion="Lunes 23 de noviembre · lo más importante de cada módulo"
          />
          <div className="space-y-5">
            {visibles.includes('sucursales') && <MexicoResumen />}
            <div className="columns-1 gap-5 md:columns-2 2xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
              {visibles.includes('bi') && <VistaBi d={BI} />}
              {visibles.includes('costeo') && <VistaCosteo d={COSTEO} />}
              {visibles.includes('crm') && <VistaCrm d={CRM} />}
              {visibles.includes('comercializadora') && <VistaComercializadora d={COM} />}
              {visibles.includes('franquiciatarios') && <VistaFranquiciatarios d={FRANQ} />}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Encabezado
            area="CRM Franquicias"
            titulo="Panel"
            descripcion="Pipeline de tiendas, prospectos, contactos y actividades."
          />
          <Tarjeta cuerpo={false}>
            <Vacio titulo="El CRM se está preparando">
              Las pantallas de tiendas, prospectos, contactos y actividades llegan con la importación de Zoho.
            </Vacio>
          </Tarjeta>
        </>
      )}
    </Marco>
  );
}

const BI = {
  desde: '2026-11-01',
  hasta: '2026-11-23',
  tiendas: 79,
  mes: { ventaCent: 1_184_532_40_0, tickets: 98_214, ticketCent: 12_061, upt: 1.42 },
  anterior: { ventaCent: 1_102_118_00_0, tickets: 95_870, ticketCent: 11_496, upt: 1.4 },
};
const COSTEO = {
  productos: 114,
  foodCost: 0.268,
  objetivo: 0.55,
  salud: { ok: 78, bajo: 21, pierde: 9, 'sin-precio': 6 },
  canales: [
    { nombre: 'Mostrador', margen: 0.66 },
    { nombre: 'App', margen: 0.62 },
    { nombre: 'Rappi', margen: 0.41 },
    { nombre: 'Uber Eats', margen: 0.38 },
  ],
  peores: [
    { producto: 'Croque Monsieur', tamano: 'Único', margen: -0.04 },
    { producto: 'Cold drip V60', tamano: 'Chica', margen: 0.21 },
    { producto: 'Matcha Iced Latte', tamano: 'Grande', margen: 0.33 },
  ],
};
const CRM = {
  total: 3_850,
  etapas: [
    { nombre: 'Prospecto calificado', cards: 64 },
    { nombre: 'Presentación', cards: 41 },
    { nombre: 'Búsqueda de local', cards: 28 },
    { nombre: 'Aprobación de local', cards: 17 },
    { nombre: 'Firma de contrato', cards: 9 },
    { nombre: 'Proyecto y obra', cards: 12 },
    { nombre: 'Preapertura', cards: 5 },
  ],
  bloqueadas: 112,
  listas: 23,
  vencen14: 7,
  vencidas: 2,
  proximas: [
    { tienda: 'Querétaro Juriquilla', titulo: 'Apertura estimada', dias: 3 },
    { tienda: 'Monterrey Valle', titulo: 'Entrega de local', dias: 6 },
    { tienda: 'Mérida Altabrisa', titulo: 'Firma de contrato', dias: 11 },
  ],
};
const COM = {
  proyeccion: { calculado: '2026-11-23T06:10:00Z', sinCosto: 3, sinProveedor: 1 },
  cierres: [
    { proveedor: 'Lácteos del Bajío', fin: '2026-11-30', ultimoDia: '2026-11-25' },
    { proveedor: 'Panificadora Norte', fin: '2026-12-02', ultimoDia: null },
  ],
  ov: { semana: '2026-11-23', tiendas: 12, errores: 0, piezas: 4_382, montoCent: 386_540_00 },
};
const seccionesDe = (a: number, d: number, m: number, c: number, noes = 0) => [
  { clave: 'apertura' as const, nombre: 'Apertura', avance: a, estado: 'en-curso', noes },
  { clave: 'durante' as const, nombre: 'Durante la operación', avance: d, estado: 'en-curso', noes: 0 },
  { clave: 'medio' as const, nombre: 'Medio turno', avance: m, estado: 'pendiente', noes: 0 },
  { clave: 'cierre' as const, nombre: 'Fin de turno', avance: c, estado: 'pendiente', noes: 0 },
];
const FRANQ = {
  dia: '2026-11-23',
  mas: 78,
  sucursales: [
    { companyId: 514, nombre: 'Essentia', incidencias: 1, secciones: seccionesDe(1, 0.6, 0.3, 0, 1) },
    { companyId: 612, nombre: 'Cd. Juárez', incidencias: 0, secciones: seccionesDe(1, 0.8, 0.5, 0) },
    { companyId: 384, nombre: 'Bonampak', incidencias: 0, secciones: seccionesDe(0.4, 0, 0, 0) },
    { companyId: 513, nombre: 'Rubén Darío', incidencias: 0, secciones: seccionesDe(0, 0, 0, 0) },
    { companyId: 532, nombre: 'Ventura', incidencias: 0, secciones: seccionesDe(1, 1, 1, 0.2) },
  ],
};
