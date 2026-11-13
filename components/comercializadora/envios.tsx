'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Vacio, type Estado } from '@/components/portal/piezas';
import { numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import {
  conteoEnvios,
  filtrarEnvios,
  type GrupoVenta,
  type VistaEnvios,
} from '@/lib/comercializadora/envios';
import { marcarEnviado } from '@/app/(comercializadora)/comercializadora/acciones';

const POR_PAGINA = 25;
const VISTAS: [VistaEnvios, string][] = [
  ['por_enviar', 'Por enviar'],
  ['enviados', 'Enviados'],
  ['todos', 'Todos'],
];
const TONO: Record<GrupoVenta['estado'], Estado> = { por_enviar: 'bajo', enviado: 'ok', otro: 'neutro' };

export function Envios({ grupos, editable }: { grupos: GrupoVenta[]; editable: boolean }) {
  const router = useRouter();
  const [vista, setVista] = useState<VistaEnvios>('por_enviar');
  const [ver, setVer] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [, iniciar] = useTransition();
  const conteo = conteoEnvios(grupos);
  const lista = filtrarEnvios(grupos, vista);

  const marcar = (folio: string) => {
    if (!confirm(`¿Marcar ${folio} como enviado?`)) return;
    setEnviando(folio);
    iniciar(async () => {
      const r = await marcarEnviado(folio);
      setEnviando(null);
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: `${folio}: marcado como enviado.` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VISTAS.map(([v, nombre]) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            onClick={() => {
              setVista(v);
              setVer(POR_PAGINA);
            }}
            className={`h-9 rounded-[10px] border px-3 text-sm font-semibold ${
              vista === v ? 'border-ink bg-ink text-white' : 'border-line-strong'
            }`}
          >
            {nombre} ({conteo[v]})
          </button>
        ))}
      </div>
      {msg ? (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}
        >
          {msg.t}
        </p>
      ) : null}
      {!lista.length ? (
        <Vacio titulo={vista === 'por_enviar' ? 'Nada por enviar' : 'Sin pedidos en esta vista'} />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Sucursal / folio</th>
                <th>Fecha de envío</th>
                <th className="text-right">SKUs</th>
                <th className="text-right">Piezas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((g) => (
                <tr key={g.folio}>
                  <td>
                    <div className="font-medium">{g.sucursal || '—'}</div>
                    <div className="text-xs text-muted-foreground">{g.folio}</div>
                    {abierto === g.folio ? (
                      <ul className="mt-1 text-xs">
                        {g.items.map((i) => (
                          <li key={i.id}>
                            {i.sku}: {numero(Number(i.cantidad) || 0)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td>{g.fecha_envio ? fechaCorta(g.fecha_envio) : '—'}</td>
                  <td className="text-right tabular-nums">{g.skus}</td>
                  <td className="text-right tabular-nums">{numero(g.uds)}</td>
                  <td>
                    <Pill estado={TONO[g.estado]}>{g.textoEstado}</Pill>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => setAbierto(abierto === g.folio ? null : g.folio)}
                    >
                      {abierto === g.folio ? 'Ocultar' : 'Detalle'}
                    </button>
                    {editable && g.estado === 'por_enviar' ? (
                      <button
                        type="button"
                        disabled={enviando === g.folio}
                        onClick={() => marcar(g.folio)}
                        className="ml-3 text-sm font-semibold underline"
                      >
                        {enviando === g.folio ? 'Marcando…' : 'Marcar enviado'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > ver ? (
            <button
              type="button"
              className="m-3 text-sm font-semibold underline"
              onClick={() => setVer(ver + POR_PAGINA)}
            >
              Ver más ({lista.length - ver})
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
