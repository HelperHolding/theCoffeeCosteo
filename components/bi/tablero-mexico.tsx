'use client';
// Tablero «The Coffee México» (BI F4): orquesta los filtros de la URL, las dos lecturas (tablero y tendencias)
// y los bloques 1 a 8. Las cifras se arman en lib/bi/bloques.ts; aquí solo se reparten.
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CircleAlert, Clock, RotateCcw } from 'lucide-react';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { ErrorCarga } from '@/components/sucursales/estados';
import { fechaCorta, horaDe } from '@/components/sucursales/formato';
import { useLectura } from '@/components/sucursales/use-lectura';
import {
  avisos,
  conShare,
  kpiTiendas,
  numerosClave,
  pagoPorTienda,
  promociones,
  rankingPorMes,
  tendenciaAnual,
  tendenciaSemanal,
} from '@/lib/bi/bloques';
import type { RespuestaTablero, RespuestaTendencias, RpcOpciones, RpcTablero } from '@/lib/bi/tipos';
import { escribirUrl, leerUrl, type FiltrosUrl } from '@/lib/bi/url';
import { ContraMeta, Mezcla, NumerosClave } from './bloques-resumen';
import { KpiVentaTiendas, Promociones } from './bloques-tiendas';
import { TiempoYPago } from './bloques-tiempo';
import { RankingProductos, Tendencias } from './bloques-productos';
import { AvisoDesactualizado, Cargando } from './estados-bi';
import { FiltrosBi } from './filtros';

/** Claves de fecha que las tendencias ignoran: cambiarlas no vuelve a pedir las tendencias. */
const CLAVES_FECHA = ['fr', 'desde', 'hasta', 'sem'];
const ZONA = 'America/Mexico_City';

export function TableroMexico() {
  const params = useSearchParams();
  const router = useRouter();
  const textoUrl = params.toString();
  const filtros = useMemo(() => leerUrl(new URLSearchParams(textoUrl)), [textoUrl]);
  const qs = escribirUrl(filtros).toString();
  const qsSinFechas = useMemo(() => {
    const q = new URLSearchParams(qs);
    for (const k of CLAVES_FECHA) q.delete(k);
    return q.toString();
  }, [qs]);

  const tablero = useLectura<RespuestaTablero>(`/api/bi/tablero?${qs}`);
  const tendencias = useLectura<RespuestaTendencias>(`/api/bi/tendencias?${qsSinFechas}`);

  // Las opciones de los filtros sobreviven mientras se lee la siguiente combinación.
  const [opciones, setOpciones] = useState<RpcOpciones | null>(null);
  const opcionesNuevas = tablero.datos?.opciones;
  if (opcionesNuevas && opcionesNuevas !== opciones) setOpciones(opcionesNuevas);

  const alCambiar = (f: FiltrosUrl) => router.replace(`?${escribirUrl(f).toString()}`, { scroll: false });

  const armadoTendencias = useMemo(() => {
    const t = tendencias.datos?.tendencias;
    return t ? { anual: tendenciaAnual(t), semanal: tendenciaSemanal(t) } : null;
  }, [tendencias.datos]);

  return (
    <div className="space-y-6">
      <FiltrosBi filtros={filtros} opciones={opciones} alCambiar={alCambiar} />

      {tablero.datos ? (
        <>
          {tablero.error && (
            <AvisoDesactualizado
              key={tablero.recibidoEn}
              recibidoEn={tablero.recibidoEn}
              alReintentar={tablero.recargar}
            />
          )}
          {tablero.datos.tablero ? (
            <Bloques
              respuesta={tablero.datos}
              tablero={tablero.datos.tablero}
              alActualizar={() => {
                void tablero.recargar();
                void tendencias.recargar();
              }}
            />
          ) : (
            <Tarjeta>
              <Vacio titulo="Ninguna de tus tiendas pasa estos filtros">
                Cambia o limpia los filtros para ver cifras.
              </Vacio>
            </Tarjeta>
          )}
        </>
      ) : tablero.error?.status === 400 ? (
        // El periodo o los filtros de la URL no valen: reintentar no cambiaría nada.
        <div role="alert" className="rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm">
          <p className="font-semibold text-bad">Revisa el filtro Rango de Fechas</p>
          <p className="mt-1 text-ink-2">{tablero.error.mensaje} Corrígelo en los filtros de arriba.</p>
        </div>
      ) : tablero.error ? (
        <ErrorCarga error={tablero.error} alReintentar={tablero.recargar} />
      ) : (
        <Cargando texto="Cargando el tablero…" />
      )}

      <Tendencias
        anual={armadoTendencias?.anual ?? null}
        semanal={armadoTendencias?.semanal ?? null}
        vacio={!!tendencias.datos && !tendencias.datos.tendencias}
        error={tendencias.error}
        recibidoEn={tendencias.recibidoEn}
        alReintentar={tendencias.recargar}
      />
    </div>
  );
}

/** Frescura, avisos y bloques 1 a 7 de una respuesta con tiendas. */
function Bloques({
  respuesta,
  tablero: t,
  alActualizar,
}: {
  respuesta: RespuestaTablero;
  tablero: RpcTablero;
  alActualizar: () => void;
}) {
  const tiendas = respuesta.opciones.tiendas;
  const b = useMemo(
    () => ({
      avisos: avisos(t, respuesta.opciones),
      numeros: numerosClave(t),
      grupos: conShare(t.por_grupo),
      cafe: conShare(t.por_cafe),
      master: conShare([...t.por_master].sort((x, y) => y.venta_cent - x.venta_cent)),
      kpi: kpiTiendas(t, tiendas),
      promos: promociones(t, tiendas),
      pago: conShare(t.por_pago),
      pagoTienda: pagoPorTienda(t, tiendas),
      ranking: rankingPorMes(t),
    }),
    [t, respuesta.opciones, tiendas],
  );
  const a = b.avisos;
  const cargas = [
    a.faltantes > 0 && `Faltan ${a.faltantes} de ${a.esperados} días de tienda`,
    a.incompletos > 0 && `${a.incompletos} de ${a.esperados} días de tienda con carga incompleta`,
  ].filter(Boolean);

  return (
    <>
      <section aria-label="Frescura de los datos" className="space-y-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 shadow-card">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Clock size={16} aria-hidden="true" />
            {a.ultimoCorte
              ? `Actualizado al corte de las ${horaDe(Date.parse(a.ultimoCorte), ZONA)}`
              : 'Sin cortes registrados'}
          </span>
          <span className="text-muted-foreground">
            Del {fechaCorta(respuesta.periodo.desde)} al {fechaCorta(respuesta.periodo.hasta)}
          </span>
          <button
            type="button"
            onClick={alActualizar}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-semibold"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Actualizar
          </button>
        </p>
        {cargas.length > 0 && <Aviso>{cargas.join('; ')} (nunca se cuentan como cero).</Aviso>}
        {a.rappiPendiente && (
          <Aviso>
            Rappi de Zoho pendiente (F3): en tiendas sin el portal de Rappi falta su venta de Rappi.
          </Aviso>
        )}
      </section>

      <NumerosClave n={b.numeros} />
      <ContraMeta />
      <Mezcla grupos={b.grupos} cafe={b.cafe} master={b.master} />
      <KpiVentaTiendas grupos={b.kpi} />
      <Promociones datos={b.promos} />
      <TiempoYPago
        porFecha={t.por_fecha}
        porPago={b.pago}
        pagoTienda={b.pagoTienda}
        porDia={t.por_dia}
        porHora={t.por_hora}
      />
      <RankingProductos meses={b.ranking} />
    </>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink-2"
    >
      <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <span>{children}</span>
    </p>
  );
}
