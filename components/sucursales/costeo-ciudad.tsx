'use client';
import { useState } from 'react';
import type { CiudadTablero } from '@/lib/sucursales/alcance';
import type { OrigenCosteo, ProductoCosteoCiudad, RespuestaCosteoCiudad } from '@/lib/sucursales/costeo-mes';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { Segmentos } from '@/components/ui/segmentos';
import { AZUL, COLOR_ORIGEN } from './colores';
import { EnlaceSucursal } from './enlace-sucursal';
import { ErrorCarga, Esqueleto } from './estados';
import { dinero, fechaCorta, numero, porcentaje } from './formato';
import { useLectura } from './use-lectura';

const MXN = 'MXN';
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const nombreMesTitulo = (mes: string) => nombreMes(mes).replace(/^./, (c) => c.toUpperCase());
const ORIGENES: { id: OrigenCosteo; texto: string }[] = [
  { id: 'todos', texto: 'Todo' },
  { id: 'mostrador', texto: 'Mostrador' },
  { id: 'app', texto: 'App' },
  { id: 'rappi', texto: 'Rappi' },
];
/** Un producto entra a «margen más bajo» con al menos estas líneas en el mes (con menos, el margen es ruido). */
const LINEAS_MINIMAS = 30;

/**
 * Costeo de una ciudad por mes cerrado (docs/sucursales/19): el margen bruto teórico de cada sucursal con las mismas
 * reglas de la sección Costeo (solo líneas de costeo completo, venta sin IVA − costo de receta) y los costos del día
 * en que se calculó el mes. Antes de comisiones.
 */
export function CosteoCiudadVista({ ciudad }: { ciudad: CiudadTablero }) {
  const [mes, setMes] = useState<string | null>(null);
  const [origen, setOrigen] = useState<OrigenCosteo>('todos');
  const q = new URLSearchParams({ ciudad: ciudad.clave, origen });
  if (mes) q.set('mes', mes.slice(0, 7));
  const { datos, error, recargar } = useLectura<RespuestaCosteoCiudad>(`/api/sucursales/costeo-ciudad?${q}`);
  if (!datos) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={3} />;
  if (!datos.mes)
    return (
      <Tarjeta>
        <Vacio titulo="Aún no hay meses con costeo">
          El costeo de un mes se calcula al cerrarlo, junto con el consumo (docs/sucursales/19).
        </Vacio>
      </Tarjeta>
    );
  const t = datos.totales;
  const prom = t.completo.margenPct;
  const masVendidos = datos.productos.slice(0, 10);
  const peores = datos.productos
    .filter((p) => p.lineas >= LINEAS_MINIMAS && p.completo.margenPct !== null)
    .sort((a, b) => a.completo.margenPct! - b.completo.margenPct!)
    .slice(0, 10);
  return (
    <div className="tablero-mx space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentos
          etiqueta="Mes"
          opciones={datos.meses.map((m) => ({ id: m, texto: nombreMesTitulo(m) }))}
          activa={datos.mes}
          alCambiar={(m) => setMes(m)}
        />
        <Segmentos
          etiqueta="Origen"
          opciones={ORIGENES.map((o) => ({
            id: o.id,
            texto: o.texto,
            color: o.id === 'todos' ? undefined : COLOR_ORIGEN[o.id],
          }))}
          activa={origen}
          alCambiar={(o) => setOrigen(o as OrigenCosteo)}
        />
      </div>

      <section
        aria-labelledby="costeo-ciudad"
        className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
      >
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:items-center">
          <div>
            <h2 id="costeo-ciudad" className="text-sm font-medium text-ink-2">
              Margen teórico de {ciudad.nombre}, {nombreMes(datos.mes)}
            </h2>
            <p className="mt-1.5 font-display text-[2.5rem] font-black leading-none tracking-[-0.03em] tabular">
              {porcentaje(prom, 1)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Venta sin IVA menos el costo de receta, antes de comisiones.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-line">
            <Dato
              etiqueta="Venta con costeo"
              valor={dinero(t.completo.ventaSinIvaCent, MXN, false)}
              nota="sin IVA"
            />
            <Dato etiqueta="Costo de receta" valor={dinero(t.completo.costoCent, MXN, false)} />
            <Dato etiqueta="Margen" valor={dinero(t.completo.margenCent, MXN, false)} />
            <Dato etiqueta="Con receta" valor={porcentaje(t.cobertura, 0)} nota="de la venta identificable" />
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Tarjeta
          className="xl:col-span-7"
          titulo="Margen por sucursal"
          descripcion={`De mayor a menor margen. La línea punteada es el de ${ciudad.nombre}.`}
        >
          {datos.sucursales.length === 0 ? (
            <Vacio titulo="Sin ventas de este origen en el mes" />
          ) : (
            <BarrasMargen filas={datos.sucursales} promedio={prom} />
          )}
          {datos.sinCalcular.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sin costeo de {nombreMes(datos.mes)}: {datos.sinCalcular.join(', ')}.
            </p>
          )}
        </Tarjeta>
        <Tarjeta
          className="xl:col-span-5"
          titulo="Margen más bajo"
          descripcion={`Productos con al menos ${LINEAS_MINIMAS} vendidos en el mes, todos los orígenes.`}
        >
          <ListaProductos filas={peores} vacio="Ningún producto llega al mínimo de ventas." />
        </Tarjeta>
      </div>

      <Tarjeta
        titulo="Lo más vendido y su margen"
        descripcion="Por venta en el mes, todos los orígenes; en cuántas sucursales se vendió."
      >
        <ListaProductos filas={masVendidos} vacio="Sin productos con costeo en el mes." conVenta />
      </Tarjeta>

      <p className="text-xs text-muted-foreground">
        Costos de Costeo del {datos.costosLeidosEn ? fechaCorta(datos.costosLeidosEn.slice(0, 10)) : '—'},
        aplicados a las ventas de {nombreMes(datos.mes)}. Solo cuentan las líneas con receta, tamaño y
        personalizaciones verificados (las mismas reglas de la sección Costeo de cada sucursal).
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="px-0 sm:px-4 sm:first:pl-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-1 font-display text-xl font-black tabular">{valor}</dd>
      {nota && <dd className="text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

/** Barras horizontales del margen %; la escala va de 0 al mayor margen y la referencia es el de la ciudad. */
function BarrasMargen({
  filas,
  promedio,
}: {
  filas: RespuestaCosteoCiudad['sucursales'];
  promedio: number | null;
}) {
  const max = Math.max(0.01, ...filas.map((f) => f.completo.margenPct ?? 0));
  return (
    <div className="relative">
      <ol className="space-y-2.5">
        {filas.map((f) => {
          const pct = f.completo.margenPct;
          return (
            <li
              key={f.companyId}
              className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4rem] items-center gap-3"
            >
              <span className="min-w-0">
                <EnlaceSucursal
                  companyId={f.companyId}
                  href={`/sucursales/${f.companyId}?seccion=costeo`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {f.nombre}
                </EnlaceSucursal>
                <span className="block truncate text-xs text-muted-foreground tabular">
                  {dinero(f.completo.ventaSinIvaCent, MXN, false)} con costeo
                </span>
              </span>
              <span className="relative block h-3 rounded-full bg-surface-2" aria-hidden="true">
                <span
                  className="mx-barra block h-full rounded-full"
                  style={{ width: `${Math.max(0, (pct ?? 0) / max) * 100}%`, backgroundColor: AZUL.fuerte }}
                />
                {promedio !== null && (
                  <span
                    className="absolute -top-1 bottom-[-4px] border-l-2 border-dashed border-ink/50"
                    style={{ left: `${(promedio / max) * 100}%` }}
                  />
                )}
              </span>
              <span className="text-right text-sm font-semibold tabular">{porcentaje(pct, 1)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ListaProductos({
  filas,
  vacio,
  conVenta = false,
}: {
  filas: ProductoCosteoCiudad[];
  vacio: string;
  conVenta?: boolean;
}) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1.5 text-left font-medium">Producto</th>
            {conVenta && <th className="py-1.5 text-right font-medium">Venta con costeo</th>}
            <th className="py-1.5 text-right font-medium">Vendidos</th>
            <th className="py-1.5 text-right font-medium">Sucursales</th>
            <th className="py-1.5 text-right font-medium">Margen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((p) => (
            <tr key={p.clave}>
              <td className="py-1.5 pr-3 font-medium">{p.nombre}</td>
              {conVenta && (
                <td className="py-1.5 text-right tabular">{dinero(p.completo.importeCent, MXN, false)}</td>
              )}
              <td className="py-1.5 text-right tabular">{numero(p.lineas)}</td>
              <td className="py-1.5 text-right tabular">{p.sucursales}</td>
              <td className="py-1.5 text-right font-semibold tabular">
                {porcentaje(p.completo.margenPct, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
