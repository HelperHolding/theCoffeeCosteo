import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle } from 'lucide-react';
import { Encabezado } from '@/components/portal/piezas';
import { Corrida } from '@/components/sucursales-propias/pagos/corrida';
import { sesionPagos } from '@/lib/supabase/sesion';
import { leerCorrida } from '@/lib/sucursales-propias/consultas';
import { contar } from '@/lib/sucursales-propias/estados';
import { pesos } from '@/lib/comercializadora/formato';
import {
  aplicarTransferencia,
  asignarProveedor,
  guardarAsignaciones,
  leerFacturasProveedor,
  leerProveedores,
} from '../acciones';

export default async function CorridaPagina({ params }: { params: Promise<{ corridaId: string }> }) {
  const { corridaId } = await params;
  const id = Number(corridaId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db, puedeAplicar } = await sesionPagos();
  const datos = await leerCorrida(db as unknown as SupabaseClient, id);
  if (!datos) notFound();
  const { corrida, filas } = datos;
  const n = contar(filas.map((f) => f.estado));
  return (
    <>
      <Encabezado
        area="Sucursales propias · Helper Holding"
        titulo={`Corrida #${corrida.id}`}
        migas={[{ href: '/sucursales/propias/pagos', nombre: 'Pagos' }]}
        descripcion={`${corrida.archivo} · ${corrida.nRecibos} recibos por ${pesos(corrida.totalRecibos)}${
          corrida.totalResumen !== null ? ` (resumen: ${pesos(corrida.totalResumen)})` : ''
        } · ${n.aplicadas}/${n.total} aplicadas`}
      />
      {corrida.avisos.length ? (
        <div role="status" className="placa space-y-1 border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          {corrida.avisos.map((a) => (
            <p key={a} className="flex items-start gap-2">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
              {a}
            </p>
          ))}
        </div>
      ) : null}
      <Corrida
        filas={filas}
        puedeAplicar={puedeAplicar}
        zohoOrg={process.env.ZOHO_SUC_ORG_ID ?? null}
        acciones={{
          aplicar: aplicarTransferencia,
          asignarProveedor,
          guardarAsignaciones,
          leerProveedores,
          leerFacturasProveedor,
        }}
      />
    </>
  );
}
