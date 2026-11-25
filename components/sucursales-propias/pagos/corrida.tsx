'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { pesos } from '@/lib/comercializadora/formato';
import { ESTADOS } from '@/lib/sucursales-propias/estados';
import { ElegirProveedor } from './elegir-proveedor';
import { EditarAsignacion } from './editar-asignacion';
import type { AccionesPagos, FilaVista } from './tipos';

const TONO = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  muted: 'bg-surface-2 text-muted-foreground',
} as const;

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
  const [confirmar, setConfirmar] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const listas = filas.filter((f) => f.estado === 'cuadra');
  const total = listas.reduce((s, f) => s + Math.round(f.monto * 100), 0) / 100;
  // Filas a aplicar cuyo proveedor se emparejó por nombre: el usuario debe revisarlas antes.
  const porNombre = listas.filter((f) => f.sugerido).length;

  async function aplicarUna(id: number) {
    const r = await acciones.aplicar(id);
    setResultados((x) => ({
      ...x,
      [id]: 'error' in r ? { estado: 'error', mensaje: r.error } : { estado: r.estado, mensaje: r.mensaje },
    }));
  }

  async function aplicarTodas() {
    setConfirmar(false);
    setProgreso({ hechas: 0, total: listas.length });
    // Una por una: cada pago es independiente y el usuario ve el avance (spec §7).
    for (const [i, f] of listas.entries()) {
      await aplicarUna(f.id);
      setProgreso({ hechas: i + 1, total: listas.length });
    }
    setProgreso(null);
    router.refresh();
  }

  async function reintentar(id: number) {
    await aplicarUna(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {puedeAplicar && listas.length > 0 ? (
        <div className="placa flex flex-wrap items-center gap-3 px-4 py-3">
          {progreso ? (
            <p role="status" className="text-sm">
              Aplicando {progreso.hechas} de {progreso.total}…
            </p>
          ) : confirmar ? (
            <>
              <p className="text-sm">
                Se registrarán en Zoho {listas.length} pagos por {pesos(total)} desde BANREGIO - CONSOLIDADO
                SUCURSALES PROPIAS
                {porNombre > 0 ? `, ${porNombre} con proveedor por nombre` : ''}.
              </p>
              <Button type="button" onClick={aplicarTodas}>
                Confirmar y aplicar en Zoho
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setConfirmar(true)}>
              Aplicar {listas.length} pagos
            </Button>
          )}
        </div>
      ) : null}

      <ul className="space-y-2">
        {filas.map((f) => {
          const r = resultados[f.id];
          const estado = (r?.estado ?? f.estado) as FilaVista['estado'];
          const e = ESTADOS[estado] ?? ESTADOS.error;
          const mensaje = r?.mensaje ?? f.error;
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
                  {f.proveedorNombre && f.sugerido ? (
                    <span className="mt-1 inline-block rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                      Proveedor por nombre — revisa
                    </span>
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
              {f.asignaciones.length ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {f.asignaciones.length} factura(s)
                  </summary>
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
                {puedeAplicar && (estado === 'error' || estado === 'aplicada_sin_adjunto') ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => reintentar(f.id)}>
                    Reintentar
                  </Button>
                ) : null}
              </div>
              {puedeAplicar && !r && f.estado === 'desconocido' ? (
                <ElegirProveedor id={f.id} acciones={acciones} />
              ) : null}
              {puedeAplicar && !r && f.estado === 'no_cuadra' ? (
                <EditarAsignacion fila={f} acciones={acciones} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
