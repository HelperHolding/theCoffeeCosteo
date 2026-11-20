import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validarFlujo } from '../../scripts/n8n/validar';

const leer = (f: string) => JSON.parse(readFileSync(`n8n/${f}`, 'utf8'));

describe('flujos de n8n de WhatsApp de OCs', () => {
  it('envío: nodos en orden y sin secretos', () => {
    expect(
      validarFlujo(leer('oc-whatsapp-envio.json'), [
        'Webhook Zoho',
        'Reservar en portal',
        '¿Enviar?',
        'Leer OC en Zoho',
        '¿Sigue emitida?',
        'Leer proveedor en Zoho',
        '¿Tiene número?',
        'PDF de la OC',
        'Mandar WhatsApp',
        'Resultado enviado',
        'Resultado sin número',
        'Resultado fallido',
      ]),
    ).toEqual([]);
  });
  it('avisos de Meta: verificación, estados y respuestas', () => {
    expect(
      validarFlujo(leer('oc-whatsapp-avisos.json'), [
        'Webhook Meta',
        'Verificar Meta',
        'Estados a portal',
        'Respuestas a portal',
      ]),
    ).toEqual([]);
  });
  it('el validador detecta secretos y nodos faltantes', () => {
    const malo = {
      nodes: [
        { name: 'X', parameters: { headerValue: 'Bearer abc', url: 'https://x.supabase.co?apikey=1' } },
      ],
      connections: {},
    };
    expect(validarFlujo(malo, ['X', 'Y'])).toEqual(
      expect.arrayContaining(['falta el nodo "Y"', 'el nodo "X" trae un valor que parece secreto']),
    );
  });
});
