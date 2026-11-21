'use client';
import { useState, useTransition } from 'react';
import {
  CalendarX2,
  ChefHat,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Droplets,
  LoaderCircle,
  Lock,
  Trash2,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  cerrarMermas,
  guardarTolerancia,
  registrarMerma,
  type Resultado,
} from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import { MOTIVOS, type FilaMerma } from '@/lib/franquiciatarios/mermas';
import type { MermasDia } from '@/lib/franquiciatarios/mermas-servidor';
import type { FranqMerma, MotivoMerma } from '@/lib/franquiciatarios/tipos';
import { Vacio } from '@/components/portal/piezas';
import { hora } from './formato';
import { TONO, type Tono } from './colores';

/** Color e ícono por motivo (tipo de información, no estado). */
const ESTILO_MOTIVO: Record<MotivoMerma, { tono: Tono; icono: LucideIcon }> = {
  caducidad: { tono: 'apertura', icono: CalendarX2 },
  preparacion: { tono: 'cambio', icono: ChefHat },
  caida: { tono: 'cierre', icono: Droplets },
  devolucion: { tono: 'tira', icono: Undo2 },
  otro: { tono: 'pedidos', icono: CircleHelp },
};

const campo =
  'h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35';
const pesos = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

function useAccion() {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (fn: () => Promise<Resultado>, ok?: () => void) =>
    iniciar(async () => {
      setError(null);
      let r: Resultado;
      try {
        r = await fn();
      } catch {
        r = { error: 'No se guardó: no hay conexión.' };
      }
      if ('error' in r) setError(r.error);
      else ok?.();
    });
  return { error, pendiente, correr };
}

function Fallo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-bad">
      <CircleAlert size={14} aria-hidden="true" /> {texto}
    </p>
  );
}

/** Mermas del día: captura (si el día sigue abierto o si es la gerencia) y lo registrado. */
export function MermasFranq({
  companyId,
  datos,
  gestor,
  hoy,
}: {
  companyId: number;
  datos: MermasDia;
  gestor: boolean;
  hoy: string;
}) {
  const activos = datos.insumos.filter((i) => i.activo).sort((a, b) => a.orden - b.orden);
  const esHoy = datos.dia === hoy;
  const cerrado = !!datos.cierre;
  const puedeCapturar = (esHoy && !cerrado) || (gestor && esHoy);
  if (!datos.insumos.length)
    return (
      <Vacio titulo="Sin lista de insumos">
        Las mermas se registran sobre la lista de insumos de conteo. La gerencia la arma en «Inventario».
      </Vacio>
    );
  const fuera = datos.filas?.filter((f) => f.fuera).length ?? null;
  const valor = datos.filas?.reduce((x, f) => x + (f.valor ?? 0), 0) ?? null;
  return (
    <div className="space-y-6">
      <div className={cn('grid gap-2 sm:gap-3', gestor ? 'grid-cols-3' : 'grid-cols-2')}>
        <Kpi
          tono="tira"
          icono={Trash2}
          titulo={esHoy ? 'Registradas hoy' : 'Registradas'}
          valor={String(datos.registros.length)}
          detalle={`${new Set(datos.registros.map((m) => m.insumo_id)).size} insumos distintos`}
        />
        {gestor && (
          <Kpi
            tono={fuera ? 'alerta' : 'durante'}
            icono={fuera ? CircleAlert : CircleCheck}
            titulo="Fuera de tolerancia"
            valor={fuera === null ? '—' : String(fuera)}
            detalle={fuera ? 'Revisa los insumos marcados abajo' : 'Todo dentro de lo esperado'}
          />
        )}
        {gestor ? (
          <Kpi
            tono="incidencia"
            icono={Wallet}
            titulo="Valor a costo"
            valor={valor === null ? '—' : pesos(valor)}
            detalle="Lo que costó lo que se perdió"
          />
        ) : (
          <Kpi
            tono={cerrado ? 'cierre' : 'ventas'}
            icono={Lock}
            titulo="Estado del día"
            valor={cerrado ? 'Cerrado' : 'Abierto'}
            detalle={cerrado ? 'Ya no se registran mermas' : 'Registra cada merma al momento'}
          />
        )}
      </div>
      {cerrado && (
        <p className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 text-sm">
          <Lock size={15} aria-hidden="true" /> Día cerrado por {datos.cierre!.nombre} a las{' '}
          {hora(datos.cierre!.cerrado_en)}.
          {gestor ? ' Un cambio pide motivo.' : ' Si falta algo, avisa a la gerencia.'}
        </p>
      )}
      {puedeCapturar && <Captura companyId={companyId} insumos={activos} pideMotivo={cerrado} />}
      <Registros
        companyId={companyId}
        datos={datos}
        gestor={gestor}
        editable={esHoy && (!cerrado || gestor)}
      />
      {gestor && datos.filas && <Comparacion companyId={companyId} datos={datos} />}
    </div>
  );
}

function Kpi({
  tono,
  icono: Icono,
  titulo,
  valor,
  detalle,
}: {
  tono: Tono;
  icono: LucideIcon;
  titulo: string;
  valor: string;
  detalle: string;
}) {
  const t = TONO[tono];
  return (
    <div
      className={cn('relative overflow-hidden rounded-3xl border p-3 shadow-card sm:p-4', t.brillo, t.borde)}
    >
      <span
        className={cn('grid size-8 place-items-center rounded-xl text-primary-foreground sm:size-9', t.marca)}
      >
        <Icono size={16} aria-hidden="true" />
      </span>
      <p className="mt-2 text-[11px] leading-tight font-semibold text-ink-2 sm:mt-3 sm:text-xs">{titulo}</p>
      <p className="font-display text-xl leading-tight font-black tabular sm:text-3xl">{valor}</p>
      <p className="hidden text-xs text-ink-2 sm:block">{detalle}</p>
    </div>
  );
}

function Captura({
  companyId,
  insumos,
  pideMotivo,
}: {
  companyId: number;
  insumos: MermasDia['insumos'];
  pideMotivo: boolean;
}) {
  const a = useAccion();
  const [insumo, setInsumo] = useState<number | ''>('');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState<MotivoMerma | ''>('');
  const [nota, setNota] = useState('');
  const [motivoCorr, setMotivoCorr] = useState('');
  const elegido = insumos.find((i) => i.id === insumo);
  const n = Number(cantidad.replace(',', '.'));
  const listo =
    !!insumo &&
    n > 0 &&
    !!motivo &&
    (motivo !== 'otro' || nota.trim().length >= 3) &&
    (!pideMotivo || motivoCorr.trim().length >= 3);
  return (
    <section
      aria-labelledby="registrar"
      className={cn('rounded-3xl border p-5 shadow-card', TONO.tira.brillo, TONO.tira.borde)}
    >
      <h2 id="registrar" className="flex items-center gap-2 text-lg">
        <Trash2 size={18} aria-hidden="true" className={TONO.tira.texto} /> Registrar merma
      </h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listo) return;
          a.correr(
            () =>
              registrarMerma({
                companyId,
                insumo: insumo || null,
                cantidad: n,
                motivo: motivo || null,
                nota: nota || null,
                motivoCorreccion: pideMotivo ? motivoCorr : null,
              }),
            () => {
              setInsumo('');
              setCantidad('');
              setMotivo('');
              setNota('');
              setMotivoCorr('');
            },
          );
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block font-medium">Insumo</span>
          <select className={campo} value={insumo} onChange={(e) => setInsumo(Number(e.target.value) || '')}>
            <option value="">Elige…</option>
            {insumos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Cantidad{elegido ? ` (${elegido.unidad})` : ''}</span>
          <input
            className={cn(campo, 'text-right tabular')}
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
          />
        </label>
        <fieldset className="text-sm sm:col-span-2 lg:col-span-4">
          <legend className="mb-1.5 font-medium">Motivo</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MOTIVOS) as MotivoMerma[]).map((m) => {
              const e = ESTILO_MOTIVO[m];
              const Icono = e.icono;
              const activo = motivo === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setMotivo(m)}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                    activo
                      ? cn(TONO[e.tono].marca, 'border-transparent text-primary-foreground')
                      : cn('bg-surface hover:border-line-strong', TONO[e.tono].borde),
                  )}
                >
                  <Icono size={15} aria-hidden="true" className={activo ? undefined : TONO[e.tono].texto} />
                  {MOTIVOS[m]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Nota{motivo === 'otro' ? '' : ' (opcional)'}</span>
          <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </label>
        {pideMotivo && (
          <label className="text-sm sm:col-span-2 lg:col-span-4">
            <span className="mb-1 block font-medium">Motivo del cambio (el día ya se cerró)</span>
            <input
              className={campo}
              value={motivoCorr}
              onChange={(e) => setMotivoCorr(e.target.value)}
              maxLength={300}
            />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={!listo || a.pendiente}>
            {a.pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Registrar merma
          </Button>
          <Fallo texto={a.error} />
        </div>
      </form>
    </section>
  );
}

function Registros({
  companyId,
  datos,
  gestor,
  editable,
}: {
  companyId: number;
  datos: MermasDia;
  gestor: boolean;
  editable: boolean;
}) {
  const nombre = new Map(datos.insumos.map((i) => [i.id, i]));
  return (
    <section aria-labelledby="registradas" className="space-y-2">
      <h2 id="registradas" className="text-lg">
        Registradas
      </h2>
      {!datos.registros.length ? (
        <p className="text-sm text-muted-foreground">Sin mermas registradas este día.</p>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {datos.registros.map((m) => (
            <Registro
              key={m.id}
              companyId={companyId}
              m={m}
              insumo={nombre.get(m.insumo_id)}
              editable={editable}
              pideMotivo={gestor && !!datos.cierre}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Registro({
  companyId,
  m,
  insumo,
  editable,
  pideMotivo,
}: {
  companyId: number;
  m: FranqMerma;
  insumo?: MermasDia['insumos'][number];
  editable: boolean;
  pideMotivo: boolean;
}) {
  const a = useAccion();
  const [motivo, setMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);
  const e = ESTILO_MOTIVO[m.motivo];
  const Icono = e.icono;
  return (
    <li
      className={cn(
        'relative space-y-2 overflow-hidden rounded-2xl border bg-surface py-3 pr-3 pl-4 text-sm shadow-card',
        TONO[e.tono].borde,
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5', TONO[e.tono].marca)} />
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TONO[e.tono].suave)}>
          <Icono size={16} aria-hidden="true" className={TONO[e.tono].texto} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-semibold">{insumo?.nombre ?? 'Insumo'}</p>
          <p className="text-xs text-ink-2">
            {MOTIVOS[m.motivo]}
            {m.nota ? ` · ${m.nota}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.nombre} · {hora(m.registrado_en)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-display text-lg leading-none font-black tabular">
            {num(Number(m.cantidad))}
          </span>
          <span className="max-w-28 text-right text-[11px] leading-tight text-ink-2">{insumo?.unidad}</span>
          {editable && !anulando && (
            <button
              type="button"
              onClick={() => setAnulando(true)}
              className="text-xs font-semibold text-ink-2 underline hover:text-bad"
            >
              Anular
            </button>
          )}
        </div>
      </div>
      {anulando && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            a.correr(() =>
              registrarMerma({
                companyId,
                insumo: null,
                cantidad: null,
                motivo: null,
                corrige: m.id,
                anular: true,
                motivoCorreccion: motivo || null,
              }),
            );
          }}
        >
          {pideMotivo && (
            <input
              aria-label="Motivo de la anulación"
              className={cn(campo, 'h-9 min-w-0 flex-1')}
              placeholder="Motivo de la anulación"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          )}
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={a.pendiente || (pideMotivo && motivo.trim().length < 3)}
          >
            {a.pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Confirmar anulación
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAnulando(false)}>
            Cancelar
          </Button>
          <Fallo texto={a.error} />
        </form>
      )}
    </li>
  );
}

/** Gerencia: merma contra el consumo teórico del día, tolerancia por insumo, valor a costo y cierre del día. */
function Comparacion({ companyId, datos }: { companyId: number; datos: MermasDia }) {
  const filas = datos.filas!;
  const conMerma = filas.filter((f) => f.merma > 0);
  const fuera = filas.filter((f) => f.fuera).length;
  const valor = filas.reduce((s, f) => s + (f.valor ?? 0), 0);
  const a = useAccion();
  const [confirmar, setConfirmar] = useState(false);
  const [todos, setTodos] = useState(false);
  const visibles = todos ? filas : filas.filter((f) => f.merma > 0 || f.fuera);
  return (
    <section aria-labelledby="tolerancia" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="tolerancia" className="text-lg">
          Contra el consumo teórico
        </h2>
        <p className={cn('text-sm', fuera ? 'font-semibold text-bad' : 'text-ink-2')}>
          {fuera ? `${fuera} fuera de tolerancia` : 'Todo dentro de tolerancia'} · Valor a costo{' '}
          {pesos(valor)}
        </p>
      </div>
      {datos.aviso && (
        <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm">
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" /> {datos.aviso}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Insumo</th>
              <th className="px-3 py-2 text-right font-medium">Merma</th>
              <th className="px-3 py-2 text-right font-medium">Consumo teórico</th>
              <th className="px-3 py-2 text-right font-medium">% merma</th>
              <th className="px-3 py-2 text-right font-medium">Tolerancia</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visibles.map((f) => (
              <FilaComparacion key={f.insumoId} companyId={companyId} f={f} />
            ))}
            {!visibles.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Sin mermas registradas este día.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setTodos((x) => !x)} className="text-sm font-semibold underline">
        {todos
          ? 'Ver solo los insumos con merma'
          : `Ver los ${filas.length} insumos de la lista (y su tolerancia)`}
      </button>
      <p className="text-xs text-muted-foreground">
        Consumo teórico = recetas × lo vendido ese día (POS y Rappi), en la unidad de conteo. Un insumo dado
        de alta a mano no tiene teórico. {conMerma.length} insumos con merma.
      </p>
      {!datos.cierre && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmar ? (
            <>
              <span className="text-sm">Después de cerrar, solo la gerencia agrega o anula, con motivo.</span>
              <Button
                disabled={a.pendiente}
                onClick={() =>
                  a.correr(
                    () => cerrarMermas(companyId, datos.dia),
                    () => setConfirmar(false),
                  )
                }
              >
                {a.pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Cerrar el día
              </Button>
              <Button variant="outline" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirmar(true)}>
              <Lock aria-hidden="true" /> Cerrar las mermas del día
            </Button>
          )}
          <Fallo texto={a.error} />
        </div>
      )}
    </section>
  );
}

function FilaComparacion({ companyId, f }: { companyId: number; f: FilaMerma }) {
  const a = useAccion();
  const [pct, setPct] = useState(String(f.tolerancia));
  const n = Number(pct.replace(',', '.'));
  const cambio = pct.trim() !== '' && Number.isFinite(n) && n !== f.tolerancia;
  return (
    <tr className={cn(f.fuera && 'bg-bad-soft/40')}>
      <td className="px-4 py-2">
        <span className="font-medium">{f.nombre}</span>
        <span className="block text-xs text-ink-2">{f.unidad}</span>
      </td>
      <td className="px-3 py-2 text-right tabular">{f.merma ? num(f.merma) : '—'}</td>
      <td className="px-3 py-2 text-right tabular">{f.teorico === null ? 'Sin teórico' : num(f.teorico)}</td>
      <td className={cn('px-3 py-2 text-right tabular', f.fuera && 'font-semibold text-bad')}>
        {f.pct !== null && f.merma > 0 && (
          <span
            className="mb-1 ml-auto block h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"
            aria-hidden="true"
          >
            <span
              className={cn('block h-full rounded-full', f.fuera ? 'bg-bad' : 'bg-ok')}
              style={{ width: `${Math.min(100, (f.pct * 100 * 100) / Math.max(f.tolerancia * 2, 0.01))}%` }}
            />
          </span>
        )}
        {!f.merma ? '—' : f.pct === null ? (f.teorico === 0 ? 'Sin venta' : '—') : `${num(f.pct * 100)} %`}
      </td>
      <td className="px-3 py-2 text-right">
        <form
          className="inline-flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (cambio) a.correr(() => guardarTolerancia(companyId, f.insumoId, n));
          }}
        >
          <input
            aria-label={`Tolerancia de ${f.nombre} (%)`}
            className={cn(campo, 'h-8 w-16 text-right tabular')}
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
          <span className="text-xs text-ink-2">%</span>
          {cambio && (
            <Button type="submit" size="sm" disabled={a.pendiente}>
              Guardar
            </Button>
          )}
        </form>
        {a.error && <Fallo texto={a.error} />}
      </td>
      <td className="px-4 py-2 text-right tabular">{f.valor === null || !f.merma ? '—' : pesos(f.valor)}</td>
    </tr>
  );
}
