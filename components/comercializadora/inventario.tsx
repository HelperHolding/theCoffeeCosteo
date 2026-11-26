'use client';
import { useState } from 'react';
import { Boxes, PackageX } from 'lucide-react';
import { Kpi, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { FilaInventarioAperturas } from '@/lib/comercializadora/inventario';
import { DescargarCsv } from './descargar-csv';
import { Ajuste3pl } from './ajuste-3pl';

const POR_PAGINA = 25;
const ESTATUS = ['Activo', 'Compra Recurrente', 'Prueba', 'Hasta Agotar Existencias', 'Inactivo'];

export function Inventario(p: {
  filas: FilaInventarioAperturas[];
  /** Aperturas por mes de Configuración (aper.por_mes) para la cobertura con aperturas. */
  aperturasMes: number;
  valor: { valor: number; sinCosto: number };
  viejos: string[];
  ultimoSync: string | null;
  hoy: string;
  editable: boolean;
  autorizadores: string[];
  saldos3pl: Record<string, number | null>;
  /** Si no se pudieron leer los pedidos, venta/día y cobertura no se muestran y se dice por qué. */
  ventaAviso: string | null;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [est, setEst] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [ajuste, setAjuste] = useState(false);
  const texto = q.trim().toLowerCase();
  const categorias = [...new Set(p.filas.map((f) => f.categoria).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
  const visibles = p.filas.filter(
    (f) =>
      (!texto || f.sku.toLowerCase().includes(texto) || f.nombre.toLowerCase().includes(texto)) &&
      (!cat || f.categoria === cat) &&
      (!est || (est === 'faltantes' ? f.inventario != null && f.inventario <= 0 : f.estatus === est)),
  );
  const minutos = p.ultimoSync
    ? Math.round((new Date(p.hoy + 'T12:00:00Z').getTime() - new Date(p.ultimoSync).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          etiqueta="Valor total de inventario (CEDIS + 3PL)"
          valor={pesos(p.valor.valor)}
          nota={
            p.valor.sinCosto ? `${p.valor.sinCosto} SKUs con stock pero sin costo no se incluyen` : undefined
          }
          icono={Boxes}
        />
        <Kpi
          etiqueta="Faltantes (inventario ≤ 0)"
          valor={
            p.filas.filter((f) => f.inventario != null && f.inventario <= 0 && f.estatus !== 'Inactivo')
              .length
          }
          icono={PackageX}
          tono="bajo"
        />
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {p.ultimoSync
          ? `Última sincronización con Zoho: ${new Date(p.ultimoSync).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`
          : 'Todavía no hay sincronización con Zoho.'}
        {minutos != null && minutos > 120 ? ' · revisa la conexión' : ''}
      </p>
      {p.ventaAviso ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {p.ventaAviso} Venta diaria y cobertura no se muestran.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Cobertura c/aperturas suma a la venta diaria el kit de apertura de cada artículo con{' '}
        {numero(p.aperturasMes)} aperturas al mes (Configuración › Aperturas por mes; el kit se edita en Kit).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Buscar artículo"
          placeholder="Buscar SKU o nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        />
        <select
          aria-label="Categoría"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Estatus"
          value={est}
          onChange={(e) => setEst(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        >
          <option value="">Todos los estatus</option>
          {ESTATUS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
          <option value="faltantes">Solo faltantes</option>
        </select>
        {p.editable ? (
          <button
            type="button"
            onClick={() => setAjuste(true)}
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
          >
            Ajustar 3PL
          </button>
        ) : null}
        <DescargarCsv
          nombre={`inventario-${p.hoy}.csv`}
          filas={visibles.map((f) => ({
            ...f,
            llegadaEstimada: f.llegada ? (f.llegadaEstimada ? 'si' : 'no') : '',
          }))}
          columnas={[
            ['sku', 'SKU'],
            ['nombre', 'Nombre'],
            ['categoria', 'Categoria'],
            ['inventario', 'Inventario (contable)'],
            ['fisicoZoho', 'Fisico (informativo)'],
            ['camino', 'En camino (OC emitidas)'],
            ['ocsCamino', 'OC en camino'],
            ['llegada', 'Llegada'],
            ['llegadaEstimada', 'Llegada estimada'],
            ['borrador', 'En borrador'],
            ['ocsBorrador', 'OC en borrador'],
            ['venta', 'Venta diaria (30 dias)'],
            ['cobertura', 'Cobertura (dias)'],
            ['kitApertura', 'Kit por apertura'],
            ['coberturaAperturas', 'Cobertura con aperturas (dias)'],
            ['estatus', 'Estatus'],
          ]}
        />
      </div>
      {ajuste ? (
        <Ajuste3pl
          filas={p.filas}
          saldos={p.saldos3pl}
          autorizadores={p.autorizadores}
          hoy={p.hoy}
          alCerrar={() => setAjuste(false)}
        />
      ) : null}
      {visibles.length === 0 ? (
        <Vacio titulo="Sin artículos con estos filtros" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="text-right">Inventario</th>
                <th className="text-right" title="Físico de Zoho. No se usa en ningún cálculo.">
                  Físico (Informativo)
                </th>
                <th
                  className="text-right"
                  title="Pendiente de recibir de OCs emitidas, parcialmente recibidas o facturadas en Zoho (sin borradores)"
                >
                  En camino
                </th>
                <th
                  className="text-right"
                  title="Llegada más próxima de lo en camino: la fecha de entrega de la OC en Zoho o, si no la tiene, fecha de la OC + lead time del artículo (estimada)"
                >
                  Llegada
                </th>
                <th
                  className="text-right"
                  title="Pendiente de OCs que siguen en borrador en Zoho (todavía no se mandan al proveedor)"
                >
                  En borrador
                </th>
                <th className="text-right">Venta diaria</th>
                <th className="text-right">Cobertura (días)</th>
                <th className="text-right">Cobertura c/aperturas (días)</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => (
                <tr key={f.sku}>
                  <td>
                    <div className="font-medium">{f.nombre}</div>
                    <div className="text-xs text-muted-foreground">{f.sku}</div>
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {f.inventario == null ? '—' : numero(f.inventario)}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {f.fisicoZoho == null ? '—' : numero(f.fisicoZoho)}
                  </td>
                  <td className="text-right tabular-nums" title={f.ocsCamino || undefined}>
                    {f.camino > 0 ? (
                      <>
                        <div>{numero(f.camino)}</div>
                        {f.ocsCamino ? (
                          <div className="text-xs text-muted-foreground">{f.ocsCamino}</div>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {f.llegada ? (
                      <>
                        <div className={f.llegadaAtrasada ? 'font-medium text-destructive' : undefined}>
                          {fechaCorta(f.llegada)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[
                            f.llegadaAtrasada ? 'atrasada' : null,
                            f.llegadaEstimada ? 'estimada' : null,
                            f.llegadaMas > 0 ? `+${f.llegadaMas} OC` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right tabular-nums" title={f.ocsBorrador || undefined}>
                    {f.borrador > 0 ? (
                      <>
                        <div>{numero(f.borrador)}</div>
                        {f.ocsBorrador ? (
                          <div className="text-xs text-muted-foreground">{f.ocsBorrador}</div>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right tabular-nums">{f.venta == null ? '—' : numero(f.venta)}</td>
                  <td className="text-right tabular-nums">{f.cobertura == null ? '—' : f.cobertura}</td>
                  <td className="text-right tabular-nums">
                    {f.coberturaAperturas == null ? '—' : f.coberturaAperturas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visibles.length > ver ? (
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
