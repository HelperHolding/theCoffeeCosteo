import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas } from '@/lib/franquiciatarios/servidor';
import { leerPedidosSucursal } from '@/lib/franquiciatarios/pedidos-servidor';
import { armarPedidos } from '@/lib/franquiciatarios/pedidos';
import { Encabezado } from '@/components/portal/piezas';
import { PedidosFranq } from '@/components/franquiciatarios/pedidos';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';

export const dynamic = 'force-dynamic';

export default async function PaginaPedidos({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Pedidos a la Comercializadora"
      descripcion="Lo que la sucursal pidió en los últimos 120 días y su recepción: quién recibió y qué llegó distinto."
    />
  );
  const baristas = c.rol === 'barista' ? await leerBaristas(c.db, c.companyId) : [];
  const elegido = c.rol === 'barista' ? await baristaElegido(baristas, c.companyId) : null;
  if (c.rol === 'barista' && !elegido)
    return (
      <>
        {encabezado}
        <QuienEres companyId={c.companyId} nombres={baristas.filter((b) => b.activo)} />
      </>
    );
  // Montos: por ahora solo el administrador (decisión pendiente de Carlos; los demás ven productos y cantidades).
  const conMontos = c.rol === 'admin';
  const [lectura, recepciones] = await Promise.all([
    leerPedidosSucursal(c.cfg),
    c.db.from('franq_recepciones').select('*').eq('company_id', c.companyId),
  ]);
  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      {!lectura.ok || recepciones.error ? (
        <p className="aviso">
          {lectura.ok ? 'No se pudieron leer las recepciones. Intenta de nuevo.' : lectura.error}
        </p>
      ) : (
        <PedidosFranq
          companyId={c.companyId}
          conMontos={conMontos}
          pedidos={armarPedidos(lectura.filas, recepciones.data ?? [], { conMontos })}
        />
      )}
    </>
  );
}
