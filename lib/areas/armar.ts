import type { PedidoNormal } from '../sucursales/normalizar';
import { aArqueo } from './arqueo';
import { codigoNormal, type Catalogo } from './catalogo';
import { aTicket, listaCent } from './ticket';
import type { ArqueoCaja, TicketCompleto } from './tipos';
import { validarArqueo, validarTicket } from './validar';

export interface Descartado {
  id: number;
  fecha: string;
  hora: string;
  motivo: string;
}
export interface Dia {
  fecha: string;
  leidos: number;
  validos: number;
  descartados: number;
  monto: number;
}
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

  // Antes de armar: el precio de lista de cada producto (sin modificadores) que se vio en la corrida, para que una
  // línea al 100% tenga precio aunque el producto sea nuevo.
  catalogo.observarPrecios(preciosDeLista(orden));

  for (const p of orden) {
    const dia = dias.get(p.fecha) ?? { fecha: p.fecha, leidos: 0, validos: 0, descartados: 0, monto: 0 };
    dias.set(p.fecha, dia);
    dia.leidos++;
    // Un ticket descartado no deja códigos ni descripciones en el catálogo (podrían llevar el nombre de la tienda).
    catalogo.iniciar();
    const r = aTicket(p, catalogo);
    const motivos = r.ok ? validarTicket(r.ticket, prohibidos) : [r.motivo];
    if (!r.ok || motivos.length) {
      catalogo.revertir();
      dia.descartados++;
      descartados.push({ id: p.id, fecha: p.fecha, hora: p.hora, motivo: motivos.join('; ') });
      continue;
    }
    catalogo.confirmar();
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

  return {
    tickets,
    arqueos,
    descartados,
    dias: [...dias.values()],
    vendidos: [...new Set(tickets.flatMap((t) => t.Detalles.map((d) => d.COD_ART)))].sort((a, b) => a - b),
  };
}

/**
 * Precio de lista de cada producto, en pesos: el más frecuente de sus líneas con descuento menor a 100%, sin
 * modificadores (empate: el mayor).
 */
function preciosDeLista(pedidos: PedidoNormal[]): Map<string, number> {
  const conteo = new Map<string, Map<number, number>>();
  for (const p of pedidos)
    for (const l of p.lineas) {
      if (l.descuentoPct < 0 || l.descuentoPct >= 100) continue;
      const c = codigoNormal(l.codigo);
      const m = conteo.get(c) ?? new Map<number, number>();
      const cent = listaCent(l);
      conteo.set(c, m.set(cent, (m.get(cent) ?? 0) + 1));
    }
  return new Map(
    [...conteo].map(([c, m]) => [c, [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] / 100]),
  );
}
