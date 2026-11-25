// components/comercializadora/reporte-semanal/atencion.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { pesos } from '@/lib/comercializadora/formato';
import type { Apertura, Atencion, GrupoAtencion, Notas } from '../../../supabase/functions/_shared/reporte/atencion.ts';
import { finSemana } from '../../../supabase/functions/_shared/reporte/fechas.ts';

function Grupo({ titulo, g, conCliente = true }: { titulo: string; g: GrupoAtencion; conCliente?: boolean }) {
  return (
    <Tarjeta titulo={titulo} descripcion={`${g.abiertas} abiertas · ${g.resueltasSemana} resueltas esta semana`}>
      {g.semanas.length === 0 && <p className="text-sm text-ok">Sin incidencias abiertas.</p>}
      {g.semanas.map((s) => (
        <div key={s.lunes} className="mb-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Semana {fechaCorta(s.lunes)} – {fechaCorta(finSemana(s.lunes))}
          </p>
          <ul className="divide-y divide-line">
            {s.casos.map((c) => (
              <li key={c.ov} className="py-2 text-sm">
                <p className="font-medium">
                  {c.sucursal || c.cliente}{c.sucursal && conCliente ? <span className="text-muted-foreground"> ({c.cliente})</span> : null}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{c.ov}</span>
                </p>
                <p className="text-xs">
                  {c.tipo} · <span className={c.resuelto ? 'text-ok' : 'text-bad'}>{c.resolucion}</span>
                </p>
                {c.descripcion && <p className="whitespace-pre-line text-xs text-muted-foreground">{c.descripcion}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Tarjeta>
  );
}

export function AtencionVista({ a }: { a: Atencion }) {
  return (
    <div className="grid gap-3 *:min-w-0 lg:grid-cols-2">
      <Grupo titulo="Sucursales propias" g={a.propias} conCliente={false} />
      <Grupo titulo="Clientes externos" g={a.externos} />
    </div>
  );
}

export function NotasVista({ n }: { n: Notas }) {
  return (
    <Tarjeta titulo="Notas de crédito">
      {n.filas.length === 0 ? <p className="text-sm text-muted-foreground">Sin notas de crédito esta semana.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1">Folio</th><th>Cliente</th><th>Descripción</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {n.filas.map((f) => (
                <tr key={f.numero} className="border-t border-line align-top">
                  <td className="py-1 font-mono text-xs">{f.numero}</td>
                  <td>{f.cliente}{f.sucursal ? <span className="block text-xs text-muted-foreground">{f.sucursal}</span> : null}</td>
                  <td className="text-xs">{f.descripcion}</td>
                  <td className="text-right font-mono tabular">{pesos(f.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-semibold"><td colSpan={3} className="py-1">Total NC</td><td className="text-right font-mono tabular">{pesos(n.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

export function AperturasVista({ a }: { a: Apertura[] }) {
  return (
    <Tarjeta>
      {a.length === 0 ? <p className="text-sm text-muted-foreground">Sin aperturas en curso.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1">Sucursal</th><th>Franquiciatario</th><th>OV</th><th>Pedido</th><th>Estatus</th></tr></thead>
            <tbody>
              {a.map((x) => (
                <tr key={x.ov} className="border-t border-line">
                  <td className="py-1">{x.sucursal}</td><td>{x.cliente}</td><td className="font-mono text-xs">{x.ov}</td>
                  <td>{fechaCorta(x.fecha)}</td><td>{x.envio ? `Enviado ${fechaCorta(x.envio)}` : 'Por enviar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
