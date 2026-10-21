// Traduce lo que el agente hace de verdad (partes del stream) al verbo del Thinking Orb.
export type EstadoOrbe =
  'breathing' | 'working' | 'searching' | 'solving' | 'connecting' | 'weaving' | 'composing';

export const pasosConsulta: Record<string, { estado: EstadoOrbe; texto: string }> = {
  buscar_recetas: { estado: 'searching', texto: 'Buscando en el menú' },
  buscar_insumos: { estado: 'searching', texto: 'Buscando insumos' },
  consultar_alertas: { estado: 'searching', texto: 'Revisando alertas' },
  consultar_costos: { estado: 'solving', texto: 'Calculando costos y márgenes' },
  consultar_receta: { estado: 'solving', texto: 'Leyendo la receta' },
  recetas_por_insumo: { estado: 'connecting', texto: 'Cruzando insumos con recetas' },
  resumen_pipeline: { estado: 'searching', texto: 'Revisando el pipeline' },
  buscar_tiendas: { estado: 'searching', texto: 'Buscando tiendas' },
  consultar_tienda: { estado: 'solving', texto: 'Leyendo el expediente' },
  buscar_actividades: { estado: 'searching', texto: 'Revisando actividades' },
  buscar_prospectos: { estado: 'searching', texto: 'Buscando prospectos' },
  consultar_prospecto: { estado: 'solving', texto: 'Leyendo la ficha del prospecto' },
  buscar_contactos: { estado: 'searching', texto: 'Buscando contactos' },
  historial_cambios: { estado: 'connecting', texto: 'Revisando el historial' },
};

type Parte = { type: string; state?: string; text?: string };
export type Paso = { id: string; texto: string; estado: EstadoOrbe; listo: boolean };

export function pasosDe(partes: Parte[]): Paso[] {
  return partes.flatMap((p, i) => {
    if (!p.type.startsWith('tool-')) return [];
    const info = pasosConsulta[p.type.slice(5)] ?? { estado: 'working' as const, texto: 'Consultando datos' };
    return [{ id: `${i}`, ...info, listo: p.state === 'output-available' || p.state === 'output-error' }];
  });
}

export function estadoOrbe(status: string, partes: Parte[]): { estado: EstadoOrbe; texto: string } {
  if (status !== 'submitted' && status !== 'streaming')
    return { estado: 'breathing', texto: 'Listo para consultar' };
  if (status === 'submitted' || !partes.length) return { estado: 'working', texto: 'Pensando' };
  const pasos = pasosDe(partes);
  const enCurso = pasos.find((p) => !p.listo);
  if (enCurso) return { estado: enCurso.estado, texto: enCurso.texto };
  const ultima = partes[partes.length - 1];
  if (ultima.type === 'text' && ultima.text) return { estado: 'composing', texto: 'Redactando' };
  if (new Set(pasos.map((p) => p.texto)).size > 1)
    return { estado: 'weaving', texto: 'Combinando resultados' };
  return { estado: 'working', texto: 'Pensando' };
}

export function sugerenciasPara(ruta: string, titulo?: string): string[] {
  if (ruta.startsWith('/crm/tiendas/') && titulo)
    return [
      `¿Cómo va ${titulo} y qué le falta?`,
      `¿Quién modificó por última vez ${titulo}?`,
      `¿Qué pendientes del checklist tiene ${titulo}?`,
    ];
  if (ruta.startsWith('/crm/prospectos'))
    return ['¿Cuántos prospectos hay por etapa?', '¿Qué prospectos están con interés?'];
  if (ruta.startsWith('/crm/actividades'))
    return ['¿Qué actividades están vencidas?', '¿Qué actividades siguen en curso?'];
  if (ruta.startsWith('/crm'))
    return [
      '¿Cuántas tiendas hay en cada etapa?',
      '¿Qué tiendas están en remodelación y qué les falta?',
      '¿Cuáles fueron los últimos cambios en el CRM y quién los hizo?',
    ];
  if (ruta.startsWith('/productos/') && titulo && !ruta.endsWith('/nuevo') && !ruta.endsWith('/calculadora'))
    return [
      `¿Por qué ${titulo} tiene su margen actual en cada canal?`,
      `¿Qué ingrediente pesa más en el costo de ${titulo}?`,
      `Compara ${titulo} en Mostrador y Rappi`,
    ];
  if (ruta.startsWith('/insumos'))
    return [
      '¿Qué insumos se usan en más productos?',
      'Busca insumos de lácteos',
      '¿Qué productos usan matcha?',
    ];
  if (ruta.startsWith('/subrecetas'))
    return ['¿Qué sub-recetas se usan en más productos?', '¿Cuánto cuesta el concentrado de cold brew?'];
  return [
    '¿Qué productos tienen alertas?',
    '¿Qué productos pierden dinero en Rappi?',
    'Consulta los costos del Americano',
  ];
}
