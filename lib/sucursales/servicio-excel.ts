import { TIPOS_RECHAZO, TIPOS_RECLAMO, nombreTop, type RespuestaServicio, type Totales } from './servicio';
import type { RespuestaServicioNacional } from './servicio-nacional';

/**
 * Hojas del Excel de Nivel de servicio de una sucursal (docs/rappi-portal/08): el mismo periodo que se ve en pantalla
 * (un día con el filtro «Un día»/«Ayer»/«Hoy», o el rango). Función pura; la descarga la hace el cliente con xlsx.
 */
const CANAL = { normal: 'Rappi', turbo: 'Rappi Turbo' } as const;
const pct = (x: number | null) => (x === null ? '' : Math.round(x * 1000) / 10);
const dec = (x: number | null, d = 2) => (x === null ? '' : Math.round(x * 10 ** d) / 10 ** d);

export function filaTotales(t: Totales) {
  return {
    'Pedidos creados': t.pedidos,
    Rechazos: t.rechazosTotal,
    ...Object.fromEntries(
      Object.entries(TIPOS_RECHAZO).map(([k, n]) => [
        `Rechazo: ${n}`,
        t.rechazos[k as keyof typeof TIPOS_RECHAZO],
      ]),
    ),
    'Rechazos (% de creados)': pct(t.tasaRechazos),
    'Pedidos finalizados': t.finalizados,
    Reclamos: t.reclamosTotal,
    ...Object.fromEntries(
      Object.entries(TIPOS_RECLAMO).map(([k, n]) => [
        `Reclamo: ${n}`,
        t.reclamos[k as keyof typeof TIPOS_RECLAMO],
      ]),
    ),
    'Reclamos (% de finalizados)': pct(t.tasaReclamos),
    'Disponibilidad (%)': dec(t.disponibilidad, 1),
    'Minutos sin disponibilidad': t.sinDispMinutos ?? '',
    'Cocina demorada (pedidos)': t.cocinaDemorada,
    'Cocina demorada (%)': pct(t.tasaCocina),
    'Espera del repartidor (min)': dec(t.espera),
  };
}

export function hojasServicio(d: RespuestaServicio, sucursal: string) {
  const periodo = d.desde === d.hasta ? d.desde : `${d.desde} a ${d.hasta}`;
  return {
    nombreArchivo: `nivel-servicio-${sucursal.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-')}-${periodo.replace(' a ', '_')}.xlsx`,
    resumen: [
      { Concepto: 'Sucursal', Valor: sucursal },
      { Concepto: 'Periodo', Valor: periodo },
      { Concepto: 'Fuente', Valor: 'Portal de Rappi Partners (Nivel de servicio y Conectividad)' },
      {
        Concepto: 'Días',
        Valor: d.diasEnHoraCentro
          ? 'Rappi cuenta los días en hora del centro; las horas de conectividad van en hora local'
          : 'Hora del centro (la de la sucursal)',
      },
      ...d.canales.map((c) => ({
        Concepto: `Top Restaurantes (${CANAL[c.canal]})`,
        Valor: c.top
          ? `${nombreTop(c.top.categoria)} (próxima: ${nombreTop(c.top.proxima) ?? '—'}; leído ${c.top.fecha})`
          : '—',
      })),
      { Concepto: 'Monto compensado por reclamos', Valor: d.compensado },
    ],
    dias: d.dias.map((x) => ({ Fecha: x.fecha, ...filaTotales(x.total) })),
    porCanal: (Object.entries(d.porCanal) as [keyof typeof CANAL, Totales][]).map(([c, t]) => ({
      Tienda: CANAL[c],
      ...filaTotales(t),
    })),
    reclamos: d.reclamos.map((r) => ({
      Fecha: r.fecha,
      Tienda: CANAL[r.canal],
      Pedido: r.pedido,
      Producto: r.producto ?? '',
      Tipo: r.tipo ? TIPOS_RECLAMO[r.tipo] : '',
      Detalle: r.detalle ?? '',
      'Comentario del cliente': r.comentario ?? '',
      'Compensado (MXN)': r.monto ?? '',
    })),
    conectividad: d.tramos.map((t) => ({
      Tienda: CANAL[t.canal],
      Estado: t.estado === 'ACTIVE' ? 'Activa' : `Desactivada (${t.estado})`,
      Motivo: t.motivo ?? '',
      'Desde (hora local)': t.desde,
      'Hasta (hora local)': t.hasta ?? 'sigue',
      Minutos: t.minutos,
    })),
  };
}

/** Excel del Tablero de México · Nivel de servicio: el mismo periodo de pantalla, todas las sucursales del usuario. */
export function hojasServicioNacional(d: RespuestaServicioNacional) {
  const periodo = d.desde === d.hasta ? d.desde : `${d.desde} a ${d.hasta}`;
  const hora = (iso: string) =>
    new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'short',
      timeStyle: 'short',
      hourCycle: 'h23',
    }).format(new Date(iso));
  return {
    nombreArchivo: `nivel-servicio-mexico-${periodo.replace(' a ', '_')}.xlsx`,
    resumen: [
      { Concepto: 'Periodo', Valor: periodo },
      { Concepto: 'Fuente', Valor: 'Portal de Rappi Partners (Nivel de servicio y Conectividad)' },
      { Concepto: 'Días', Valor: 'Los de Rappi (hora del centro)' },
      { Concepto: 'Sucursales con tienda en Rappi', Valor: d.sucursales.length },
      {
        Concepto: 'Sucursales sin tienda en el portal',
        Valor: d.sinPortal.map((s) => s.nombre).join(', ') || '—',
      },
      ...d.ahora.map((a) => ({
        Concepto: `Activas al descargar (${CANAL[a.canal]})`,
        Valor: `${a.activas} de ${a.tiendas}`,
      })),
      ...d.top.map((x) => ({ Concepto: `Top Restaurantes: ${nombreTop(x.categoria)}`, Valor: x.tiendas })),
      { Concepto: 'Monto compensado por reclamos', Valor: d.compensado },
      ...Object.entries(filaTotales(d.totales)).map(([Concepto, Valor]) => ({ Concepto, Valor })),
    ],
    porSucursal: d.sucursales.map((s) => ({
      Sucursal: s.nombre,
      Ciudad: s.ciudad,
      'ID API': s.companyId,
      'Rappi ahora': s.ahora.normal ? (s.ahora.normal.activa ? 'Activa' : 'Desactivada') : '—',
      'Turbo ahora': s.ahora.turbo ? (s.ahora.turbo.activa ? 'Activa' : 'Desactivada') : '—',
      'Top Restaurantes': nombreTop(s.top) ?? '',
      ...filaTotales(s.totales),
    })),
    dias: d.dias.map((x) => ({ Fecha: x.fecha, ...filaTotales(x.total) })),
    reclamos: d.reclamos.map((r) => ({
      Fecha: r.fecha,
      Sucursal: r.sucursal,
      Tienda: CANAL[r.canal],
      Pedido: r.pedido,
      Producto: r.producto ?? '',
      Tipo: r.tipo ? TIPOS_RECLAMO[r.tipo] : '',
      Detalle: r.detalle ?? '',
      'Comentario del cliente': r.comentario ?? '',
      'Compensado (MXN)': r.monto ?? '',
    })),
    desactivadas: d.desactivadas.map((x) => ({
      Sucursal: x.sucursal,
      Tienda: CANAL[x.canal],
      Estado: x.estado,
      Motivo: x.motivo ?? '',
      'Desde (hora del centro)': hora(x.desde),
    })),
  };
}
