'use client';
import { useMemo, useState, useTransition } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, PackageCheck, Truck } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { recibirPedido, type Resultado } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { PedidoFranq } from '@/lib/franquiciatarios/pedidos';
import { Franja } from './colores';
import { hora } from './formato';

const SIN_RED = 'No se guardó: no hay conexión. Lo capturado sigue aquí; reintenta cuando vuelva la red.';
const pesos = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const fecha = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
        .format(new Date(iso))
        .replace(/\./g, '')
    : 'Sin fecha';
const cantidad = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

/**
 * Pedidos de la sucursal a la Comercializadora y su recepción. Los montos solo llegan si el servidor los mandó
 * (administrador); los demás ven productos, cantidades y estado.
 */
export function PedidosFranq({
  companyId,
  pedidos,
  conMontos,
}: {
  companyId: number;
  pedidos: PedidoFranq[];
  conMontos: boolean;
}) {
  const porRecibir = pedidos.filter((p) => p.recibible).length;
  const conDif = pedidos.filter((p) => p.recepcion && !p.recepcion.completo).length;
  const enCamino = pedidos.filter((p) => p.estado === 'enviado').length;
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-3 gap-3">
        <Cifra titulo="Por recibir" valor={porRecibir} tono={porRecibir ? 'text-warn' : undefined} />
        <Cifra titulo="En camino" valor={enCamino} />
        <Cifra titulo="Con diferencias" valor={conDif} tono={conDif ? 'text-bad' : undefined} />
      </dl>
      {pedidos.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-2 shadow-card">
          No hay pedidos en los últimos 120 días.
        </p>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((p) => (
            <Pedido key={p.id} companyId={companyId} pedido={p} conMontos={conMontos} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, tono }: { titulo: string; valor: number; tono?: string }) {
  return (
    <div className="rounded-2xl border border-pedidos/40 bg-linear-to-t from-pedidos/20 to-surface px-4 py-3 shadow-card">
      <dt className="text-xs text-ink-2">{titulo}</dt>
      <dd className={cn('font-display text-2xl font-black tabular', tono)}>{valor}</dd>
    </div>
  );
}

function Pedido({
  companyId,
  pedido,
  conMontos,
}: {
  companyId: number;
  pedido: PedidoFranq;
  conMontos: boolean;
}) {
  const [abierto, setAbierto] = useState(pedido.recibible);
  const [recibiendo, setRecibiendo] = useState(false);
  const r = pedido.recepcion;
  const cancelado = pedido.estado.startsWith('cancela');
  return (
    <li className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 pl-5 shadow-card sm:p-5 sm:pl-6">
      <Franja tono="pedidos" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground first-letter:uppercase">{fecha(pedido.fecha)}</p>
          <h3 className="font-display text-lg font-bold">{pedido.folio}</h3>
          <p className="text-sm text-ink-2">
            {pedido.lineas.length} {pedido.lineas.length === 1 ? 'producto' : 'productos'} ·{' '}
            {cantidad(pedido.piezas)} piezas
            {conMontos && pedido.total !== undefined && (
              <span className="font-semibold text-ink"> · {pesos(pedido.total)}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              cancelado ? 'bg-surface-2 text-muted-foreground' : 'bg-pedidos-soft text-ink',
            )}
          >
            <Truck size={13} aria-hidden="true" /> {pedido.estadoTexto}
          </span>
          {r ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                r.completo ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
              )}
            >
              {r.completo ? (
                <CircleCheck size={13} aria-hidden="true" />
              ) : (
                <CircleAlert size={13} aria-hidden="true" />
              )}
              {r.completo ? 'Recibido completo' : `${r.diferencias.length} con diferencia`}
            </span>
          ) : (
            (pedido.recibible && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">
                <PackageCheck size={13} aria-hidden="true" /> Por recibir
              </span>
            )) ||
            (pedido.cerradoSinRecepcion && (
              <span
                title="Pasaron más de 14 días: ya no se registra su recepción en el portal."
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2"
              >
                Cerrado sin recepción
              </span>
            ))
          )}
        </div>
      </div>

      {r && (
        <p className="mt-2 text-xs text-muted-foreground">
          Recibió {r.nombre} el {fecha(r.registrado_en)} a las {hora(r.registrado_en)}
          {r.observacion && <span className="text-ink-2"> · «{r.observacion}»</span>}
        </p>
      )}

      <details className="mt-3" open={abierto} onToggle={(e) => setAbierto(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-semibold text-ink-2 hover:text-ink">
          Ver productos
        </summary>
        {recibiendo ? (
          <Recepcion companyId={companyId} pedido={pedido} alTerminar={() => setRecibiendo(false)} />
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Producto</th>
                <th className="py-1.5 pl-3 text-right font-medium">Pedido</th>
                {r && !r.completo && <th className="py-1.5 pl-3 text-right font-medium">Recibido</th>}
                {conMontos && <th className="py-1.5 pl-3 text-right font-medium">Precio</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pedido.lineas.map((l, i) => {
                const dif = r?.diferencias.find((d) => d.nombre === l.nombre && (d.sku ?? null) === l.sku);
                return (
                  <tr key={`${l.sku ?? l.nombre}-${i}`}>
                    <td className="py-2 pr-3">
                      {l.nombre}
                      {l.variante && <span className="text-muted-foreground"> · {l.variante}</span>}
                    </td>
                    <td className="py-2 pl-3 text-right tabular">{cantidad(l.cantidad)}</td>
                    {r && !r.completo && (
                      <td className={cn('py-2 pl-3 text-right tabular', dif && 'font-semibold text-bad')}>
                        {cantidad(dif ? dif.recibido : l.cantidad)}
                      </td>
                    )}
                    {conMontos && <td className="py-2 pl-3 text-right tabular">{pesos(l.precio ?? 0)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </details>
      {pedido.recibible && !recibiendo && (
        <Button
          size="lg"
          className="mt-3 w-full sm:w-auto"
          onClick={() => {
            setAbierto(true);
            setRecibiendo(true);
          }}
        >
          <PackageCheck aria-hidden="true" /> Registrar recepción
        </Button>
      )}
    </li>
  );
}

/** Captura de lo recibido: cada renglón trae lo pedido; solo se cambia lo que llegó distinto. */
function Recepcion({
  companyId,
  pedido,
  alTerminar,
}: {
  companyId: number;
  pedido: PedidoFranq;
  alTerminar: () => void;
}) {
  const [recibidos, setRecibidos] = useState(pedido.lineas.map((l) => String(l.cantidad)));
  const [obs, setObs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const numeros = recibidos.map((x) => (x.trim() === '' ? NaN : Number(x)));
  const invalidos = numeros.some((x) => !Number.isFinite(x) || x < 0);
  const diferencias = useMemo(
    () => pedido.lineas.filter((l, i) => Number.isFinite(numeros[i]) && numeros[i] !== l.cantidad).length,
    [numeros, pedido.lineas],
  );
  const guardar = () =>
    iniciar(async () => {
      setError(null);
      let res: Resultado;
      try {
        res =
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? { error: SIN_RED }
            : await recibirPedido({ companyId, pedido: pedido.id, recibidos: numeros, observacion: obs });
      } catch {
        res = { error: SIN_RED };
      }
      if ('error' in res) setError(res.error);
      else alTerminar();
    });

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-ink-2">
        Cuenta lo que llegó. Si algo no coincide, cambia la cantidad recibida.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {pedido.lineas.map((l, i) => {
          const distinto = Number.isFinite(numeros[i]) && numeros[i] !== l.cantidad;
          return (
            <li key={`${l.sku ?? l.nombre}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                {l.nombre}
                {l.variante && <span className="text-muted-foreground"> · {l.variante}</span>}
                <span className="block text-xs text-muted-foreground">Pedido: {cantidad(l.cantidad)}</span>
              </span>
              <label className="sr-only" htmlFor={`rec-${pedido.id}-${i}`}>
                Recibido de {l.nombre}
              </label>
              <input
                id={`rec-${pedido.id}-${i}`}
                inputMode="decimal"
                value={recibidos[i]}
                onChange={(e) => setRecibidos((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                className={cn(
                  'h-11 w-20 rounded-xl border bg-surface px-2 text-right text-[15px] tabular outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35',
                  distinto ? 'border-bad text-bad' : 'border-line-strong text-ink',
                )}
              />
            </li>
          );
        })}
      </ul>
      {diferencias > 0 && (
        <label className="block">
          <span className="text-sm font-medium text-ink">
            Qué pasó ({diferencias} {diferencias === 1 ? 'producto distinto' : 'productos distintos'};
            obligatorio)
          </span>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Qué faltó o sobró y a quién se avisó"
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          variant={diferencias ? 'destructive' : 'default'}
          disabled={pendiente || invalidos || (diferencias > 0 && obs.trim().length < 3)}
          onClick={guardar}
        >
          {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {diferencias ? 'Guardar recepción con diferencias' : 'Confirmar: llegó completo'}
        </Button>
        <Button size="lg" variant="ghost" disabled={pendiente} onClick={alTerminar}>
          Cancelar
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
