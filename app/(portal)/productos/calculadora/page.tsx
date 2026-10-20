import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { Encabezado } from '@/components/portal/piezas';
import { CalculadoraPromociones } from '@/components/recetas/calculadora-promociones';

export default async function Calculadora() {
  const { db } = await sesion();
  const [recetas, tamanos, productoTamanos, costos, canales, parametros, resumen] = await Promise.all([
    todas(db, 'recetas', 'nombre,id'),
    todas(db, 'tamanos', 'orden,id'),
    todas(db, 'producto_tamanos', 'producto_id,tamano_id'),
    todas(db, 'v_costo_producto', 'producto_id,tamano_id'),
    todas(db, 'canales', 'orden,id'),
    todas(db, 'parametros', 'id'),
    todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id'),
  ]);

  const recetaPorId = new Map(recetas.map((r) => [r.id, r]));
  const tamanoPorId = new Map(tamanos.map((t) => [t.id, t]));
  const costoPorClave = new Map(costos.map((c) => [`${c.producto_id}:${c.tamano_id}`, c]));

  const rappiPorClave = new Map(
    resumen
      .filter((r) => r.canal.toLowerCase() === 'rappi')
      .map((r) => [`${r.producto_id}:${r.tamano_id}`, r.precio_canal]),
  );

  const opciones = productoTamanos
    .map((pt) => {
      const receta = recetaPorId.get(pt.producto_id);
      const tamano = tamanoPorId.get(pt.tamano_id);
      if (!receta || receta.tipo !== 'producto' || !receta.activo || !tamano) return null;
      const costo = costoPorClave.get(`${pt.producto_id}:${pt.tamano_id}`);
      return {
        id: `${pt.producto_id}:${pt.tamano_id}`,
        nombre: `${receta.nombre} · ${tamano.nombre}`,
        costo: costo ? costo.costo : null,
        precioLista: pt.precio_lista,
        precioRappi: rappiPorClave.get(`${pt.producto_id}:${pt.tamano_id}`) ?? null,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const parametro = parametros[0];

  return (
    <>
      <Encabezado
        area="Análisis"
        titulo="Calculadora de promociones"
        descripcion="Prueba precios Rappi, productos y combos con los costos oficiales y sus márgenes al instante."
      />
      <CalculadoraPromociones
        productos={opciones}
        canales={canales.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          comisionPct: c.comision_pct * 100,
          costoEnvase: c.costo_envase,
        }))}
        ivaDefault={parametro ? parametro.iva * 100 : 16}
        objetivoDefault={parametro ? parametro.margen_objetivo * 100 : 50}
      />
    </>
  );
}
