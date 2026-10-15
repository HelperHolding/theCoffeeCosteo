import { createRoot } from 'react-dom/client';
import { EditorReceta } from '../../../components/recetas/editor-receta';
import { TablaResumen } from '../../../components/portal/tabla-resumen';
import type { Resumen } from '../../../lib/supabase/database.types';
import '../../../app/globals.css';
import { VistaCatalogo } from './catalogo';
import { VistaChat } from './chat';
import { CalculadoraPromociones } from '../../../components/recetas/calculadora-promociones';
const fila = {
  producto_id: 'p',
  producto: 'Latte de prueba',
  activo: true,
  categoria: 'Bebidas',
  tamano_id: 't',
  tamano: 'Único',
  canal_id: 'c',
  canal: 'Mostrador',
  costo: 8.5,
  precio_canal: 60,
  precio_manual: null,
  margen_pct: 0.7,
  margen_objetivo: 0.55,
} as Resumen;
createRoot(document.getElementById('root')!).render(
  window.location.search.includes('chat') ? (
    <VistaChat />
  ) : window.location.search.includes('catalogo') ? (
    <VistaCatalogo />
  ) : window.location.search.includes('calculadora') ? (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      <CalculadoraPromociones
        productos={[
          { id: 'a:u', nombre: 'Americano · Único', costo: 9.5, precioLista: 52 },
          { id: 'c:u', nombre: 'Croissant · Único', costo: 14.2, precioLista: 58 },
          { id: 'l:g', nombre: 'Latte · Grande', costo: 16.8, precioLista: 72 },
          { id: 'n:u', nombre: 'Nuevo · Único', costo: null, precioLista: 40 },
        ]}
        canales={[
          { id: 'm', nombre: 'Mostrador', comisionPct: 0, costoEnvase: 0 },
          { id: 'r', nombre: 'Rappi', comisionPct: 18, costoEnvase: 6.14 },
        ]}
        ivaDefault={16}
        objetivoDefault={55}
      />
    </main>
  ) : (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      <h1>Resumen y editor de recetas</h1>
      <TablaResumen filas={[fila]} alertas={[]} />
      <EditorReceta
        inicial={{
          nombre: 'Latte de prueba',
          tipo: 'producto',
          categoria_id: 'c',
          rendimiento: null,
          unidad_rendimiento: null,
          activo: true,
          tamanos: ['t', 'ch', 'g'],
          lineas: [
            {
              insumo_id: 'cafe',
              subreceta_id: null,
              orden: 0,
              cantidades: [
                { tamano_id: 't', cantidad: 18 },
                { tamano_id: 'ch', cantidad: 7 },
                { tamano_id: 'g', cantidad: 14 },
              ],
            },
          ],
        }}
        categorias={[{ id: 'c', nombre: 'Bebidas', activo: true }]}
        tamanos={[
          { id: 't', nombre: 'Único', orden: 1 },
          { id: 'ch', nombre: 'Chica', orden: 2 },
          { id: 'g', nombre: 'Grande', orden: 3 },
        ]}
        opciones={[
          { id: 'cafe', nombre: 'Café', tipo: 'insumo', unidad: 'gr', costo: 0.3, activo: true },
          { id: 'leche', nombre: 'Leche', tipo: 'insumo', unidad: 'ml', costo: 0.024, activo: true },
          { id: 'mix', nombre: 'Mix chocolate', tipo: 'subreceta', unidad: 'ml', costo: 0.08, activo: true },
        ]}
        editable
      />
    </main>
  ),
);
