'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { CAMPOS_CATALOGO, type CampoCatalogo } from '@/lib/comercializadora/catalogo';
import {
  guardarCampoCatalogo,
  guardarMinMaxManual,
} from '@/app/(comercializadora)/comercializadora/acciones';
import type { ArticuloCatalogoFila } from '@/app/(comercializadora)/comercializadora/catalogo/page';

const POR_PAGINA = 25;
type MM = {
  minimo_calc: number;
  maximo_calc: number;
  minimo_manual: number | null;
  maximo_manual: number | null;
};
const COLUMNA: Record<Exclude<CampoCatalogo, 'lt'>, keyof ArticuloCatalogoFila> = {
  apertura: 'cantidad_por_apertura',
  minimo: 'minimo_compra_pzas',
  multiplo: 'multiplo_compra',
  dseg: 'dias_seguridad',
};

export function Catalogo(p: {
  filas: ArticuloCatalogoFila[];
  leadTimes: Record<string, number | null>;
  minmax: Record<string, MM>;
  editable: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({});
  const [pendiente, iniciar] = useTransition();
  const texto = q.trim().toLowerCase();
  const visibles = p.filas.filter(
    (f) =>
      !texto ||
      f.sku.toLowerCase().includes(texto) ||
      String(f.nombre ?? '')
        .toLowerCase()
        .includes(texto) ||
      String(f.zoho_vendor_name ?? '')
        .toLowerCase()
        .includes(texto),
  );

  const correr = (clave: string, fn: () => Promise<{ error: string } | { ok: true }>) =>
    iniciar(async () => {
      const r = await fn();
      setMsg((m) => ({
        ...m,
        [clave]: 'error' in r ? { ok: false, t: r.error } : { ok: true, t: 'Guardado' },
      }));
      if (!('error' in r)) router.refresh();
    });

  const celda = (f: ArticuloCatalogoFila, campo: CampoCatalogo) => {
    const valor = campo === 'lt' ? p.leadTimes[f.sku] : f[COLUMNA[campo as Exclude<CampoCatalogo, 'lt'>]];
    const clave = `${f.sku}:${campo}`;
    return (
      <td key={campo} className="min-w-28 text-right">
        {p.editable ? (
          <input
            aria-label={`${CAMPOS_CATALOGO[campo].etiqueta} de ${f.sku}`}
            inputMode="decimal"
            defaultValue={valor == null ? '' : String(valor)}
            onBlur={(e) => {
              if (e.target.value !== (valor == null ? '' : String(valor)))
                correr(clave, () => guardarCampoCatalogo(f.sku, campo, e.target.value));
            }}
            className={`${claseCampo} h-9 text-right`}
            disabled={pendiente}
          />
        ) : (
          <span className="tabular-nums">{valor == null ? '—' : numero(Number(valor))}</span>
        )}
        {msg[clave] ? (
          <div
            role={msg[clave].ok ? 'status' : 'alert'}
            className={`text-xs ${msg[clave].ok ? 'text-muted-foreground' : 'text-bad'}`}
          >
            {msg[clave].t}
          </div>
        ) : null}
      </td>
    );
  };

  return (
    <div className="space-y-5">
      <input
        type="search"
        aria-label="Buscar artículo"
        placeholder="Buscar SKU, nombre o proveedor"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={`${claseCampo} max-w-sm`}
      />
      {visibles.length === 0 ? (
        <Vacio titulo="Sin artículos con esta búsqueda" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="text-right">Lead time (días)</th>
                <th className="text-right">Pzas por apertura</th>
                <th className="text-right">Mín. compra (pzas)</th>
                <th className="text-right">Múltiplo</th>
                <th className="text-right">Días de seguridad</th>
                <th>Mín / Máx</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => {
                const mm = p.minmax[f.sku];
                const clave = `${f.sku}:minmax`;
                return (
                  <tr key={f.sku}>
                    <td>
                      <div className="font-medium">{f.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.sku} · {f.zoho_vendor_name ?? 'sin proveedor'}
                        {f.zoho_lead_time != null ? ` · LT Zoho ${f.zoho_lead_time}` : ''}
                      </div>
                    </td>
                    {(['lt', 'apertura', 'minimo', 'multiplo', 'dseg'] as CampoCatalogo[]).map((c) =>
                      celda(f, c),
                    )}
                    <td className="min-w-56">
                      {mm ? (
                        p.editable ? (
                          <form
                            className="flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const d = new FormData(e.currentTarget);
                              correr(clave, () =>
                                guardarMinMaxManual(
                                  f.sku,
                                  String(d.get('min') ?? ''),
                                  String(d.get('max') ?? ''),
                                ),
                              );
                            }}
                          >
                            <input
                              name="min"
                              aria-label={`Mínimo manual de ${f.sku}`}
                              placeholder={numero(mm.minimo_calc)}
                              defaultValue={mm.minimo_manual ?? ''}
                              className={`${claseCampo} h-9 max-w-20 text-right`}
                            />
                            <input
                              name="max"
                              aria-label={`Máximo manual de ${f.sku}`}
                              placeholder={numero(mm.maximo_calc)}
                              defaultValue={mm.maximo_manual ?? ''}
                              className={`${claseCampo} h-9 max-w-20 text-right`}
                            />
                            <button
                              type="submit"
                              disabled={pendiente}
                              className="h-9 rounded-[10px] border border-line-strong px-2 text-xs font-semibold"
                            >
                              Guardar
                            </button>
                          </form>
                        ) : (
                          <span className="tabular-nums">
                            {numero(mm.minimo_manual ?? mm.minimo_calc)} /{' '}
                            {numero(mm.maximo_manual ?? mm.maximo_calc)}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin cálculo</span>
                      )}
                      {msg[clave] ? (
                        <div
                          role={msg[clave].ok ? 'status' : 'alert'}
                          className={`text-xs ${msg[clave].ok ? 'text-muted-foreground' : 'text-bad'}`}
                        >
                          {msg[clave].t}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
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
      <p className="text-xs text-muted-foreground">
        Mín/Máx vacío = usar el calculado (se muestra en gris). Los cambios entran en la próxima corrida del
        cálculo.
      </p>
    </div>
  );
}
