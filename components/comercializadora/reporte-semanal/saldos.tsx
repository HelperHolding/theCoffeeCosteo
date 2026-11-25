// components/comercializadora/reporte-semanal/saldos.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { pesos } from '@/lib/comercializadora/formato';
import type { SaldoCliente, SaldosExternos, SaldosSucursales } from '../../../supabase/functions/_shared/reporte/saldos.ts';

export function SucursalesVista({ s, excluidas }: { s: SaldosSucursales; excluidas: string[] }) {
  const tabla = (filas: SaldosSucursales['filas']) => (
    <table className="w-full text-sm">
      <thead><tr className="text-right text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1 text-left">Sucursal</th><th>Dentro de crédito</th><th>Fuera de crédito</th></tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.sucursal} className="border-t border-line text-right">
            <td className="py-1 text-left">{f.sucursal}</td>
            <td className="font-mono tabular text-ok">{pesos(f.dentro)}</td>
            <td className="font-mono tabular text-bad">{pesos(f.fueraAnio + f.anteriores)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <Tarjeta titulo="Saldos · The Coffee Sucursales" descripcion={`${excluidas.length ? `Excluye ${excluidas.join(', ')} · ` : ''}${s.facturas} facturas abiertas`}>
      <p className="font-display text-3xl font-black tabular">{pesos(s.total)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Dentro de crédito</dt><dd className="font-mono tabular">{pesos(s.dentro)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Fuera de crédito {s.anio}</dt><dd className="font-mono tabular">{pesos(s.fueraAnio)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Antes de {s.anio}</dt><dd className="font-mono tabular">{pesos(s.anteriores)}</dd></div>
      </dl>
      <div className="mt-4 overflow-x-auto">{tabla(s.filas.slice(0, 11))}</div>
      {s.filas.length > 11 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">Ver todas ({s.filas.length})</summary>
          <div className="overflow-x-auto">{tabla(s.filas.slice(11))}</div>
        </details>
      )}
    </Tarjeta>
  );
}

function Filas({ filas }: { filas: SaldoCliente[] }) {
  return (
    <>
      {filas.map((f) => (
        <tr key={f.cliente + f.nota} className="border-t border-line text-right">
          <td className="py-1 text-left">
            {f.cliente}
            {f.nota && <span className="block text-xs text-muted-foreground">{f.nota}</span>}
            {f.llenado > 0 && (
              <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] uppercase">
                {Math.abs(f.llenado - f.saldo) < 0.01 ? '100% llenado canal' : `Llenado canal ${pesos(f.llenado)}`}
              </span>
            )}
          </td>
          <td className="font-mono text-xs">{fechaCorta(f.masAntigua)}</td>
          <td className={'font-mono text-xs ' + (f.dias > 30 ? 'font-semibold text-bad' : '')}>{f.dias}</td>
          <td className="font-mono tabular">{pesos(f.saldo)}</td>
        </tr>
      ))}
    </>
  );
}

export function ExternosVista({ e, corte }: { e: SaldosExternos & { anterior: number | null }; corte: string }) {
  const encabezado = (
    <thead><tr className="text-right text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1 text-left">Cliente</th><th>Más antigua</th><th>Días</th><th>Saldo</th></tr></thead>
  );
  const fila = (t: string, v: number) => (
    <tr className="border-t-2 border-ink font-semibold"><td colSpan={3} className="py-1">{t}</td><td className="text-right font-mono tabular">{pesos(v)}</td></tr>
  );
  return (
    <Tarjeta>
      <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        Saldos de clientes externos: <strong>{pesos(e.total)}</strong>
        {e.anterior != null && <> (era {pesos(e.anterior)} la semana pasada)</>}, de los cuales {pesos(e.subtotalCreditos)} son créditos activos.
        La deuda interna ({pesos(e.totalInterna)}) se muestra aparte.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {encabezado}
          <tbody>
            <Filas filas={e.filas.slice(0, 6)} />
          </tbody>
        </table>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">Ver todos ({e.filas.length} clientes)</summary>
          <table className="w-full text-sm">
            {encabezado}
            <tbody>
              <Filas filas={e.filas.slice(6)} />
              {fila('Subtotal sin créditos activos', e.subtotal)}
              <tr><td colSpan={4} className="pt-3 text-xs font-semibold uppercase text-muted-foreground">Créditos activos</td></tr>
              <Filas filas={e.creditos} />
              {fila('Subtotal créditos activos', e.subtotalCreditos)}
              {fila('Total saldos clientes externos', e.total)}
              <tr><td colSpan={4} className="pt-3 text-xs font-semibold uppercase text-muted-foreground">Deuda interna · mismo corporativo</td></tr>
              <Filas filas={e.interna} />
              {fila('Total deuda interna', e.totalInterna)}
            </tbody>
          </table>
        </details>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {e.excluidos.length > 0 && <>Excluye {e.excluidos.map((x) => `${x.cliente} (${pesos(x.saldo)})`).join(', ')}. </>}
        Saldo al {fechaCorta(corte)}.
      </p>
    </Tarjeta>
  );
}
