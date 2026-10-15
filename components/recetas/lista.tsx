import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { puede } from '@/lib/portal/permisos';
import { CatalogoRecetas } from './catalogo';
export async function ListaRecetas({ tipo, q = '' }: { tipo: 'producto' | 'subreceta'; q?: string }) {
  const { db, perfil } = await sesion();
  const [recetas, categorias] = await Promise.all([
    todas(db, 'recetas', 'nombre,id'),
    todas(db, 'categorias_producto', 'id'),
  ]);
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]));
  const filas = recetas
    .filter((r) => r.tipo === tipo)
    .map(({ id, nombre, activo, categoria_id, rendimiento, unidad_rendimiento }) => ({
      id,
      nombre,
      activo,
      categoria: categoria_id ? nombres.get(categoria_id) : undefined,
      detalle: rendimiento ? `${rendimiento} ${unidad_rendimiento}` : undefined,
    }));
  return <CatalogoRecetas tipo={tipo} filas={filas} consulta={q} editable={puede(perfil.rol, 'recetas')} />;
}
