import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const guardar = vi.fn().mockResolvedValue({ ok: true });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(comercializadora)/comercializadora/acciones', () => ({
  guardarWhatsapp: (...a: unknown[]) => guardar(...a),
}));

import { WhatsappConfig } from '../../components/comercializadora/whatsapp-config';

const provs = [
  { vendor_id: 'v1', nombre: 'ODISA' },
  { vendor_id: 'v2', nombre: 'MAHA' },
];

describe('Configuración: WhatsApp de OCs', () => {
  it('prende, elige proveedores de prueba y guarda', async () => {
    render(<WhatsappConfig activo={false} solo={[]} proveedores={provs} editable />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mandar OCs emitidas por WhatsApp' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo a ODISA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar WhatsApp' }));
    await waitFor(() => expect(guardar).toHaveBeenCalledWith(true, ['v1']));
  });
  it('sin edición todo queda deshabilitado', () => {
    render(<WhatsappConfig activo solo={['v2']} proveedores={provs} editable={false} />);
    expect(
      (screen.getByRole('checkbox', { name: 'Mandar OCs emitidas por WhatsApp' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar WhatsApp' })).toBeNull();
  });
});
