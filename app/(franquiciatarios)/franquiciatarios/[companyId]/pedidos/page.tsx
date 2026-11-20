import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { leerPedidosSucursal } from '@/lib/franquiciatarios/pedidos-servidor';
import { armarPedidos } from '@/lib/franquiciatarios/pedidos';
import { Encabezado } from '@/components/portal/piezas';
import { PedidosFranq } from '@/components/franquiciatarios/pedidos';

export const dynamic = 'force-dynamic';

/**
 * Pedidos a la Comercializadora con sus montos y recepciones: solo gerente, franquiciatario y admin (decisión de
 * Carlos, 2026-11-20). A la cuenta de baristas le responde el mismo 404 que las otras páginas de gerencia.
 */
export default async function PaginaPedidos({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoGestor(params);
  const [lectura, recepciones] = await Promise.all([
    leerPedidosSucursal(c.cfg),
    c.db.from('franq_recepciones').select('*').eq('company_id', c.companyId),
  ]);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Pedidos a la Comercializadora"
        descripcion="Lo que la sucursal pidió en los últimos 120 días, lo que costó y su recepción: quién recibió y qué llegó distinto."
      />
      {!lectura.ok || recepciones.error ? (
        <p className="aviso">
          {lectura.ok ? 'No se pudieron leer las recepciones. Intenta de nuevo.' : lectura.error}
        </p>
      ) : (
        <PedidosFranq
          companyId={c.companyId}
          conMontos
          pedidos={armarPedidos(lectura.filas, recepciones.data ?? [], { conMontos: true })}
        />
      )}
    </>
  );
}
