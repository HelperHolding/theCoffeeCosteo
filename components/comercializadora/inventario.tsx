'use client';
import { useState } from 'react';
import { Boxes, PackageX } from 'lucide-react';
import { Kpi, Pill, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero, pesos } from '@/lib/comercializadora/formato';
import type { FilaInventario } from '@/lib/comercializadora/inventario';
import { DescargarCsv } from './descargar-csv';
import { Ajuste3pl } from './ajuste-3pl';

const POR_PAGINA = 25;
const TONO: Record<string, Estado> = { rojo: 'pierde', amarillo: 'bajo', verde: 'ok' };
const ESTATUS = ['Activo', 'Compra Recurrente', 'Prueba', 'Hasta Agotar Existencias', 'Inactivo'];

export function Inventario(p: {
  filas: FilaInventario[];
  valor: { valor: number; sinCosto: number };
  viejos: string[];
  ultimoSync: string | null;
  hoy: string;
  editable: boolean;
  autorizadores: string[];
  saldos3pl: Record<string, number | null>;
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
      (!est || (est === 'faltantes' ? f.disponible <= 0 : f.estatus === est)),
  );
  const viejos = new Set(p.viejos);
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
          etiqueta="Faltantes (disponible ≤ 0)"
          valor={p.filas.filter((f) => f.disponible <= 0 && f.estatus !== 'Inactivo').length}
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
          filas={visibles as unknown as Record<string, unknown>[]}
          columnas={[
            ['sku', 'SKU'],
            ['nombre', 'Nombre'],
            ['categoria', 'Categoria'],
            ['fisico', 'CEDIS'],
            ['comprometido', 'Comprometido'],
            ['disponible', 'Disponible'],
            ['tresPl', '3PL'],
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
                <th>SKU</th>
                <th className="text-right">Físico (Zoho)</th>
                <th className="text-right">Contable (Zoho)</th>
                <th className="text-right">Comprometido</th>
                <th className="text-right">Disponible</th>
                <th className="text-right">En camino</th>
                <th className="text-right">Mín</th>
                <th className="text-right">Máx</th>
                <th className="text-right">Venta/día</th>
                <th className="text-right">Cobertura (días)</th>
                <th>Estado</th>
                <th className="text-right">3PL</th>
                <th>Estatus</th>
                <th>Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => (
                <tr key={f.sku}>
                  <td>
                    <div className="font-medium">{f.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.sku} · {f.categoria}
                    </div>
                  </td>
                  <td className="text-right tabular-nums">{numero(f.fisico)}</td>
                  <td className="text-right tabular-nums">{f.contable == null ? '—' : numero(f.contable)}</td>
                  <td className="text-right tabular-nums">{numero(f.comprometido)}</td>
                  <td className="text-right font-semibold tabular-nums">{numero(f.disponible)}</td>
                  <td className="text-right tabular-nums">{numero(f.camino)}</td>
                  <td className="text-right tabular-nums">
                    {f.minimo == null ? '—' : `${numero(f.minimo)}${f.minManual ? ' ✎' : ''}`}
                  </td>
                  <td className="text-right tabular-nums">
                    {f.maximo == null ? '—' : `${numero(f.maximo)}${f.maxManual ? ' ✎' : ''}`}
                  </td>
                  <td className="text-right tabular-nums">{numero(f.venta)}</td>
                  <td className="text-right tabular-nums">{f.cobertura == null ? '—' : f.cobertura}</td>
                  <td>
                    {f.estado ? (
                      <Pill estado={TONO[f.estado]}>
                        {f.estado === 'rojo' ? 'Pedir' : f.estado === 'amarillo' ? 'Atento' : 'Bien'}
                      </Pill>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {numero(f.tresPl)}
                    {viejos.has(f.sku) ? <div className="text-xs text-warn">3PL sin actualizar</div> : null}
                  </td>
                  <td>{f.estatus}</td>
                  <td>{f.proveedor || '—'}</td>
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
