import '@/components/sucursales/tablero-mexico.css';
import { accesos, sesionSucursales } from '@/lib/supabase/sesion';
import { tieneCosteo } from '@/lib/portal/roles';
import { CIUDADES_TABLERO, sucursalesDeCiudad } from '@/lib/sucursales/alcance';
import { Encabezado } from '@/components/portal/piezas';
import { VistasMexico, type Vista } from '@/components/sucursales/vistas-mexico';

const VISTAS: Vista[] = ['costeo', 'consumo', 'servicio'];

/**
 * Tablero Guadalajara (docs/sucursales/19): las 11 sucursales de la ciudad, completas, para todo usuario con el módulo
 * Sucursales (decisión de Carlos, 2026-11-27), con las secciones de una sucursal y el mapa de la ciudad. Costeo solo
 * con permiso (rol de Costeo o módulo sucursales_costeo); la base lo vuelve a exigir.
 */
export default async function TableroGuadalajara({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const s = await sesionSucursales();
  const a = await accesos(s.db, s.perfil.user_id);
  const puedeCostear = tieneCosteo(s.perfil.rol) || a.sucursales_costeo !== undefined;
  const lista = sucursalesDeCiudad('guadalajara');
  const vista = VISTAS.find((v) => v === q.vista) ?? 'ventas';
  return (
    <>
      <Encabezado
        area="Sucursales"
        titulo="Tablero Guadalajara"
        descripcion={`La venta (se actualiza cada 10 minutos), ${puedeCostear ? 'el costeo y ' : ''}el consumo por mes y el nivel de servicio en Rappi de las ${lista.length} sucursales de Guadalajara.`}
      />
      <VistasMexico
        vistaInicial={vista}
        ciudad={{ clave: 'guadalajara', nombre: CIUDADES_TABLERO.guadalajara }}
        puedeCostear={puedeCostear}
        asignadas={s.companias}
      />
    </>
  );
}
