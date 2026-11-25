// components/comercializadora/reporte-semanal/surtido.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Origen, Surtido, Indicador } from '../../../supabase/functions/_shared/reporte/surtido.ts';
import { Meta, porcentaje } from './piezas';

const ORIGEN: Record<Origen, string> = {
  stock: 'Error de surtido (falta de stock)', pickeo: 'Error de pickeo', paqueteria: 'Paquetería', otro: 'Sin clasificar',
};

function Ind({ titulo, i, meta, nota }: { titulo: string; i: Indicador; meta: string; nota: string }) {
  return (
    <Tarjeta>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{titulo}</p>
      <p className="mt-1 font-display text-3xl font-black tabular">{porcentaje(i.valor)}<Meta cumple={i.cumple} /></p>
      <p className="mt-1 text-xs text-muted-foreground">Meta: {meta}</p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </Tarjeta>
  );
}

export function SurtidoVista({ s }: { s: Surtido }) {
  const m = (i: Indicador, signo: string) => `${signo}${i.meta}%`;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{s.enviados} pedidos enviados en la semana</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Ind titulo="Fill rate" i={s.fill} meta={m(s.fill, '≥')} nota={`${s.conFaltante} de ${s.enviados} pedidos con faltante`} />
        <Ind titulo="Faltante / tardío por stock" i={s.stock} meta={m(s.stock, '≤')} nota={`${s.casos.stock} pedido(s) con incidencia de stock`} />
        <Ind titulo="Precisión de pickeo" i={s.pickeo} meta={m(s.pickeo, '≥')} nota={`${s.casos.pickeo} casos de error de pickeo`} />
        <Ind titulo="Calidad física" i={s.fisica} meta={m(s.fisica, '≤')} nota={`${s.casos.paqueteria} pedido(s) con incidencia de paquetería`} />
      </div>
      <Tarjeta>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Envío en tiempo</p>
        <p className="mt-1 font-display text-3xl font-black tabular">{porcentaje(s.envio.valor)}<Meta cumple={s.envio.cumple} /></p>
        <p className="mt-1 text-xs text-muted-foreground">
          {s.envio.enMeta} de {s.envio.universo} pedidos foráneos · mismo día: {s.envio.buckets[0]} · 1 día: {s.envio.buckets[1]} · 2 días: {s.envio.buckets[2]} · más de 2: {s.envio.buckets[3]}
        </p>
        {s.envio.fuera.map((f) => (
          <p key={f.ov} className="text-xs text-bad">Fuera de meta: {f.sucursal} {f.ov} ({fechaCorta(f.fecha)} → {fechaCorta(f.envio)}, {f.dias} días)</p>
        ))}
      </Tarjeta>
      <Tarjeta titulo={`Incidencias por origen · ${s.incidenciasTotal} en total (${porcentaje(s.enviados ? s.incidenciasTotal / s.enviados : null)} de los pedidos)`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['stock', 'pickeo', 'paqueteria'] as Origen[]).map((o) => (
            <div key={o}>
              <p className="font-display text-2xl font-black tabular">{s.casos[o]}</p>
              <p className="text-sm">{ORIGEN[o]}</p>
              <p className="text-xs text-muted-foreground">{porcentaje(s.incidenciasTotal ? s.casos[o] / s.incidenciasTotal : null, 0)} de las incidencias</p>
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">Ver todas ({s.incidencias.length})</summary>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1">OV</th><th>Sucursal</th><th>Origen</th><th>Estatus</th></tr></thead>
              <tbody>
                {s.incidencias.map((f) => (
                  <tr key={f.ov} className="border-t border-line">
                    <td className="py-1 font-mono text-xs">{f.ov}</td><td>{f.sucursal}</td><td>{ORIGEN[f.origen]}</td><td>{f.resolucion || 'Abierta'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Tarjeta>
    </div>
  );
}
