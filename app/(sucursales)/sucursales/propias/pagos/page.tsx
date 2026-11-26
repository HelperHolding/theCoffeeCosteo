import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { SubirZip } from '@/components/sucursales-propias/pagos/subir-zip';
import { sesionPagos } from '@/lib/supabase/sesion';
import { listarCorridas } from '@/lib/sucursales-propias/consultas';
import { contar } from '@/lib/sucursales-propias/estados';
import { pesos } from '@/lib/comercializadora/formato';

export default async function PagosPropiasPagina() {
  const { db, puedeAplicar } = await sesionPagos();
  // Cliente sin tipos generados: las tablas suc_* aún no están en types.
  const corridas = await listarCorridas(db as unknown as SupabaseClient);
  return (
    <>
      <Encabezado
        area="Sucursales propias · Helper Holding"
        titulo="Pagos a proveedores"
        descripcion="Sube el ZIP de recibos de una transferencia masiva Banregio y registra los pagos en Zoho Books (Sucursales GDL)."
      />
      {puedeAplicar ? <SubirZip /> : null}
      <Tarjeta titulo="Corridas">
        {corridas.length === 0 ? (
          <Vacio titulo="Todavía no hay corridas">Sube el primer ZIP de recibos para empezar.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {corridas.map((c) => {
              const n = contar(c.estados);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/sucursales/propias/pagos/${c.id}`} className="font-medium">
                    #{c.id} · {c.archivo}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {new Date(c.subidoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                    {c.subidoPor ? ` · ${c.subidoPor}` : ''} · {pesos(c.totalRecibos)} · {n.aplicadas}/
                    {n.total} aplicadas
                    {n.revisar ? ` · ${n.revisar} por revisar` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
