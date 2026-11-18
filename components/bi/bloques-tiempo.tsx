'use client';
// Bloque 6 del tablero BI: tiempo y pago (por fecha, método de pago, pago por tienda, día de la semana y hora).
import { Tarjeta } from '@/components/portal/piezas';
import { BarraApilada } from '@/components/sucursales/graficas';
import { diaMes, dinero, fechaCorta, numero, porcentaje } from '@/components/sucursales/formato';
import type { pagoPorTienda } from '@/lib/bi/bloques';
import type { RpcTablero } from '@/lib/bi/tipos';
import { ColumnasYLinea, type Categoria } from './graficas-bi';
import { colorDe, enOrden, PAGOS, SERIE_TICKETS, SERIE_VENTA } from './colores-bi';
import { dineroEje } from './graficas-bi-piezas';

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

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold text-ink-2">{titulo}</h3>
      {children}
    </section>
  );
}

export function TiempoYPago({
  porFecha,
  porPago,
  pagoTienda,
  porDia,
  porHora,
}: {
  porFecha: RpcTablero['por_fecha'];
  porPago: (RpcTablero['por_pago'][number] & { share: number | null })[];
  pagoTienda: ReturnType<typeof pagoPorTienda>;
  porDia: RpcTablero['por_dia'];
  porHora: RpcTablero['por_hora'];
}) {
  const fechas: Categoria[] = porFecha.map((f) => ({
    clave: f.fecha,
    eje: diaMes(f.fecha),
    titulo: fechaCorta(f.fecha),
  }));
  const dia = new Map(porDia.map((d) => [d.dow, d]));
  const horas = porHora.map((h) => h.hora);
  const desde = Math.min(...horas);
  const rango = horas.length
    ? Array.from({ length: Math.max(...horas) - desde + 1 }, (_, i) => desde + i)
    : [];
  const hora = new Map(porHora.map((h) => [h.hora, h]));
  // Orden y color fijos por etiqueta de pago (colores-bi.ts): un filtro no repinta los métodos que quedan.
  const pagos = enOrden(porPago, PAGOS, (p) => p.etiqueta);
  const colorPago = (etiqueta: string) => colorDe(PAGOS, etiqueta);

  return (
    <Tarjeta titulo="Tiempo y pago">
      <div className="space-y-8">
        <Seccion titulo="Ventas vs transacciones por día">
          {fechas.length === 0 ? (
            SIN_VENTA
          ) : (
            <ColumnasYLinea
              resumen="Venta neta (columnas) y tickets (línea) por día"
              categorias={fechas}
              {...ventaYTickets(porFecha)}
            />
          )}
        </Seccion>

        <div className="grid gap-8 lg:grid-cols-2">
          <Seccion titulo="Venta por día de la semana">
            {porDia.length === 0 ? (
              SIN_VENTA
            ) : (
              <ColumnasYLinea
                resumen="Venta neta (columnas) y tickets (línea) por día de la semana"
                anchoMinimo="min-w-[20rem]"
                categorias={DIAS.map((d) => ({ clave: String(d.dow), eje: d.corto, titulo: d.largo }))}
                {...ventaYTickets(DIAS.map((d) => dia.get(d.dow)))}
              />
            )}
          </Seccion>
          <Seccion titulo="Venta por hora">
            {rango.length === 0 ? (
              SIN_VENTA
            ) : (
              <ColumnasYLinea
                resumen="Venta neta (columnas) y tickets (línea) por hora del día"
                anchoMinimo="min-w-[24rem]"
                categorias={rango.map((h) => ({
                  clave: String(h),
                  eje: hh(h),
                  titulo: `${hh(h)}:00–${hh(h)}:59`,
                }))}
                {...ventaYTickets(rango.map((h) => hora.get(h)))}
              />
            )}
          </Seccion>
        </div>

        <Seccion titulo="Método de pago">
          {porPago.length === 0 ? (
            SIN_VENTA
          ) : (
            <BarraApilada
              titulo="Participación en la venta neta (ped. = tickets)"
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
        </Seccion>

        <Seccion titulo="Método de pago por tienda">
          {pagoTienda.length === 0 ? (
            SIN_VENTA
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla tabla-bi" style={{ minWidth: `${20 + pagos.length * 7}rem` }}>
                <caption className="sr-only">
                  Participación de cada método de pago en la venta neta de cada tienda
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Tienda</th>
                    <th scope="col" className="numero">
                      Venta
                    </th>
                    <th scope="col">Mezcla</th>
                    {pagos.map((p) => (
                      <th key={p.etiqueta} scope="col" className="numero">
                        {p.etiqueta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagoTienda.map((t) => {
                    const share = new Map(t.pagos.map((p) => [p.etiqueta, p.share]));
                    return (
                      <tr key={t.companyId}>
                        <th scope="row" className="font-medium">
                          {t.nombre}
                        </th>
                        <td className="numero">{dinero(t.ventaCent, 'MXN', false)}</td>
                        <td className="min-w-32">
                          <span
                            aria-hidden="true"
                            className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px]"
                          >
                            {enOrden(t.pagos, PAGOS, (p) => p.etiqueta).map((p) => (
                              <span
                                key={p.etiqueta}
                                className="h-full"
                                style={{
                                  width: `${(p.share ?? 0) * 100}%`,
                                  backgroundColor: colorPago(p.etiqueta),
                                }}
                              />
                            ))}
                          </span>
                        </td>
                        {pagos.map((p) => (
                          <td key={p.etiqueta} className="numero">
                            {porcentaje(share.get(p.etiqueta) ?? null)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      </div>
    </Tarjeta>
  );
}
