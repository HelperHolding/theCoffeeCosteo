'use client';
import { Fragment, useMemo, useState } from 'react';
import { CalendarClock, CalendarRange, Flame, Lock } from 'lucide-react';
import { Barra, Kpi, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { agruparPagos, kpisPagos, type ModoPeriodo, type PagoFila } from '@/lib/comercializadora/pagos';
import { DescargarCsv } from './descargar-csv';

export function Pagos({
  filas,
  hoy,
  sinCosto,
  sinProveedor,
}: {
  filas: PagoFila[];
  hoy: string;
  sinCosto: string[];
  sinProveedor: string[];
}) {
  const [modo, setModo] = useState<ModoPeriodo>('semana');
  const [fecha, setFecha] = useState<'fecha_pago' | 'fecha_oc'>('fecha_pago');
  const [comp, setComp] = useState(true);
  const [prov, setProv] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const k = kpisPagos(filas, hoy);
  const filtradas = useMemo(
    () => filas.filter((f) => !prov || String(f.vendor_id || f.vendor_name) === prov),
    [filas, prov],
  );
  const g = useMemo(
    () => agruparPagos(filtradas, modo, fecha, comp, hoy),
    [filtradas, modo, fecha, comp, hoy],
  );
  const proveedores = [
    ...new Map(
      filas.map((f) => [String(f.vendor_id || f.vendor_name), f.vendor_name || '(sin proveedor)']),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const maximo = Math.max(1, ...g.provs.map((x) => x.total));
  const total = (c?: { proy: number; comp: number }) => (c ? c.proy + c.comp : 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="A pagar esta semana"
          valor={pesos(k.estaSemana)}
          nota="Hasta el domingo, con lo vencido"
          icono={CalendarClock}
        />
        <Kpi etiqueta="Próximos 30 días" valor={pesos(k.proximos30)} icono={CalendarRange} />
        <Kpi
          etiqueta="Periodo más pesado"
          valor={k.pesado ? pesos(k.pesado.monto) : '—'}
          nota={k.pesado ? `Semana del ${k.pesado.etiqueta}` : undefined}
          icono={Flame}
        />
        <Kpi
          etiqueta="Ya comprometido"
          valor={pesos(k.comprometido)}
          nota="OCs abiertas en Zoho"
          icono={Lock}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Periodo"
          value={modo}
          onChange={(e) => setModo(e.target.value as ModoPeriodo)}
          className={`${claseCampo} max-w-40`}
        >
          <option value="semana">Por semana</option>
          <option value="quincena">Por quincena</option>
          <option value="mes">Por mes</option>
        </select>
        <select
          aria-label="Fecha"
          value={fecha}
          onChange={(e) => setFecha(e.target.value as 'fecha_pago' | 'fecha_oc')}
          className={`${claseCampo} max-w-48`}
        >
          <option value="fecha_pago">Fecha de pago</option>
          <option value="fecha_oc">Fecha de compra</option>
        </select>
        <select
          aria-label="Proveedor"
          value={prov}
          onChange={(e) => setProv(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} /> Incluir
          comprometido
        </label>
        <DescargarCsv
          nombre={`pagos-${hoy}.csv`}
          filas={filtradas as unknown as Record<string, unknown>[]}
          columnas={[
            ['vendor_name', 'Proveedor'],
            ['sku', 'SKU'],
            ['nombre', 'Artículo'],
            ['tipo', 'Tipo'],
            ['fecha_oc', 'Fecha de compra'],
            ['fecha_pago', 'Fecha de pago'],
            ['cantidad', 'Cantidad'],
            ['monto', 'Monto'],
          ]}
        />
      </div>
      {g.provs.length === 0 ? (
        <Vacio titulo="Sin pagos con estos filtros" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                {g.periodos.map((x) => (
                  <th key={x.clave} className="text-right">
                    {x.etiqueta}
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {g.provs.map((x) => (
                <Fragment key={x.vendor}>
                  <tr
                    className="cursor-pointer"
                    onClick={() => setAbierto(abierto === x.vendor ? null : x.vendor)}
                    aria-expanded={abierto === x.vendor}
                  >
                    <td className="min-w-56">
                      <div className="font-medium">{x.nombre}</div>
                      <Barra valor={x.total} max={maximo} />
                    </td>
                    {g.periodos.map((per) => (
                      <td key={per.clave} className="text-right tabular-nums">
                        {total(x.celdas[per.clave]) ? pesos(total(x.celdas[per.clave])) : ''}
                      </td>
                    ))}
                    <td className="text-right font-semibold tabular-nums">{pesos(x.total)}</td>
                  </tr>
                  {abierto === x.vendor
                    ? x.skus.map((s) => (
                        <tr key={`${x.vendor}-${s.sku}`} className="text-xs text-muted-foreground">
                          <td className="pl-8">
                            {s.nombre || s.sku} · {s.cantidad} pzas
                          </td>
                          {g.periodos.map((per) => (
                            <td key={per.clave} className="text-right tabular-nums">
                              {total(s.celdas[per.clave]) ? pesos(total(s.celdas[per.clave])) : ''}
                            </td>
                          ))}
                          <td className="text-right tabular-nums">{pesos(s.total)}</td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                {g.periodos.map((per) => (
                  <td key={per.clave} className="text-right tabular-nums">
                    {pesos(total(g.tot[per.clave]))}
                  </td>
                ))}
                <td className="text-right tabular-nums">{pesos(g.provs.reduce((s, x) => s + x.total, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {sinCosto.length || sinProveedor.length ? (
        <p className="text-xs text-muted-foreground">
          {sinCosto.length ? `Sin costo (no suman): ${sinCosto.join(', ')}. ` : ''}
          {sinProveedor.length ? `Sin proveedor en Zoho: ${sinProveedor.join(', ')}.` : ''}
        </p>
      ) : null}
    </div>
  );
}
