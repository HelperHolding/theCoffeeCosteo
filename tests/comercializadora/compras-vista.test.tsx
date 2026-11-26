// tests/comercializadora/compras-vista.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/app/(comercializadora)/comercializadora/acciones', () => ({ sincronizarCompras: vi.fn(async () => ({ ok: true, mensaje: 'Listo: 1 OCs, 0 recepciones y 2 facturas leídas de Zoho.' })) }));

import { FiltrosCompras } from '@/components/comercializadora/compras/filtros';
import { IndicadoresCompras } from '@/components/comercializadora/compras/indicadores';
import { SincronizarCompras } from '@/components/comercializadora/compras/sincronizar';
import { armarTablero, periodoDe } from '../../supabase/functions/_shared/compras/tablero.ts';

const t = armarTablero({
  ocs: [{ zoho_po_id: 'P1', folio: 'COM-OC-1', proveedor: 'Prov A', comprador: 'CC', emision: '2026-11-17', arribo: '2026-11-19', estado: 'open', received_status: 'received', monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false }],
  recepciones: [{ zoho_po_id: 'P1', fecha: '2026-11-19', monto: 2000, por_categoria: { CAF: 2000 } }],
  ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  lineas: [],
}, { periodo: '2026-11-16', categoria: null, proveedor: null, comprador: null }, '2026-11-26');

describe('vista del tablero de compras', () => {
  it('los 9 indicadores con su semáforo y el plan que no se pudo calcular', () => {
    render(<IndicadoresCompras t={t} faltan={null} />);
    for (const e of ['Venta', 'Compras recibidas', 'Compras / venta · meta 45–55%', 'OCs que llegaron', 'Entregas a tiempo', 'Lead time promedio', 'Mayor compra del periodo', 'OCs vencidas sin recibir', 'Faltan por comprar'])
      expect(screen.getByText(e)).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('No se pudo calcular el plan')).toBeTruthy();
  });
  it('cambiar la categoría lleva a la URL con el filtro y conserva el periodo', () => {
    render(<FiltrosCompras filtros={t.filtros} opciones={t.opciones} />);
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'CAF' } });
    expect(push).toHaveBeenCalledWith('/comercializadora/compras?periodo=2026-11-16&categoria=CAF');
    expect(screen.getByRole('link', { name: 'Restablecer filtros' }).getAttribute('href')).toBe('/comercializadora/compras');
  });
  it('Sincronizar ahora muestra el resultado', async () => {
    render(<SincronizarCompras />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Listo');
  });
  it('periodoDe sigue el mismo periodo que la vista', () => {
    expect(t.periodo.clave).toBe(periodoDe('2026-11-16', '2026-11-26').clave);
  });
});
