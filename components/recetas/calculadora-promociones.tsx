'use client';
import { useState } from 'react';
import { simularPromocion } from '@/lib/portal/promociones';
import { dinero, porcentaje } from '@/lib/portal/consultas';

export type ProductoSimulacion = {
  id: string;
  nombre: string;
  costo: number | null;
  precioLista: number | null;
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
  const [base, setBase] = useState<'con-iva' | 'sin-iva'>('sin-iva');

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
      if (c.costoEnvase) setExtra(String(c.costoEnvase));
    }
  };

  const campos: {
    nombre: string;
    valor: string;
    cambiar: (v: string) => void;
    min?: number;
    max?: number;
    step: string;
  }[] = [
    { nombre: 'Costo por unidad, sin IVA', valor: costo, cambiar: setCosto, min: 0, step: '0.0001' },
    {
      nombre: 'Unidades del producto en la promoción',
      valor: unidades,
      cambiar: setUnidades,
      min: 1,
      step: '1',
    },
    {
      nombre: 'Precio total de la promoción, con IVA',
      valor: precio,
      cambiar: setPrecio,
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
  const incompleto = campos.some((c) => c.valor.trim() === '');
  const r = incompleto
    ? null
    : simularPromocion({
        costo: Number(costo),
        unidades: Number(unidades),
        precio: Number(precio),
        descuento: Number(descuento),
        iva: Number(iva),
        comision: Number(comision),
        baseComision: base,
        extra: Number(extra),
        objetivo: Number(objetivo),
      });
  const objetivoFraccion = Number(objetivo) / 100;

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
        </div>
        <div aria-live="polite" aria-atomic="true" className="space-y-4">
          {r ? (
            <>
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
                  ['Venta sin IVA', dinero(r.neto)],
                  ['Costo de productos', dinero(r.costo)],
                  ['Margen bruto', `${dinero(r.bruto)} · ${porcentaje(r.margenBruto)}`],
                  ['Comisión', dinero(r.comision)],
                  ['Costos extra', dinero(Number(extra))],
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
                Los precios sugeridos son el total con IVA antes de aplicar el descuento indicado. Para un
                combo mixto, captura manualmente el costo total y usa una unidad.
              </p>
            </>
          ) : (
            <p className="aviso">
              {incompleto
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
