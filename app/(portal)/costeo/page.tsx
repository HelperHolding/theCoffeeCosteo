import Link from 'next/link';
import { Percent, TrendingDown, CircleDashed, Bike, ChevronDown, ArrowUpRight } from 'lucide-react';
import { sesion } from '@/lib/supabase/sesion';
import { todas, porcentaje, dinero } from '@/lib/portal/consultas';
import { indicadores, saludMenu, margenPor, menorMargen, alertasPorTipo } from '@/lib/portal/tablero';
import { AvisoComision } from '@/components/portal/aviso-comision';
import { Encabezado, Tarjeta, Kpi, Barra, Pill, estadoMargen, type Estado } from '@/components/portal/piezas';

const tonoAlerta = (a: string): Estado =>
  a === 'Falta precio de lista'
    ? 'sin-precio'
    : a === 'Vende por debajo del costo' || a === 'Pierde dinero en el canal'
      ? 'pierde'
      : 'bajo';
const resumen = (p: Record<string, string>) => `/resumen?${new URLSearchParams(p)}`;

export default async function Tablero() {
  const { db, perfil } = await sesion();
  const [filas, alertas, canales] = await Promise.all([
    todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id'),
    todas(db, 'v_alerta_producto_canal', 'producto_id,canal_id'),
    todas(db, 'canales', 'id'),
  ]);
  const k = indicadores(filas);
  const activos = new Set(filas.filter((f) => f.activo).map((f) => f.producto_id));
  const objetivo = filas[0]?.margen_objetivo ?? 0.55;
  const salud = saludMenu(filas);
  const totalSalud = Object.values(salud).reduce((a, b) => a + b, 0);
  const categorias = margenPor(filas, 'categoria', true);
  const porCanal = margenPor(filas, 'canal', false);
  const peores = menorMargen(filas);
  const grupos = alertasPorTipo(alertas, activos);
  const hoy = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(),
  );
  const segmentos: { clave: keyof typeof salud; nombre: string; color: string; estado: Estado }[] = [
    { clave: 'ok', nombre: 'En objetivo', color: 'bg-ok', estado: 'ok' },
    { clave: 'bajo', nombre: 'Bajo objetivo', color: 'bg-warn', estado: 'bajo' },
    { clave: 'pierde', nombre: 'Pierde en algún canal', color: 'bg-bad', estado: 'pierde' },
    { clave: 'sin-precio', nombre: 'Sin precio', color: 'bg-line-strong', estado: 'sin-precio' },
  ];
  return (
    <>
      <Encabezado
        area={`Hola, ${perfil.nombre.split(' ')[0]} · ${hoy}`}
        titulo="Tablero de costeos"
        descripcion={`${k.productos} productos activos. Margen objetivo: ${porcentaje(objetivo)}.`}
      />
      <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Food cost promedio"
          valor={porcentaje(k.foodCost)}
          icono={Percent}
          tono={k.foodCost !== null && 1 - k.foodCost >= objetivo ? 'ok' : 'bajo'}
          nota={`Meta: food cost ≤ ${porcentaje(1 - objetivo)} (Mostrador)`}
        >
          <Barra
            valor={k.foodCost ?? 0}
            max={0.8}
            objetivo={1 - objetivo}
            estado={k.foodCost !== null && 1 - k.foodCost >= objetivo ? 'ok' : 'bajo'}
          />
        </Kpi>
        <Kpi
          etiqueta="Bajo objetivo"
          valor={k.bajoObjetivo}
          icono={TrendingDown}
          tono={k.bajoObjetivo ? 'bajo' : 'ok'}
          nota="Productos con margen de mostrador menor a la meta"
          href={resumen({ alerta: 'Margen bajo el objetivo', canal: 'Mostrador' })}
        />
        <Kpi
          etiqueta="Sin precio"
          valor={k.sinPrecio}
          icono={CircleDashed}
          tono="sin-precio"
          nota="Al menos un tamaño sin precio de lista"
          href={resumen({ alerta: 'Falta precio de lista' })}
        />
        <Kpi
          etiqueta="Pierden en delivery"
          valor={k.pierdenDelivery}
          icono={Bike}
          tono={k.pierdenDelivery ? 'pierde' : 'ok'}
          nota="Margen negativo en Rappi o App propia"
          href={resumen({ alerta: 'Pierde dinero en el canal' })}
        />
      </div>

      <Tarjeta titulo="Salud del menú" descripcion="Cada producto activo, en su peor estado.">
        <div
          className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label="Distribución de productos por estado"
        >
          {segmentos.map((s) =>
            salud[s.clave] ? (
              <div
                key={s.clave}
                className={`${s.color} h-full first:rounded-l-full last:rounded-r-full`}
                style={{ width: `${(salud[s.clave] / (totalSalud || 1)) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {segmentos.map((s) => (
            <li key={s.clave} className="rounded-xl bg-paper px-3.5 py-3">
              <p className="flex items-center gap-2 text-xs font-medium text-ink-2">
                <span className={`size-2.5 rounded-full ${s.color}`} aria-hidden="true" />
                {s.nombre}
              </p>
              <p className="mt-1 font-display text-2xl font-black tabular">
                {salud[s.clave]}
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                  {porcentaje(salud[s.clave] / (totalSalud || 1))}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <div className="grid gap-5 xl:grid-cols-5">
        <Tarjeta
          className="xl:col-span-3"
          titulo="Margen por categoría"
          descripcion="Promedio de margen en Mostrador. La línea marca el objetivo."
        >
          <ul className="space-y-3.5">
            {categorias.map((c) => {
              const estado: Estado = c.margen < 0 ? 'pierde' : c.margen < objetivo ? 'bajo' : 'ok';
              return (
                <li
                  key={c.nombre}
                  className="grid grid-cols-[minmax(0,9rem)_1fr_4rem] items-center gap-3 text-sm"
                >
                  <Link
                    href={resumen({ categoria: c.nombre, canal: 'Mostrador' })}
                    className="truncate font-medium hover:underline"
                  >
                    {c.nombre}
                  </Link>
                  <Barra valor={c.margen} max={1} objetivo={objetivo} estado={estado} className="h-2.5" />
                  <span
                    className={`text-right font-semibold tabular ${estado === 'ok' ? 'text-ok' : estado === 'bajo' ? 'text-warn' : 'text-bad'}`}
                  >
                    {porcentaje(c.margen)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Tarjeta>

        <Tarjeta
          className="xl:col-span-2"
          titulo="Margen por canal"
          descripcion="Promedio de todos los productos y tamaños con precio."
        >
          <div className="flex h-56 items-end justify-around gap-4 border-b border-line pb-2">
            {porCanal.map((c) => {
              const estado: Estado = c.margen < 0 ? 'pierde' : c.margen < objetivo ? 'bajo' : 'ok';
              return (
                <div key={c.nombre} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="font-display text-lg font-black tabular">{porcentaje(c.margen)}</span>
                  <div
                    className={`w-full max-w-16 rounded-t-xl ${estado === 'ok' ? 'bg-ink' : estado === 'bajo' ? 'bg-crema' : 'bg-bad'}`}
                    style={{ height: `${Math.max(4, c.margen * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-around gap-4 text-center text-xs font-medium text-ink-2">
            {porCanal.map((c) => (
              <span key={c.nombre} className="flex-1">
                {c.nombre}
              </span>
            ))}
          </div>
        </Tarjeta>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Tarjeta
          className="xl:col-span-2"
          titulo="Menor margen en Mostrador"
          cuerpo={false}
          acciones={
            <Link
              href={resumen({ canal: 'Mostrador', orden: 'margen' })}
              className="text-xs font-semibold text-crema-strong hover:underline"
            >
              Ver todo
            </Link>
          }
        >
          <ol className="divide-y divide-line">
            {peores.map((f, i) => (
              <li key={`${f.producto_id}:${f.tamano_id}`}>
                <Link
                  href={`/productos/${f.producto_id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper"
                >
                  <span className="w-5 text-xs font-semibold text-muted-foreground tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.producto}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.tamano} · costo {dinero(f.costo)} · precio {dinero(f.precio_canal)}
                    </span>
                  </span>
                  <Pill estado={estadoMargen(f)}>{porcentaje(f.margen_pct)}</Pill>
                </Link>
              </li>
            ))}
          </ol>
        </Tarjeta>

        <Tarjeta
          className="xl:col-span-3"
          titulo="Alertas por tipo"
          descripcion="Abre cada grupo para ver los productos y canales."
          cuerpo={false}
        >
          <div className="space-y-2 p-5 pt-3">
            {grupos.map((g) => (
              <details
                key={g.alerta}
                className="group rounded-xl border border-line bg-paper/50 open:bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <Pill estado={tonoAlerta(g.alerta)}>{g.filas.length}</Pill>
                  <span className="flex-1 text-sm font-semibold">{g.alerta}</span>
                  <Link
                    href={resumen({ alerta: g.alerta })}
                    className="hidden text-xs font-semibold text-crema-strong hover:underline sm:inline"
                  >
                    Abrir en Resumen
                  </Link>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <ul className="grid gap-1 border-t border-line px-2 py-2 sm:grid-cols-2">
                  {g.filas.map((a) => (
                    <li key={`${a.producto_id}:${a.canal_id}`}>
                      <Link
                        href={`/productos/${a.producto_id}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-paper"
                      >
                        <span className="truncate">{a.producto}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {a.canal} <ArrowUpRight size={12} aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {!grupos.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin alertas en productos activos.
              </p>
            )}
          </div>
        </Tarjeta>
      </div>

      <p className="text-xs text-muted-foreground">
        Food cost y márgenes: media simple por producto/tamaño, no ponderada por ventas. Conteos de productos
        distintos. Delivery incluye Rappi y App propia.
      </p>
    </>
  );
}
