'use client';
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RespuestaProductos } from '@/lib/sucursales/contratos';
import { CODIGO_GENERICO, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { enZona, sumarDias } from '@/lib/sucursales/tiempo';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { ConInfo } from '@/components/portal/con-info';
import { claseCampo } from '@/lib/crm/formato';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import { NOTA_LINEAS } from './en-vivo';
import { dinero, fechaCorta, numero, porcentaje, textoConciliacion } from './formato';
import { useLectura } from './use-lectura';
import { BarraCelda, Etiqueta, TIPOS, tipoPersonalizacion } from './colores';
import { CeldaCosteo, TarjetaCosteo } from './costeo';
import { infoProductos } from './info-tableros';

const PERIODOS = [
  { id: 'hoy', nombre: 'Hoy', dias: 0, fin: 0 },
  { id: 'ayer', nombre: 'Ayer', dias: 0, fin: -1 },
  { id: '7d', nombre: 'Últimos 7 días', dias: 6, fin: 0 },
  { id: '28d', nombre: 'Últimos 28 días', dias: 27, fin: 0 },
] as const;
type Orden = 'importe' | 'pedidos' | 'lineas' | 'nombre';

export function Productos({
  companyId,
  origen,
  zona,
}: {
  companyId: number;
  origen: FiltroOrigen;
  zona: string;
}) {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['id']>('hoy');
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState<Orden>('importe');
  const [abierto, setAbierto] = useState<string | null>(null);
  // "Hoy" de la sucursal (no del navegador); se recalcula al elegir periodo.
  const hoy = enZona(new Date(), zona).fecha;
  const p = PERIODOS.find((x) => x.id === periodo)!;
  const hasta = sumarDias(hoy, p.fin);
  const desde = sumarDias(hasta, -p.dias);
  const { datos, error, cargando, recargar } = useLectura<RespuestaProductos>(
    `/api/sucursales/${companyId}/productos?desde=${desde}&hasta=${hasta}&origen=${origen}`,
  );
  const lista = useMemo(() => {
    if (!datos) return [];
    const q = buscar.trim().toLocaleLowerCase('es-MX');
    const f = q
      ? datos.productos.filter((x) => x.nombre.toLocaleLowerCase('es-MX').includes(q))
      : datos.productos;
    const comp: Record<Orden, (a: (typeof f)[number], b: (typeof f)[number]) => number> = {
      importe: (a, b) => b.importeCent - a.importeCent,
      pedidos: (a, b) => b.pedidos - a.pedidos,
      lineas: (a, b) => b.lineas - a.lineas,
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'),
    };
    return [...f].sort(comp[orden]);
  }, [datos, buscar, orden]);

  const m = datos?.sucursal.moneda ?? 'MXN';
  const maxImporte = Math.max(1, ...(datos?.productos ?? []).map((x) => x.importeCent));
  const maxVeces = Math.max(1, ...(datos?.personalizaciones ?? []).map((c) => c.veces));
  return (
    <div className="space-y-6" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-end gap-3 p-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Periodo</span>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
            className={`${claseCampo} w-48`}
          >
            {PERIODOS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1 text-sm sm:max-w-xs">
          <span className="mb-1 block font-medium text-ink-2">Buscar producto</span>
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
            <option value="pedidos">Pedidos</option>
            <option value="lineas">Líneas</option>
            <option value="nombre">Nombre</option>
          </select>
        </label>
        <p className="pb-2 text-xs text-muted-foreground">
          {desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`}
        </p>
      </div>

      {!datos ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto filas={1} />
        )
      ) : (
        <>
          {error && <ErrorCarga error={error} alReintentar={recargar} />}
          <AvisosLectura lecturas={[{ nombre: 'Periodo', info: datos.lectura }]} />
          {datos.lectura.estado !== 'error' && (
            <>
              <p className="placa px-3 py-2 text-sm text-ink-2">
                Venta {dinero(datos.totales.ventaCent, m)} · {numero(datos.totales.pedidos)} pedidos ·{' '}
                {numero(datos.totales.lineas)} líneas · suma por productos{' '}
                {dinero(datos.conciliacion.productosCent, m)}
                {textoConciliacion(datos.conciliacion, m)}
              </p>
              {datos.costeo && <TarjetaCosteo c={datos.costeo} moneda={m} />}
              <ConInfo info={infoProductos(datos).productos}>
                <Tarjeta
                  titulo="Productos"
                  descripcion="Importe atribuible = producto + sus personalizaciones, una sola vez."
                  cuerpo={false}
                >
                  {lista.length === 0 ? (
                    <Vacio titulo={buscar ? 'Ningún producto coincide' : 'Sin ventas en el periodo'} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="tabla w-full">
                        <thead>
                          <tr>
                            <th scope="col">Producto</th>
                            <th scope="col" className="numero">
                              Importe
                            </th>
                            <th scope="col" className="numero">
                              % venta
                            </th>
                            <th scope="col" className="numero">
                              Pedidos
                            </th>
                            <th scope="col" className="numero">
                              <abbr title={NOTA_LINEAS}>Líneas*</abbr>
                            </th>
                            <th scope="col" className="numero">
                              Extra personalización
                            </th>
                            {datos.costeo && <th scope="col">Costeo (costo actual)</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((x) => {
                            const exp = abierto === x.clave;
                            return (
                              <Fragment key={x.clave}>
                                <tr>
                                  <td>
                                    <button
                                      type="button"
                                      aria-expanded={exp}
                                      onClick={() => setAbierto(exp ? null : x.clave)}
                                      className="flex items-center gap-1.5 text-left font-medium"
                                    >
                                      {exp ? (
                                        <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
                                      ) : (
                                        <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
                                      )}
                                      {x.nombre}
                                      {x.sinCodigo && (
                                        <span className="text-xs font-normal text-muted-foreground">
                                          sin código
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                  <td className="numero">{dinero(x.importeCent, m)}</td>
                                  <td className="numero">
                                    <span className="flex items-center justify-end gap-2">
                                      <span className="w-20">
                                        <BarraCelda valor={x.importeCent} max={maxImporte} />
                                      </span>
                                      <span className="w-12">{porcentaje(x.participacion)}</span>
                                    </span>
                                  </td>
                                  <td className="numero">{numero(x.pedidos)}</td>
                                  <td className="numero">{numero(x.lineas)}</td>
                                  <td className="numero">{dinero(x.extraCustomsCent, m)}</td>
                                  {datos.costeo && (
                                    <td>
                                      <CeldaCosteo
                                        c={x.costeo}
                                        moneda={m}
                                        generico={x.codigo === CODIGO_GENERICO && !x.sinCodigo}
                                      />
                                    </td>
                                  )}
                                </tr>
                                {exp && (
                                  <tr>
                                    <td colSpan={datos.costeo ? 7 : 6} className="bg-surface-2/50">
                                      <div className="grid gap-4 py-2 text-sm sm:grid-cols-2">
                                        <div>
                                          <p className="mb-1 font-semibold">Tamaños</p>
                                          {x.tamanos.length ? (
                                            <ul className="flex flex-wrap gap-1.5">
                                              {x.tamanos.map((t) => (
                                                <li key={t.nombre}>
                                                  <Etiqueta color={TIPOS.tamano.color}>
                                                    {t.nombre} · {numero(t.lineas)}
                                                  </Etiqueta>
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <p className="text-muted-foreground">Sin tamaño registrado.</p>
                                          )}
                                        </div>
                                        <div>
                                          <p className="mb-1 font-semibold">Personalizaciones más pedidas</p>
                                          {x.customs.length ? (
                                            <ul className="flex flex-wrap gap-1.5">
                                              {x.customs.map((c) => (
                                                <li key={c.nombre}>
                                                  <Etiqueta
                                                    color={TIPOS[tipoPersonalizacion(c.nombre)].color}
                                                    titulo={TIPOS[tipoPersonalizacion(c.nombre)].nombre}
                                                  >
                                                    {c.nombre} · {numero(c.veces)}
                                                    {c.importeCent > 0 && ` · ${dinero(c.importeCent, m)}`}
                                                  </Etiqueta>
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <p className="text-muted-foreground">Sin personalizaciones.</p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="px-5 pb-4 pt-2 text-xs text-muted-foreground">* {NOTA_LINEAS}</p>
                    </div>
                  )}
                </Tarjeta>
              </ConInfo>
              <ConInfo info={infoProductos(datos).personalizaciones}>
                <Tarjeta
                  titulo="Personalizaciones del periodo"
                  descripcion="Frecuencia e importe adicional cobrado (sin tamaños)."
                  cuerpo={false}
                >
                  {datos.personalizaciones.length === 0 ? (
                    <Vacio titulo="Sin personalizaciones en el periodo" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="tabla w-full">
                        <thead>
                          <tr>
                            <th scope="col">Personalización</th>
                            <th scope="col">Tipo</th>
                            <th scope="col" className="numero">
                              Veces
                            </th>
                            <th scope="col" className="numero">
                              Importe adicional
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {datos.personalizaciones.map((c) => {
                            const tipo = TIPOS[tipoPersonalizacion(c.nombre)];
                            return (
                              <tr key={c.nombre}>
                                <td className="font-medium">{c.nombre}</td>
                                <td>
                                  <Etiqueta color={tipo.color}>{tipo.nombre}</Etiqueta>
                                </td>
                                <td className="numero">
                                  <span className="flex items-center justify-end gap-2">
                                    <span className="w-20">
                                      <BarraCelda valor={c.veces} max={maxVeces} color={tipo.color} />
                                    </span>
                                    <span className="w-10">{numero(c.veces)}</span>
                                  </span>
                                </td>
                                <td className="numero">{dinero(c.importeCent, m)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Tarjeta>
              </ConInfo>
            </>
          )}
        </>
      )}
    </div>
  );
}
