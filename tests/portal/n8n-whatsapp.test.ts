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
  it('envío: toda falla después de reservar termina en "Resultado fallido" (no queda reservado sin aviso)', () => {
    const f = leer('oc-whatsapp-envio.json');
    for (const n of [
      'Leer OC en Zoho',
      'Leer proveedor en Zoho',
      'Preparar datos',
      'PDF de la OC',
      'Subir PDF a WhatsApp',
      'Mandar WhatsApp',
    ]) {
      const nodo = f.nodes.find((x: { name: string }) => x.name === n);
      expect(nodo?.onError, n).toBe('continueErrorOutput');
      expect(
        f.connections[n]?.main?.[1]?.map((c: { node: string }) => c.node),
        n,
      ).toEqual(['Resultado fallido']);
    }
  });
  it('avisos de Meta: verificación y el aviso crudo con su firma va al portal', () => {
    const f = leer('oc-whatsapp-avisos.json');
    expect(
      validarFlujo(f, [
        'Webhook Meta verificación',
        'Verificar Meta',
        'Webhook Meta',
        'Cuerpo crudo',
        'Reenviar a portal',
      ]),
    ).toEqual([]);
    const webhook = f.nodes.find((x: { name: string }) => x.name === 'Webhook Meta');
    expect(webhook.parameters.options.rawBody).toBe(true);
    const reenviar = f.nodes.find((x: { name: string }) => x.name === 'Reenviar a portal');
    expect(reenviar.parameters.jsonBody).toContain("accion: 'meta'");
    expect(reenviar.onError).toBe('continueRegularOutput');
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
