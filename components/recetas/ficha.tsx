import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sesion } from '@/lib/supabase/sesion';
import { todas, dinero, porcentaje } from '@/lib/portal/consultas';
import { fusionarCanales } from '@/lib/portal/canales';
import { cargarEditor } from '@/lib/portal/recetas';
import { dependientes } from '@/lib/portal/dependencias';
import { puede } from '@/lib/portal/permisos';
import { EditorReceta } from './editor-receta';
import { AvisoComision } from '@/components/portal/aviso-comision';
import { EditorPrecios } from './editor-precios';
import { HistorialReceta } from './historial-receta';
import { Encabezado, Tarjeta, Pill, Insignia, Barra, estadoMargen } from '@/components/portal/piezas';
import { Pestanas } from '@/components/portal/pestanas';
import { Coffee, Layers } from 'lucide-react';
export async function Ficha({
  id,
  tipo,
  tab,
}: {
  id?: string;
  tipo: 'producto' | 'subreceta';
  tab?: string;
}) {
  const { db, perfil } = await sesion();
  const editor = await cargarEditor(db, tipo, id);
  if (!editor) notFound();
  const [resumen, historial, canales, manuales, usuarios] = await Promise.all([
    id && tipo === 'producto' ? todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id') : [],
    id
      ? db.from('bitacora').select('*').eq('receta_id', id).order('id', { ascending: false }).limit(50)
      : { data: [], error: null },
    todas(db, 'canales', 'orden,id'),
    id && tipo === 'producto' ? todas(db, 'precio_canal_manual', 'producto_id,tamano_id,canal_id') : [],
    todas(db, 'perfiles', 'user_id'),
  ]);
  if (historial.error) throw new Error('No se pudo consultar el historial');
  const filas = resumen
    .filter((r) => r.producto_id === id)
    .sort((a, b) => a.tamano_orden - b.tamano_orden || a.canal_orden - b.canal_orden);
  // Mostrador y App propia en una sola fila cuando sus números coinciden.
  const filasCanal = fusionarCanales(filas);
  const usos = id ? dependientes(editor.lineas, editor.recetas, id, 'subreceta') : [];
  const migas =
    tipo === 'producto'
      ? [{ href: '/productos', nombre: 'Productos' }]
      : [{ href: '/subrecetas', nombre: 'Sub-recetas' }];
  const nombreTamano = (t: string | null) => editor.tamanos.find((x) => x.id === t)?.nombre ?? 'Lote';
  const editorReceta = (
    <EditorReceta
      key={editor.borrador.id ?? 'nueva'}
      inicial={editor.borrador}
      opciones={editor.opciones}
      categorias={editor.categorias}
      tamanos={editor.tamanos}
      editable={puede(perfil.rol, 'recetas')}
      afectados={usos.map((r) => r.nombre)}
    />
  );

  if (!id)
    return (
      <>
        <Encabezado migas={migas} titulo={tipo === 'producto' ? 'Nuevo producto' : 'Nueva sub-receta'} />
        {editorReceta}
      </>
    );

  // Tamaño principal: el más grande que vende el producto.
  const tamanosProducto = [...new Set(filas.map((f) => f.tamano_id))];
  const principal = tamanosProducto.at(-1);
  const mostrador = filas.find((f) => f.tamano_id === principal && f.canal === 'Mostrador');
  const columna = tipo === 'producto' ? (principal ?? null) : null;
  const composicion = editor.borrador.lineas
    .map((l) => {
      const o = editor.opciones.find((x) => x.id === (l.insumo_id ?? l.subreceta_id));
      const cantidad = l.cantidades.find((c) => c.tamano_id === columna)?.cantidad ?? 0;
      return {
        nombre: o?.nombre ?? '—',
        tipo: o?.tipo,
        unidad: o?.unidad,
        cantidad,
        costo: (o?.costo ?? 0) * cantidad,
      };
    })
    .filter((c) => c.costo > 0)
    .sort((a, b) => b.costo - a.costo);
  const totalComposicion = composicion.reduce((n, c) => n + c.costo, 0);
  const categoria = editor.categorias.find((c) => c.id === editor.borrador.categoria_id)?.nombre;

  const tarjetaComposicion = (
    <Tarjeta
      titulo="Composición del costo"
      descripcion={`${tipo === 'producto' ? `Tamaño ${nombreTamano(columna)}` : 'Lote completo'} · qué ingrediente pesa más.`}
    >
      <ul className="space-y-3">
        {composicion.map((c) => (
          <li key={c.nombre} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {c.tipo === 'subreceta' ? (
                <Layers size={14} className="shrink-0 text-crema-strong" aria-label="Sub-receta" />
              ) : (
                <Coffee size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="truncate font-medium">{c.nombre}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {c.cantidad} {c.unidad}
              </span>
            </span>
            <span className="text-right font-semibold tabular">
              {dinero(c.costo)}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {porcentaje(c.costo / (totalComposicion || 1))}
              </span>
            </span>
            <Barra valor={c.costo} max={composicion[0]?.costo ?? 1} className="col-span-2 h-1.5" />
          </li>
        ))}
      </ul>
      {!composicion.length && <p className="text-sm text-muted-foreground">Sin componentes con costo.</p>}
      <p className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold">
        Total <span className="tabular">{dinero(totalComposicion)}</span>
      </p>
    </Tarjeta>
  );

  const historialPanel = (
    <HistorialReceta
      id={id}
      inicial={historial.data ?? []}
      usuarios={Object.fromEntries(usuarios.map((u) => [u.user_id, u.nombre]))}
    />
  );

  if (tipo === 'subreceta')
    return (
      <>
        <Encabezado migas={migas} titulo={editor.borrador.nombre}>
          <Pill estado={editor.borrador.activo ? 'ok' : 'sin-precio'}>
            {editor.borrador.activo ? 'Activa' : 'Inactiva'}
          </Pill>
        </Encabezado>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-ink p-5 text-white shadow-card sm:col-span-1">
            <p className="text-sm text-neutral-400">Costo oficial por {editor.borrador.unidad_rendimiento}</p>
            <p className="mt-2 font-display text-3xl font-black tabular">
              {new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: 'MXN',
                maximumFractionDigits: 4,
              }).format(editor.costoOficial)}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              Rendimiento del lote: {editor.borrador.rendimiento} {editor.borrador.unidad_rendimiento}
            </p>
          </div>
          <Tarjeta
            className="sm:col-span-2"
            titulo="Usada en"
            descripcion="Productos y sub-recetas que la usan, directa o indirectamente."
          >
            <div className="flex flex-wrap gap-2">
              {usos.map((r) => (
                <Link
                  key={r.id}
                  href={`/${r.tipo === 'producto' ? 'productos' : 'subrecetas'}/${r.id}`}
                  className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium transition-colors hover:border-crema hover:bg-crema-soft"
                >
                  {r.nombre}
                </Link>
              ))}
              {!usos.length && <p className="text-sm text-muted-foreground">Sin uso registrado.</p>}
            </div>
          </Tarjeta>
        </div>
        <Pestanas
          inicial={tab}
          pestanas={[
            {
              id: 'receta',
              nombre: 'Receta',
              contenido: (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  {editorReceta}
                  {tarjetaComposicion}
                </div>
              ),
            },
            {
              id: 'historial',
              nombre: 'Historial',
              contador: historial.data?.length,
              contenido: historialPanel,
            },
          ]}
        />
      </>
    );

  const editaPrecios = puede(perfil.rol, 'precios');
  return (
    <>
      <Encabezado migas={migas} titulo={editor.borrador.nombre}>
        {categoria && <Insignia>{categoria}</Insignia>}
        {[...new Set(filas.map((f) => f.tamano))].map((t) => (
          <Insignia key={t}>{t}</Insignia>
        ))}
        <Pill estado={editor.borrador.activo ? 'ok' : 'sin-precio'}>
          {editor.borrador.activo ? 'Activo' : 'Inactivo'}
        </Pill>
      </Encabezado>
      <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />
      {mostrador && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Costo', dinero(mostrador.costo), `Tamaño ${mostrador.tamano}`],
            ['Precio de lista', dinero(mostrador.precio_lista), 'Mostrador, con IVA'],
            ['Margen mostrador', porcentaje(mostrador.margen_pct), `${dinero(mostrador.margen)} por venta`],
          ].map(([etiqueta, valor, nota], i) => (
            <div
              key={etiqueta}
              className={`rounded-2xl border p-5 shadow-card ${i === 2 ? 'border-ink bg-ink text-white' : 'border-line bg-surface'}`}
            >
              <p className={`text-sm ${i === 2 ? 'text-neutral-400' : 'text-ink-2'}`}>{etiqueta}</p>
              <p className="mt-2 flex items-center gap-3 font-display text-3xl font-black tabular">
                {valor}
                {i === 2 && <Pill estado={estadoMargen(mostrador)} className="font-sans" />}
              </p>
              <p className={`mt-1 text-xs ${i === 2 ? 'text-neutral-400' : 'text-muted-foreground'}`}>
                {nota}
              </p>
            </div>
          ))}
        </div>
      )}
      <Pestanas
        inicial={tab}
        pestanas={[
          {
            id: 'costeo',
            nombre: 'Costeo',
            contenido: (
              <>
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {tamanosProducto.map((t) => {
                    const xs = filasCanal.filter((f) => f.tamano_id === t);
                    return (
                      <Tarjeta
                        key={t}
                        titulo={`Tamaño ${xs[0].tamano}`}
                        descripcion={`Costo ${dinero(xs[0].costo)}`}
                        cuerpo={false}
                      >
                        <ul className="divide-y divide-line">
                          {xs.map((f) => (
                            <li key={f.canal_id} className="px-5 py-3.5">
                              <span className="block text-sm font-semibold">{f.canal}</span>
                              <span className="text-xs text-muted-foreground">
                                {dinero(f.precio_canal)}
                                {f.precio_manual !== null && ' · manual'}
                                {f.comision ? ` · comisión ${dinero(f.comision)}` : ''}
                              </span>
                              <dl className="mt-2 grid grid-cols-2 gap-3">
                                <div>
                                  <dt className="text-[11px] text-muted-foreground">Margen bruto</dt>
                                  <dd className="text-sm font-semibold tabular">
                                    {porcentaje(f.margen_bruto_pct)}{' '}
                                    <span className="text-xs font-normal text-muted-foreground">
                                      {dinero(f.margen_bruto)}
                                    </span>
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] text-muted-foreground">Margen con comisión</dt>
                                  <dd className="flex items-center gap-1.5 text-sm tabular">
                                    <Pill estado={estadoMargen(f)}>{porcentaje(f.margen_pct)}</Pill>
                                    <span className="text-xs text-muted-foreground">{dinero(f.margen)}</span>
                                  </dd>
                                </div>
                              </dl>
                            </li>
                          ))}
                        </ul>
                      </Tarjeta>
                    );
                  })}
                </div>
                <Tarjeta titulo="Costeo oficial detallado" cuerpo={false}>
                  <div className="overflow-x-auto">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Tamaño</th>
                          <th>Canal</th>
                          <th className="text-right">Costo</th>
                          <th className="text-right">Precio calculado</th>
                          <th className="text-right">Manual</th>
                          <th className="text-right">Precio final</th>
                          <th className="text-right">Margen bruto</th>
                          <th className="text-right">Comisión</th>
                          <th className="text-right">Margen con comisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasCanal.map((f) => (
                          <tr key={`${f.tamano_id}:${f.canal_id}`}>
                            <td>{f.tamano}</td>
                            <td>{f.canal}</td>
                            <td className="numero">{dinero(f.costo)}</td>
                            <td className="numero">{dinero(f.precio_calculado)}</td>
                            <td className="numero">
                              {f.precio_manual === null ? '—' : dinero(f.precio_manual)}
                            </td>
                            <td className="numero font-semibold">{dinero(f.precio_canal)}</td>
                            <td className="numero">
                              {dinero(f.margen_bruto)} · {porcentaje(f.margen_bruto_pct)}
                            </td>
                            <td className="numero">{f.comision === null ? '—' : dinero(f.comision)}</td>
                            <td className="numero">
                              {dinero(f.margen)} · {porcentaje(f.margen_pct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
              </>
            ),
          },
          {
            id: 'receta',
            nombre: 'Receta',
            contador: editor.borrador.lineas.length,
            contenido: (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                {editorReceta}
                {tarjetaComposicion}
              </div>
            ),
          },
          {
            id: 'precios',
            nombre: 'Precios',
            contenido: editaPrecios ? (
              <EditorPrecios filas={filas} manuales={manuales} editable />
            ) : (
              <p className="aviso">
                Solo Finanzas y Administración capturan precios. Consulta los vigentes en la pestaña Costeo.
              </p>
            ),
          },
          {
            id: 'historial',
            nombre: 'Historial',
            contador: historial.data?.length,
            contenido: historialPanel,
          },
        ]}
      />
    </>
  );
}
