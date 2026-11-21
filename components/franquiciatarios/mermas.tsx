'use client';
import { useState, useTransition } from 'react';
import { CircleAlert, LoaderCircle, Lock } from 'lucide-react';
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
  return (
    <div className="space-y-6">
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
      className="rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <h2 id="registrar" className="text-lg">
        Registrar merma
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
        <label className="text-sm">
          <span className="mb-1 block font-medium">Motivo</span>
          <select className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoMerma)}>
            <option value="">Elige…</option>
            {(Object.keys(MOTIVOS) as MotivoMerma[]).map((m) => (
              <option key={m} value={m}>
                {MOTIVOS[m]}
              </option>
            ))}
          </select>
        </label>
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
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
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
  return (
    <li className="space-y-2 px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{insumo?.nombre ?? 'Insumo'}</span>
        <span className="tabular">
          {num(Number(m.cantidad))} {insumo?.unidad}
        </span>
        <span className="text-ink-2">
          {MOTIVOS[m.motivo]}
          {m.nota ? ` · ${m.nota}` : ''}
        </span>
        <span className="ml-auto text-xs text-ink-2">
          {m.nombre} · {hora(m.registrado_en)}
        </span>
        {editable && !anulando && (
          <Button size="sm" variant="outline" onClick={() => setAnulando(true)}>
            Anular
          </Button>
        )}
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
            {filas.map((f) => (
              <FilaComparacion key={f.insumoId} companyId={companyId} f={f} />
            ))}
          </tbody>
        </table>
      </div>
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
