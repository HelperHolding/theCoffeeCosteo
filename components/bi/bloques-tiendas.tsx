'use client';
// Bloques 4 y 5 del tablero BI: venta por tienda agrupada por tipo y promociones (una tarjeta cada uno).
import { Barra, Insignia } from '@/components/portal/piezas';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import { alcanza, cociente, type kpiTiendas, type promociones } from '@/lib/bi/bloques';
import { BarraEnCelda, TablaBi, type ColumnaBi } from './tabla-bi';
import { TarjetaBi } from './tarjeta-bi';

/** Sin meta cargada (o sin comparación posible): se ve «—», nunca cero. */
const Guion = ({ titulo }: { titulo: string }) => (
  <span className="text-muted-foreground" title={titulo}>
    —
  </span>
);

/** Meta del periodo (o «—» sin meta cargada). */
const contenidoMeta = (metaCent: number | null) =>
  metaCent === null ? <Guion titulo="Sin meta cargada" /> : dinero(metaCent);

/** Cumplimiento (venta ÷ meta de los días con corte): verde si alcanza, rojo si no, «—» si no se puede comparar. */
function contenidoVsMeta(metaCent: number | null, cumplimiento: number | null, comparar: boolean) {
  if (metaCent === null) return <Guion titulo="Sin meta cargada" />;
  if (!comparar) return <Guion titulo="Con filtros de producto, pago, hora o monto la meta no se compara" />;
  if (cumplimiento === null) return <Guion titulo="Todavía no hay días con corte" />;
  return (
    <span className={alcanza(cumplimiento) ? 'font-semibold text-ok' : 'font-semibold text-bad'}>
      {porcentaje(cumplimiento)}
    </span>
  );
}

type Grupos = ReturnType<typeof kpiTiendas>;
type FilaTienda = Grupos[number]['tiendas'][number];

/** Bloque 4: Propias/Franquicia → tienda, con venta, tickets, ticket promedio, share de la red y meta. */
export function KpiVentaTiendas({ grupos, comparar }: { grupos: Grupos; comparar: boolean }) {
  const total = grupos.reduce((s, g) => s + g.ventaCent, 0);
  const maxShare = Math.max(0, ...grupos.flatMap((g) => g.tiendas.map((t) => t.share ?? 0)));
  const columnas: ColumnaBi<FilaTienda>[] = [
    { clave: 'tienda', titulo: 'Tienda', celda: (t) => <span className="pl-3">{t.nombre}</span> },
    { clave: 'venta', titulo: 'Venta', numero: true, orden: (t) => t.ventaCent, celda: (t) => dinero(t.ventaCent) },
    { clave: 'tickets', titulo: 'Tickets', numero: true, orden: (t) => t.tickets, celda: (t) => numero(t.tickets) },
    {
      clave: 'ticket',
      titulo: 'Ticket prom.',
      numero: true,
      orden: (t) => t.ticketPromedioCent,
      celda: (t) => dinero(t.ticketPromedioCent),
    },
    {
      clave: 'share',
      titulo: 'Share',
      numero: true,
      orden: (t) => t.share,
      celda: (t) => (
        <BarraEnCelda valor={t.share} max={maxShare}>
          {porcentaje(t.share)}
        </BarraEnCelda>
      ),
    },
    { clave: 'meta', titulo: 'Meta', numero: true, celda: (t) => contenidoMeta(t.metaCent) },
    {
      clave: 'vs',
      titulo: 'Vs meta',
      numero: true,
      orden: (t) => (comparar ? t.cumplimiento : null),
      celda: (t) => contenidoVsMeta(t.metaCent, t.cumplimiento, comparar),
    },
  ];
  return (
    <TarjetaBi
      ancho={8}
      titulo="Venta por tienda agrupada por tipo"
      descripcion="Share: participación de cada tienda en la venta neta del filtro. Vs meta: venta de los días con corte contra su meta."
      cuerpo={false}
    >
      {grupos.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">Sin venta por tienda en el periodo.</p>
      ) : (
        <TablaBi
          resumen="Venta por tienda agrupada por tipo"
          columnas={columnas}
          secciones={grupos.map((g) => ({
            clave: g.tipo,
            cabecera: (
              <tr className="bg-surface-2/60 font-semibold">
                <th scope="rowgroup">{g.tipo}</th>
                <td className="numero">{dinero(g.ventaCent)}</td>
                <td className="numero">{numero(g.tickets)}</td>
                <td className="numero">{dinero(cociente(g.ventaCent, g.tickets))}</td>
                <td className="numero">{porcentaje(cociente(g.ventaCent, total))}</td>
                <td className="numero">{contenidoMeta(g.metaCent)}</td>
                <td className="numero">{contenidoVsMeta(g.metaCent, g.cumplimiento, comparar)}</td>
              </tr>
            ),
            filas: g.tiendas,
          }))}
          claveFila={(t) => String(t.companyId)}
          ordenInicial="venta"
          primeras={5}
          minimo="min-w-[44rem]"
        />
      )}
    </TarjetaBi>
  );
}

const CORTO: Record<string, string> = {
  'Promoción alimentos y bebidas': 'Alimentos y bebidas',
  'Promoción café': 'Café',
};

type DatosPromos = ReturnType<typeof promociones>;
type FilaPromo = DatosPromos['porTienda'][number];

/** Bloque 5, indicadores: share de cada promoción contra su meta (6 % y 1 %). */
export function Promociones({ datos }: { datos: DatosPromos }) {
  return (
    <TarjetaBi ancho={4} titulo="Promociones" descripcion="Share de la venta neta de cada promoción contra su meta.">
      <div className="grid gap-4">
        {datos.red.map((r) => {
          const estado = r.share === null ? 'neutro' : r.share >= r.meta ? 'ok' : 'bajo';
          return (
            <div key={r.promocion} className="space-y-2 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-2">{r.promocion}</h3>
                <Insignia>Meta {porcentaje(r.meta, 0)}</Insignia>
              </div>
              <p className="font-display text-3xl font-black tabular">{porcentaje(r.share)}</p>
              <Barra valor={r.share ?? 0} max={r.meta * 2} objetivo={r.meta} estado={estado} />
              <p className="text-xs text-muted-foreground">
                {r.share === null
                  ? 'Sin venta en el periodo.'
                  : `${r.share >= r.meta ? 'En meta' : 'Bajo la meta'} · ${numero(r.unidades)} unidades vendidas`}
              </p>
            </div>
          );
        })}
      </div>
    </TarjetaBi>
  );
}

/** Bloque 5, tabla: share y cantidad vendida de cada promoción por tienda. */
export function PromocionesPorTienda({ datos }: { datos: DatosPromos }) {
  const nombres = datos.red.map((r) => r.promocion);
  const columnas: ColumnaBi<FilaPromo>[] = [
    { clave: 'tienda', titulo: 'Tienda', celda: (t) => t.nombre },
    ...nombres.flatMap((p): ColumnaBi<FilaPromo>[] => [
      {
        clave: `share-${p}`,
        titulo: `${CORTO[p] ?? p} · share`,
        numero: true,
        orden: (t) => t.promos[p].share,
        celda: (t) => porcentaje(t.promos[p].share),
      },
      {
        clave: `unidades-${p}`,
        titulo: `${CORTO[p] ?? p} · unidades`,
        numero: true,
        orden: (t) => t.promos[p].unidades,
        celda: (t) => numero(t.promos[p].unidades),
      },
    ]),
  ];
  return (
    <TarjetaBi
      ancho={12}
      titulo="Promociones por tienda"
      descripcion="Share y cantidad vendida de cada promoción por tienda."
      cuerpo={false}
    >
      {datos.porTienda.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          Ninguna tienda vendió promociones en el periodo.
        </p>
      ) : (
        <TablaBi
          resumen="Share y cantidad vendida de cada promoción por tienda"
          columnas={columnas}
          secciones={[{ clave: 'todas', filas: datos.porTienda }]}
          claveFila={(t) => String(t.companyId)}
          ordenInicial={`share-${nombres[0]}`}
          primeras={10}
          minimo="min-w-[40rem]"
        />
      )}
    </TarjetaBi>
  );
}
