// Pedido del usuario (2026-11-18): OCs automáticas lunes y jueves 08:00 CDMX; seguridad 20 días y 45 a importados.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261119000071_comercializadora_oc_lunes_jueves.sql', 'utf8');

describe('migración 71: horario de OCs y días de seguridad', () => {
  it('mueve zoho-generar-oc a lunes y jueves 14:00 UTC (08:00 CDMX) sin tocar si está activo', () => {
    expect(sql).toMatch(/cron\.alter_job\([^;]*jobname = 'zoho-generar-oc'[^;]*schedule := '0 14 \* \* 1,4'\)/s);
    expect(sql).not.toMatch(/active :=/);
  });
  it('20 días de seguridad general y 45 por artículo a lo importado (lead time > entrega máxima), con historial', () => {
    expect(sql).toMatch(/jsonb_set\(config, '\{seg,dias\}', '20'::jsonb\)/);
    expect(sql).toMatch(/set dias_seguridad = 45/);
    expect(sql).toMatch(/\{compra,entrega_max\}/);
    expect(sql.match(/insert into public\.com_plan_config_historial/g)).toHaveLength(2);
  });
});
