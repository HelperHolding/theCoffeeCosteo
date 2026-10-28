'use client';
import { useMemo, useState } from 'react';
import type { RespuestaCosteo, SucursalInfo } from '@/lib/sucursales/contratos';
import { CODIGO_GENERICO, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { claseCampo } from '@/lib/crm/formato';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import { BarraCelda } from './colores';
import { CeldaCosteo, CeldaGanancia, TarjetaCosteo } from './costeo';
import { dinero, numero, porcentaje } from './formato';
import { rango, SelectorPeriodo, type Periodo } from './periodo';
import { useLectura } from './use-lectura';

type Orden = 'importe' | 'ganancia' | 'lineas' | 'nombre';

/**
 * Sección Costeo: el bloque «Costeo · calculado con el costo actual de Costeo» que antes iba en Productos (mismas
 * cifras: mismas ventas, identidad y costos) y el costeo por producto. La API responde 403 sin permiso de Costeo.
 */
export function SeccionCosteo({
  sucursal,
  origen,
  periodo,
  alCambiarPeriodo,
}: {
  sucursal: SucursalInfo;
  origen: FiltroOrigen;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
}) {
  const { desde, hasta } = rango(periodo, sucursal.zona);
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState<Orden>('importe');
  const { datos, error, cargando, recargar } = useLectura<RespuestaCosteo>(
    `/api/sucursales/${sucursal.companyId}/costeo?desde=${desde}&hasta=${hasta}&origen=${origen}`,
  );
  const m = sucursal.moneda;
  const lista = useMemo(() => {
    if (!datos) return [];
    const q = buscar.trim().toLocaleLowerCase('es-MX');
    const f = q
      ? datos.productos.filter(
          (x) =>
            x.nombre.toLocaleLowerCase('es-MX').includes(q) ||
            x.costeo?.receta.toLocaleLowerCase('es-MX').includes(q),
        )
      : datos.productos;
    const comp: Record<Orden, (a: (typeof f)[number], b: (typeof f)[number]) => number> = {
      importe: (a, b) => b.importeCent - a.importeCent,
      lineas: (a, b) => b.lineas - a.lineas,
      // Sin líneas de costeo completo no hay ganancia: van al final.
      ganancia: (a, b) =>
        (b.costeo?.completo.lineas ? b.costeo.completo.margenCent : -Infinity) -
          (a.costeo?.completo.lineas ? a.costeo.completo.margenCent : -Infinity) ||
        b.importeCent - a.importeCent,
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'),
    };
    return [...f].sort(comp[orden]);
  }, [datos, buscar, orden]);
  const maxImporte = Math.max(1, ...(datos?.productos ?? []).map((x) => x.importeCent));

  return (
    <div className="space-y-6" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-end gap-3 p-3">
        <SelectorPeriodo periodo={periodo} zona={sucursal.zona} alCambiar={alCambiarPeriodo} />
        <label className="min-w-48 flex-1 text-sm sm:max-w-xs">
          <span className="mb-1 block font-medium text-ink-2">Buscar producto o receta</span>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className={claseCampo}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Ordenar por</span>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className={`${claseCampo} w-44`}
          >
            <option value="importe">Importe</option>
            <option value="ganancia">Ganancia teórica</option>
            <option value="lineas">Líneas</option>
            <option value="nombre">Nombre</option>
          </select>
        </label>
      </div>

      {!datos ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto filas={2} />
        )
      ) : (
        <>
          {error && <ErrorCarga error={error} alReintentar={recargar} />}
          <AvisosLectura lecturas={[{ nombre: 'Periodo', info: datos.lectura }]} />
          {datos.lectura.estado !== 'error' && (
            <>
              <TarjetaCosteo c={datos.costeo} moneda={m} />
              <Tarjeta
                titulo="Costeo por producto"
                descripcion="Receta enlazada y estado de sus líneas en el periodo. La ganancia teórica solo cuenta las líneas de costeo completo."
                cuerpo={false}
              >
                {lista.length === 0 ? (
                  <Vacio titulo={buscar ? 'Ningún producto coincide' : 'Sin ventas en el periodo'} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tabla w-full">
                      <thead>
                        <tr>
                          <th scope="col">Producto (POS)</th>
                          <th scope="col" className="numero">
                            Importe
                          </th>
                          <th scope="col" className="numero">
                            Líneas
                          </th>
                          <th scope="col">Receta de Costeo</th>
                          <th scope="col" className="numero">
                            <abbr title="Venta sin IVA − costo actual de la receta, solo de las líneas de costeo completo; antes de comisiones">
                              Ganancia teórica
                            </abbr>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((x) => (
                          <tr key={x.clave}>
                            <td className="font-medium">
                              {x.nombre}
                              {x.sinCodigo && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  sin código
                                </span>
                              )}
                            </td>
                            <td className="numero">
                              <span className="flex items-center justify-end gap-2">
                                <span className="w-16">
                                  <BarraCelda valor={x.importeCent} max={maxImporte} />
                                </span>
                                <span className="w-24">{dinero(x.importeCent, m)}</span>
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {porcentaje(x.participacion)}
                              </span>
                            </td>
                            <td className="numero">{numero(x.lineas)}</td>
                            <td>
                              <CeldaCosteo
                                c={x.costeo ?? undefined}
                                moneda={m}
                                generico={x.codigo === CODIGO_GENERICO && !x.sinCodigo}
                              />
                            </td>
                            <td className="numero">
                              <CeldaGanancia c={x.costeo ?? undefined} moneda={m} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Tarjeta>
            </>
          )}
        </>
      )}
    </div>
  );
}
