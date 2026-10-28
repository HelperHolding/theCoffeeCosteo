import { TableroAnalytics } from '../../../components/analytics/tablero';
import { Navegacion } from '../../../components/portal/navegacion';
import { Marca } from '../../../components/portal/marca';
import { construirTablero, type DatosSemana, type FilaKpiDb } from '../../../lib/analytics/tablero';

/**
 * Datos SINTÉTICOS (sin ventas reales): 12 tiendas ficticias, un día cerrado, uno provisional, una tienda sin
 * ventas y una sin lectura el día abierto. La evidencia real de conciliación vive fuera del repo.
 */
function sinteticos(): DatosSemana {
  const tiendas = Array.from({ length: 12 }, (_, i) => ({
    company_id: 900 + i,
    store_id: 100 + i,
    nombre: `Tienda de prueba ${String.fromCharCode(65 + i)}`,
  }));
  const kpi: FilaKpiDb[] = [];
  for (const [fecha, provisional, factor] of [
    ['2026-10-26', false, 1],
    ['2026-10-27', true, 0.55],
  ] as const)
    for (const t of tiendas) {
      if (provisional && t.company_id === 911) continue; // sin lectura el día abierto
      const sinVentas = t.company_id === 910;
      const tickets = sinVentas ? 0 : Math.round((30 + ((t.company_id * 37) % 70)) * factor);
      kpi.push({
        company_id: t.company_id,
        fecha,
        provisional,
        leido_en: provisional ? '2026-10-27T15:05:00Z' : '2026-10-27T13:00:00Z',
        tickets,
        unidades: Math.round(tickets * 1.6),
        venta_cent: tickets * (13_000 + ((t.company_id * 53) % 2_000)),
        // Reparto sintético: la app pesa entre 3 % y 12 % según la tienda.
        app_cent: Math.round(
          tickets * (13_000 + ((t.company_id * 53) % 2_000)) * (0.03 + (t.company_id % 10) / 100),
        ),
        mostrador_cent: 0,
        rappi_pos_tickets: t.company_id === 905 ? 6 : 0,
        rappi_pos_cent: t.company_id === 905 ? 120_000 : 0,
        sin_origen_tickets: 0,
      });
    }
  for (const k of kpi) k.mostrador_cent = k.venta_cent - k.app_cent;
  return {
    tiendas,
    kpi,
    rappiZoho: [{ company_id: 905, fecha: '2026-10-26', venta_cent: 1_890_000, tickets: 90 }],
  };
}

export function VistaAnalytics() {
  const q = new URLSearchParams(window.location.search);
  const ahora = new Date(q.has('desfase') ? '2026-10-27T21:30:00Z' : '2026-10-27T15:20:00Z');
  const vacio = q.has('vacio');
  const d = sinteticos();
  const t = construirTablero(
    vacio ? { ...d, kpi: [], rappiZoho: [] } : d,
    vacio ? '2026-10-19' : '2026-10-26',
    ahora,
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden bg-primary p-5 text-white lg:flex lg:flex-col lg:gap-7">
        <Marca />
        <Navegacion seccion="analytics" visibles={['costeo', 'analytics']} />
      </aside>
      <main className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6 p-4 md:p-10">
        <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
        <TableroAnalytics t={t} />
      </main>
    </div>
  );
}
