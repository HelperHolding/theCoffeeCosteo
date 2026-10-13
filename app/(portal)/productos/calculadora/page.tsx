import Link from 'next/link';
import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { CalculadoraPromociones } from '@/components/recetas/calculadora-promociones';

export default async function Calculadora() {
  const { db } = await sesion();
  const [recetas, tamanos, productoTamanos, costos, canales, parametros] = await Promise.all([
    todas(db, 'recetas', 'nombre,id'),
    todas(db, 'tamanos', 'orden,id'),
    todas(db, 'producto_tamanos', 'producto_id,tamano_id'),
    todas(db, 'v_costo_producto', 'producto_id,tamano_id'),
    todas(db, 'canales', 'orden,id'),
    todas(db, 'parametros', 'id'),
  ]);

  const recetaPorId = new Map(recetas.map((r) => [r.id, r]));
  const tamanoPorId = new Map(tamanos.map((t) => [t.id, t]));
  const costoPorClave = new Map(costos.map((c) => [`${c.producto_id}:${c.tamano_id}`, c]));

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
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const parametro = parametros[0];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1>Calculadora de promociones</h1>
          <p className="text-muted-foreground">Precio, descuento y contribución por promoción.</p>
        </div>
        <Link href="/productos" className="text-sm underline underline-offset-4">
          Volver a productos
        </Link>
      </div>
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
