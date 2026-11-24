'use client';
import { useState, useTransition } from 'react';
import {
  ArrowDownToLine,
  Boxes,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  PackageCheck,
  Scale,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { registrarEntrada, type Resultado } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { FilaExistencia } from '@/lib/franquiciatarios/existencias';
import type { FranqEntrada, FranqInsumo, OrigenEntrada } from '@/lib/franquiciatarios/tipos';
import { Vacio } from '@/components/portal/piezas';
import { diaCorto, hora } from './formato';
import { TONO, type Tono } from './colores';

const campo =
  'h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35';
const num = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
const conSigno = (n: number) => (n > 0 ? `+${num(n)}` : num(n));

/** Color e ícono por origen (tipo de información). */
const ORIGEN: Record<OrigenEntrada, { nombre: string; tono: Tono; icono: LucideIcon }> = {
  pedido: { nombre: 'Pedido a la Comercializadora', tono: 'pedidos', icono: Truck },
  proveedor: { nombre: 'Otro proveedor', tono: 'apertura', icono: PackageCheck },
};

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

/**
 * Entradas a la sucursal: captura de lo que llega de otro proveedor (cualquier rol) y lo que entró hoy, incluidos los
 * pedidos recibidos de la Comercializadora (esos los registra la gerencia al recibir el pedido).
 */
export function EntradasFranq({
  companyId,
  insumos,
  entradas,
  gestor,
  hoy,
}: {
  companyId: number;
  insumos: FranqInsumo[];
  entradas: FranqEntrada[];
  gestor: boolean;
  hoy: string;
}) {
  const activos = insumos.filter((i) => i.activo).sort((a, b) => a.orden - b.orden);
  if (!insumos.length)
    return (
      <Vacio titulo="Sin lista de insumos">
        Las entradas se registran sobre la lista de insumos de conteo. La gerencia la arma en «Inventario».
      </Vacio>
    );
  return (
    <div className="space-y-6">
      <Captura companyId={companyId} insumos={activos} />
      <Lista companyId={companyId} insumos={insumos} entradas={entradas} gestor={gestor} hoy={hoy} />
    </div>
  );
}

function Captura({ companyId, insumos }: { companyId: number; insumos: FranqInsumo[] }) {
  const a = useAccion();
  const [insumo, setInsumo] = useState<number | ''>('');
  const [cantidad, setCantidad] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [nota, setNota] = useState('');
  const elegido = insumos.find((i) => i.id === insumo);
  const n = Number(cantidad.replace(',', '.'));
  const listo = !!insumo && n > 0 && proveedor.trim().length >= 2;
  const t = TONO.apertura;
  return (
    <section
      aria-labelledby="registrar-entrada"
      className={cn('rounded-3xl border p-5 shadow-card', t.brillo, t.borde)}
    >
      <h2 id="registrar-entrada" className="flex items-center gap-2 text-lg">
        <ArrowDownToLine size={18} aria-hidden="true" className={t.texto} /> Registrar lo que llegó
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Leche, pan y todo lo que no viene en el pedido a la Comercializadora. Cuenta en la misma unidad que el
        conteo.
      </p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listo) return;
          a.correr(
            () =>
              registrarEntrada({
                companyId,
                insumo: insumo || null,
                cantidad: n,
                proveedor,
                nota: nota || null,
              }),
            () => {
              setInsumo('');
              setCantidad('');
              setNota('');
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
          <span className="mb-1 block font-medium">Proveedor</span>
          <input
            className={campo}
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            maxLength={120}
            placeholder="Ej. Lala, panadería…"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Nota (opcional)</span>
          <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={!listo || a.pendiente}>
            {a.pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Registrar entrada
          </Button>
          <Fallo texto={a.error} />
        </div>
      </form>
    </section>
  );
}

function Lista({
  companyId,
  insumos,
  entradas,
  gestor,
  hoy,
}: {
  companyId: number;
  insumos: FranqInsumo[];
  entradas: FranqEntrada[];
  gestor: boolean;
  hoy: string;
}) {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  return (
    <section aria-labelledby="entradas" className="space-y-2">
      <h2 id="entradas" className="text-lg">
        Entradas
      </h2>
      {!entradas.length ? (
        <p className="text-sm text-muted-foreground">Sin entradas registradas.</p>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {entradas.map((e) => (
            <Entrada
              key={e.id}
              companyId={companyId}
              e={e}
              insumo={porId.get(e.insumo_id)}
              // Lo de hoy de otro proveedor lo anula cualquiera; lo demás, la gerencia con motivo.
              editable={gestor || (e.dia === hoy && e.origen === 'proveedor')}
              pideMotivo={e.dia !== hoy || e.origen === 'pedido'}
              hoy={hoy}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Entrada({
  companyId,
  e,
  insumo,
  editable,
  pideMotivo,
  hoy,
}: {
  companyId: number;
  e: FranqEntrada;
  insumo?: FranqInsumo;
  editable: boolean;
  pideMotivo: boolean;
  hoy: string;
}) {
  const a = useAccion();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const o = ORIGEN[e.origen];
  const Icono = o.icono;
  return (
    <li
      className={cn(
        'relative space-y-2 overflow-hidden rounded-2xl border bg-surface py-3 pr-3 pl-4 text-sm shadow-card',
        TONO[o.tono].borde,
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5', TONO[o.tono].marca)} />
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TONO[o.tono].suave)}>
          <Icono size={16} aria-hidden="true" className={TONO[o.tono].texto} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-semibold">{insumo?.nombre ?? 'Insumo'}</p>
          <p className="text-xs text-ink-2">
            {e.origen === 'proveedor' ? e.proveedor : o.nombre}
            {e.sku ? ` · ${e.sku}` : ''}
            {e.nota ? ` · ${e.nota}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e.nombre} ·{' '}
            {e.dia === hoy ? hora(e.registrado_en) : `${diaCorto(e.dia)}, ${hora(e.registrado_en)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-display text-lg leading-none font-black tabular">
            +{num(Number(e.cantidad))}
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
          onSubmit={(ev) => {
            ev.preventDefault();
            a.correr(() =>
              registrarEntrada({
                companyId,
                insumo: null,
                cantidad: null,
                proveedor: null,
                corrige: e.id,
                anular: true,
                motivoCorreccion: motivo || null,
              }),
            );
          }}
        >
          {pideMotivo && (
            <input
              className={cn(campo, 'max-w-xs flex-1')}
              value={motivo}
              onChange={(x) => setMotivo(x.target.value)}
              placeholder="Motivo de la anulación"
              maxLength={300}
              aria-label="Motivo de la anulación"
            />
          )}
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={a.pendiente || (pideMotivo && motivo.trim().length < 3)}
          >
            Anular entrada
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAnulando(false)}>
            Cancelar
          </Button>
          <Fallo texto={a.error} />
        </form>
      )}
    </li>
  );
}

/**
 * Existencias de la gerencia: de dónde sale cada número (último conteo de apertura, entradas, consumo teórico y
 * mermas) y la diferencia del último conteo contra lo esperado.
 */
export function ExistenciasFranq({
  filas,
  entradas,
  insumos,
  aviso,
  hoy,
  companyId,
}: {
  filas: FilaExistencia[];
  entradas: FranqEntrada[];
  insumos: FranqInsumo[];
  aviso: string | null;
  hoy: string;
  companyId: number;
}) {
  if (!filas.length)
    return (
      <Vacio titulo="Sin lista de insumos">
        Las existencias se calculan sobre la lista de insumos de conteo. Ármala en «Inventario».
      </Vacio>
    );
  const conBase = filas.filter((f) => f.base);
  const conciliadas = filas.filter((f) => f.conciliacion);
  const faltantes = conciliadas.filter((f) => f.conciliacion!.diferencia < 0);
  const entradasHoy = entradas.filter((e) => e.dia === hoy).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          tono="ventas"
          icono={Boxes}
          titulo="Con existencia calculada"
          valor={`${conBase.length} de ${filas.length}`}
          detalle="Insumos con conteo de apertura"
        />
        <Kpi
          tono="apertura"
          icono={ArrowDownToLine}
          titulo="Entradas de hoy"
          valor={String(entradasHoy)}
          detalle="Pedidos recibidos y otros proveedores"
        />
        <Kpi
          tono={faltantes.length ? 'alerta' : 'durante'}
          icono={faltantes.length ? CircleAlert : CircleCheck}
          titulo="Faltantes en el último conteo"
          valor={String(faltantes.length)}
          detalle={faltantes.length ? 'Contaron menos de lo esperado' : 'El conteo cuadró con lo esperado'}
        />
        <Kpi
          tono="cierre"
          icono={Scale}
          titulo="Conteos conciliados"
          valor={String(conciliadas.length)}
          detalle="Contra el conteo de apertura anterior"
        />
      </div>
      {aviso && <p className="aviso">{aviso}</p>}
      <section aria-labelledby="existencias" className="space-y-2">
        <h2 id="existencias" className="text-lg">
          Existencia esperada por insumo
        </h2>
        <p className="text-sm text-ink-2">
          Último conteo de apertura + entradas − consumo por recetas − mermas. Se compara con el siguiente
          conteo.
        </p>
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2/60 text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Insumo</th>
                <th className="px-3 py-2.5 text-right font-semibold">Último conteo</th>
                <th className="px-3 py-2.5 text-right font-semibold">+ Entradas</th>
                <th className="px-3 py-2.5 text-right font-semibold">− Consumo</th>
                <th className="px-3 py-2.5 text-right font-semibold">− Mermas</th>
                <th className="px-3 py-2.5 text-right font-semibold">= Esperado hoy</th>
                <th className="px-4 py-2.5 text-right font-semibold">Diferencia del conteo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.insumoId} className="border-t border-line align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold">{f.nombre}</p>
                    <p className="text-xs text-ink-2">{f.unidad}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {f.base ? (
                      <>
                        {num(f.base.cantidad)}
                        <span className="block text-[11px] text-ink-2">
                          {f.base.dia === hoy ? 'hoy' : diaCorto(f.base.dia)} · {f.base.nombre}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin conteo de apertura</span>
                    )}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right tabular', f.entradas > 0 && TONO.apertura.texto)}>
                    {f.base ? `+${num(f.entradas)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {f.base ? (
                      f.consumo === null ? (
                        <span className="text-xs text-muted-foreground">Sin receta</span>
                      ) : (
                        `−${num(f.consumo)}`
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{f.base ? `−${num(f.mermas)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-display text-base font-black tabular">
                    {f.esperado === null ? '—' : num(f.esperado)}
                    {f.esperado !== null && f.esperado < 0 && (
                      <span className="block text-[11px] font-semibold text-bad">
                        Revisa entradas o conteo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {f.conciliacion ? (
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          f.conciliacion.diferencia < 0
                            ? 'bg-bad-soft text-bad'
                            : f.conciliacion.diferencia > 0
                              ? 'bg-warn-soft text-warn'
                              : 'bg-ok-soft text-ok',
                        )}
                        title={`Esperado ${num(f.conciliacion.esperado)}, contado ${num(f.conciliacion.contado)}`}
                      >
                        {f.conciliacion.diferencia === 0
                          ? 'Cuadró'
                          : `${conSigno(f.conciliacion.diferencia)} ${f.conciliacion.diferencia < 0 ? 'faltante' : 'sobrante'}`}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Falta otro conteo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Lista companyId={companyId} insumos={insumos} entradas={entradas} gestor hoy={hoy} />
    </div>
  );
}
