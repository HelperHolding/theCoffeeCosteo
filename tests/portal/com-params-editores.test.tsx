// Plan 3e: editores de parámetros de Importaciones y Café (borrador, Guardar, Descartar, solo lectura).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ refresh: vi.fn(), guardar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  guardarParamsImpCafe: m.guardar,
}));
import { ParametrosCafe, ParametrosImp } from '../../components/comercializadora/parametros-imp-cafe';
import { contextoParamsCafe, contextoParamsImp } from '../../lib/comercializadora/paramsContexto';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeCorrer } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const imp = impCorrer(datosImp(), normalizarCfgMotor({}));
const ctxImp = contextoParamsImp(imp, datosImp());
const cafe = cafeCorrer(datosImp(), normalizarCfgMotor({}));
const escribir = (etiqueta: string, valor: string) => {
  const el = screen.getByLabelText(etiqueta);
  fireEvent.change(el, { target: { value: valor } });
  fireEvent.blur(el);
};

describe('ParametrosImp', () => {
  afterEach(() => vi.clearAllMocks());

  it('edita el borrador y guarda solo la sección imp con la versión que vio', async () => {
    m.guardar.mockResolvedValue({ ok: true, version: 5, cambios: 2 });
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />);
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
    escribir('Venta INS-DES-021', '0.95');
    escribir('Lead time Easy Drinkware', '999'); // se acota a 400
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
    fireEvent.click(guardar);
    await waitFor(() => expect(m.guardar).toHaveBeenCalled());
    const [ambito, b, version] = m.guardar.mock.calls[0];
    expect([ambito, version]).toEqual(['imp', 4]);
    expect(b.items['INS-DES-021'].venta).toBe(0.95);
    expect(b.prov[1].lead).toBe(400);
    expect(await screen.findByText('Guardado: 2 cambios.')).toBeTruthy();
    expect(m.refresh).toHaveBeenCalled();
  });

  it('revisión 3e (I2): un render del servidor con los mismos datos (Actualizar) no borra el borrador', () => {
    const { rerender } = render(
      <ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />,
    );
    escribir('Venta INS-DES-021', '0.95');
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
    rerender(
      <ParametrosImp imp={structuredClone(imp.cfg.imp)} version={4} editable esc="Base" ctx={ctxImp} />,
    );
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
    expect((screen.getByLabelText('Venta INS-DES-021') as HTMLInputElement).value).toBe('0.95');
  });

  it('la tabla de la red se recalcula con el borrador; "usar" toma la venta de la plataforma; agregar y descartar', () => {
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />);
    escribir('Meses en los que manda el pipeline', '0');
    escribir('Plan 2027-02', '40');
    expect(screen.getByLabelText('Plan 2027-02').closest('tr')!.textContent).toContain('40plan de Dirección');
    fireEvent.click(screen.getAllByRole('button', { name: 'usar' })[0]);
    const v = (screen.getByLabelText('Venta INS-DES-021') as HTMLInputElement).value;
    expect(Number(v)).toBe(Math.round((ctxImp.meta['INS-DES-021'].vPlat as number) * 10000) / 10000);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByLabelText('Venta IMP-NUE-900')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByLabelText('Venta IMP-NUE-900')).toBeNull();
    expect(screen.getByText(/Sin cambios/)).toBeTruthy();
  });

  it('quitar pide confirmación; un error al guardar se muestra y el borrador se queda', async () => {
    m.guardar.mockResolvedValue({ error: 'Otra persona guardó la configuración mientras trabajabas.' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0]);
    expect(screen.queryByLabelText('Venta INS-DES-021')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Otra persona');
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
  });

  it('solo lectura: campos deshabilitados y sin botones de guardar', () => {
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable={false} esc="Base" ctx={ctxImp} />);
    expect((screen.getByLabelText('Venta INS-DES-021') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
    expect(screen.getByText('Tu acceso es de solo lectura.')).toBeTruthy();
  });
});

describe('ParametrosCafe', () => {
  it('la suma de la mezcla se marca si no es 1; el arranque manual muestra sus campos; guarda la sección cafe', async () => {
    m.guardar.mockResolvedValue({ ok: true, version: 3, cambios: 1 });
    render(<ParametrosCafe cafe={cafe.cfg.cafe} version={2} editable ctx={contextoParamsCafe(cafe)} />);
    expect(screen.getAllByText(/^\d+ \(plataforma\)$/).length).toBe(6);
    escribir('Mezcla White 1 kg', '0.5');
    expect(screen.getByText('0.614').className).toContain('text-bad');
    fireEvent.change(screen.getByLabelText('Arranque del año'), { target: { value: 'manual' } });
    expect(screen.getByLabelText('Sucursales Base')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(m.guardar).toHaveBeenCalled());
    expect(m.guardar.mock.calls[0][0]).toBe('cafe');
    expect(m.guardar.mock.calls[0][1]).toMatchObject({
      q4_modo: 'manual',
      prod: { white_1kg: { mezcla: 0.5 } },
    });
  });
});
