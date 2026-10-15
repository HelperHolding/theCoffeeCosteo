import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from '@ai-sdk/provider';

// Modelo guionado SOLO para la demo local; la ruta lo importa bajo demanda (CHAT_DEMO=1, sin clave, fuera de producción).
// No inventa datos: llama a las consultas reales de lectura y redacta con lo que devuelven.
const uso = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
function flujo(partes: (LanguageModelV4StreamPart | number)[]) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    async start(c) {
      for (const p of partes) {
        if (typeof p === 'number') await espera(p);
        else c.enqueue(p);
      }
      c.close();
    },
  });
}
function llamada(
  id: string,
  toolName: string,
  input: Record<string, unknown>,
): (LanguageModelV4StreamPart | number)[] {
  const json = JSON.stringify(input);
  return [
    { type: 'tool-input-start', id, toolName },
    900,
    { type: 'tool-input-delta', id, delta: json },
    900,
    { type: 'tool-input-end', id },
    { type: 'tool-call', toolCallId: id, toolName, input: json },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: uso },
  ];
}
function texto(t: string): (LanguageModelV4StreamPart | number)[] {
  const trozos = t.match(/[\s\S]{1,24}/g) ?? [];
  return [
    { type: 'text-start', id: 't' },
    ...trozos.flatMap((delta) => [{ type: 'text-delta' as const, id: 't', delta }, 40]),
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'end_turn' }, usage: uso },
  ];
}
type Fila = Record<string, unknown>;
function resultados(o: LanguageModelV4CallOptions): Fila[][] {
  return o.prompt.flatMap((m) =>
    m.role === 'tool'
      ? m.content.flatMap((p) =>
          p.type === 'tool-result' && p.output.type === 'json'
            ? [((p.output.value as { datos?: Fila[] })?.datos ?? []) as Fila[]]
            : [],
        )
      : [],
  );
}
const pct = (n: unknown) => (typeof n === 'number' ? `${(n * 100).toFixed(1)}%` : '—');
const mxn = (n: unknown) => (typeof n === 'number' ? `$${n.toFixed(2)}` : 'Sin precio');

export function modeloDemo() {
  return new MockLanguageModelV4({
    provider: 'demo-local',
    modelId: 'guion',
    doStream: async (o) => {
      const previos = resultados(o);
      const inicio: (LanguageModelV4StreamPart | number)[] = [{ type: 'stream-start', warnings: [] }, 1100];
      if (previos.length === 0)
        return { stream: flujo([...inicio, ...llamada('a1', 'consultar_alertas', { canal: 'Rappi' })]) };
      const alertas = previos[0];
      if (previos.length === 1 && alertas[0]?.producto_id)
        return {
          stream: flujo([
            ...inicio.slice(0, 1),
            400,
            ...llamada('c1', 'consultar_costos', { producto_id: alertas[0].producto_id, canal: 'Rappi' }),
          ]),
        };
      const costos = previos[1] ?? [];
      const filas = alertas
        .slice(0, 8)
        .map((a) => `| [${a.producto}](/productos/${a.producto_id}) | ${a.alerta} |`)
        .join('\n');
      const detalle = costos
        .map(
          (c) =>
            `| ${c.tamano} | ${mxn(c.costo)} | ${mxn(c.precio_canal)} | ${mxn(c.margen)} | ${pct(c.margen_pct)} |`,
        )
        .join('\n');
      const respuesta = alertas.length
        ? `Encontré **${alertas.length} alertas** en Rappi${alertas.length > 8 ? ' (muestro las primeras 8)' : ''}:\n\n| Producto | Alerta |\n|---|---|\n${filas}\n\n` +
          (detalle
            ? `Detalle de **${alertas[0].producto}** en Rappi:\n\n| Tamaño | Costo | Precio | Margen $ | Margen % |\n|---|---|---|---|---|\n${detalle}\n\n`
            : '') +
          '_Respuesta de demostración local: consultas reales a la base de demo, redacción guionada._'
        : 'No hay alertas en Rappi. _Respuesta de demostración local._';
      return { stream: flujo([...inicio.slice(0, 1), 300, ...texto(respuesta)]) };
    },
  });
}
