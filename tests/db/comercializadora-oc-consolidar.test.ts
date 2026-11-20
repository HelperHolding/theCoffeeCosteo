// Spec 2026-11-20: OC automática consolida borradores y alerta OCs emitidas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261120000077_comercializadora_oc_consolidar.sql', 'utf8');

describe('migración: columnas de consolidación en com_oc_auto', () => {
  it('agrega reemplaza y alerta_emitidas como jsonb opcionales', () => {
    expect(sql).toMatch(/alter table public\.com_oc_auto\s+add column if not exists reemplaza jsonb/i);
    expect(sql).toMatch(/add column if not exists alerta_emitidas jsonb/i);
  });
  it('no prende la bandera auto.consolidar', () => {
    expect(sql).not.toMatch(/\{auto,consolidar\}/);
    expect(sql).not.toMatch(/jsonb_set\(config/);
  });
});
