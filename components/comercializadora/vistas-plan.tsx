import Link from 'next/link';
import { Pill, type Estado } from '@/components/portal/piezas';

/** Parámetros de la URL de una pantalla del plan, con cambios (undefined o '' quita el parámetro). */
export function hrefPlan(
  ruta: string,
  actual: Record<string, string | undefined>,
  cambios: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...actual, ...cambios })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

/** _ifNav: las vistas de la pantalla como enlaces (?vista=), conservando el escenario y "Ver todo". */
export function NavVistas(p: {
  ruta: string;
  vistas: [string, string][];
  activa: string;
  params: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Vistas" className="mb-4 flex flex-wrap gap-1.5">
      {p.vistas.map(([v, t]) => (
        <Link
          key={v}
          href={hrefPlan(p.ruta, p.params, { vista: v, cuando: undefined, todos: undefined })}
          aria-current={p.activa === v ? 'page' : undefined}
          className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.activa === v ? 'border-ink font-bold' : 'border-line text-ink-2'}`}
        >
          {t}
        </Link>
      ))}
      <span className="flex-1" />
      <Link
        href={hrefPlan(p.ruta, p.params, { det: p.params.det ? undefined : '1', vista: undefined })}
        className="px-2 py-1.5 text-sm font-semibold underline"
      >
        {p.params.det ? 'Vista simple' : 'Ver todo'}
      </Link>
    </nav>
  );
}

/** Caja de avisos (_impAvisosHtml / _cafeAvisosHtml); plegada en Qué pedir. */
export function AvisosPlan({ avisos, plegado }: { avisos: string[]; plegado?: boolean }) {
  if (!avisos.length) return null;
  const lista = (
    <ul className="space-y-1 text-sm text-ink-2">
      {avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
  return plegado ? (
    <details className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Avisos del cálculo ({avisos.length})</summary>
      <div className="mt-2">{lista}</div>
    </details>
  ) : (
    <div className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <p className="mb-1 text-sm font-bold">Avisos</p>
      {lista}
    </div>
  );
}

/** Tarjeta chica de cifra (_ifKpi). */
export function CifraPlan(p: {
  etiqueta: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
  tono?: Estado;
  ayuda?: string;
}) {
  const color = { ok: 'text-ok', bajo: 'text-warn', pierde: 'text-bad', 'sin-precio': '', neutro: '' }[
    p.tono ?? 'neutro'
  ];
  return (
    <div
      title={p.ayuda}
      className="min-w-40 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <p className="text-xs font-medium text-ink-2">{p.etiqueta}</p>
      <p className={`mt-1 truncate font-display text-xl font-bold tabular-nums ${color}`}>{p.valor}</p>
      {p.nota ? <p className="mt-1 text-xs text-muted-foreground">{p.nota}</p> : null}
    </div>
  );
}

/** Sección con título y ayuda (_ifSec). */
export function SeccionPlan({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2>{titulo}</h2>
      {ayuda ? <p className="mt-1 max-w-4xl text-xs text-muted-foreground">{ayuda}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Banda de proveedor y filas de las vistas "Qué pedir" (_ordVistaHtml / _impVistaAhora): una sola tabla alineada. */
export interface GrupoQuePedir {
  clave: string;
  nombre: string;
  chips: { texto: string; estado: Estado }[];
  accion?: React.ReactNode;
  filas: {
    clave: string;
    nombre: string;
    sku: string;
    marca?: React.ReactNode;
    detalle?: React.ReactNode;
    visual: React.ReactNode;
    pedir: React.ReactNode;
    quedas: React.ReactNode;
    porQue: React.ReactNode;
    ayuda: string;
    tono: 'esta' | 'prox' | 'espera' | '';
  }[];
}
const BORDE = {
  esta: 'border-l-bad',
  prox: 'border-l-warn',
  espera: 'border-l-line-strong',
  '': 'border-l-transparent',
};
export function TablaQuePedir({
  grupos,
  simple,
  columnaVisual,
  vacio,
}: {
  grupos: GrupoQuePedir[];
  simple: boolean;
  columnaVisual: string;
  vacio: string;
}) {
  if (!grupos.length) return <p className="py-10 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div className="placa overflow-x-auto">
      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>{columnaVisual}</th>
            <th>Qué pedir</th>
            <th title="Inventario cuando llegue el pedido">Quedas con</th>
            {simple ? null : <th>Por qué</th>}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => [
            <tr key={g.clave} className="bg-surface-2">
              <td colSpan={simple ? 4 : 5}>
                <div className="flex flex-wrap items-center gap-2">
                  <b>{g.nombre}</b>
                  {g.chips.map((c) => (
                    <Pill key={c.texto} estado={c.estado}>
                      {c.texto}
                    </Pill>
                  ))}
                  <span className="flex-1" />
                  {g.accion}
                </div>
              </td>
            </tr>,
            ...g.filas.map((f) => (
              <tr
                key={g.clave + '|' + f.clave}
                title={f.ayuda}
                className={`border-l-4 align-top ${BORDE[f.tono]}`}
              >
                <td className="min-w-48">
                  <b>{f.nombre}</b>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {f.sku}
                    {f.marca}
                  </span>
                  {f.detalle}
                </td>
                <td className="min-w-56">{f.visual}</td>
                <td>{f.pedir}</td>
                <td>{f.quedas}</td>
                {simple ? null : <td className="min-w-56 text-xs text-ink-2">{f.porQue}</td>}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
