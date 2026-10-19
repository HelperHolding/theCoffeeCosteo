'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { simularPromocion, resumirCombo } from '@/lib/portal/promociones';
import { dinero, porcentaje } from '@/lib/portal/consultas';

export type ProductoSimulacion = {
  id: string;
  nombre: string;
  costo: number | null;
  precioLista: number | null;
  precioRappi?: number | null;
};
export type CanalSimulacion = { id: string; nombre: string; comisionPct: number; costoEnvase: number };

export function CalculadoraPromociones({
  productos,
  canales,
  ivaDefault,
  objetivoDefault,
}: {
  productos: ProductoSimulacion[];
  canales: CanalSimulacion[];
  ivaDefault: number;
  objetivoDefault: number;
}) {
  const [producto, setProducto] = useState('');
  const [canal, setCanal] = useState('');
  const [costo, setCosto] = useState('');
  const [precio, setPrecio] = useState('');
  const [unidades, setUnidades] = useState('1');
  const [descuento, setDescuento] = useState('0');
  const [iva, setIva] = useState(String(ivaDefault));
  const [comision, setComision] = useState('0');
  const [extra, setExtra] = useState('0');
  const [objetivo, setObjetivo] = useState(String(objetivoDefault));
  const [base, setBase] = useState<'con-iva' | 'sin-iva'>('con-iva');
  const [modo, setModo] = useState<'producto' | 'combo' | 'rappi'>('producto');
  const [combo, setCombo] = useState<{ producto: string; cantidad: string }[]>([
    { producto: '', cantidad: '1' },
    { producto: '', cantidad: '1' },
  ]);
  const esCombo = modo === 'combo';
  const esRappi = modo === 'rappi';
  const canalRappi = canales.find((c) => c.nombre.toLowerCase() === 'rappi');
  const [productoRappi, setProductoRappi] = useState('');
  const [precioRappi, setPrecioRappi] = useState('');
  const seleccionadoRappi = productos.find((p) => p.id === productoRappi);

  const lineasCombo = combo.map((l) => {
    const p = productos.find((p) => p.id === l.producto);
    return {
      ...l,
      p,
      costo: p ? p.costo : null,
      precioLista: p ? p.precioLista : null,
      cantidadNum: Number(l.cantidad),
    };
  });
  const resumen = resumirCombo(
    lineasCombo.map((l) => ({ costo: l.costo, precioLista: l.precioLista, cantidad: l.cantidadNum })),
  );
  const comboListo = lineasCombo.every((l) => l.p) && resumen.costo !== null;
  const cambiarCombo = (i: number, patch: Partial<(typeof combo)[number]>) =>
    setCombo(combo.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // En combo, el precio sigue la suma de precios de lista hasta que se captura uno propio.
  const [precioCombo, setPrecioCombo] = useState<string | null>(null);
  const precioEfectivo = esCombo
    ? (precioCombo ?? (comboListo && resumen.precioLista !== null ? String(resumen.precioLista) : ''))
    : precio;

  const elegirProducto = (id: string) => {
    setProducto(id);
    const p = productos.find((p) => p.id === id);
    setCosto(p?.costo == null ? '' : String(p.costo));
    setPrecio(p?.precioLista == null ? '' : String(p.precioLista));
  };

  const elegirCanal = (id: string) => {
    setCanal(id);
    const c = canales.find((c) => c.id === id);
    if (c) {
      setComision(String(c.comisionPct));
      setExtra(String(c.costoEnvase));
    }
  };

  const camposProducto = [
    { nombre: 'Costo por unidad, sin IVA', valor: costo, cambiar: setCosto, min: 0, step: '0.0001' },
    {
      nombre: 'Unidades del producto en la promoción',
      valor: unidades,
      cambiar: setUnidades,
      min: 1,
      step: '1',
    },
  ];
  const campos: {
    nombre: string;
    valor: string;
    cambiar: (v: string) => void;
    min?: number;
    max?: number;
    step: string;
  }[] = [
    ...(esCombo ? [] : camposProducto),
    {
      nombre: esCombo ? 'Precio total del combo, con IVA' : 'Precio total de la promoción, con IVA',
      valor: precioEfectivo,
      cambiar: esCombo ? setPrecioCombo : setPrecio,
      min: 0.01,
      step: '0.01',
    },
    {
      nombre: 'Descuento del restaurante (%)',
      valor: descuento,
      cambiar: setDescuento,
      min: 0,
      max: 99.99,
      step: '0.01',
    },
    { nombre: 'IVA de la venta (%)', valor: iva, cambiar: setIva, min: 0, max: 100, step: '0.01' },
    {
      nombre: 'Comisión del canal (%)',
      valor: comision,
      cambiar: setComision,
      min: 0,
      max: 99.99,
      step: '0.01',
    },
    { nombre: 'Costos extra por promoción, sin IVA', valor: extra, cambiar: setExtra, min: 0, step: '0.01' },
    {
      nombre: 'Objetivo de contribución (%)',
      valor: objetivo,
      cambiar: setObjetivo,
      min: 0,
      max: 99.99,
      step: '0.01',
    },
  ];
  const incompleto = campos.some((c) => c.valor.trim() === '') || (esCombo && !comboListo);
  const resultadoPromo = incompleto
    ? null
    : simularPromocion({
        // Un combo se simula como una sola unidad con el costo total de sus productos.
        costo: esCombo ? resumen.costo! : Number(costo),
        unidades: esCombo ? 1 : Number(unidades),
        precio: Number(precioEfectivo),
        descuento: Number(descuento),
        iva: Number(iva),
        comision: Number(comision),
        baseComision: base,
        extra: Number(extra),
        objetivo: Number(objetivo),
      });
  const r = esRappi
    ? seleccionadoRappi?.costo != null && canalRappi && precioRappi.trim() !== ''
      ? simularPromocion({
          costo: seleccionadoRappi.costo,
          unidades: 1,
          precio: Number(precioRappi),
          descuento: 0,
          iva: ivaDefault,
          comision: canalRappi.comisionPct,
          baseComision: 'con-iva',
          extra: canalRappi.costoEnvase,
          objetivo: objetivoDefault,
        })
      : null
    : resultadoPromo;
  const extraEfectivo = esRappi ? (canalRappi?.costoEnvase ?? 0) : Number(extra);
  const objetivoFraccion = (esRappi ? objetivoDefault : Number(objetivo)) / 100;
  const bruto = r ? r.bruto - extraEfectivo : 0;

  return (
    <section className="panel space-y-5">
      <div>
        <h2>Simular una promoción</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Prueba escenarios; los precios y costos registrados no cambian. El costo vigente ya incluye sus
          periféricos: agrega solo costos extra que no estén incluidos.
        </p>
      </div>
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Tipo de promoción" className="flex flex-wrap gap-2">
            {(
              [
                ['rappi', 'Precio Rappi'],
                ['producto', 'Un producto'],
                ['combo', 'Combo de varios productos'],
              ] as const
            ).map(([valor, etiqueta]) => (
              <Button
                key={valor}
                type="button"
                role="radio"
                aria-checked={modo === valor}
                variant={modo === valor ? 'accent' : 'outline'}
                size="sm"
                onClick={() => setModo(valor)}
              >
                {etiqueta}
              </Button>
            ))}
          </div>
          {esRappi ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Elige un producto y prueba su precio de venta. Se aplican automáticamente el costo vigente, el
                envase y la comisión configurada de Rappi.
              </p>
              <label>
                Producto Rappi
                <select
                  value={productoRappi}
                  onChange={(e) => {
                    setProductoRappi(e.target.value);
                    const p = productos.find((p) => p.id === e.target.value);
                    setPrecioRappi(p?.precioRappi == null ? '' : String(p.precioRappi));
                  }}
                >
                  <option value="">Seleccionar producto</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.costo === null ? ' · sin costo' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Precio de venta Rappi, con IVA
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={precioRappi}
                  onChange={(e) => setPrecioRappi(e.target.value)}
                />
              </label>
              {canalRappi ? (
                <p className="text-sm text-muted-foreground">
                  Comisión Rappi: {porcentaje(canalRappi.comisionPct / 100)} sobre el precio con IVA · Envase:{' '}
                  {dinero(canalRappi.costoEnvase)} · IVA: {ivaDefault}%
                </p>
              ) : (
                <p className="aviso">No hay un canal Rappi configurado.</p>
              )}
              {seleccionadoRappi && (
                <p className="text-sm text-muted-foreground">
                  Costo vigente:{' '}
                  {seleccionadoRappi.costo === null ? 'sin registrar' : dinero(seleccionadoRappi.costo)} ·
                  Precio Rappi registrado: {dinero(seleccionadoRappi.precioRappi ?? null)}
                </p>
              )}
            </div>
          ) : esCombo ? (
            <fieldset className="space-y-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold">Productos del combo</legend>
              {lineasCombo.map((l, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2">
                  <label>
                    <span className="sr-only">Producto {i + 1} del combo</span>
                    <select
                      aria-label={`Producto ${i + 1} del combo`}
                      value={l.producto}
                      onChange={(e) => cambiarCombo(i, { producto: e.target.value })}
                    >
                      <option value="">Seleccionar producto</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                          {p.costo === null ? ' · sin costo' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Cantidad del producto {i + 1}</span>
                    <input
                      aria-label={`Cantidad del producto ${i + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step="1"
                      value={l.cantidad}
                      onChange={(e) => cambiarCombo(i, { cantidad: e.target.value })}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar producto ${i + 1} del combo`}
                    disabled={combo.length <= 2}
                    onClick={() => setCombo(combo.filter((_, j) => j !== i))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                  {l.p && (
                    <p className="col-span-3 -mt-1 text-xs text-muted-foreground">
                      Costo {l.costo === null ? 'sin registrar' : dinero(l.costo)} · Precio de lista{' '}
                      {dinero(l.precioLista)}
                    </p>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCombo([...combo, { producto: '', cantidad: '1' }])}
              >
                <Plus aria-hidden="true" />
                Agregar producto
              </Button>
              <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
                <dt className="text-muted-foreground">Costo del combo, sin IVA</dt>
                <dd className="text-right font-semibold numero">
                  {resumen.costo === null ? '—' : dinero(resumen.costo)}
                </dd>
                <dt className="text-muted-foreground">Suma de precios de lista</dt>
                <dd className="text-right font-semibold numero">
                  {resumen.precioLista === null ? '—' : dinero(resumen.precioLista)}
                </dd>
              </dl>
              {lineasCombo.some((l) => l.p && l.costo === null) && (
                <p className="aviso">Un producto del combo no tiene costo registrado; no se puede simular.</p>
              )}
            </fieldset>
          ) : (
            <label>
              Producto de referencia
              <select value={producto} onChange={(e) => elegirProducto(e.target.value)}>
                <option value="">Captura manual / otro producto</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.costo === null ? ' · sin costo' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!esRappi && (
            <>
              <label>
                Canal de referencia
                <select value={canal} onChange={(e) => elegirCanal(e.target.value)}>
                  <option value="">Captura manual</option>
                  {canales.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                {campos.map((c) => (
                  <label key={c.nombre}>
                    {c.nombre}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      value={c.valor}
                      onChange={(e) => c.cambiar(e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label>
                Base de la comisión
                <select value={base} onChange={(e) => setBase(e.target.value as typeof base)}>
                  <option value="sin-iva">Venta después del descuento, sin IVA</option>
                  <option value="con-iva">Cobro después del descuento, con IVA</option>
                </select>
              </label>
            </>
          )}
        </div>
        <div aria-live="polite" aria-atomic="true" className="space-y-4">
          {r ? (
            <>
              <dl aria-label="Cuatro indicadores de margen" className="grid grid-cols-2 gap-3">
                {[
                  ['Margen bruto $', dinero(bruto)],
                  ['Margen bruto %', porcentaje(bruto / r.neto)],
                  ['Margen con comisión $', dinero(r.contribucion)],
                  ['Margen con comisión %', porcentaje(r.margen)],
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="rounded-xl border border-line p-4">
                    <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
                    <dd className="mt-2 text-2xl font-bold numero">{valor}</dd>
                  </div>
                ))}
              </dl>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  r.contribucion < 0
                    ? 'bg-red-100 text-red-800'
                    : r.margen < objetivoFraccion
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-green-100 text-green-800'
                }`}
              >
                {r.contribucion < 0
                  ? 'Contribución negativa'
                  : r.margen < objetivoFraccion
                    ? 'Por debajo del objetivo'
                    : 'Cumple el objetivo simulado'}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Contribución por promoción</h3>
                <strong className="text-3xl font-bold tracking-tight">{dinero(r.contribucion)}</strong>
                <p className="text-sm text-muted-foreground">{porcentaje(r.margen)} de la venta sin IVA</p>
              </div>
              <dl className="divide-y rounded-lg border">
                {[
                  ['Cobro al cliente', dinero(r.cobro)],
                  ...(esCombo && resumen.precioLista !== null
                    ? [['Ahorro para el cliente vs. precios de lista', dinero(resumen.precioLista - r.cobro)]]
                    : []),
                  ['Venta sin IVA', dinero(r.neto)],
                  ['Costo de productos', dinero(r.costo)],
                  ['Margen bruto', `${dinero(bruto)} · ${porcentaje(bruto / r.neto)}`],
                  ['Comisión', dinero(r.comision)],
                  [esRappi ? 'Envase' : 'Costos extra', dinero(extraEfectivo)],
                  [
                    'Precio de lista para equilibrio',
                    r.precioEquilibrio === null
                      ? 'No alcanzable con esta comisión'
                      : dinero(r.precioEquilibrio),
                  ],
                  [
                    'Precio de lista para el objetivo',
                    r.precioObjetivo === null
                      ? 'No alcanzable con esta comisión y objetivo'
                      : dinero(r.precioObjetivo),
                  ],
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{etiqueta}</dt>
                    <dd className="font-medium numero">{valor}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Los precios sugeridos son el total con IVA antes de aplicar el descuento indicado.
                {esCombo && ' En combo, el costo es la suma de los costos oficiales de sus productos.'}
              </p>
            </>
          ) : (
            <p className="aviso">
              {esRappi
                ? !seleccionadoRappi
                  ? 'Elige un producto para probar su precio Rappi.'
                  : seleccionadoRappi.costo === null
                    ? 'Este producto no tiene costo registrado; no se puede simular.'
                    : !canalRappi
                      ? 'Configura el canal Rappi para simular.'
                      : 'Captura un precio Rappi mayor a cero.'
                : esCombo && !comboListo
                  ? 'Elige los productos del combo con cantidades enteras positivas.'
                  : incompleto
                    ? 'Completa costo y precio para ver el escenario.'
                    : 'Revisa los importes: cantidades enteras positivas y porcentajes de descuento, comisión y objetivo menores a 100 %.'}
            </p>
          )}
          <p className="text-xs text-muted-foreground border-t pt-4">
            Contribución = venta sin IVA − costo − comisión − extras. No incluye los demás gastos del negocio
            ni representa utilidad neta. Usa la comisión y su base acordadas para el canal.
          </p>
        </div>
      </div>
    </section>
  );
}
