import Link from 'next/link';
import { cn } from 'cn';
import type {
  ResumenBi,
  ResumenComercializadora,
  ResumenCosteo,
  ResumenCrm,
  ResumenFranquicia,
} from '@/lib/inicio/resumenes';
import { Bloque, Mini, Principal } from './bloque';

/** Vistas de los bloques de Inicio: solo presentación (el arnés visual las usa con datos sintéticos). */
const pesos = (cent: number) =>
  (cent / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const pct = (x: number | null, d = 0) =>
  x === null
    ? '—'
    : `${(x * 100).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d })} %`;
const num = (n: number) => n.toLocaleString('es-MX');
const variacion = (a: number, b: number) => (b > 0 ? a / b - 1 : null);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
};

function Cambio({ valor, texto }: { valor: number | null; texto: string }) {
  if (valor === null) return <span>{texto}: sin base completa</span>;
  const sube = valor >= 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'rounded-full px-2 py-0.5 font-bold tabular',
          sube ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
        )}
      >
        {sube ? '▲' : '▼'} {Math.abs(valor * 100).toFixed(1)} %
      </span>
      {texto}
    </span>
  );
}

// ── Costeo ───────────────────────────────────────────────────────────────────────────────────────────────────
const SALUD = [
  { clave: 'ok', nombre: 'En objetivo', color: 'bg-ok' },
  { clave: 'bajo', nombre: 'Bajo objetivo', color: 'bg-warn' },
  { clave: 'pierde', nombre: 'Pierde en un canal', color: 'bg-bad' },
  { clave: 'sin-precio', nombre: 'Sin precio', color: 'bg-line-strong' },
] as const;

export function VistaCosteo({ d }: { d: ResumenCosteo }) {
  const total = Object.values(d.salud).reduce((a, b) => a + b, 0);
  const max = Math.max(0.01, ...d.canales.map((c) => Math.abs(c.margen)), d.objetivo);
  return (
    <Bloque modulo="costeo" subtitulo={`${num(d.productos)} productos activos`}>
      <Principal valor={pct(d.foodCost, 1)} etiqueta="Food cost promedio en mostrador">
        <span>Margen objetivo {pct(d.objetivo)}</span>
      </Principal>
      <p className="mb-1.5 text-xs font-semibold text-ink-2">Salud del menú</p>
      <div
        className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label="Salud del menú"
      >
        {SALUD.filter((s) => d.salud[s.clave]).map((s) => (
          <span
            key={s.clave}
            className={s.color}
            style={{ width: `${(d.salud[s.clave] / Math.max(1, total)) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {SALUD.map((s) => (
          <li key={s.clave} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('size-2 rounded-full', s.color)} />
            <span className="text-ink-2">{s.nombre}</span>
            <span className="ml-auto font-semibold tabular">{d.salud[s.clave]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 mb-1.5 text-xs font-semibold text-ink-2">Margen por canal</p>
      <ul className="space-y-1.5">
        {d.canales.slice(0, 4).map((c) => (
          <li key={c.nombre} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="truncate">{c.nombre}</span>
            <span className="relative h-2 rounded-full bg-surface-2">
              <span
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  c.margen >= d.objetivo ? 'bg-ok' : c.margen >= 0 ? 'bg-warn' : 'bg-bad',
                )}
                style={{ width: `${(Math.max(0, c.margen) / max) * 100}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-y-[-3px] w-0.5 rounded bg-ink/60"
                style={{ left: `${(d.objetivo / max) * 100}%` }}
              />
            </span>
            <span className="text-right font-semibold tabular">{pct(c.margen)}</span>
          </li>
        ))}
      </ul>
      {d.peores.length > 0 && (
        <div className="mt-auto pt-4">
          <p className="mb-1 text-xs font-semibold text-ink-2">Menor margen</p>
          <ul className="divide-y divide-line text-xs">
            {d.peores.map((p) => (
              <li key={`${p.producto}-${p.tamano}`} className="flex justify-between gap-2 py-1.5">
                <span className="truncate">
                  {p.producto} <span className="text-ink-2">· {p.tamano}</span>
                </span>
                <span className={cn('font-bold tabular', p.margen < 0 ? 'text-bad' : 'text-warn')}>
                  {pct(p.margen)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloque>
  );
}

// ── CRM ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function VistaCrm({ d }: { d: ResumenCrm }) {
  const max = Math.max(1, ...d.etapas.map((e) => e.cards));
  const enProceso = d.etapas.reduce((a, e) => a + e.cards, 0);
  return (
    <Bloque modulo="crm" subtitulo={`${num(d.total)} cards en el CRM`}>
      <Principal valor={num(enProceso)} etiqueta="Tiendas en proceso">
        <span>
          {num(d.bloqueadas)} con requisitos pendientes · {num(d.listas)} listas para avanzar
        </span>
      </Principal>
      <ul className="space-y-1.5">
        {d.etapas
          .filter((e) => e.cards > 0)
          .slice(0, 7)
          .map((e, i) => (
            <li key={e.nombre} className="grid grid-cols-[8.5rem_1fr_2.2rem] items-center gap-2 text-xs">
              <span className="truncate">{e.nombre}</span>
              <span className="h-2.5 rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-cambio"
                  style={{ width: `${(e.cards / max) * 100}%`, opacity: 1 - i * 0.08 }}
                />
              </span>
              <span className="text-right font-semibold tabular">{e.cards}</span>
            </li>
          ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Mini valor={num(d.vencen14)} etiqueta="vencen en 14 días" tono={d.vencen14 ? 'warn' : undefined} />
        <Mini valor={num(d.vencidas)} etiqueta="fechas ya vencidas" tono={d.vencidas ? 'bad' : 'ok'} />
      </div>
      {d.proximas.length > 0 && (
        <ul className="mt-auto divide-y divide-line pt-3 text-xs">
          {d.proximas.map((p, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{p.tienda}</span>{' '}
                <span className="text-ink-2">· {p.titulo}</span>
              </span>
              <span className="shrink-0 font-semibold tabular">
                {p.dias === 0 ? 'hoy' : `en ${p.dias} d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}

// ── BI ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function VistaBi({ d }: { d: ResumenBi }) {
  const a = d.anterior;
  return (
    <Bloque modulo="bi" subtitulo={`${fecha(d.desde)} – ${fecha(d.hasta)} · ${num(d.tiendas)} tiendas`}>
      <Principal valor={pesos(d.mes.ventaCent)} etiqueta="Venta del mes (neta, con IVA)">
        <Cambio
          valor={a ? variacion(d.mes.ventaCent, a.ventaCent) : null}
          texto="vs mismos días del mes anterior"
        />
      </Principal>
      <div className="grid grid-cols-3 gap-2">
        <Mini valor={num(d.mes.tickets)} etiqueta="tickets" />
        <Mini valor={d.mes.ticketCent === null ? '—' : pesos(d.mes.ticketCent)} etiqueta="ticket promedio" />
        <Mini valor={d.mes.upt === null ? '—' : d.mes.upt.toFixed(2)} etiqueta="productos por ticket" />
      </div>
      {a && (
        <div
          className="mt-5 space-y-2.5"
          role="img"
          aria-label="Venta de este mes contra los mismos días del mes anterior"
        >
          {[
            { etiqueta: 'Este mes', valor: d.mes.ventaCent, clase: 'bg-cierre' },
            { etiqueta: 'Mes anterior', valor: a.ventaCent, clase: 'bg-cierre/35' },
          ].map((x) => (
            <div key={x.etiqueta} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-2 text-xs">
              <span className="text-ink-2">{x.etiqueta}</span>
              <span className="h-3 rounded-full bg-surface-2">
                <span
                  className={cn('block h-full rounded-full', x.clase)}
                  style={{ width: `${(x.valor / Math.max(1, d.mes.ventaCent, a.ventaCent)) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular">{pesos(x.valor)}</span>
            </div>
          ))}
        </div>
      )}
      {a && (
        <ul className="mt-auto space-y-1 pt-4 text-xs text-ink-2">
          <li>
            <Cambio valor={variacion(d.mes.tickets, a.tickets)} texto="en tickets" />
          </li>
          <li>
            <Cambio
              valor={d.mes.ticketCent && a.ticketCent ? variacion(d.mes.ticketCent, a.ticketCent) : null}
              texto="en ticket promedio"
            />
          </li>
        </ul>
      )}
    </Bloque>
  );
}

// ── Comercializadora ─────────────────────────────────────────────────────────────────────────────────────────
export function VistaComercializadora({ d }: { d: ResumenComercializadora }) {
  const p = d.proyeccion;
  return (
    <Bloque
      modulo="comercializadora"
      subtitulo={p ? `Proyección del ${fecha(p.calculado)}` : 'Sin proyección calculada'}
    >
      <Principal
        valor={d.ov ? pesos(d.ov.montoCent) : '—'}
        etiqueta={d.ov ? `OV sugerida de la semana del ${fecha(d.ov.semana)}` : 'OV sugerida'}
      >
        {d.ov && (
          <span>
            {num(d.ov.piezas)} piezas · {num(d.ov.tiendas)} tiendas
            {d.ov.errores ? ` · ${d.ov.errores} con error` : ''}
          </span>
        )}
      </Principal>
      <div className="grid grid-cols-3 gap-2">
        <Mini
          valor={num(d.cierres.length)}
          etiqueta="proveedores sin stock"
          tono={d.cierres.length ? 'warn' : 'ok'}
        />
        <Mini
          valor={p ? num(p.sinCosto) : '—'}
          etiqueta="SKUs sin costo"
          tono={p?.sinCosto ? 'bad' : undefined}
        />
        <Mini
          valor={p ? num(p.sinProveedor) : '—'}
          etiqueta="SKUs sin proveedor"
          tono={p?.sinProveedor ? 'bad' : undefined}
        />
      </div>
      {d.cierres.length > 0 && (
        <ul className="mt-auto divide-y divide-line pt-3 text-xs">
          {d.cierres.slice(0, 3).map((c, i) => (
            <li key={i} className="flex justify-between gap-2 py-1.5">
              <span className="truncate font-semibold">{c.proveedor}</span>
              <span className="shrink-0 text-ink-2 tabular">
                {c.ultimoDia ? `pedir antes del ${fecha(c.ultimoDia)}` : `hasta el ${fecha(c.fin)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}

// ── Franquiciatarios ─────────────────────────────────────────────────────────────────────────────────────────
const COLOR_SECCION: Record<string, string> = {
  apertura: 'bg-apertura',
  durante: 'bg-durante',
  cambio: 'bg-cambio',
  medio: 'bg-cambio',
  cierre: 'bg-cierre',
};
const CORTO: Record<string, string> = {
  apertura: 'Apertura',
  durante: 'Durante',
  cambio: 'Medio',
  medio: 'Medio',
  cierre: 'Cierre',
};

/** Una fila por sucursal: avance de cada sección del checklist de hoy en barras finas de su color. */
export function VistaFranquiciatarios({ d }: { d: ResumenFranquicia }) {
  const noes = d.sucursales.reduce((a, s) => a + s.secciones.reduce((x, y) => x + y.noes, 0), 0);
  const incid = d.sucursales.reduce((a, s) => a + s.incidencias, 0);
  const conAvance = d.sucursales.filter((s) => s.secciones.some((x) => x.avance > 0)).length;
  const secciones = d.sucursales[0]?.secciones ?? [];
  return (
    <Bloque modulo="franquiciatarios" subtitulo={`Checklists de hoy · ${fecha(d.dia)}`}>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Mini valor={`${conAvance}/${d.sucursales.length}`} etiqueta="sucursales con avance" />
        <Mini valor={num(noes)} etiqueta="respuestas «No»" tono={noes ? 'bad' : 'ok'} />
        <Mini valor={num(incid)} etiqueta="incidencias" tono={incid ? 'warn' : 'ok'} />
      </div>
      {secciones.length > 0 && (
        <div className="mb-1.5 grid grid-cols-[minmax(0,7rem)_repeat(4,minmax(0,1fr))] gap-2 text-[10px] font-semibold text-ink-2">
          <span />
          {secciones.slice(0, 4).map((x) => (
            <span key={x.clave} className="flex items-center gap-1">
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', COLOR_SECCION[x.clave])} />
              {CORTO[x.clave] ?? x.nombre}
            </span>
          ))}
        </div>
      )}
      <ul className="divide-y divide-line/60">
        {d.sucursales.map((s) => (
          <li
            key={s.companyId}
            className="grid grid-cols-[minmax(0,7rem)_repeat(4,minmax(0,1fr))] items-center gap-2 py-2"
          >
            <Link
              href={`/franquiciatarios/${s.companyId}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {s.nombre}
            </Link>
            {s.secciones.slice(0, 4).map((x) => (
              <span
                key={x.clave}
                className="h-2 rounded-full bg-ink/10"
                role="img"
                aria-label={`${s.nombre}, ${x.nombre}: ${pct(x.avance)}`}
              >
                <span
                  className={cn('block h-full rounded-full', COLOR_SECCION[x.clave])}
                  style={{ width: `${Math.max(x.avance > 0 ? 6 : 0, x.avance * 100)}%` }}
                />
              </span>
            ))}
          </li>
        ))}
      </ul>
      {d.mas > 0 && (
        <p className="mt-2 text-xs text-ink-2">Y {d.mas} sucursales más: ábrelas en el módulo.</p>
      )}
    </Bloque>
  );
}
