'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { pesos } from '@/lib/comercializadora/formato';
import { ESTADOS, PREVIOS } from '@/lib/sucursales-propias/estados';
import { ElegirProveedor } from './elegir-proveedor';
import { EditarAsignacion } from './editar-asignacion';
import type { AccionesPagos, FilaVista } from './tipos';

const TONO = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  muted: 'bg-surface-2 text-muted-foreground',
} as const;

const INSIGNIA = 'mt-1 mr-1 inline-block rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn';

/** Estados en los que se puede volver a llamar aplicar ("aplicando" la Edge Function la retoma al vencer la reserva). */
const REINTENTABLES: readonly string[] = ['error', 'aplicada_sin_adjunto', 'aplicando'];

/** Recibo de solicitud SPEI sin clave de rastreo: no prueba que Banregio ejecutó la transferencia. */
const esSolicitud = (f: Pick<FilaVista, 'llave'>) => f.llave.startsWith('SOL-');

const esPrevia = (estado: string) => (PREVIOS as readonly string[]).includes(estado);

type Resultado = { estado: string; mensaje?: string };

export function Corrida({
  filas,
  puedeAplicar,
  acciones,
  zohoOrg,
}: {
  filas: FilaVista[];
  puedeAplicar: boolean;
  acciones: AccionesPagos;
  zohoOrg: string | null;
}) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Record<number, Resultado>>({});
  const [ocupadas, setOcupadas] = useState<Record<number, boolean>>({});
  const [fallos, setFallos] = useState<Record<number, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [confirmarSolicitud, setConfirmarSolicitud] = useState<number | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  // El lote solo lleva filas que cuadran, con proveedor confirmado y con recibo definitivo (spec §7).
  const listas = filas.filter((f) => f.estado === 'cuadra' && !f.sugerido && !esSolicitud(f));
  const total = listas.reduce((s, f) => s + Math.round(f.monto * 100), 0) / 100;
  const nPagos = listas.length === 1 ? '1 pago' : `${listas.length} pagos`;
  const porConfirmar = filas.filter((f) => f.estado === 'cuadra' && f.sugerido).length;
  const solicitudes = filas.filter((f) => f.estado === 'cuadra' && !f.sugerido && esSolicitud(f)).length;
  const notas = [
    porConfirmar === 1
      ? '1 fila con proveedor por nombre espera tu confirmación y no se incluye.'
      : porConfirmar > 1
        ? `${porConfirmar} filas con proveedor por nombre esperan tu confirmación y no se incluyen.`
        : null,
    solicitudes === 1
      ? '1 solicitud sin clave de rastreo se aplica aparte, en su fila.'
      : solicitudes > 1
        ? `${solicitudes} solicitudes sin clave de rastreo se aplican aparte, cada una en su fila.`
        : null,
  ].filter((n): n is string => n !== null);

  async function aplicarUna(id: number) {
    setOcupadas((o) => ({ ...o, [id]: true }));
    try {
      const r = await acciones.aplicar(id);
      setResultados((x) => ({
        ...x,
        [id]: 'error' in r ? { estado: 'error', mensaje: r.error } : { estado: r.estado, mensaje: r.mensaje },
      }));
    } catch {
      // Caída de red o 504: se registra en la fila y el lote sigue con la siguiente.
      setResultados((x) => ({ ...x, [id]: { estado: 'error', mensaje: 'No se pudo aplicar; reintenta.' } }));
    } finally {
      setOcupadas((o) => ({ ...o, [id]: false }));
    }
  }

  async function aplicarTodas() {
    setConfirmar(false);
    setProgreso({ hechas: 0, total: listas.length });
    try {
      // Una por una: cada pago es independiente y el usuario ve el avance (spec §7).
      for (const [i, f] of listas.entries()) {
        await aplicarUna(f.id);
        setProgreso({ hechas: i + 1, total: listas.length });
      }
    } finally {
      setProgreso(null);
      router.refresh();
    }
  }

  /** Reintento o aplicación individual (solicitudes ya confirmadas con Banregio). */
  async function aplicarSola(id: number) {
    if (ocupadas[id]) return;
    setConfirmarSolicitud(null);
    try {
      await aplicarUna(id);
    } finally {
      router.refresh();
    }
  }

  /** Confirma el proveedor sugerido por nombre: el servidor lo revalida en Zoho y rehace el reparto. */
  async function confirmarProveedor(f: FilaVista) {
    if (ocupadas[f.id] || !f.proveedorId || !f.proveedorNombre) return;
    setOcupadas((o) => ({ ...o, [f.id]: true }));
    setFallos((x) => {
      const y = { ...x };
      delete y[f.id];
      return y;
    });
    try {
      const r = await acciones.asignarProveedor(f.id, { id: f.proveedorId, nombre: f.proveedorNombre });
      if ('error' in r) setFallos((x) => ({ ...x, [f.id]: r.error }));
      else router.refresh();
    } catch {
      setFallos((x) => ({ ...x, [f.id]: 'No se pudo confirmar. Intenta de nuevo.' }));
    } finally {
      setOcupadas((o) => ({ ...o, [f.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {puedeAplicar && (listas.length > 0 || notas.length > 0) ? (
        <div className="placa space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {progreso ? (
              <p role="status" className="text-sm">
                Aplicando {progreso.hechas} de {progreso.total}…
              </p>
            ) : confirmar ? (
              <>
                <p className="text-sm">
                  Se {listas.length === 1 ? 'registrará' : 'registrarán'} en Zoho {nPagos} por {pesos(total)}{' '}
                  desde BANREGIO - CONSOLIDADO SUCURSALES PROPIAS.
                </p>
                <Button type="button" onClick={aplicarTodas}>
                  Confirmar y aplicar en Zoho
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirmar(false)}>
                  Cancelar
                </Button>
              </>
            ) : listas.length > 0 ? (
              <Button type="button" onClick={() => setConfirmar(true)}>
                Aplicar {nPagos}
              </Button>
            ) : null}
          </div>
          {!progreso
            ? notas.map((n) => (
                <p key={n} className="text-sm text-warn">
                  {n}
                </p>
              ))
            : null}
        </div>
      ) : null}

      <ul className="space-y-2">
        {filas.map((f) => {
          const r = resultados[f.id];
          const estado = (r?.estado ?? f.estado) as FilaVista['estado'];
          const e = ESTADOS[estado] ?? ESTADOS.error;
          const mensaje = r?.mensaje ?? f.error;
          const editable = puedeAplicar && !r && esPrevia(f.estado);
          const solicitud = esSolicitud(f);
          const porNombre = Boolean(f.proveedorNombre && f.sugerido);
          return (
            <li key={f.id} className="placa px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{f.alias}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.proveedorNombre
                      ? `Zoho: ${f.proveedorNombre}${f.sugerido ? ' (por nombre)' : ''}`
                      : 'Sin proveedor en Zoho'}{' '}
                    · {f.fecha} · {f.concepto}
                  </p>
                  {porNombre ? <span className={INSIGNIA}>Proveedor por nombre — revisa</span> : null}
                  {solicitud ? (
                    <span className={INSIGNIA}>Solicitud sin clave de rastreo — confirma con Banregio</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums font-medium">{pesos(f.monto)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONO[e.tono]}`}>
                    {e.texto}
                  </span>
                </div>
              </div>
              {mensaje ? <p className="mt-1 text-sm text-bad">{mensaje}</p> : null}
              {fallos[f.id] ? <p className="mt-1 text-sm text-bad">{fallos[f.id]}</p> : null}
              {f.asignaciones.length ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {f.asignaciones.length === 1 ? '1 factura' : `${f.asignaciones.length} facturas`}
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="mt-1 w-full text-left">
                      <tbody>
                        {f.asignaciones.map((a) => (
                          <tr key={a.billId}>
                            <td>{a.numero}</td>
                            <td>{a.ubicacion}</td>
                            <td>{a.fecha}</td>
                            <td className="text-right tabular-nums">{pesos(a.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {f.aplicadoEn ? (
                  <span className="text-muted-foreground">
                    Aplicada el{' '}
                    {new Date(f.aplicadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                  </span>
                ) : null}
                {f.reciboUrl ? (
                  <a href={f.reciboUrl} target="_blank" rel="noreferrer">
                    Recibo PDF
                  </a>
                ) : null}
                {f.pagoId && zohoOrg ? (
                  <a
                    href={`https://books.zoho.com/app/${zohoOrg}#/paymentsmade/${f.pagoId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en Zoho
                  </a>
                ) : null}
                {puedeAplicar && REINTENTABLES.includes(estado) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ocupadas[f.id]}
                    onClick={() => aplicarSola(f.id)}
                  >
                    Reintentar
                  </Button>
                ) : null}
                {editable && porNombre ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ocupadas[f.id]}
                    onClick={() => confirmarProveedor(f)}
                  >
                    Confirmar proveedor
                  </Button>
                ) : null}
                {editable &&
                solicitud &&
                f.estado === 'cuadra' &&
                !f.sugerido &&
                confirmarSolicitud !== f.id ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={ocupadas[f.id] || progreso !== null}
                    onClick={() => setConfirmarSolicitud(f.id)}
                  >
                    Aplicar
                  </Button>
                ) : null}
              </div>
              {editable && solicitud && confirmarSolicitud === f.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <p>¿Ya confirmaste con Banregio que se ejecutó?</p>
                  <Button type="button" size="sm" disabled={ocupadas[f.id]} onClick={() => aplicarSola(f.id)}>
                    Confirmar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmarSolicitud(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : null}
              {editable ? (
                <ElegirProveedor
                  id={f.id}
                  acciones={acciones}
                  texto={f.proveedorNombre ? 'Cambiar proveedor' : 'Elegir proveedor de Zoho'}
                />
              ) : null}
              {editable && f.estado === 'no_cuadra' ? (
                <EditarAsignacion fila={f} acciones={acciones} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
