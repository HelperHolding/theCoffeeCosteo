import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoTransferencia } from './estados';
import type { FilaVista } from '@/components/sucursales-propias/pagos/tipos';

export interface CorridaLista {
  id: number;
  archivo: string;
  subidoEn: string;
  subidoPor: string | null;
  totalRecibos: number;
  estados: string[];
}

export interface CorridaFila {
  id: number;
  archivo: string;
  subidoEn: string;
  nResumen: number | null;
  totalResumen: number | null;
  nRecibos: number;
  totalRecibos: number;
  avisos: string[];
}

// Lista explícita: sin la CLABE (dato sensible que la pantalla no necesita).
const COLUMNAS_TRANSFERENCIA =
  'id, llave, tipo, alias, concepto, monto, fecha_operacion, estado, error, proveedor_zoho_id, proveedor_nombre, sugerido, zoho_vendorpayment_id, archivo_pdf, aplicado_en, suc_pago_asignacion(*)';

export async function listarCorridas(db: SupabaseClient): Promise<CorridaLista[]> {
  const { data, error } = await db
    .from('suc_pago_corrida')
    .select(
      'id, archivo, subido_en, total_recibos, perfiles!suc_pago_corrida_subido_por_fkey(nombre), suc_pago_transferencia(estado)',
    )
    .order('subido_en', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    archivo: c.archivo,
    subidoEn: c.subido_en,
    subidoPor: (c.perfiles as { nombre?: string } | null)?.nombre ?? null,
    totalRecibos: Number(c.total_recibos),
    estados: (c.suc_pago_transferencia as { estado: string }[]).map((t) => t.estado),
  }));
}

export async function leerCorrida(
  db: SupabaseClient,
  id: number,
): Promise<{ corrida: CorridaFila; filas: FilaVista[] } | null> {
  const [c, t] = await Promise.all([
    db.from('suc_pago_corrida').select('*').eq('id', id).maybeSingle(),
    db.from('suc_pago_transferencia').select(COLUMNAS_TRANSFERENCIA).eq('corrida_id', id).order('id'),
  ]);
  if (c.error) throw c.error;
  if (t.error) throw t.error;
  if (!c.data) return null;
  const filasDb = t.data ?? [];
  const firmadas = filasDb.length
    ? await db.storage.from('suc-pagos-recibos').createSignedUrls(
        filasDb.map((f) => f.archivo_pdf),
        600,
      )
    : { data: [] };
  const url = new Map((firmadas.data ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    corrida: {
      id: c.data.id,
      archivo: c.data.archivo,
      subidoEn: c.data.subido_en,
      nResumen: c.data.n_resumen,
      totalResumen: c.data.total_resumen === null ? null : Number(c.data.total_resumen),
      nRecibos: c.data.n_recibos,
      totalRecibos: Number(c.data.total_recibos),
      avisos: c.data.avisos as string[],
    },
    filas: filasDb.map((f) => ({
      id: f.id,
      llave: f.llave,
      tipo: f.tipo,
      alias: f.alias,
      concepto: f.concepto,
      monto: Number(f.monto),
      fecha: f.fecha_operacion,
      estado: f.estado as EstadoTransferencia,
      error: f.error,
      proveedorId: f.proveedor_zoho_id,
      proveedorNombre: f.proveedor_nombre,
      sugerido: f.sugerido,
      pagoId: f.zoho_vendorpayment_id,
      reciboUrl: url.get(f.archivo_pdf) ?? null,
      aplicadoEn: f.aplicado_en,
      asignaciones: (
        f.suc_pago_asignacion as {
          bill_id: string;
          bill_numero: string;
          ubicacion: string;
          fecha: string | null;
          saldo: number;
          monto: number;
        }[]
      )
        .map((a) => ({
          billId: a.bill_id,
          numero: a.bill_numero,
          ubicacion: a.ubicacion,
          fecha: a.fecha,
          saldo: Number(a.saldo),
          monto: Number(a.monto),
        }))
        .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '')),
    })),
  };
}
