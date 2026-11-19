import type { Db } from '../portal/consultas';
import type { Consulta } from './consulta';

/** Herramientas de ventas (docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.2). Solo para /mcp. */
export function consultasVentas(db: Db): Consulta[] {
  void db;
  return [];
}
