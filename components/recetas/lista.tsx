import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { puede } from '@/lib/portal/permisos';
import { CatalogoRecetas, type PreciosTamano } from './catalogo';
export async function ListaRecetas({ tipo, q = '' }: { tipo: 'producto' | 'subreceta'; q?: string }) {
  const { db, perfil } = await sesion();
  const [recetas, categorias, resumen, canales] = await Promise.all([
    todas(db, 'recetas', 'nombre,id'),
    todas(db, 'categorias_producto', 'id'),
    tipo === 'producto' ? todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id') : [],
    tipo === 'producto' ? todas(db, 'canales', 'orden,id') : [],
  ]);
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]));
  // Costo y precio final por canal de cada tamaño, tal como los calcula v_resumen.
  const precios = new Map<string, Map<string, PreciosTamano>>();
  for (const r of [...resumen].sort((a, b) => a.tamano_orden - b.tamano_orden)) {
    const tamanos = precios.get(r.producto_id) ?? new Map<string, PreciosTamano>();
    const t = tamanos.get(r.tamano_id) ?? { tamano: r.tamano, costo: r.costo, canales: {} };
    t.canales[r.canal_id] = r.precio_canal;
    tamanos.set(r.tamano_id, t);
    precios.set(r.producto_id, tamanos);
  }
  const filas = recetas
    .filter((r) => r.tipo === tipo)
    .map(({ id, nombre, activo, categoria_id, rendimiento, unidad_rendimiento }) => ({
      id,
      nombre,
      activo,
      categoria: categoria_id ? nombres.get(categoria_id) : undefined,
      detalle: rendimiento ? `${rendimiento} ${unidad_rendimiento}` : undefined,
      precios: tipo === 'producto' ? [...(precios.get(id)?.values() ?? [])] : undefined,
    }));
  return (
    <CatalogoRecetas
      tipo={tipo}
      filas={filas}
      canales={canales.map((c) => ({ id: c.id, nombre: c.nombre }))}
      consulta={q}
      editable={puede(perfil.rol, 'recetas')}
    />
  );
}
