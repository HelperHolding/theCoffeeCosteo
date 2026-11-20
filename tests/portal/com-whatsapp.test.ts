import { describe, expect, it } from 'vitest';
import { etiquetaWhatsapp, leerBanderaWhatsapp } from '../../lib/comercializadora/whatsapp';

const e = (o: Record<string, unknown>) =>
  ({
    zoho_po_id: 'p',
    po_number: 'COM-OC-1',
    estado: 'enviado',
    error: null,
    enviado_at: '2026-11-24T14:12:00Z',
    leido_at: null,
    ...o,
  }) as never;

describe('WhatsApp de OCs (pantalla)', () => {
  it('etiqueta por estado, con hora de CDMX y reintento solo en fallas', () => {
    expect(etiquetaWhatsapp(undefined)).toEqual({ texto: '—', tono: 'neutro', reintentable: false });
    expect(etiquetaWhatsapp(e({}))).toEqual({ texto: 'Enviado 08:12', tono: 'ok', reintentable: false });
    expect(etiquetaWhatsapp(e({ estado: 'leido', leido_at: '2026-11-24T15:00:00Z' }))).toEqual({
      texto: 'Leído 09:00',
      tono: 'ok',
      reintentable: false,
    });
    expect(etiquetaWhatsapp(e({ estado: 'entregado' })).texto).toBe('Entregado');
    expect(etiquetaWhatsapp(e({ estado: 'reservado' })).texto).toBe('Enviando…');
    expect(etiquetaWhatsapp(e({ estado: 'fallido', error: 'Meta 131026' }))).toEqual({
      texto: 'Falló: Meta 131026',
      tono: 'bajo',
      reintentable: true,
    });
    expect(etiquetaWhatsapp(e({ estado: 'sin_numero' }))).toEqual({
      texto: 'Sin número',
      tono: 'bajo',
      reintentable: true,
    });
    expect(etiquetaWhatsapp(e({ estado: 'omitido', error: 'WhatsApp apagado' }))).toEqual({
      texto: 'No se mandó (WhatsApp apagado)',
      tono: 'neutro',
      reintentable: true,
    });
  });
  it('bandera: apagada por omisión; lista solo de textos no vacíos', () => {
    expect(leerBanderaWhatsapp({})).toEqual({ activo: false, solo_vendor_ids: [] });
    expect(leerBanderaWhatsapp({ whatsapp: { activo: 'si' } })).toEqual({
      activo: false,
      solo_vendor_ids: [],
    });
    expect(leerBanderaWhatsapp({ whatsapp: { activo: true, solo_vendor_ids: ['v1', '', 3] } })).toEqual({
      activo: true,
      solo_vendor_ids: ['v1', '3'],
    });
  });

  it('un reservado de más de 30 minutos se marca para revisar y se puede reintentar', () => {
    const ahora = new Date('2026-11-24T16:00:00Z');
    expect(etiquetaWhatsapp(e({ estado: 'reservado', reservado_at: '2026-11-24T15:00:00Z' }), ahora)).toEqual(
      {
        texto: 'Sin confirmar: revisa en WhatsApp',
        tono: 'bajo',
        reintentable: true,
      },
    );
    expect(
      etiquetaWhatsapp(e({ estado: 'reservado', reservado_at: '2026-11-24T15:45:00Z' }), ahora).texto,
    ).toBe('Enviando…');
  });
});
