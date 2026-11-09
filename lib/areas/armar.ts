import type { PedidoNormal } from '../sucursales/normalizar';
import { aArqueo } from './arqueo';
import type { Catalogo } from './catalogo';
import { aTicket } from './ticket';
import type { ArqueoCaja, TicketCompleto } from './tipos';
import { validarArqueo, validarTicket } from './validar';

export interface Descartado { id: number; fecha: string; hora: string; motivo: string }
export interface Dia { fecha: string; leidos: number; validos: number; descartados: number; monto: number }
export interface Exportacion {
  /** En orden de fecha y hora. */
  tickets: TicketCompleto[];
  /** Uno por día con tickets válidos, en orden. */
  arqueos: ArqueoCaja[];
  descartados: Descartado[];
  /** Todos los días con al menos un pedido leído, en orden. */
  dias: Dia[];
  /** COD_ART de los tickets válidos, sin repetir, ordenados. */
  vendidos: number[];
}

/** Pedidos leídos → lo que se manda a Areas, lo que no y por qué. Fija el precio de lista del catálogo. */
export function armar(pedidos: PedidoNormal[], catalogo: Catalogo, prohibidos: string[]): Exportacion {
  // De menor a mayor, para que la descripción del catálogo quede con el nombre más reciente.
  const orden = [...pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.segundo - b.segundo);
  const tickets: TicketCompleto[] = [];
  const descartados: Descartado[] = [];
  const dias = new Map<string, Dia>();

  for (const p of orden) {
    const dia = dias.get(p.fecha) ?? { fecha: p.fecha, leidos: 0, validos: 0, descartados: 0, monto: 0 };
    dias.set(p.fecha, dia);
    dia.leidos++;
    const r = aTicket(p, catalogo);
    const motivos = r.ok ? validarTicket(r.ticket, prohibidos) : [r.motivo];
    if (!r.ok || motivos.length) {
      dia.descartados++;
      descartados.push({ id: p.id, fecha: p.fecha, hora: p.hora, motivo: motivos.join('; ') });
      continue;
    }
    dia.validos++;
    dia.monto = Math.round(dia.monto * 100 + r.ticket.Cabecera.IMP_VEN * 100) / 100;
    tickets.push(r.ticket);
  }

  const arqueos: ArqueoCaja[] = [];
  for (const fecha of dias.keys()) {
    const delDia = tickets.filter((t) => t.Cabecera.MOM_OPE.startsWith(fecha));
    if (!delDia.length) continue;
    const a = aArqueo(fecha, delDia);
    const motivos = validarArqueo(a, delDia, prohibidos);
    if (motivos.length) throw new Error(`Arqueo inválido del ${fecha}: ${motivos.join('; ')}`);
    arqueos.push(a);
  }

  // Precio de lista del catálogo: el PRE_UNI más frecuente de cada artículo (empate: el mayor).
  const conteo = new Map<number, Map<number, number>>();
  for (const t of tickets)
    for (const d of t.Detalles) {
      const m = conteo.get(d.COD_ART) ?? new Map<number, number>();
      conteo.set(d.COD_ART, m.set(d.PRE_UNI, (m.get(d.PRE_UNI) ?? 0) + 1));
    }
  for (const [cod, m] of conteo) {
    const [precio] = [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    catalogo.fijarPrecio(cod, precio);
  }

  return {
    tickets,
    arqueos,
    descartados,
    dias: [...dias.values()],
    vendidos: [...conteo.keys()].sort((a, b) => a - b),
  };
}
