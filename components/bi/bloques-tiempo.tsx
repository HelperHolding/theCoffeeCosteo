'use client';
// Bloque 6 del tablero BI: tiempo y pago (por fecha, método de pago, pago por tienda, día de la semana y hora).
import { Tarjeta } from '@/components/portal/piezas';
import { BarraApilada } from '@/components/sucursales/graficas';
import { AZUL, COLOR_ORIGEN } from '@/components/sucursales/colores';
import { diaMes, dinero, fechaCorta, numero, porcentaje } from '@/components/sucursales/formato';
import type { pagoPorTienda } from '@/lib/bi/bloques';
import type { RpcTablero } from '@/lib/bi/tipos';
import { ColumnasYLinea, colorCategoria, type Categoria } from './graficas-bi';

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
const dineroEje = (v: number) => dinero(v, 'MXN', false);
const dineroSerie = (v: number | null) => dinero(v, 'MXN', false);
const SIN_VENTA = <p className="text-sm text-muted-foreground">Sin venta en el periodo.</p>;

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
  const colorPago = new Map(porPago.map((p, i) => [p.etiqueta, colorCategoria(i)]));

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
              columnas={{
                etiqueta: 'Venta neta',
                color: AZUL.fuerte,
                valores: porFecha.map((f) => f.venta_cent),
                formato: dineroSerie,
                eje: dineroEje,
              }}
              linea={{
                etiqueta: 'Tickets',
                color: COLOR_ORIGEN.app,
                valores: porFecha.map((f) => f.tickets),
                formato: numero,
                eje: numero,
              }}
            />
          )}
        </Seccion>

        <div className="grid gap-8 lg:grid-cols-2">
          <Seccion titulo="Venta por día de la semana">
            {porDia.length === 0 ? (
              SIN_VENTA
            ) : (
              <ColumnasYLinea
                resumen="Venta neta por día de la semana"
                anchoMinimo="min-w-[20rem]"
                categorias={DIAS.map((d) => ({ clave: String(d.dow), eje: d.corto, titulo: d.largo }))}
                columnas={{
                  etiqueta: 'Venta neta',
                  color: AZUL.fuerte,
                  valores: DIAS.map((d) => dia.get(d.dow)?.venta_cent ?? null),
                  formato: dineroSerie,
                  eje: dineroEje,
                }}
                linea={{
                  etiqueta: 'Tickets',
                  color: COLOR_ORIGEN.app,
                  valores: DIAS.map((d) => dia.get(d.dow)?.tickets ?? null),
                  formato: numero,
                  eje: numero,
                }}
              />
            )}
          </Seccion>
          <Seccion titulo="Venta por hora">
            {rango.length === 0 ? (
              SIN_VENTA
            ) : (
              <ColumnasYLinea
                resumen="Venta neta por hora del día"
                anchoMinimo="min-w-[24rem]"
                categorias={rango.map((h) => ({
                  clave: String(h),
                  eje: hh(h),
                  titulo: `${hh(h)}:00–${hh(h)}:59`,
                }))}
                columnas={{
                  etiqueta: 'Venta neta',
                  color: AZUL.fuerte,
                  valores: rango.map((h) => hora.get(h)?.venta_cent ?? null),
                  formato: dineroSerie,
                  eje: dineroEje,
                }}
                linea={{
                  etiqueta: 'Tickets',
                  color: COLOR_ORIGEN.app,
                  valores: rango.map((h) => hora.get(h)?.tickets ?? null),
                  formato: numero,
                  eje: numero,
                }}
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
              segmentos={porPago.map((p) => ({
                clave: p.etiqueta,
                etiqueta: p.etiqueta,
                color: colorPago.get(p.etiqueta)!,
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
              <table className="tabla" style={{ minWidth: `${20 + porPago.length * 7}rem` }}>
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
                    {porPago.map((p) => (
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
                            {t.pagos.map((p) => (
                              <span
                                key={p.etiqueta}
                                className="h-full"
                                style={{
                                  width: `${(p.share ?? 0) * 100}%`,
                                  backgroundColor: colorPago.get(p.etiqueta) ?? colorCategoria(99),
                                }}
                              />
                            ))}
                          </span>
                        </td>
                        {porPago.map((p) => (
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
