import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIPOS_DOCUMENTO, camposSucursal } from '../../lib/crm/validacion';

// Cada requisito de documento sube su archivo con su propio tipo (crm_requisitos.tipo_documento) y
// prepararDocumento rechaza los tipos que no están en TIPOS_DOCUMENTO: si falta uno, ese requisito no se
// puede registrar. Pasaba con los ocho entregables de Proyectos (26.1–26.7) y con la factura de Finanzas.
const MIGRACIONES = join(__dirname, '../../supabase/migrations');
const sql = readdirSync(MIGRACIONES)
  .filter((f) => /crm_(requisitos|flujo_completo)\.sql$/.test(f))
  .map((f) => readFileSync(join(MIGRACIONES, f), 'utf8'))
  .join('\n');

describe('Requisitos del CRM que se cumplen con un documento o un dato', () => {
  it('todos los tipos de documento de los requisitos se pueden subir', () => {
    const tipos = [...sql.matchAll(/'([a-z_0-9]+)', '\{[a-z_,]*\}'/g)].map((m) => m[1]);
    expect(tipos.length).toBeGreaterThan(15);
    const faltan = [...new Set(tipos)].filter((t) => !(t in TIPOS_DOCUMENTO));
    expect(faltan).toEqual([]);
  });

  it('la fecha real de apertura (26.7) se puede capturar en la sucursal', () => {
    expect(sql).toContain("'Fecha real de apertura', 'dato', 'fecha_apertura'");
    expect(camposSucursal).toHaveProperty('fecha_apertura');
  });
});
