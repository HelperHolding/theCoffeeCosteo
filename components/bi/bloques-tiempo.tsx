'use client';
// Bloque 6 del tablero BI: tiempo y pago, una tarjeta por gráfica (por fecha, método de pago, día de la semana, hora y
// pago por tienda).
import { BarraApilada } from '@/components/sucursales/graficas';
import { diaMes, dinero, fechaCorta, numero, porcentaje } from '@/components/sucursales/formato';
import type { pagoPorTienda } from '@/lib/bi/bloques';
import type { RpcTablero } from '@/lib/bi/tipos';
import { ColumnasYLinea, type Categoria } from './graficas-bi';
import { colorDe, enOrden, PAGOS, SERIE_TICKETS, SERIE_VENTA } from './colores-bi';
import { dineroEje } from './graficas-bi-piezas';
import { BarraEnCelda, TablaBi, type ColumnaBi } from './tabla-bi';
import { TarjetaBi } from './tarjeta-bi';

const DIAS = [
  { dow: 1, corto: 'Lun', largo: 'Lunes' },
  { dow: 2, corto: 'Mar', largo: 'Martes' },
  { dow: 3, corto: 'Mié', largo: 'Miércoles' },
  { dow: 4, corto: 'Jue', largo: 'Jueves' },
  { dow: 5, corto: 'Vie', largo: 'Viernes' },
  { dow: 6, corto: 'Sáb', largo: 'Sábado' },
  { dow: 0, corto: 'Dom', largo: 'Domingo' },
];
const hh = (h: number) => String(h).padStart(2, '0');
const dineroSerie = (v: number | null) => dinero(v, 'MXN', false);
const SIN_VENTA = <p className="text-sm text-muted-foreground">Sin venta en el periodo.</p>;

type VentaTickets = { venta_cent: number; tickets: number } | undefined;

/** Venta (columnas), tickets (línea) y ticket promedio (solo tooltip y tabla) de las mismas categorías. */
const ventaYTickets = (filas: VentaTickets[]) => ({
  columnas: {
    etiqueta: 'Venta neta',
    color: SERIE_VENTA,
    valores: filas.map((f) => f?.venta_cent ?? null),
    formato: dineroSerie,
    eje: dineroEje,
  },
  linea: {
    etiqueta: 'Tickets',
    color: SERIE_TICKETS,
    valores: filas.map((f) => f?.tickets ?? null),
    formato: numero,
    eje: numero,
  },
  extra: {
    etiqueta: 'Ticket promedio',
    color: 'transparent',
    valores: filas.map((f) => (f && f.tickets > 0 ? Math.round(f.venta_cent / f.tickets) : null)),
    formato: dineroSerie,
  },
});

type PorPago = (RpcTablero['por_pago'][number] & { share: number | null })[];
type FilaPagoTienda = ReturnType<typeof pagoPorTienda>[number];

// Orden y color fijos por etiqueta de pago (colores-bi.ts): un filtro no repinta los métodos que quedan.
const colorPago = (etiqueta: string) => colorDe(PAGOS, etiqueta);

/** Ventas vs transacciones por día (8). */
export function VentasPorDia({ porFecha }: { porFecha: RpcTablero['por_fecha'] }) {
  const fechas: Categoria[] = porFecha.map((f) => ({
    clave: f.fecha,
    eje: diaMes(f.fecha),
    titulo: fechaCorta(f.fecha),
  }));
  return (
    <TarjetaBi ancho={8} titulo="Ventas vs transacciones por día">
      {fechas.length === 0 ? (
        SIN_VENTA
      ) : (
        <ColumnasYLinea
          resumen="Venta neta (columnas) y tickets (línea) por día"
          categorias={fechas}
          alto={260}
          {...ventaYTickets(porFecha)}
        />
      )}
    </TarjetaBi>
  );
}

/** Método de pago (4): participación en la venta neta. */
export function MetodoPago({ porPago }: { porPago: PorPago }) {
  const pagos = enOrden(porPago, PAGOS, (p) => p.etiqueta);
  return (
    <TarjetaBi ancho={4} titulo="Método de pago" descripcion="Participación en la venta neta (ped. = tickets).">
      {porPago.length === 0 ? (
        SIN_VENTA
      ) : (
        <BarraApilada
          moneda="MXN"
          segmentos={pagos.map((p) => ({
            clave: p.etiqueta,
            etiqueta: p.etiqueta,
            color: colorPago(p.etiqueta),
            ventaCent: p.venta_cent,
            pedidos: p.tickets,
            participacion: p.share,
          }))}
        />
      )}
    </TarjetaBi>
  );
}

/** Venta por día de la semana (6). */
export function VentaDiaSemana({ porDia }: { porDia: RpcTablero['por_dia'] }) {
  const dia = new Map(porDia.map((d) => [d.dow, d]));
  return (
    <TarjetaBi ancho={6} titulo="Venta por día de la semana">
      {porDia.length === 0 ? (
        SIN_VENTA
      ) : (
        <ColumnasYLinea
          resumen="Venta neta (columnas) y tickets (línea) por día de la semana"
          anchoMinimo="min-w-[20rem]"
          alto={220}
          categorias={DIAS.map((d) => ({ clave: String(d.dow), eje: d.corto, titulo: d.largo }))}
          {...ventaYTickets(DIAS.map((d) => dia.get(d.dow)))}
        />
      )}
    </TarjetaBi>
  );
}

/** Venta por hora (6). */
export function VentaPorHora({ porHora }: { porHora: RpcTablero['por_hora'] }) {
  const horas = porHora.map((h) => h.hora);
  const desde = Math.min(...horas);
  const rango = horas.length
    ? Array.from({ length: Math.max(...horas) - desde + 1 }, (_, i) => desde + i)
    : [];
  const hora = new Map(porHora.map((h) => [h.hora, h]));
  return (
    <TarjetaBi ancho={6} titulo="Venta por hora">
      {rango.length === 0 ? (
        SIN_VENTA
      ) : (
        <ColumnasYLinea
          resumen="Venta neta (columnas) y tickets (línea) por hora del día"
          anchoMinimo="min-w-[24rem]"
          alto={220}
          categorias={rango.map((h) => ({
            clave: String(h),
            eje: hh(h),
            titulo: `${hh(h)}:00–${hh(h)}:59`,
          }))}
          {...ventaYTickets(rango.map((h) => hora.get(h)))}
        />
      )}
    </TarjetaBi>
  );
}

/** Ancho mínimo de la tabla según los métodos de pago (clases literales: Tailwind no ve las armadas al vuelo). */
const MINIMO_PAGOS = [
  'min-w-[20rem]',
  'min-w-[27rem]',
  'min-w-[34rem]',
  'min-w-[41rem]',
  'min-w-[48rem]',
  'min-w-[55rem]',
  'min-w-[62rem]',
  'min-w-[69rem]',
  'min-w-[76rem]',
];

/** Método de pago por tienda (12): venta, mezcla y share de cada método, ordenable. */
export function PagoPorTienda({
  porPago,
  pagoTienda,
}: {
  porPago: PorPago;
  pagoTienda: ReturnType<typeof pagoPorTienda>;
}) {
  const pagos = enOrden(porPago, PAGOS, (p) => p.etiqueta);
  const shareDe = (t: FilaPagoTienda, etiqueta: string) =>
    t.pagos.find((p) => p.etiqueta === etiqueta)?.share ?? null;
  const maxVenta = Math.max(0, ...pagoTienda.map((t) => t.ventaCent));
  const columnas: ColumnaBi<FilaPagoTienda>[] = [
    { clave: 'tienda', titulo: 'Tienda', celda: (t) => t.nombre },
    {
      clave: 'venta',
      titulo: 'Venta',
      numero: true,
      orden: (t) => t.ventaCent,
      celda: (t) => (
        <BarraEnCelda valor={t.ventaCent} max={maxVenta}>
          {dinero(t.ventaCent, 'MXN', false)}
        </BarraEnCelda>
      ),
    },
    {
      clave: 'mezcla',
      titulo: 'Mezcla',
      celda: (t) => (
        <span aria-hidden="true" className="flex h-2.5 w-full min-w-32 gap-[2px] overflow-hidden rounded-[4px]">
          {enOrden(t.pagos, PAGOS, (p) => p.etiqueta).map((p) => (
            <span
              key={p.etiqueta}
              className="h-full"
              style={{ width: `${(p.share ?? 0) * 100}%`, backgroundColor: colorPago(p.etiqueta) }}
            />
          ))}
        </span>
      ),
    },
    ...pagos.map(
      (p): ColumnaBi<FilaPagoTienda> => ({
        clave: `pago-${p.etiqueta}`,
        titulo: p.etiqueta,
        numero: true,
        orden: (t) => shareDe(t, p.etiqueta),
        celda: (t) => porcentaje(shareDe(t, p.etiqueta)),
      }),
    ),
  ];
  return (
    <TarjetaBi
      ancho={12}
      titulo="Método de pago por tienda"
      descripcion="Participación de cada método de pago en la venta neta de cada tienda."
      cuerpo={false}
    >
      {pagoTienda.length === 0 ? (
        <div className="px-4 pb-4">{SIN_VENTA}</div>
      ) : (
        <TablaBi
          resumen="Participación de cada método de pago en la venta neta de cada tienda"
          columnas={columnas}
          secciones={[{ clave: 'todas', filas: pagoTienda }]}
          claveFila={(t) => String(t.companyId)}
          ordenInicial="venta"
          primeras={10}
          minimo={MINIMO_PAGOS[Math.min(pagos.length, MINIMO_PAGOS.length - 1)]}
        />
      )}
    </TarjetaBi>
  );
}
