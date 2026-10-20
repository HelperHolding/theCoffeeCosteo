import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { puede } from '@/lib/portal/permisos';
import { APP_PROPIA, FUSIONADO, MOSTRADOR, fusionarCanales } from '@/lib/portal/canales';
import { veMargenRappiEnTabla } from '@/lib/portal/vistas';
import { estadoMargen } from '@/components/portal/piezas';
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
  // Costo y precio final por canal de cada tamaño, tal como los calcula v_resumen. Mostrador y App propia
  // comparten la columna "App propia/Mostrador"; si su precio difiere, la celda muestra ambos.
  const idCanal = new Map(canales.map((c) => [c.nombre, c.id]));
  const fusionado = idCanal.get(MOSTRADOR) ?? FUSIONADO;
  const columnas = canales
    .filter((c) => c.nombre !== APP_PROPIA)
    .map((c) => ({ id: c.id, nombre: c.nombre === MOSTRADOR ? FUSIONADO : c.nombre }));
  const precios = new Map<string, Map<string, PreciosTamano>>();
  const filasCanal = fusionarCanales(resumen, { campos: ['precio_canal'] });
  for (const r of filasCanal.sort(
    (a, b) => a.tamano_orden - b.tamano_orden || a.canal_orden - b.canal_orden,
  )) {
    const tamanos = precios.get(r.producto_id) ?? new Map<string, PreciosTamano>();
    const t = tamanos.get(r.tamano_id) ?? { tamano: r.tamano, costo: r.costo, canales: {} };
    if (r.canal === MOSTRADOR || r.canal === APP_PROPIA) {
      const previo = t.canales[fusionado];
      t.canales[fusionado] = [
        ...(Array.isArray(previo) ? previo : []),
        { nombre: r.canal, precio: r.precio_canal },
      ];
    } else t.canales[r.canal_id] = r.precio_canal;
    tamanos.set(r.tamano_id, t);
    precios.set(r.producto_id, tamanos);
  }
  // Margen con comisión Rappi por tamaño (mismo dato que la tarjeta de la ficha). Solo se calcula, y solo
  // llega al navegador, para la cuenta que lo tiene habilitado.
  const conMargenRappi = tipo === 'producto' && veMargenRappiEnTabla(perfil.user_id);
  if (conMargenRappi)
    for (const r of resumen) {
      if (r.canal.toLowerCase() !== 'rappi') continue;
      const t = precios.get(r.producto_id)?.get(r.tamano_id);
      if (t)
        t.margenRappi = {
          pct: r.margen_pct,
          importe: r.margen,
          estado: estadoMargen(r),
        };
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
      canales={columnas}
      consulta={q}
      margenRappi={conMargenRappi}
      editable={puede(perfil.rol, 'recetas')}
    />
  );
}
