export type Usos = Map<string, { lee: Set<string>; escribe: Set<string> }>;
export interface TablaLegado {
  tabla: string;
  filas: number;
  rls: boolean;
}

const LLAMADA = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)\s*\.(select|insert|update|upsert|delete)\b/g;

/** Agrega a `usos` las tablas que toca `texto` (`origen`: 'app', 'edge:<función>', 'netlify:<archivo>'). */
export function registrarUsos(usos: Usos, texto: string, origen: string): void {
  for (const m of texto.matchAll(LLAMADA)) {
    const u = usos.get(m[1]) ?? { lee: new Set<string>(), escribe: new Set<string>() };
    (m[2] === 'select' ? u.lee : u.escribe).add(origen);
    usos.set(m[1], u);
  }
}

// El orden importa: la primera regla que coincide gana (pedidos_apertura es de Aperturas, no de Pedidos).
const AREAS: [RegExp, string][] = [
  [/^com_/, 'Comercializadora'],
  [/^(aperturas|franquiciado_aperturas|pedidos_apertura)$/, 'Aperturas'],
  [/^(pedidos|pedido_)/, 'Pedidos'],
  [/^crm_/, 'CRM prospectos'],
  [/^chat_/, 'Chat'],
  [/^(regalias_|app_liquidaciones)/, 'Regalías'],
  [/^encuesta/, 'Encuestas'],
  [/^(marketing_|campanas)/, 'Marketing'],
  [/^seguimiento/, 'Seguimientos'],
  [/^(usuarios|proveedores_contactos)$/, 'Usuarios y accesos'],
];

export const areaDe = (tabla: string): string => AREAS.find(([re]) => re.test(tabla))?.[1] ?? 'Por asignar';

export function inventarioMarkdown(tablas: TablaLegado[], usos: Usos, fecha: string): string {
  const lista = (s?: Set<string>) => (s && s.size ? [...s].sort().join(', ') : '—');
  const filas = [...tablas]
    .sort((a, b) => areaDe(a.tabla).localeCompare(areaDe(b.tabla), 'es') || a.tabla.localeCompare(b.tabla))
    .map((t) => {
      const u = usos.get(t.tabla);
      return `| ${areaDe(t.tabla)} | \`${t.tabla}\` | ${t.filas} | ${t.rls ? 'sí' : '**no**'} | ${lista(u?.lee)} | ${lista(u?.escribe)} |  |`;
    });
  const huerfanas = [...usos.keys()].filter((k) => !tablas.some((t) => t.tabla === k)).sort();
  return [
    '# Inventario de tablas de thecoffeemexico (bliocjvq)',
    '',
    `Generado el ${fecha} con \`scripts/migracion-legado/inventario.ts\`. "Lee" y "Escribe" salen del código del repo`,
    'thecoffee-comercializadora; n8n y Apps Script que escriben por API no aparecen. La columna **Cruce con el portal**',
    'se llena a mano (por ejemplo: `crm_prospectos` ↔ `crm_*` del portal).',
    '',
    '| Área | Tabla | Filas | RLS | Lee | Escribe | Cruce con el portal |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...filas,
    ...(huerfanas.length
      ? ['', '## Referencias en el código sin tabla en la base', '', ...huerfanas.map((h) => `- \`${h}\``)]
      : []),
    '',
  ].join('\n');
}

const SECRETOS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{6,}/g, // llaves con prefijo
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/g, // encabezados Authorization
];

/** Quita secretos incrustados en definiciones de funciones antes de guardarlas en el repo. */
export function redactar(texto: string): string {
  return SECRETOS.reduce(
    (t, re) =>
      t.replace(re, (_m, g1) =>
        typeof g1 === 'string' && /^Bearer/.test(g1) ? `${g1}[REDACTADO]` : '[REDACTADO]',
      ),
    texto,
  );
}
