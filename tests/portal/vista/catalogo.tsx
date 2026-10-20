import { CatalogoRecetas } from '../../../components/recetas/catalogo';
import { Navegacion } from '../../../components/portal/navegacion';
import { Marca } from '../../../components/portal/marca';
const nombres = [
  'Açaí Bowl',
  'Acai Cup',
  'Affogato Coffee',
  'Almond Croissant',
  'Americano',
  'Americano + Croissant Traditional',
  'Americano + Gingerbread',
  'Americano + Grilled Ham & Cheese Sandwich',
  'Apple and Cinnamon Muffin',
  'Banana Cake',
];
// Margen Rappi de muestra, variado: en objetivo (≥ 50 %), bajo objetivo y con pérdida.
const margen = (i: number, ajuste = 0) => {
  const pct = i === 5 ? -0.04 : ((i * 17 + ajuste) % 45) / 100 + 0.22;
  return {
    pct,
    importe: Math.round(pct * 75 * 100) / 100,
    estado: pct < 0 ? ('pierde' as const) : pct < 0.5 ? ('bajo' as const) : ('ok' as const),
  };
};
export function VistaCatalogo() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="bg-primary text-white p-5 flex flex-col gap-7">
        <Marca />
        <p className="text-xs uppercase tracking-[.22em] text-neutral-400">Portal de costeos</p>
        <Navegacion />
      </aside>
      <main className="p-5 md:p-10 min-w-0 max-w-[1400px] w-full mx-auto space-y-6">
        <CatalogoRecetas
          editable
          tipo="producto"
          margenRappi={window.location.search.includes('margen')}
          canales={[
            { id: 'm', nombre: 'App propia/Mostrador' },
            { id: 'r', nombre: 'Rappi' },
          ]}
          filas={Array.from({ length: 31 }, (_, i) => ({
            id: String(i),
            nombre: `${nombres[i % nombres.length]}${i >= 10 ? ` · prueba ${i}` : ''}`,
            activo: i !== 8,
            categoria: i % 2 ? 'Bebidas calientes' : 'Bakery',
            precios:
              i % 3 === 0
                ? [
                    {
                      tamano: 'Chica',
                      costo: 12.4 + i,
                      canales: { m: 55, r: 75 },
                      margenRappi: margen(i, 9),
                    },
                    {
                      tamano: 'Grande',
                      costo: 16.9 + i,
                      canales: { m: 65, r: 89 },
                      margenRappi: margen(i),
                    },
                  ]
                : i === 4
                  ? []
                  : [
                      {
                        tamano: 'Único',
                        costo: 9.8 + i,
                        canales: {
                          m:
                            i === 1
                              ? [
                                  { nombre: 'Mostrador', precio: 48 },
                                  { nombre: 'App propia', precio: 52 },
                                ]
                              : 48,
                          r: 66,
                        },
                        margenRappi: i === 2 ? { pct: null, importe: null, estado: 'sin-precio' } : margen(i),
                      },
                    ],
          }))}
        />
      </main>
    </div>
  );
}
