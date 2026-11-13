'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Package, Truck, Wallet } from 'lucide-react';
import { Kpi, Pill, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero, pesos } from '@/lib/comercializadora/formato';
import {
  filasQuePedir,
  kpisQuePedir,
  ordenQuePedir,
  proveedoresQuePedir,
  type DatosQuePedir,
} from '@/lib/comercializadora/quepedir';
import { AvisosCierre, type AvisoFranja } from './avisos-cierre';
import { DescargarCsv } from './descargar-csv';

const HORIZONTES = [7, 15, 30];
const POR_PAGINA = 25;

export function QuePedir({
  datos,
  hoy,
  edadHoras,
  avisos,
}: {
  datos: DatosQuePedir;
  hoy: string;
  edadHoras: number;
  avisos: AvisoFranja[];
}) {
  const [dias, setDias] = useState(7);
  const [vista, setVista] = useState<'sku' | 'proveedor'>('sku');
  const [q, setQ] = useState('');
  const [prov, setProv] = useState('');
  const [soloPedir, setSoloPedir] = useState(true);
  const [ver, setVer] = useState(POR_PAGINA);

  const filas = useMemo(() => filasQuePedir(datos, dias, hoy), [datos, dias, hoy]);
  const proveedores = useMemo(
    () =>
      [...new Map(filas.map((f) => [f.vendor, f.vendorNombre])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1], 'es'),
      ),
    [filas],
  );
  const texto = q.trim().toLowerCase();
  // Como el sitio viejo: KPIs y grupos salen de lo filtrado por proveedor y búsqueda; "solo lo que hay que pedir"
  // solo oculta filas (y proveedores sin nada que pedir), no cambia los totales del proveedor.
  const base = filas
    .filter((f) => !prov || f.vendor === prov)
    .filter((f) => !texto || f.sku.toLowerCase().includes(texto) || f.nombre.toLowerCase().includes(texto));
  const k = kpisQuePedir(base, dias);
  const visibles = base.filter((f) => !soloPedir || f.pedir).sort(ordenQuePedir);
  const grupos = proveedoresQuePedir(base)
    .filter((p) => !soloPedir || p.pedir)
    .sort(ordenQuePedir);

  return (
    <div className="space-y-5">
      {edadHoras > 36 ? (
        <p
          role="status"
          className="placa flex items-center gap-2 border-warn/40 bg-warn-soft px-4 py-3 text-sm"
        >
          <AlertTriangle size={16} aria-hidden="true" className="text-warn" /> La simulación se calculó hace
          más de 36 horas: las cantidades pueden no estar al día.
        </p>
      ) : null}
      <AvisosCierre avisos={avisos} hoy={hoy} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Artículos a pedir" valor={k.articulos} icono={Package} />
        <Kpi etiqueta="Monto a comprar (sin IVA)" valor={pesos(k.monto)} icono={Wallet} />
        <Kpi etiqueta="Proveedores con pedido" valor={k.proveedores} icono={Truck} />
        <Kpi
          etiqueta={`Con menos de ${dias} días`}
          valor={k.cortos}
          icono={CalendarDays}
          tono={k.cortos ? 'bajo' : 'neutro'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Horizonte" className="flex gap-1">
          {HORIZONTES.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={dias === h}
              onClick={() => setDias(h)}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold ${dias === h ? 'bg-ink text-white' : 'border border-line-strong bg-surface'}`}
            >
              {h} días
            </button>
          ))}
        </div>
        <div role="group" aria-label="Vista" className="flex gap-1">
          {(['sku', 'proveedor'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => setVista(v)}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold ${vista === v ? 'bg-ink text-white' : 'border border-line-strong bg-surface'}`}
            >
              {v === 'sku' ? 'Por SKU' : 'Por proveedor'}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Buscar artículo"
          placeholder="Buscar SKU o nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        />
        <select
          aria-label="Proveedor"
          value={prov}
          onChange={(e) => setProv(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloPedir} onChange={(e) => setSoloPedir(e.target.checked)} /> Solo
          lo que hay que pedir
        </label>
        <DescargarCsv
          nombre={`que-pedir-${hoy}.csv`}
          filas={visibles as unknown as Record<string, unknown>[]}
          columnas={[
            ['sku', 'SKU'],
            ['nombre', 'Artículo'],
            ['vendorNombre', 'Proveedor'],
            ['disp', 'Físico'],
            ['camino', 'En camino'],
            ['dias', 'Días de inventario'],
            ['cant', 'Cantidad'],
            ['monto', 'Monto'],
          ]}
        />
      </div>

      {visibles.length === 0 ? (
        <Vacio titulo={soloPedir ? 'Nada que pedir en este horizonte' : 'Sin artículos con estos filtros'}>
          {soloPedir ? 'Quita "Solo lo que hay que pedir" para ver todo el inventario.' : null}
        </Vacio>
      ) : vista === 'sku' ? (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Proveedor</th>
                <th className="text-right">Físico (Zoho)</th>
                <th className="text-right">En camino</th>
                <th className="text-right">Días de inventario</th>
                <th>¿Pedir?</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => (
                <tr key={f.sku}>
                  <td>
                    <div className="font-medium">{f.nombre}</div>
                    <div className="text-xs text-muted-foreground">{f.sku}</div>
                  </td>
                  <td>{f.vendorNombre}</td>
                  <td className="text-right tabular-nums">{numero(f.disp)}</td>
                  <td className="text-right tabular-nums">{numero(f.camino)}</td>
                  <td className="text-right tabular-nums">{f.dias == null ? 'Sin venta' : numero(f.dias)}</td>
                  <td className="space-x-1">
                    {f.pedir ? <Pill estado="bajo">Pedir</Pill> : <Pill estado="ok">No</Pill>}
                    {f.adelanto ? <Pill estado="neutro">Adelanto por cierre</Pill> : null}
                    {f.tarde ? <Pill estado="pierde">Cierre: ya no llega</Pill> : null}
                    {f.adMin ? <Pill estado="neutro">Adelantado por mínimo</Pill> : null}
                    {f.bajo ? <Pill estado="pierde">No llega al mínimo</Pill> : null}
                    {f.nota ? <span className="text-xs text-muted-foreground">{f.nota}</span> : null}
                  </td>
                  <td className="text-right tabular-nums">{f.pedir ? numero(f.cant) : '—'}</td>
                  <td className="text-right tabular-nums">{f.pedir ? pesos(f.monto) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Artículos a pedir</th>
                <th className="text-right">Disponible (MXN)</th>
                <th className="text-right">Días (promedio / más corto)</th>
                <th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {grupos.slice(0, ver).map((p) => (
                <tr key={p.vendor}>
                  <td className="font-medium">
                    {p.nombre} {p.bajo ? <Pill estado="pierde">No llega al mínimo</Pill> : null}
                  </td>
                  <td className="text-right tabular-nums">
                    {p.aPedir} de {p.skus.length}
                  </td>
                  <td className="text-right tabular-nums">{pesos(p.valor)}</td>
                  <td className="text-right tabular-nums">
                    {numero(p.dias)} / {numero(p.diasMin)}
                  </td>
                  <td className="text-right tabular-nums">{pesos(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(vista === 'sku' ? visibles.length : grupos.length) > ver ? (
        <button
          type="button"
          onClick={() => setVer(ver + POR_PAGINA)}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
        >
          Ver más
        </button>
      ) : null}
    </div>
  );
}
