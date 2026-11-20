// Valida un flujo exportado de n8n: nodos esperados presentes y sin valores que parezcan secretos.
const SOSPECHOSO =
  /(bearer\s+[a-z0-9._-]{3,}|apikey=|service_role|sb_secret_|eyJ[a-zA-Z0-9_-]{10,}|password)/i;

export function validarFlujo(json: unknown, esperado: string[]): string[] {
  const f = json as {
    nodes?: {
      name: string;
      parameters?: unknown;
      credentials?: Record<string, { id?: string; name?: string }>;
    }[];
    connections?: object;
  };
  const out: string[] = [];
  if (!Array.isArray(f?.nodes)) return ['no es un flujo de n8n (falta nodes)'];
  const nombres = new Set(f.nodes.map((n) => n.name));
  for (const e of esperado) if (!nombres.has(e)) out.push(`falta el nodo "${e}"`);
  for (const n of f.nodes) {
    if (SOSPECHOSO.test(JSON.stringify(n.parameters ?? {})))
      out.push(`el nodo "${n.name}" trae un valor que parece secreto`);
    for (const c of Object.values(n.credentials ?? {}))
      if (c.id) out.push(`el nodo "${n.name}" trae un id de credencial; deja solo el nombre`);
  }
  return out;
}
