# Comercializadora: orden de venta sugerida, piloto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada lunes a las 06:00 de CDMX, calcular la orden de venta sugerida de las tres tiendas del piloto (La Mexicana, Pasaje Parián, Avándaro) con la "receta calibrada", guardarla en tablas propias y mandarla por correo a `compras@mx.thecoffee.jp` y `scervera@mx.thecoffee.jp`, con la medición contra lo que la tienda sí pidió.

**Architecture:**
- **Cálculo puro** en `lib/comercializadora/ovSugerida.ts`: pedidos de resurtido (mismas reglas que `serieDiaria`), cadencia, insumo → SKU, calibración `k`, fuera de receta, ya pedido, arrastre, exclusión de inactivos, monto y medición. Sin base ni POS.
- **Consumo de 28 días** en `lib/comercializadora/ovConsumo.ts` con el **mismo motor** que Sucursales: `leerDias` + `conRappi` + `rappiPorDias` + `consumir`, igual que `calcularMes`/`consumoMesSucursal` pero para una ventana `hoy-28 … hoy-1` y sin separar por origen (la suma de orígenes es el consumo con todos los pedidos).
- **Correo**: `ovCorreo.ts` arma el HTML (escapado); `correoServidor.ts` lo manda con `CORREO_URL` + `CORREO_LLAVE`, el mismo cuerpo que `supabase/functions/_shared/correo.ts`, **sin** la compuerta `COM_EFECTOS_EXTERNOS` (excepción del spec §7).
- **Orquestación** en `ovSugeridaServidor.ts` (`correrOvs(deps)` con dependencias inyectables y `depsReales(db)`), llamada por la ruta `GET /api/comercializadora/ov-sugerida` (cron de Vercel `0 12 * * 1`, `CRON_SECRET`).
- **Migración 72**: `com_insumo_sku`, `com_ovs_tiendas`, `com_ovs_corridas`, `com_ovs_lineas`, la función `com_ovs_guardar` (reemplazo atómico por semana y tienda) y la carga inicial idempotente.

Rama: `feat/ov-sugerida-piloto` (ya creada desde `origin/main`, en `C:\Users\sebcm\Projects\thecoffee-costeos-inventario`).

**Tech Stack:** Next.js 16 (App Router, route handler `runtime = 'nodejs'`), Supabase (Postgres/RLS, PostgREST con llave de servicio), Vitest (proyecto `node`), PGlite (`scripts/db/pglite.ts`) para la migración. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-18-ov-sugerida-piloto-design.md` y su anexo `docs/superpowers/specs/anexos/2026-11-18-ov-sugerida-ejercicio.md` (mapeo insumo → SKU y presentaciones corregidas).

## Decisiones (al planear, 2026-11-18)

1. **"Ya pedido" (§4.8) = pedidos de resurtido del día de la corrida (`hoy`, CDMX).** La lectura literal ("desde su último pedido hasta hoy") restaría siempre el último pedido entero y dejaría la sugerencia en ~0 cada semana; restar lo pedido desde la corrida anterior la deja en ~0 para las tiendas de cadencia 7 que piden entre corridas. Se queda el caso que el spec pone de ejemplo: si pidió hoy, la sugerencia queda en lo que falte. Se puede cambiar después en una sola función (`calcularLineas`). **Revisar con el usuario antes de ejecutar.**
2. **Arrastre y medición salen solo de la corrida `ok` de la semana anterior (`semana − 7`).** Repetir la semana nunca lee su propia corrida (no acumula arrastre). Si la semana pasada falló, el arrastre vuelve a 0 y el correo dice "Primera semana…" para esa tienda.
3. **Tipo de pedido con `planDatTipo` sin aperturas** (`apById = {}`): llenado de canal, marketing, corporativo, sin sucursal y apertura (tabla `com_legado_pedidos_apertura` o nota "pedido/kit de apertura") no cuentan. Las tres tiendas ya están abiertas, así que la gracia de apertura no aplica.
4. **El mapeo de nombres de Shopify es `com_sku_mapping`** (migración 45). El spec dice `com_mapeo_sku`, que no existe.
5. **Las presentaciones corregidas van en `com_insumo_sku.factor`** (vaso 12 oz = 500, espresso = 2 500, chip = 500 g, como el anexo), con una `nota`. **No se toca `insumos`** (es Costeo). La carga resuelve por `insumos.nombre` exacto y `com_catalogo.sku`; lo que no resuelve no entra (`on conflict do nothing`, idempotente).
6. **Un insumo cuenta para un solo SKU activo** (índice único parcial `com_insumo_sku_un_activo`): dos activos duplicarían su consumo.
7. **Un SKU de receta sin venta en 28 días sigue siendo `receta`** (diario 0, `k = 1`), no pasa a historial: "fuera de receta" es solo lo que no sale de ninguna receta mapeada.
8. **Cadencia:** días distintos con pedido en `hoy-90 … hoy` (dos pedidos el mismo día cuentan como uno), mediana redondeada y acotada a [7, 30]; con menos de 2 días, 14. **Compras de 90 días** (calibración e historial) = `hoy-90 … hoy-1`.
9. **Lectura parcial del POS** (días o Rappi sin leer): se calcula y el correo avisa que el consumo puede quedar bajo. **Error** (POS, puente, recetas): la tienda queda `error` con el motivo y las demás siguen.
10. **SKUs pedidos que no están en `com_catalogo`** se ignoran, como en `serieDiaria`, y se listan en los avisos.
11. **Destinatarios:** `com_plan_config.config.ovs.correos` se lee crudo con default en código (`CORREOS_OVS`), validado con `validarCorreos`. La migración no escribe la configuración; `guardarConfig` conserva las claves que no conoce, así que un `ovs.correos` puesto a mano no se pierde.
12. **Guardado atómico** con `com_ovs_guardar(...)` (solo `service_role`): upsert de la corrida por `(semana, company_id)`, borra sus líneas e inserta las nuevas en una transacción. Un reintento con `error` no pisa una corrida `ok` de la misma semana (revisión del plan).
13. **Autorización de cron compartida:** `autorizadoCron` pasa a `lib/cron.ts` y la usan la ruta nueva y la del corte de Sucursales (mismo código, sin cambio de conducta).
14. **Monto** = sugerido × `costo_unitario`; sin costo, `null` ("sin costo" en el correo, no suma al total).

**Fuera de este plan:** pantalla en el portal, envío al franquiciatario, borradores en Shopify u OVs en Zoho, inventario de la tienda, más tiendas (spec §1 y §10).

## Mapa de archivos

| Archivo | Tarea | Qué hace |
| --- | --- | --- |
| `supabase/migrations/20261119000072_comercializadora_ovs.sql` | 1 | Tablas, permisos, `com_ovs_guardar`, carga inicial |
| `tests/db/comercializadora-ovs.test.ts` | 1 | Tablas, permisos, guardado idempotente, carga |
| `tests/db/comercializadora.test.ts` | 1 | La lista de tablas `com_` pasa de 17 a 21 |
| `lib/comercializadora/ovSugerida.ts` | 2 | Cálculo puro |
| `tests/portal/ov-sugerida.test.ts` | 2 | Pruebas del cálculo |
| `lib/comercializadora/ovConsumo.ts` | 3 | Consumo de 28 días con el motor de Sucursales |
| `tests/portal/ov-consumo.test.ts` | 3 | Pruebas con lecturas falsas |
| `lib/comercializadora/ovCorreo.ts` | 4 | HTML del correo |
| `lib/comercializadora/correoServidor.ts` | 4 | Envío por `CORREO_URL`/`CORREO_LLAVE` |
| `tests/portal/ov-correo.test.ts`, `tests/portal/correo-servidor.test.ts` | 4 | Pruebas del correo y del envío |
| `lib/cron.ts` | 5 | `autorizadoCron` |
| `lib/comercializadora/ovSugeridaServidor.ts` | 5 | `correrOvs`, `depsReales` |
| `app/api/comercializadora/ov-sugerida/route.ts` | 5 | Ruta del cron |
| `app/api/sucursales/corte/route.ts` | 5 | Usa `autorizadoCron` |
| `vercel.json` | 5 | Cron `0 12 * * 1` |
| `tests/portal/ov-sugerida-servidor.test.ts`, `tests/portal/ov-sugerida-ruta.test.ts` | 5 | Orquestación y ruta |
| `docs/migracion/comercializadora.md` | 6 | Sección 15 |

## Global Constraints

- **Solo lee y escribe sus propias tablas:** nada en Shopify ni en Zoho. La ruta escribe solo `com_ovs_corridas`, `com_ovs_lineas` (vía `com_ovs_guardar`) y `com_sync_log` (`proceso = 'com-ovs'`).
- **Permisos:** solo `service_role` escribe; lectura para Comercializadora con `com_puede_leer()`, igual que las demás `com_`.
- **Correo:** solo a `com_plan_config.config.ovs.correos` (por omisión `compras@mx.thecoffee.jp` y `scervera@mx.thecoffee.jp`). Sale aunque `COM_EFECTOS_EXTERNOS` esté apagado (excepción documentada, spec §7). Si faltan `CORREO_URL` o `CORREO_LLAVE`: la corrida se guarda y la bitácora dice "correo no configurado".
- **El correo nunca lleva datos de clientes del POS;** solo cantidades y montos por SKU.
- **Fechas en días de CDMX** (`hoyCdmx`, `fechaLocal`). Cron `0 12 * * 1` = lunes 06:00 CDMX.
- **Mismo motor que Sucursales:** `consumir`, `leerDias`, `conRappi`, `rappiPorDias`, `recetasServicio`, `catalogoServicio`, `rappiServicio`. No se reimplementa el consumo.
- **La migración 72 se aplica sola en producción al integrar a `main`** (integración de GitHub de Supabase): la carga es idempotente, solo inserta, y no modifica `insumos` ni `com_catalogo`. El merge lo decide el usuario.
- **Durante la implementación no se toca ninguna base real:** solo PGlite. Nada se despliega ni se corre contra producción sin OK explícito del usuario.
- **Secretos:** nunca se imprimen `CORREO_LLAVE`, `CRON_SECRET`, `SUPABASE_SECRET_KEY` ni URLs con credenciales (ni en logs, ni en commits, ni en el PR). Las variables de Vercel las pone el usuario.
- **Textos de UI, correos, comentarios y mensajes en español.**
- **PowerShell:** `npx.cmd`/`npm.cmd` y `curl.exe` si `npx`/`npm` no corren por la política de ejecución.
- **Sin dependencias nuevas.**

## Review Focus

1. **Pedidos con `items_editados`** (vacío, sin `sku` en sus líneas, o guardado como texto JSON), artículos sin SKU o con SKU fuera del catálogo. Expectativa: mismo resultado que `serieDiaria` (editados manda aunque venga vacío; sku recuperado por nombre de la línea original y luego por `com_sku_mapping`; SKU canónico del catálogo), y lo descartado se cuenta en los avisos. Lo cubre la Tarea 2: "items_editados manda…".
2. **Pedido hecho de noche** (23:30 de CDMX = día siguiente en UTC). Expectativa: cuenta para el día de CDMX en cadencia, ya pedido y medición. Lo cubre la Tarea 2: "usa el día local de CDMX".
3. **Correr la ruta dos veces la misma semana** (a mano o reintento). Expectativa: una corrida por `(semana, tienda)`, líneas reemplazadas y arrastre sin acumular. Lo cubren la Tarea 1 ("com_ovs_guardar … la reemplaza") y la Tarea 5 ("repetir la semana no acumula el arrastre").
4. **Nombres de producto, sucursales o motivos de error con `<`, `&` o comillas.** Expectativa: el correo los muestra escapados, nunca como HTML. Lo cubre la Tarea 4: "escapa el HTML".
5. **POS que responde a medias o no responde, Rappi del portal sin leer, puente caído en una tienda.** Expectativa: con lectura parcial se calcula y se avisa; con error la tienda queda `error` con su motivo en el correo y las demás siguen. Lo cubren la Tarea 3 ("lectura parcial…", "Rappi del portal sin leer…", "error del POS…") y la Tarea 5 ("una tienda que falla no detiene a las demás").

---

### Task 1: Migración 72 (tablas, permisos, guardado y carga inicial)

**Files:**
- Create: `supabase/migrations/20261119000072_comercializadora_ovs.sql`
- Create: `tests/db/comercializadora-ovs.test.ts`
- Modify: `tests/db/comercializadora.test.ts:6-11` (lista `TABLAS`) y `:29` (título "crea las 17 tablas con RLS")

**Interfaces:**
- Consumes: `public.insumos (id uuid, nombre text unique)`, `public.com_catalogo (sku text pk, estatus, costo_unitario)`, `public.com_puede_leer()` (migración 45); en pruebas, `crearDbLocal(hasta?)`, `crearInsumo`, `comoUsuario`, `crearUsuario`, `darModulo`, `num`.
- Produces:
  - `public.com_insumo_sku (insumo_id uuid, sku text, factor numeric > 0, activo bool, nota text)`, pk `(insumo_id, sku)`, índice único parcial `com_insumo_sku_un_activo (insumo_id) where activo`;
  - `public.com_ovs_tiendas (company_id integer pk, apertura_id text, nombre text, activo bool)`;
  - `public.com_ovs_corridas (id bigint identity pk, semana date [lunes], company_id integer, cadencia integer null, estado 'ok'|'error', error text, creada_at timestamptz)`, única por `(semana, company_id)`;
  - `public.com_ovs_lineas (corrida_id bigint → com_ovs_corridas on delete cascade, sku, origen 'receta'|'historial', k, diario, necesidad, ya_pedido, arrastre [−1, 1], sugerido integer ≥ 0, monto)`, pk `(corrida_id, sku)`;
  - `public.com_ovs_guardar(p_semana date, p_company integer, p_cadencia integer, p_estado text, p_error text, p_lineas jsonb) returns bigint` (id de la corrida), solo `service_role`. Cada elemento de `p_lineas`: `{ sku, origen, k, diario, necesidad, ya_pedido, arrastre, sugerido, monto }` (otras claves se ignoran).

- [ ] **Step 1: Escribir la prueba de la migración (falla)**

Crear `tests/db/comercializadora-ovs.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

// Migración 72: piloto de la orden de venta sugerida (spec 2026-11-18-ov-sugerida-piloto-design.md, §6).
const SQL = readFileSync('supabase/migrations/20261119000072_comercializadora_ovs.sql', 'utf8');
const SEMILLA = SQL.slice(SQL.indexOf('-- semilla:inicio'), SQL.indexOf('-- semilla:fin'));

async function comoServicio<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const guardar = (db: PGlite, semana: string, lineas: unknown, estado = 'ok', error: string | null = null) =>
  comoServicio(db, async () =>
    num(
      (
        await db.query<{ id: number }>('select public.com_ovs_guardar($1, 519, 14, $2, $3, $4::jsonb) id', [
          semana,
          estado,
          error,
          JSON.stringify(lineas),
        ])
      ).rows[0].id,
    ),
  );
const LINEA = {
  sku: 'INS-CAF-003',
  nombre: 'Cafe en Grano White 1.5 Kg',
  origen: 'receta',
  k: 1.2,
  diario: 1.2,
  necesidad: 16.8,
  ya_pedido: 0,
  arrastre: 0.1,
  sugerido: 13,
  monto: 5460,
};

describe('migración 72: tablas del piloto de OV sugerida', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
  });
  afterAll(async () => db.close());

  it('carga las tres tiendas del piloto por apertura', async () => {
    const r = await db.query('select company_id, apertura_id, nombre, activo from com_ovs_tiendas order by company_id');
    expect(r.rows).toEqual([
      { company_id: 460, apertura_id: '354', nombre: 'Pasaje Parián', activo: true },
      { company_id: 463, apertura_id: '347', nombre: 'Avándaro', activo: true },
      { company_id: 519, apertura_id: '411', nombre: 'La Mexicana', activo: true },
    ]);
  });

  it('com_ovs_guardar crea la corrida y repetirla en la misma semana la reemplaza', async () => {
    const id1 = await guardar(db, '2026-11-16', [
      LINEA,
      { ...LINEA, sku: 'INS-DES-021', k: 1, sugerido: 2, arrastre: -0.6 },
    ]);
    const id2 = await guardar(db, '2026-11-16', [{ ...LINEA, sugerido: 12 }]);
    expect(id2).toBe(id1);
    const c = await db.query<{ n: number }>(`select count(*)::int n from com_ovs_corridas where company_id = 519`);
    expect(c.rows[0].n).toBe(1);
    const l = await db.query('select sku, sugerido from com_ovs_lineas where corrida_id = $1', [id1]);
    expect(l.rows).toEqual([{ sku: 'INS-CAF-003', sugerido: 12 }]);
  });

  it('una corrida con error queda sin líneas y con el motivo', async () => {
    const id = await guardar(db, '2026-11-23', [], 'error', 'POS: sin respuesta');
    const c = await db.query('select estado, error, cadencia from com_ovs_corridas where id = $1', [id]);
    expect(c.rows).toEqual([{ estado: 'error', error: 'POS: sin respuesta', cadencia: 14 }]);
    const l = await db.query<{ n: number }>('select count(*)::int n from com_ovs_lineas where corrida_id = $1', [id]);
    expect(l.rows[0].n).toBe(0);
  });

  it('un reintento con error no pisa una corrida buena de la misma semana', async () => {
    const ok = await guardar(db, '2026-11-30', [{ ...LINEA, sugerido: 7 }]);
    const re = await guardar(db, '2026-11-30', [], 'error', 'POS: sin respuesta');
    expect(re).toBe(ok);
    const c = await db.query('select estado, error from com_ovs_corridas where id = $1', [ok]);
    expect(c.rows).toEqual([{ estado: 'ok', error: null }]);
    const l = await db.query('select sugerido from com_ovs_lineas where corrida_id = $1', [ok]);
    expect(l.rows).toEqual([{ sugerido: 7 }]);
  });

  it('rechaza una semana que no es lunes y un p_lineas que no es arreglo', async () => {
    await expect(guardar(db, '2026-11-18', [])).rejects.toThrow(/check/i);
    await expect(guardar(db, '2026-12-07', {})).rejects.toThrow(/arreglo/);
  });

  it('Comercializadora lee; nadie más escribe ni llama a com_ovs_guardar', async () => {
    const editor = await crearUsuario(db, 'interno');
    await darModulo(db, editor, 'comercializadora', 'edicion');
    const sinModulo = await crearUsuario(db, 'admin');
    await comoUsuario(db, editor, async () => {
      expect((await db.query('select * from com_ovs_tiendas')).rows).toHaveLength(3);
      expect((await db.query('select * from com_ovs_lineas')).rows.length).toBeGreaterThan(0);
      await expect(
        db.query(`insert into com_ovs_tiendas (company_id, apertura_id, nombre) values (1, '1', 'x')`),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query('update com_ovs_lineas set sugerido = 99')).rejects.toThrow(/permission denied/);
      await expect(
        db.query(`select public.com_ovs_guardar('2026-11-16', 519, 14, 'ok', null, '[]')`),
      ).rejects.toThrow(/permission denied/);
    });
    await comoUsuario(db, sinModulo, async () => {
      expect((await db.query('select * from com_ovs_tiendas')).rows).toHaveLength(0);
      expect((await db.query('select * from com_ovs_corridas')).rows).toHaveLength(0);
    });
  });

  it('un insumo no puede tener dos SKUs activos', async () => {
    const id = await crearInsumo(db, { nombre: 'MENTA PRUEBA', costoPaquete: 1, presentacion: 3000, unidad: 'ml' });
    await db.exec(`insert into com_catalogo (sku, nombre) values ('MEN-1', 'Menta 1'), ('MEN-2', 'Menta 2')`);
    await db.query(`insert into com_insumo_sku (insumo_id, sku, factor) values ($1, 'MEN-1', 3000)`, [id]);
    await expect(
      db.query(`insert into com_insumo_sku (insumo_id, sku, factor) values ($1, 'MEN-2', 3000)`, [id]),
    ).rejects.toThrow(/com_insumo_sku_un_activo/);
    await db.query(`insert into com_insumo_sku (insumo_id, sku, factor, activo) values ($1, 'MEN-2', 3000, false)`, [
      id,
    ]);
  });
});

describe('migración 72: carga inicial del mapeo', () => {
  it('trae las 50 filas del anexo', () => {
    expect(SEMILLA.match(/^\s+\('/gm)).toHaveLength(50);
  });

  it('resuelve por nombre exacto del insumo y SKU del catálogo, con las presentaciones corregidas; repetirla no duplica', async () => {
    const db = await crearDbLocal('20261119000071');
    try {
      const insumos = [
        ['VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', 1000, 'pza'],
        ['VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS)', 500, 'pza'],
        ['CHIP DE SABOR CHOCOLATE 1 KG', 1000, 'gr'],
        ['CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 1500, 'gr'],
        // Su SKU (INS-BEB-069) no está en este catálogo: no entra.
        ['JARABE DE MENTA 1 LT (3 PZAS)', 3000, 'ml'],
        // No está en el mapeo.
        ['LECHE ENTERA', 1000, 'ml'],
      ] as const;
      for (const [nombre, presentacion, unidad] of insumos)
        await crearInsumo(db, { nombre, costoPaquete: 100, presentacion, unidad });
      await db.exec(`insert into com_catalogo (sku, nombre, estatus) values
        ('INS-DES-021', 'Vaso Caliente Grande 12 Oz (500 Pzs)', 'Compra Recurrente'),
        ('INS-DES-002', 'Vaso Espresso 4 Oz (2;500 Pzs)', 'Compra Recurrente'),
        ('INS-BEB-047', 'Chips de Chocolate 500g', 'Compra Recurrente'),
        ('INS-CAF-003', 'Cafe en Grano White 1.5 Kg', 'Compra Recurrente')`);
      await db.exec(SQL);
      const mapeo = async () =>
        (
          await db.query(
            `select i.nombre, m.sku, m.factor::float8 factor, m.activo
             from com_insumo_sku m join insumos i on i.id = m.insumo_id order by m.sku`,
          )
        ).rows;
      expect(await mapeo()).toEqual([
        { nombre: 'CHIP DE SABOR CHOCOLATE 1 KG', sku: 'INS-BEB-047', factor: 500, activo: true },
        { nombre: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', sku: 'INS-CAF-003', factor: 1500, activo: true },
        { nombre: 'VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS)', sku: 'INS-DES-002', factor: 2500, activo: true },
        { nombre: 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', sku: 'INS-DES-021', factor: 500, activo: true },
      ]);
      await db.exec(SEMILLA);
      expect(await mapeo()).toHaveLength(4);
      expect(num((await db.query<{ n: number }>('select count(*) n from com_ovs_tiendas')).rows[0].n)).toBe(3);
      // Costeo no cambia: la presentación del insumo sigue como estaba.
      const p = await db.query<{ presentacion: number }>(
        `select presentacion::float8 presentacion from insumos where nombre = 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)'`,
      );
      expect(p.rows[0].presentacion).toBe(1000);
    } finally {
      await db.close();
    }
  });
});
```

- [ ] **Step 2: Correr la prueba para verla fallar**

Run: `npx vitest run tests/db/comercializadora-ovs.test.ts`
Expected: FAIL con `ENOENT: no such file or directory, open 'supabase/migrations/20261119000072_comercializadora_ovs.sql'`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20261119000072_comercializadora_ovs.sql`:

```sql
-- Orden de venta sugerida, piloto (spec 2026-11-18-ov-sugerida-piloto-design.md, §6). Tablas propias del piloto: el
-- cálculo corre en la ruta /api/comercializadora/ov-sugerida (cron de Vercel, lunes 06:00 CDMX) y solo escribe aquí.
-- Solo service_role escribe; lee quien tiene Comercializadora (com_puede_leer), como las demás com_.
-- Se aplica sola al integrar a main (integración de GitHub de Supabase): la carga inicial solo inserta, es idempotente
-- y no toca insumos (Costeo) ni com_catalogo.

-- 1. Insumo de receta → SKU de la Comercializadora. factor = unidades del insumo (gr, ml, pza) por paquete del SKU.
create table public.com_insumo_sku (
  insumo_id uuid not null references public.insumos (id) on delete cascade,
  sku text not null references public.com_catalogo (sku) on delete cascade,
  factor numeric not null check (factor > 0),
  activo boolean not null default true,
  nota text,
  primary key (insumo_id, sku)
);
-- Un insumo cuenta para un solo SKU a la vez: dos activos duplicarían su consumo.
create unique index com_insumo_sku_un_activo on public.com_insumo_sku (insumo_id) where activo;
create index com_insumo_sku_sku on public.com_insumo_sku (sku);

-- 2. Tiendas del piloto. Se emparejan por apertura del sitio viejo, nunca por correo (CDMX-MJA comparte correo).
create table public.com_ovs_tiendas (
  company_id integer primary key check (company_id > 0),
  apertura_id text not null check (btrim(apertura_id) <> ''),
  nombre text not null check (btrim(nombre) <> ''),
  activo boolean not null default true
);

-- 3. Una corrida por semana (lunes) y tienda. Repetirla la reemplaza (com_ovs_guardar): no duplica el arrastre.
create table public.com_ovs_corridas (
  id bigint generated by default as identity primary key,
  semana date not null check (extract(isodow from semana) = 1),
  company_id integer not null,
  cadencia integer check (cadencia between 7 and 30),
  estado text not null check (estado in ('ok', 'error')),
  error text,
  creada_at timestamptz not null default now(),
  unique (semana, company_id)
);

create table public.com_ovs_lineas (
  corrida_id bigint not null references public.com_ovs_corridas (id) on delete cascade,
  sku text not null,
  origen text not null check (origen in ('receta', 'historial')),
  k numeric,
  diario numeric not null,
  necesidad numeric not null,
  ya_pedido numeric not null default 0,
  arrastre numeric not null default 0 check (arrastre between -1 and 1),
  sugerido integer not null check (sugerido >= 0),
  monto numeric,
  primary key (corrida_id, sku)
);

-- 4. Guardado atómico de una corrida: upsert por (semana, tienda), borra sus líneas e inserta las nuevas.
create function public.com_ovs_guardar(
  p_semana date, p_company integer, p_cadencia integer, p_estado text, p_error text, p_lineas jsonb
) returns bigint
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'p_lineas debe ser un arreglo';
  end if;
  -- Un reintento que falla no pisa la corrida buena de la misma semana (se conserva la sugerencia ya mandada).
  if p_estado = 'error' then
    select id into v_id from public.com_ovs_corridas
    where semana = p_semana and company_id = p_company and estado = 'ok';
    if found then return v_id; end if;
  end if;
  insert into public.com_ovs_corridas (semana, company_id, cadencia, estado, error)
  values (p_semana, p_company, p_cadencia, p_estado, p_error)
  on conflict (semana, company_id) do update
    set cadencia = excluded.cadencia, estado = excluded.estado, error = excluded.error, creada_at = now()
  returning id into v_id;
  delete from public.com_ovs_lineas where corrida_id = v_id;
  insert into public.com_ovs_lineas (corrida_id, sku, origen, k, diario, necesidad, ya_pedido, arrastre, sugerido, monto)
  select v_id, l.sku, l.origen, l.k, l.diario, l.necesidad, coalesce(l.ya_pedido, 0), coalesce(l.arrastre, 0),
         l.sugerido, l.monto
  from jsonb_to_recordset(p_lineas) as l(
    sku text, origen text, k numeric, diario numeric, necesidad numeric, ya_pedido numeric, arrastre numeric,
    sugerido integer, monto numeric);
  return v_id;
end $$;
revoke all on function public.com_ovs_guardar(date, integer, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.com_ovs_guardar(date, integer, integer, text, text, jsonb) to service_role;

-- 5. Permisos y RLS: escribe solo service_role (la ruta del cron); lee quien tiene Comercializadora.
do $$
declare
  t text;
begin
  foreach t in array array['com_insumo_sku', 'com_ovs_tiendas', 'com_ovs_corridas', 'com_ovs_lineas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy lectura on public.%I for select to authenticated using ((select public.com_puede_leer()))', t);
  end loop;
end $$;

-- 6. Carga inicial. Mapeo del ejercicio (anexo 2026-11-18-ov-sugerida-ejercicio.md, "Mapeo insumo → SKU"), con las
--    presentaciones corregidas en el factor: vaso 12 oz = 500 pzas, espresso = 2 500, chip = 500 g. Resuelve por
--    nombre exacto del insumo y SKU del catálogo; lo que no resuelve no entra. Idempotente.
-- semilla:inicio
insert into public.com_insumo_sku (insumo_id, sku, factor, nota)
select i.id, c.sku, v.factor, v.nota
from (values
  ('AGUA MINERAL PERRIER 330 ML', 'RTD-PER-003', 4, null),
  ('FELIX SCHORLE FRAMBUESA', 'RTD-FEL-004', 1, 'El SKU dice 24 Pz pero el costo es por botella: factor 1 por revisar.'),
  ('ZOE WATER NATURAL', 'RTD-ZOÉ-001', 24, null),
  ('ZOE WATER TWIST FRUTOS ROJOS', 'RTD-ZOÉ-003', 12, null),
  ('ZOE WATER TWIST LIMÓN Y JENGIBRE', 'RTD-ZOÉ-002', 12, null),
  ('CAFÉ TOSTADO EN GRANO BLACK 1.5 KG', 'INS-CAF-001', 1500, null),
  ('CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG', 'INS-CAF-002', 1500, null),
  ('CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 'INS-CAF-003', 1500, null),
  ('BOLSAS PARA PAN PAQUETE (1000 PIEZAS)', 'INS-FOD-001', 1000, null),
  ('POPOTE CON PUNTA NEGRO (2,000 PZS)', 'INS-DES-010', 2000, null),
  ('TAPA CALIENTE 80MM (1,000 PZS)', 'INS-DES-012', 1000, null),
  ('TAPA CALIENTE 90MM (1,000 PZS)', 'INS-DES-013', 1000, null),
  ('TAPA FRIO PET (1,000 PZS)', 'INS-DES-008', 1000, null),
  ('VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', 'INS-DES-021', 500, 'El nombre del insumo dice 1,000 pzas; el paquete del SKU es de 500.'),
  ('VASO CALIENTE PAPEL KRAFT 8 OZ (500 PZS)', 'INS-DES-004', 500, null),
  ('VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS)', 'INS-DES-002', 2500, 'El nombre del insumo dice 500 pzas; el paquete del SKU es de 2,500.'),
  ('VASO FRÍO PET 14 OZ (1,000 PZS)', 'INS-DES-005', 1000, null),
  ('VASO FRÍO PET 20 OZ (1,000 PZS)', 'INS-DES-003', 1000, null),
  ('BASE CHAI PARA FRAPPÉ 1 KG', 'INS-BA-071', 1000, null),
  ('BASE MATCHA LATTE PARA FRAPPÉ 1 KG', 'INS-BA-070', 1000, null),
  ('BASE NEUTRA PARA FRAPPÉ 1 KG', 'INS-BA-069', 1000, null),
  ('BASE TARO/COCO PARA FRAPPÉ 1 KG', 'INS-BA-072', 1000, null),
  ('CHAI 1 KG', 'INS-BEB-046', 1000, null),
  ('CHIP DE SABOR CHOCOLATE 1 KG', 'INS-BEB-047', 500, 'El nombre del insumo dice 1 kg; la bolsa del SKU es de 500 g.'),
  ('COCOA POWDER - EXTRA BRUTE 1 KG', 'INS-BEB-009', 1000, null),
  ('JARABE DE BLUEBERRY 1 LITRO ( 1 PIEZA)', 'INS-BEB-058', 1000, null),
  ('JARABE DE CARAMELO 1 LT (3 PZAS)', 'INS-BEB-052', 3000, null),
  ('JARABE DE CARAMELO SALADO 1 LT (3 PZAS)', 'INS-BEB-051', 3000, null),
  ('JARABE DE COCO 1 LT (1 PZA)', 'INS-BEB-022', 1000, null),
  ('JARABE DE JENGIBRE 1 LT (3 PZAS)', 'INS-BEB-050', 3000, null),
  ('JARABE DE MENTA 1 LT (3 PZAS)', 'INS-BEB-069', 3000, null),
  ('JARABE DE VANILLA 1 LT (3 PZAS)', 'INS-BEB-049', 3000, null),
  ('MATCHA GOURMET ORGÁNICO 1 KG', 'INS-BEB-045', 1000, null),
  ('MIEL DE ABEJA 1 LT', 'INS-BEB-030', 1000, null),
  ('PULPA DE MARACUYÁ 500 ML', 'INS-BEB-032', 500, null),
  ('SALSA DE CARAMELO BOTE 4 LTS', 'INS-BEB-033', 4000, null),
  ('SCHWEPPES AGUA TÓNICA 296 ML', 'INS-BEB-034', 296, null),
  ('TERNEATEA 500 GRS', 'INS-BEB-041', 500, null),
  ('AZUCAR MASCABADO USO BARRA', 'INS-BEB-057', 500, null),
  ('FILTRO PARA CAFÉ DE PAPEL V60 CÓNICO PAQUETE (100 PZS)', 'INS-BEB-053', 100, null),
  ('ISOPURE', 'INS-BEB-067', 3400, null),
  ('ETIQUETAS THE COFFEE ROLLO', 'INS-DEL-005', 1250, null),
  ('BOLSA TOTE BAG NEGRA THE COFFEE', 'MER-TOT-002', 1, null),
  ('CAFE TOSTADO EN GRANO BLACK MERCH 250 GRAMOS', 'INS-CAF-006', 1, null),
  ('CAFÉ TOSTADO EN GRANO KRAFT MERCH 250 GRAMOS', 'INS-CAF-005', 1, null),
  ('CAFE TOSTADO EN GRANO WHITE MERCH 250 GRAMOS', 'INS-CAF-004', 1, null),
  ('COFFEE MUG 300 ML WHITE', 'MER-TAZ-002', 1, null),
  ('TUMBLER (240ML)', 'MER-TER-001', 1, null),
  ('TUMBLER (360ML)', 'MER-TER-003', 1, null),
  ('ORÉGANO MEMBERS MARK 195 GRS', 'INS-FOD-006', 200, null)
) as v(insumo, sku, factor, nota)
join public.insumos i on i.nombre = v.insumo
join public.com_catalogo c on c.sku = v.sku
on conflict do nothing;

insert into public.com_ovs_tiendas (company_id, apertura_id, nombre) values
  (519, '411', 'La Mexicana'),
  (460, '354', 'Pasaje Parián'),
  (463, '347', 'Avándaro')
on conflict (company_id) do nothing;
-- semilla:fin
```

- [ ] **Step 4: Actualizar la prueba de la base de Comercializadora (17 → 21 tablas)**

En `tests/db/comercializadora.test.ts`, reemplazar la lista y el título:

```ts
const TABLAS = [
  'com_catalogo', 'com_catalogo_costo_historial', 'com_insumo_sku', 'com_kit_apertura', 'com_lead_times', 'com_minmax',
  'com_movimientos', 'com_oc_auto', 'com_ovs_corridas', 'com_ovs_lineas', 'com_ovs_tiendas', 'com_pago_proyectado',
  'com_parametros', 'com_plan_config', 'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping',
  'com_sync_cambios', 'com_sync_log', 'com_zoho_oc_lineas', 'com_zoho_proveedor',
];
```

y `it('crea las 17 tablas con RLS', …)` → `it('crea las 21 tablas con RLS (17 de la migración 45 y 4 del piloto de OV, migración 72)', …)`. El cuerpo no cambia: "sin módulo no lee nada" ya recorre `TABLAS` (las tiendas sembradas no se ven sin módulo).

- [ ] **Step 5: Correr las pruebas de la base**

Run: `npx vitest run tests/db/comercializadora-ovs.test.ts tests/db/comercializadora.test.ts tests/db/guardia-lectura.test.ts`
Expected: PASS. Las 8 nuevas; `comercializadora.test.ts` con 21 tablas; la guardia de lecturas sin cambios (las 4 políticas nuevas usan `com_puede_leer()`, que ya está en `PREDICADOS`; no hay vistas nuevas).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261119000072_comercializadora_ovs.sql tests/db/comercializadora-ovs.test.ts tests/db/comercializadora.test.ts
git commit -m "feat(comercializadora): tablas del piloto de OV sugerida, mapeo insumo-SKU y tiendas (migración 72)"
```

---

### Task 2: Cálculo puro de la OV sugerida

**Files:**
- Create: `lib/comercializadora/ovSugerida.ts`
- Test: `tests/portal/ov-sugerida.test.ts`

**Interfaces:**
- Consumes:
  - `supabase/functions/_shared/planEngine.ts`: `fechaLocal(t: number): string`, `parseItems(x: any): any[]`, `planDatTipo(p: PedidoPlan, apById: Record<string, any>, pedEnAper: Record<string, boolean>, gracia: number, maxVenc: number): string`, `planEngCeil(x: number): number`, `planEngMediana(a: number[]): number`, `type PedidoPlan = { id; apertura_id?; franquiciatario_email?; fecha_pedido: string; status?; items; items_editados; notas_shopify?; es_llenado_canal?; marketing_proyecto_id? }`;
  - `lib/comercializadora/fechas.ts`: `masDias(iso, n)`, `difDias(a, b)` (= b − a en días);
  - `lib/comercializadora/config.ts`: `validarCorreos(txt: string): { correos: string[] } | { error: string }`.
- Produces (todo exportado desde `lib/comercializadora/ovSugerida.ts`):
  - constantes `DIAS_HISTORIA = 90`, `DIAS_CONSUMO = 28`, `CADENCIA_MIN = 7`, `CADENCIA_MAX = 30`, `CADENCIA_POR_DEFECTO = 14`, `K_MIN = 0.8`, `K_MAX = 1.5`, `TOLERANCIA = 0.2`, `ARRASTRE_MAX = 1`, `CORREOS_OVS: string[]`;
  - tipos `PedidoTienda { id: string; fecha: string; lineas: Record<string, number> }`, `FilaCatalogoOv { sku; nombre: string | null; estatus: string | null; costo_unitario: number | null }`, `InsumoSku { insumo_id: string; sku: string; factor: number; activo: boolean }`, `InsumoConsumido { insumoId: string; insumo: string; cantidad: number }`, `OrigenOv = 'receta' | 'historial'`, `LineaOv { sku; nombre: string | null; origen: OrigenOv; k: number | null; diario: number; necesidad: number; ya_pedido: number; arrastre: number; sugerido: number; monto: number | null }`, `FilaMedicion { sku; nombre: string | null; sugerido; pedido; diferencia }`, `Medicion { desde: string; filas: FilaMedicion[]; montoSugerido: number; montoPedido: number }`;
  - `lunesDe(fecha: string): string`;
  - `correosOvs(config: unknown): string[]`;
  - `pedidosResurtido(a: { pedidos: PedidoPlan[]; aperturaId: string; pedidosApertura: Iterable<string>; mapa: { shopify_nombre: string; sku: string }[]; catalogo: FilaCatalogoOv[] }): { pedidos: PedidoTienda[]; sinSku: number; fueraDeCatalogo: string[] }`;
  - `cadencia(pedidos: PedidoTienda[], hoy: string): { dias: number; porDefecto: boolean; diasConPedido: number }`;
  - `ultimoPedido(pedidos: PedidoTienda[], hoy: string): string | null`;
  - `comprasEn(pedidos: PedidoTienda[], desde: string, hasta: string): Map<string, number>`;
  - `diarioPorSku(a: { insumos: InsumoConsumido[]; dias: number; mapeo: InsumoSku[] }): { porSku: Map<string, number>; sinMapeo: string[] }`;
  - `calibracion(compras90: number, diario: number): number`;
  - `conArrastre(necesidad: number, yaPedido: number, arrastrePrevio: number): { bruto: number; sugerido: number; arrastre: number }`;
  - `calcularLineas(a: { hoy: string; cadencia: number; recetaDiaria: Map<string, number>; skusReceta: Set<string>; pedidos: PedidoTienda[]; catalogo: FilaCatalogoOv[]; arrastrePrevio: Map<string, number> }): { lineas: LineaOv[]; inactivos: { sku: string; nombre: string | null }[] }`;
  - `medicion(a: { anteriores: { sku: string; sugerido: number }[]; desde: string; hoy: string; pedidos: PedidoTienda[]; catalogo: FilaCatalogoOv[] }): Medicion`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

Crear `tests/portal/ov-sugerida.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';
import {
  CORREOS_OVS,
  cadencia,
  calcularLineas,
  calibracion,
  comprasEn,
  conArrastre,
  correosOvs,
  diarioPorSku,
  lunesDe,
  medicion,
  pedidosResurtido,
  ultimoPedido,
  type FilaCatalogoOv,
  type PedidoTienda,
} from '../../lib/comercializadora/ovSugerida';

const CAT: FilaCatalogoOv[] = [
  { sku: 'INS-CAF-003', nombre: 'Cafe en Grano White 1.5 Kg', estatus: 'Compra Recurrente', costo_unitario: 420 },
  { sku: 'INS-DES-021', nombre: 'Vaso Caliente Grande 12 Oz (500 Pzs)', estatus: 'Compra Recurrente', costo_unitario: 568.19 },
  { sku: 'INS-BEB-032', nombre: 'Pulpa de Maracuya 500ml', estatus: 'Inactivo', costo_unitario: 70.67 },
  { sku: 'INS-BA-068', nombre: 'SERVILLETAS THE COFFEE (6,000 PIEZAS)', estatus: 'Compra Recurrente', costo_unitario: 951 },
  { sku: 'MP-OPE-022', nombre: 'Acrilico Soporte Para Tarjeta', estatus: 'Compra Recurrente', costo_unitario: null },
];
const ped = (id: string, fecha_pedido: string, items: unknown, extra: Partial<PedidoPlan> = {}): PedidoPlan => ({
  id,
  apertura_id: '411',
  fecha_pedido,
  status: 'pagado',
  items,
  items_editados: null,
  notas_shopify: null,
  ...extra,
});
const pt = (fecha: string, lineas: Record<string, number> = {}, id = fecha): PedidoTienda => ({ id, fecha, lineas });
const resurtido = (pedidos: PedidoPlan[], mapa: { shopify_nombre: string; sku: string }[] = [], apertura: string[] = []) =>
  pedidosResurtido({ pedidos, aperturaId: '411', pedidosApertura: apertura, mapa, catalogo: CAT });

describe('fechas y destinatarios', () => {
  it('lunesDe da el lunes ISO de la semana', () => {
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
    expect(lunesDe('2026-11-18')).toBe('2026-11-16');
    expect(lunesDe('2026-11-22')).toBe('2026-11-16');
  });

  it('correosOvs usa ovs.correos si es válido y, si no, las dos direcciones del piloto', () => {
    expect(CORREOS_OVS).toEqual(['compras@mx.thecoffee.jp', 'scervera@mx.thecoffee.jp']);
    expect(correosOvs({ ovs: { correos: ['Ana@MX.thecoffee.jp', 'ana@mx.thecoffee.jp'] } })).toEqual([
      'ana@mx.thecoffee.jp',
    ]);
    expect(correosOvs(null)).toEqual(CORREOS_OVS);
    expect(correosOvs({ ovs: { correos: [] } })).toEqual(CORREOS_OVS);
    expect(correosOvs({ ovs: { correos: ['no-es-correo'] } })).toEqual(CORREOS_OVS);
  });
});

describe('pedidos de resurtido (§4.1)', () => {
  it('deja fuera otra apertura, cancelados, pedidos y notas de apertura, llenado y marketing', () => {
    const r = resurtido(
      [
        ped('p1', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', nombre: 'Cafe', cantidad: 3 }]),
        ped('p2', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { apertura_id: '354' }),
        ped('p3', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { status: 'cancelado' }),
        ped('p4', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }]),
        ped('p5', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { notas_shopify: 'Pedido de apertura' }),
        ped('p6', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { es_llenado_canal: true }),
        ped('p7', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { marketing_proyecto_id: 'm1' }),
      ],
      [],
      ['p4'],
    );
    expect(r.pedidos).toEqual([{ id: 'p1', fecha: '2026-11-10', lineas: { 'INS-CAF-003': 3 } }]);
  });

  it('items_editados manda (aunque venga vacío), recupera el sku por nombre, usa el mapa y el SKU canónico', () => {
    const r = resurtido(
      [
        ped(
          'p1',
          '2026-11-02T16:00:00Z',
          [
            { sku: 'INS-CAF-003', nombre: 'Cafe White', cantidad: 2 },
            { sku: 'INS-DES-021', nombre: 'Vaso 12', cantidad: 1 },
          ],
          { items_editados: [{ nombre: 'Cafe White', cantidad: 5 }] },
        ),
        ped('p2', '2026-11-03T16:00:00Z', [{ sku: 'INS-CAF-003', nombre: 'x', cantidad: 1 }], { items_editados: [] }),
        ped(
          'p3',
          '2026-11-04T16:00:00Z',
          JSON.stringify([
            { nombre: 'Servilletas', cantidad: '2' },
            { sku: ' ins-des-021 ', nombre: 'v', cantidad: 1 },
            { nombre: 'Sin mapeo', cantidad: 1 },
            { sku: 'INS-BA-076', nombre: 'Cafe 1kg', cantidad: 7 },
            { sku: 'INS-CAF-003', nombre: 'negativo', cantidad: -1 },
          ]),
        ),
      ],
      [{ shopify_nombre: 'Servilletas', sku: 'INS-BA-068' }],
    );
    expect(r.pedidos).toEqual([
      { id: 'p1', fecha: '2026-11-02', lineas: { 'INS-CAF-003': 5 } },
      { id: 'p2', fecha: '2026-11-03', lineas: {} },
      { id: 'p3', fecha: '2026-11-04', lineas: { 'INS-BA-068': 2, 'INS-DES-021': 1 } },
    ]);
    expect(r.sinSku).toBe(1);
    expect(r.fueraDeCatalogo).toEqual(['INS-BA-076']);
  });

  it('usa el día local de CDMX (23:30 del 16 = 05:30 UTC del 17)', () => {
    const r = resurtido([ped('p1', '2026-11-17T05:30:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }])]);
    expect(r.pedidos[0].fecha).toBe('2026-11-16');
  });
});

describe('cadencia (§4.2)', () => {
  const HOY = '2026-11-16';
  it('mediana de días entre pedidos de los últimos 90 días', () => {
    expect(cadencia([pt('2026-10-05'), pt('2026-10-15'), pt('2026-10-29'), pt('2026-11-09')], HOY)).toEqual({
      dias: 11,
      porDefecto: false,
      diasConPedido: 4,
    });
  });
  it('acotada a [7, 30]', () => {
    expect(cadencia([pt('2026-11-01'), pt('2026-11-04'), pt('2026-11-07')], HOY).dias).toBe(7);
    expect(cadencia([pt('2026-08-20'), pt('2026-10-01')], HOY).dias).toBe(30);
  });
  it('dos pedidos el mismo día cuentan como uno', () => {
    expect(cadencia([pt('2026-11-01', {}, 'a'), pt('2026-11-01', {}, 'b'), pt('2026-11-15')], HOY)).toEqual({
      dias: 14,
      porDefecto: false,
      diasConPedido: 2,
    });
  });
  it('con menos de 2 días con pedido en 90 días: 14 por omisión', () => {
    expect(cadencia([pt('2026-11-01')], HOY)).toEqual({ dias: 14, porDefecto: true, diasConPedido: 1 });
    expect(cadencia([pt('2026-08-01'), pt('2026-11-01')], HOY)).toEqual({ dias: 14, porDefecto: true, diasConPedido: 1 });
    expect(cadencia([], HOY)).toEqual({ dias: 14, porDefecto: true, diasConPedido: 0 });
  });
  it('último pedido y compras por ventana', () => {
    const ps = [pt('2026-10-05', { A: 1 }), pt('2026-11-09', { A: 2, B: 1 }), pt('2026-11-20', { A: 9 })];
    expect(ultimoPedido(ps, HOY)).toBe('2026-11-09');
    expect(ultimoPedido([], HOY)).toBeNull();
    expect([...comprasEn(ps, '2026-10-05', '2026-11-09')]).toEqual([
      ['A', 3],
      ['B', 1],
    ]);
  });
});

describe('insumo → SKU (§4.4) y calibración (§4.5)', () => {
  it('consumo diario por SKU = Σ consumo ÷ factor ÷ días; sin mapeo activo no entra y se lista', () => {
    const r = diarioPorSku({
      dias: 28,
      insumos: [
        { insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', cantidad: 42000 },
        { insumoId: 'cafe2', insumo: 'OTRO CAFÉ', cantidad: 21000 },
        { insumoId: 'vaso12', insumo: 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', cantidad: 1400 },
        { insumoId: 'leche', insumo: 'LECHE ENTERA', cantidad: 90000 },
        { insumoId: 'hielo', insumo: 'HIELO', cantidad: 0 },
      ],
      mapeo: [
        { insumo_id: 'cafe', sku: 'INS-CAF-003', factor: 1500, activo: true },
        { insumo_id: 'cafe2', sku: 'INS-CAF-003', factor: 1500, activo: true },
        { insumo_id: 'vaso12', sku: 'INS-DES-021', factor: 500, activo: true },
        { insumo_id: 'leche', sku: 'X', factor: 1, activo: false },
      ],
    });
    expect([...r.porSku.keys()]).toEqual(['INS-CAF-003', 'INS-DES-021']);
    expect(r.porSku.get('INS-CAF-003')).toBeCloseTo(1.5);
    expect(r.porSku.get('INS-DES-021')).toBeCloseTo(0.1); // 1400 / 500 / 28
    expect(r.sinMapeo).toEqual(['LECHE ENTERA']);
  });

  it('k = compras 90 días ÷ (diario × 90), acotado a [0.8, 1.5]; sin compras o sin consumo, 1', () => {
    expect(calibracion(90, 1)).toBe(1);
    expect(calibracion(108, 1)).toBeCloseTo(1.2);
    expect(calibracion(45, 1)).toBe(0.8);
    expect(calibracion(180, 1)).toBe(1.5);
    expect(calibracion(0, 1)).toBe(1);
    expect(calibracion(10, 0)).toBe(1);
  });
});

describe('arrastre (§4.9)', () => {
  const caso = (n: number, ya: number, prev: number) => conArrastre(n, ya, prev);
  it('redondea con tolerancia de 0.2 y guarda lo que sobra o falta', () => {
    expect(caso(10, 0, 0)).toMatchObject({ sugerido: 10 });
    expect(caso(10, 0, 0).arrastre).toBeCloseTo(0);
    expect(caso(1.2, 0, 0).sugerido).toBe(1);
    expect(caso(1.2, 0, 0).arrastre).toBeCloseTo(0.2);
    expect(caso(1.21, 0, 0).sugerido).toBe(2);
    expect(caso(1.21, 0, 0).arrastre).toBeCloseTo(-0.79);
    expect(caso(0.15, 0, 0)).toEqual({ bruto: 0.15, sugerido: 0, arrastre: 0.15 });
  });
  it('suma el arrastre anterior (positivo o negativo)', () => {
    expect(caso(3.6, 0, 0.9).sugerido).toBe(5);
    expect(caso(3.6, 0, 0.9).arrastre).toBeCloseTo(-0.5);
    expect(caso(0.5, 0, -0.4).sugerido).toBe(0);
    expect(caso(0.5, 0, -0.4).arrastre).toBeCloseTo(0.1);
  });
  it('resta lo ya pedido y acota el arrastre a ±1 paquete', () => {
    expect(caso(2, 5, 0)).toEqual({ bruto: -3, sugerido: 0, arrastre: -1 });
    expect(caso(1.1, 0, 0).sugerido).toBe(1);
  });
});

describe('líneas de la sugerencia (§4.6–4.11)', () => {
  const HOY = '2026-11-16';
  const pedidos = [
    pt('2026-08-01', { 'INS-DES-021': 50 }), // fuera de los 90 días
    pt('2026-09-01', { 'INS-CAF-003': 30, 'INS-BA-068': 1 }),
    pt('2026-10-15', { 'INS-CAF-003': 78, 'INS-BA-068': 2, 'MP-OPE-022': 9 }),
    pt(HOY, { 'INS-CAF-003': 4 }), // pedido hoy: ya pedido
  ];
  const receta = new Map([
    ['INS-CAF-003', 1],
    ['INS-DES-021', 0.1],
    ['INS-BEB-032', 0.05],
  ]);

  it('receta × k, historial ÷ 90, ya pedido, arrastre, inactivos aparte y monto', () => {
    const r = calcularLineas({
      hoy: HOY,
      cadencia: 14,
      recetaDiaria: receta,
      skusReceta: new Set(receta.keys()),
      pedidos,
      catalogo: CAT,
      arrastrePrevio: new Map([['INS-CAF-003', 0.3]]),
    });
    expect(r.lineas).toEqual([
      {
        sku: 'INS-BA-068',
        nombre: 'SERVILLETAS THE COFFEE (6,000 PIEZAS)',
        origen: 'historial',
        k: null,
        diario: 0.0333,
        necesidad: 0.4667,
        ya_pedido: 0,
        arrastre: -0.5333,
        sugerido: 1,
        monto: 951,
      },
      {
        sku: 'INS-CAF-003',
        nombre: 'Cafe en Grano White 1.5 Kg',
        origen: 'receta',
        k: 1.2,
        diario: 1.2,
        necesidad: 16.8,
        ya_pedido: 4,
        arrastre: 0.1,
        sugerido: 13,
        monto: 5460,
      },
      {
        sku: 'INS-DES-021',
        nombre: 'Vaso Caliente Grande 12 Oz (500 Pzs)',
        origen: 'receta',
        k: 1,
        diario: 0.1,
        necesidad: 1.4,
        ya_pedido: 0,
        arrastre: -0.6,
        sugerido: 2,
        monto: 1136.38,
      },
      {
        sku: 'MP-OPE-022',
        nombre: 'Acrilico Soporte Para Tarjeta',
        origen: 'historial',
        k: null,
        diario: 0.1,
        necesidad: 1.4,
        ya_pedido: 0,
        arrastre: -0.6,
        sugerido: 2,
        monto: null,
      },
    ]);
    expect(r.inactivos).toEqual([{ sku: 'INS-BEB-032', nombre: 'Pulpa de Maracuya 500ml' }]);
  });

  it('un SKU de receta sin venta en 28 días sigue siendo de receta (no pasa a historial)', () => {
    const r = calcularLineas({
      hoy: HOY,
      cadencia: 14,
      recetaDiaria: new Map(),
      skusReceta: new Set(['INS-BA-068']),
      pedidos,
      catalogo: CAT,
      arrastrePrevio: new Map(),
    });
    expect(r.lineas.find((l) => l.sku === 'INS-BA-068')).toMatchObject({
      origen: 'receta',
      k: 1,
      diario: 0,
      sugerido: 0,
    });
  });
});

describe('medición contra la semana anterior (§7)', () => {
  it('lo sugerido la semana pasada contra lo pedido desde su lunes, con montos', () => {
    const m = medicion({
      anteriores: [
        { sku: 'INS-CAF-003', sugerido: 13 },
        { sku: 'INS-DES-021', sugerido: 2 },
        { sku: 'MP-OPE-022', sugerido: 0 },
      ],
      desde: '2026-11-09',
      hoy: '2026-11-16',
      pedidos: [
        pt('2026-11-08', { 'INS-CAF-003': 50 }),
        pt('2026-11-12', { 'INS-CAF-003': 12, 'INS-BA-068': 1 }),
        pt('2026-11-16', { 'INS-CAF-003': 1 }),
      ],
      catalogo: CAT,
    });
    expect(m).toEqual({
      desde: '2026-11-09',
      filas: [
        { sku: 'INS-BA-068', nombre: 'SERVILLETAS THE COFFEE (6,000 PIEZAS)', sugerido: 0, pedido: 1, diferencia: 1 },
        { sku: 'INS-CAF-003', nombre: 'Cafe en Grano White 1.5 Kg', sugerido: 13, pedido: 13, diferencia: 0 },
        { sku: 'INS-DES-021', nombre: 'Vaso Caliente Grande 12 Oz (500 Pzs)', sugerido: 2, pedido: 0, diferencia: -2 },
      ],
      montoSugerido: 6596.38,
      montoPedido: 6411,
    });
  });
});
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Run: `npx vitest run tests/portal/ov-sugerida.test.ts`
Expected: FAIL con `Failed to resolve import "../../lib/comercializadora/ovSugerida"` (o "Cannot find module").

- [ ] **Step 3: Escribir el cálculo**

Crear `lib/comercializadora/ovSugerida.ts`:

```ts
import {
  fechaLocal,
  parseItems,
  planDatTipo,
  planEngCeil,
  planEngMediana,
  type PedidoPlan,
} from '../../supabase/functions/_shared/planEngine.ts';
import { validarCorreos } from './config';
import { difDias, masDias } from './fechas';

/**
 * Orden de venta sugerida, piloto (spec 2026-11-18-ov-sugerida-piloto-design.md, §4): "receta calibrada" por tienda.
 * Puro: no lee la base ni el POS. Fechas en días de CDMX ('YYYY-MM-DD'); cantidades de SKU en paquetes del catálogo.
 */
export const DIAS_HISTORIA = 90;
export const DIAS_CONSUMO = 28;
export const CADENCIA_MIN = 7;
export const CADENCIA_MAX = 30;
export const CADENCIA_POR_DEFECTO = 14;
export const K_MIN = 0.8;
export const K_MAX = 1.5;
export const TOLERANCIA = 0.2;
export const ARRASTRE_MAX = 1;
export const CORREOS_OVS = ['compras@mx.thecoffee.jp', 'scervera@mx.thecoffee.jp'];

export interface PedidoTienda {
  id: string;
  /** Día local de CDMX del pedido. */
  fecha: string;
  /** SKU canónico del catálogo → cantidad. */
  lineas: Record<string, number>;
}
export interface FilaCatalogoOv {
  sku: string;
  nombre: string | null;
  estatus: string | null;
  costo_unitario: number | null;
}
export interface InsumoSku {
  insumo_id: string;
  sku: string;
  /** Unidades del insumo (gr, ml, pza) por paquete del SKU. */
  factor: number;
  activo: boolean;
}
export interface InsumoConsumido {
  insumoId: string;
  insumo: string;
  cantidad: number;
}
export type OrigenOv = 'receta' | 'historial';
export interface LineaOv {
  sku: string;
  nombre: string | null;
  origen: OrigenOv;
  /** Calibración; null en lo de historial. */
  k: number | null;
  /** Paquetes por día (receta × k, o compras de 90 días ÷ 90). */
  diario: number;
  necesidad: number;
  ya_pedido: number;
  arrastre: number;
  sugerido: number;
  /** sugerido × costo_unitario; null si el SKU no tiene costo. */
  monto: number | null;
}
export interface FilaMedicion {
  sku: string;
  nombre: string | null;
  sugerido: number;
  pedido: number;
  diferencia: number;
}
export interface Medicion {
  desde: string;
  filas: FilaMedicion[];
  montoSugerido: number;
  montoPedido: number;
}

const CANCELADOS = new Set(['cancelado', 'cancelacion_pendiente']);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r2 = (x: number) => Math.round(x * 100) / 100;
const acotar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Lunes (ISO) de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return masDias(fecha, -((dia + 6) % 7));
}

/** Destinatarios: com_plan_config.config.ovs.correos si es una lista válida; si no, las dos direcciones del piloto. */
export function correosOvs(config: unknown): string[] {
  const lista = (config as { ovs?: { correos?: unknown } } | null | undefined)?.ovs?.correos;
  if (!Array.isArray(lista) || !lista.length) return CORREOS_OVS;
  const v = validarCorreos(lista.map(String).join(','));
  return 'correos' in v && v.correos.length ? v.correos : CORREOS_OVS;
}

type ItemPedido = { sku?: string; nombre?: string; cantidad?: unknown } | null;

/**
 * Pedidos de resurtido de una apertura (§4.1), con las reglas de ítems de serieDiaria: sin cancelados; items_editados
 * manda aunque venga vacío; el sku de una línea editada se recupera de la línea original con el mismo nombre y si no,
 * de com_sku_mapping; SKU canónico del catálogo (sin espacios, sin importar mayúsculas). El tipo es el de planDatTipo
 * sin aperturas: llenado de canal, marketing, corporativo, sin sucursal y apertura (tabla o nota) no cuentan.
 */
export function pedidosResurtido(a: {
  pedidos: PedidoPlan[];
  aperturaId: string;
  pedidosApertura: Iterable<string>;
  mapa: { shopify_nombre: string; sku: string }[];
  catalogo: FilaCatalogoOv[];
}): { pedidos: PedidoTienda[]; sinSku: number; fueraDeCatalogo: string[] } {
  const pedEnAper: Record<string, boolean> = {};
  for (const id of a.pedidosApertura) pedEnAper[id] = true;
  const skuMap: Record<string, string> = {};
  a.mapa.forEach((m) => {
    skuMap[m.shopify_nombre] = m.sku;
  });
  const catSku = new Map(a.catalogo.map((c) => [String(c.sku).trim().toUpperCase(), c.sku]));
  const fuera = new Set<string>();
  let sinSku = 0;
  const salida: PedidoTienda[] = [];
  for (const p of a.pedidos) {
    if (String(p.apertura_id ?? '') !== a.aperturaId) continue;
    if (p.status == null || CANCELADOS.has(p.status)) continue;
    if (planDatTipo(p, {}, pedEnAper, 0, 0) !== 'resurtido') continue;
    const t = new Date(p.fecha_pedido).getTime();
    if (isNaN(t)) continue;
    const orig = parseItems(p.items) as ItemPedido[];
    const its = p.items_editados ? (parseItems(p.items_editados) as ItemPedido[]) : orig;
    let idxNom: Record<string, string> | null = null;
    const lineas: Record<string, number> = {};
    for (const it of its) {
      if (!it) continue;
      let sku = it.sku || (it.nombre ? skuMap[it.nombre] : undefined);
      if (!sku && it.nombre) {
        idxNom ??= Object.fromEntries(
          orig.filter((o) => o && o.sku && o.nombre).map((o) => [o!.nombre as string, o!.sku as string]),
        );
        sku = idxNom[it.nombre];
      }
      const qty = Number(it.cantidad == null ? 0 : it.cantidad);
      if (!isFinite(qty) || qty < 0) continue;
      if (!sku) {
        if (it.nombre) sinSku++;
        continue;
      }
      const real = catSku.get(String(sku).trim().toUpperCase());
      if (!real) {
        fuera.add(String(sku));
        continue;
      }
      lineas[real] = (lineas[real] ?? 0) + qty;
    }
    salida.push({ id: String(p.id), fecha: fechaLocal(t), lineas });
  }
  salida.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id.localeCompare(y.id));
  return { pedidos: salida, sinSku, fueraDeCatalogo: [...fuera].sort() };
}

/** §4.2: mediana de días entre días con pedido de hoy-90 a hoy, acotada a [7, 30]; con menos de 2 días, 14. */
export function cadencia(
  pedidos: PedidoTienda[],
  hoy: string,
): { dias: number; porDefecto: boolean; diasConPedido: number } {
  const desde = masDias(hoy, -DIAS_HISTORIA);
  const fechas = [...new Set(pedidos.filter((p) => p.fecha >= desde && p.fecha <= hoy).map((p) => p.fecha))].sort();
  if (fechas.length < 2) return { dias: CADENCIA_POR_DEFECTO, porDefecto: true, diasConPedido: fechas.length };
  const saltos = fechas.slice(1).map((f, i) => difDias(fechas[i], f));
  return {
    dias: acotar(Math.round(planEngMediana(saltos)), CADENCIA_MIN, CADENCIA_MAX),
    porDefecto: false,
    diasConPedido: fechas.length,
  };
}

export function ultimoPedido(pedidos: PedidoTienda[], hoy: string): string | null {
  const fechas = pedidos.map((p) => p.fecha).filter((f) => f <= hoy);
  return fechas.length ? fechas.reduce((x, y) => (y > x ? y : x)) : null;
}

/** Cantidad pedida por SKU con día entre desde y hasta (incluidos). */
export function comprasEn(pedidos: PedidoTienda[], desde: string, hasta: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pedidos)
    if (p.fecha >= desde && p.fecha <= hasta)
      for (const [sku, q] of Object.entries(p.lineas)) m.set(sku, (m.get(sku) ?? 0) + q);
  return m;
}

/**
 * §4.4: paquetes por día de cada SKU = Σ consumo del insumo ÷ factor ÷ días. Solo mapeos activos; un insumo con
 * consumo y sin mapeo activo no entra (leche, hielo, panadería…) y se lista por nombre.
 */
export function diarioPorSku(a: {
  insumos: InsumoConsumido[];
  dias: number;
  mapeo: InsumoSku[];
}): { porSku: Map<string, number>; sinMapeo: string[] } {
  const porInsumo = new Map(a.mapeo.filter((m) => m.activo && m.factor > 0).map((m) => [m.insumo_id, m]));
  const porSku = new Map<string, number>();
  const sinMapeo = new Set<string>();
  if (!(a.dias > 0)) return { porSku, sinMapeo: [] };
  for (const i of a.insumos) {
    if (!(i.cantidad > 0)) continue;
    const m = porInsumo.get(i.insumoId);
    if (!m) {
      sinMapeo.add(i.insumo);
      continue;
    }
    porSku.set(m.sku, (porSku.get(m.sku) ?? 0) + i.cantidad / m.factor / a.dias);
  }
  return { porSku, sinMapeo: [...sinMapeo].sort((x, y) => x.localeCompare(y, 'es')) };
}

/** §4.5: compras de 90 días ÷ (diario × 90), acotado a [0.8, 1.5]; sin compras o sin consumo, 1. */
export function calibracion(compras90: number, diario: number): number {
  if (!(compras90 > 0) || !(diario > 0)) return 1;
  return acotar(compras90 / (diario * DIAS_HISTORIA), K_MIN, K_MAX);
}

/** §4.9: bruto = necesidad − ya pedido + arrastre anterior; sugerido = max(0, ⌈bruto − 0.2⌉); arrastre en ±1. */
export function conArrastre(
  necesidad: number,
  yaPedido: number,
  arrastrePrevio: number,
): { bruto: number; sugerido: number; arrastre: number } {
  const bruto = necesidad - yaPedido + arrastrePrevio;
  const sugerido = Math.max(0, planEngCeil(bruto - TOLERANCIA));
  return { bruto, sugerido, arrastre: acotar(bruto - sugerido, -ARRASTRE_MAX, ARRASTRE_MAX) };
}

/**
 * §4.6–4.11. Universo: SKUs con consumo por receta y SKUs comprados en hoy-90 … hoy-1. Es "receta" si algún insumo
 * activo se mapea a él (aunque no haya vendido en 28 días); si no, "historial". Ya pedido = lo pedido hoy (decisión 1
 * del plan). Inactivos fuera; los que pide la receta se devuelven aparte.
 */
export function calcularLineas(a: {
  hoy: string;
  cadencia: number;
  recetaDiaria: Map<string, number>;
  skusReceta: Set<string>;
  pedidos: PedidoTienda[];
  catalogo: FilaCatalogoOv[];
  arrastrePrevio: Map<string, number>;
}): { lineas: LineaOv[]; inactivos: { sku: string; nombre: string | null }[] } {
  const cat = new Map(a.catalogo.map((c) => [c.sku, c]));
  const compras = comprasEn(a.pedidos, masDias(a.hoy, -DIAS_HISTORIA), masDias(a.hoy, -1));
  const deHoy = comprasEn(a.pedidos, a.hoy, a.hoy);
  const skus = [...new Set([...a.recetaDiaria.keys(), ...compras.keys()])].sort();
  const lineas: LineaOv[] = [];
  const inactivos: { sku: string; nombre: string | null }[] = [];
  for (const sku of skus) {
    const c = cat.get(sku);
    const base = a.recetaDiaria.get(sku) ?? 0;
    const deReceta = a.skusReceta.has(sku) || a.recetaDiaria.has(sku);
    if (c?.estatus === 'Inactivo') {
      if (base > 0) inactivos.push({ sku, nombre: c.nombre });
      continue;
    }
    const comprado = compras.get(sku) ?? 0;
    const k = deReceta ? calibracion(comprado, base) : null;
    const diario = k != null ? base * k : comprado / DIAS_HISTORIA;
    const necesidad = diario * a.cadencia;
    const ya = deHoy.get(sku) ?? 0;
    const r = conArrastre(necesidad, ya, a.arrastrePrevio.get(sku) ?? 0);
    const costo = c?.costo_unitario;
    lineas.push({
      sku,
      nombre: c?.nombre ?? null,
      origen: deReceta ? 'receta' : 'historial',
      k: k == null ? null : r4(k),
      diario: r4(diario),
      necesidad: r4(necesidad),
      ya_pedido: ya,
      arrastre: r4(r.arrastre),
      sugerido: r.sugerido,
      monto: costo == null ? null : r2(r.sugerido * costo),
    });
  }
  return { lineas, inactivos };
}

/** §7: lo sugerido la semana pasada (sugerido > 0) contra lo que la tienda pidió desde su lunes hasta hoy. */
export function medicion(a: {
  anteriores: { sku: string; sugerido: number }[];
  desde: string;
  hoy: string;
  pedidos: PedidoTienda[];
  catalogo: FilaCatalogoOv[];
}): Medicion {
  const cat = new Map(a.catalogo.map((c) => [c.sku, c]));
  const pedido = comprasEn(a.pedidos, a.desde, a.hoy);
  const sug = new Map(a.anteriores.filter((l) => l.sugerido > 0).map((l) => [l.sku, l.sugerido]));
  let montoSugerido = 0;
  let montoPedido = 0;
  const filas = [...new Set([...sug.keys(), ...pedido.keys()])].sort().map((sku) => {
    const s = sug.get(sku) ?? 0;
    const p = pedido.get(sku) ?? 0;
    const costo = cat.get(sku)?.costo_unitario ?? 0;
    montoSugerido += s * costo;
    montoPedido += p * costo;
    return { sku, nombre: cat.get(sku)?.nombre ?? null, sugerido: s, pedido: p, diferencia: p - s };
  });
  return { desde: a.desde, filas, montoSugerido: r2(montoSugerido), montoPedido: r2(montoPedido) };
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run tests/portal/ov-sugerida.test.ts`
Expected: PASS (18 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/ovSugerida.ts tests/portal/ov-sugerida.test.ts
git commit -m "feat(comercializadora): cálculo de la OV sugerida (cadencia, receta calibrada, historial, arrastre)"
```

---

### Task 3: Consumo de 28 días por tienda con el motor de Sucursales

**Files:**
- Create: `lib/comercializadora/ovConsumo.ts`
- Test: `tests/portal/ov-consumo.test.ts`

**Interfaces:**
- Consumes:
  - `lib/sucursales/consumo.ts`: `consumir(ps: PedidoNormal[], datos: DatosConsumo, evidencia?: PedidoNormal[], catalogo?: CatalogoNombres, fechas?: string[], piloto?: boolean): ResultadoConsumo` (usa `r.insumos[].{insumoId, insumo, cantidad}` y `r.cobertura.sobreTotal`);
  - `lib/sucursales/datos.ts`: `conRappi(l: LecturaNormal, rappi?: FuenteRappi): Promise<LecturaNormal>`, tipos `LecturaNormal`, `FuenteRappi`;
  - `lib/sucursales/consumo-mes.ts`: `rappiPorDias(fuente: FuenteRappi | undefined): FuenteRappi | undefined`;
  - `lib/sucursales/tiempo.ts`: `diasEntre(desde, hasta)`, `sumarDias(fecha, n)`;
  - `lib/sucursales/config.ts`: `ConfigSucursal` (`rappiPortal?: boolean`); Task 2: `InsumoConsumido`.
- Produces:
  - `type ConsumoTienda = { ok: true; desde: string; hasta: string; dias: number; completa: boolean; avisos: string[]; pedidos: number; cobertura: number | null; insumos: InsumoConsumido[] } | { ok: false; motivo: string }`;
  - `interface DepsConsumoTienda { leer: (cfg: ConfigSucursal, desde: string, hasta: string) => Promise<LecturaNormal>; rappi: (cfg: ConfigSucursal) => FuenteRappi | undefined }`;
  - `consumoVentana(a: { cfg: ConfigSucursal; desde: string; hasta: string; datos: DatosConsumo; catalogo?: CatalogoNombres; deps: DepsConsumoTienda }): Promise<ConsumoTienda>` (nunca lanza). En producción `deps = { leer: leerDias, rappi: (c) => rappiServicio(db, c) }` (Task 5).

- [ ] **Step 1: Escribir las pruebas (fallan)**

Crear `tests/portal/ov-consumo.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { consumoVentana } from '../../lib/comercializadora/ovConsumo';
import { claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';

const IL = 'il';
const datos: DatosConsumo = {
  leidoEn: '2026-11-16T00:00:00.000Z',
  enlaces: new Map([['5IL', { recetaId: IL, receta: 'Iced Latte' }]]),
  unicas: new Set([IL]),
  recetas: new Map([
    [
      claveConsumo(IL, 'Único'),
      [
        { insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', unidad: 'gr', categoria: 'CAFE', cantidad: 18 },
        { insumoId: 'le', insumo: 'LECHE', unidad: 'ml', categoria: 'LECHE', cantidad: 100 },
      ],
    ],
  ]),
};
const p = (fecha: string, origen: PedidoNormal['origen'], rappi: string | null = null): PedidoNormal => ({
  id: Math.random(),
  fecha,
  segundo: 36000,
  hora: '10:00:00',
  origen,
  ventaCent: 8000,
  netoCent: null,
  descuentoCent: 0,
  metodo: 'CARTAO',
  tipo: 'EMV',
  lineas: [{ codigo: '5IL', nombre: 'Iced Latte', importeCent: 8000, descuentoPct: 0, customs: [] }],
  numeroPedidoRappi: rappi,
  cuadra: true,
});
const lectura = (
  desde: string,
  hasta: string,
  pedidos: PedidoNormal[],
  estado: LecturaNormal['estado'] = 'completa',
  avisos: string[] = [],
): LecturaNormal => ({
  desde,
  hasta,
  leidoEn: 0,
  estado,
  error: estado === 'error' ? 'proveedor-no-disponible' : null,
  avisos,
  totalDeclarado: null,
  pedidos,
});
const DESDE = '2026-10-19';
const HASTA = '2026-11-15';
const cfg = configDe(519)!; // La Mexicana, con Rappi del portal

describe('consumo de la ventana de 28 días', () => {
  it('lee la ventana una vez, suma Rappi del portal día por día, quita el Rappi del POS y suma por insumo', async () => {
    const leidas: string[] = [];
    const rappiDias: string[] = [];
    const r = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async (_c, d, h) => {
          leidas.push(`${d}..${h}`);
          return lectura(d, h, [p('2026-11-15', 'mostrador'), p('2026-10-25', 'rappi', 'X'), p('2026-10-20', 'app')]);
        },
        rappi: () => async (d, h) => {
          rappiDias.push(`${d}..${h}`);
          return d === '2026-11-01' ? [p('2026-11-01', 'rappi', 'R1')] : [];
        },
      },
    });
    expect(leidas).toEqual([`${DESDE}..${HASTA}`]);
    expect(rappiDias).toHaveLength(28);
    expect(r).toEqual({
      ok: true,
      desde: DESDE,
      hasta: HASTA,
      dias: 28,
      completa: true,
      avisos: [],
      pedidos: 3,
      cobertura: 1,
      insumos: [
        { insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', cantidad: 54 },
        { insumoId: 'le', insumo: 'LECHE', cantidad: 300 },
      ],
    });
  });

  it('lectura parcial del POS: calcula y lo marca incompleto con su aviso', async () => {
    const r = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async (_c, d, h) =>
          lectura(d, h, [p('2026-11-15', 'mostrador')], 'parcial', ['2 de 28 días con lectura incompleta.']),
        rappi: () => undefined,
      },
    });
    expect(r).toMatchObject({ ok: true, completa: false, avisos: ['2 de 28 días con lectura incompleta.'] });
  });

  it('Rappi del portal sin leer: calcula y lo marca incompleto', async () => {
    const r = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: { leer: async (_c, d, h) => lectura(d, h, [p('2026-11-15', 'mostrador')]), rappi: () => async () => null },
    });
    expect(r).toMatchObject({
      ok: true,
      completa: false,
      avisos: ['No se pudieron leer los pedidos de Rappi del portal.'],
    });
  });

  it('error del POS o una excepción: no hay consumo y se dice el motivo', async () => {
    const error = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: { leer: async (_c, d, h) => lectura(d, h, [], 'error', ['El proveedor no respondió.']), rappi: () => undefined },
    });
    expect(error).toEqual({ ok: false, motivo: 'El proveedor no respondió.' });
    const lanza = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async () => {
          throw new Error('red caída');
        },
        rappi: () => undefined,
      },
    });
    expect(lanza).toEqual({ ok: false, motivo: 'red caída' });
  });
});
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Run: `npx vitest run tests/portal/ov-consumo.test.ts`
Expected: FAIL con `Failed to resolve import "../../lib/comercializadora/ovConsumo"`.

- [ ] **Step 3: Escribir el lector de consumo**

Crear `lib/comercializadora/ovConsumo.ts`:

```ts
import 'server-only';
import type { ConfigSucursal } from '../sucursales/config';
import { consumir, type DatosConsumo } from '../sucursales/consumo';
import { rappiPorDias } from '../sucursales/consumo-mes';
import { conRappi, type FuenteRappi, type LecturaNormal } from '../sucursales/datos';
import type { CatalogoNombres } from '../sucursales/metricas';
import { diasEntre, sumarDias } from '../sucursales/tiempo';
import type { InsumoConsumido } from './ovSugerida';

/**
 * Consumo por receta de una tienda en una ventana (spec OV sugerida §4.3: hoy-28 … hoy-1) con el MISMO motor que
 * Sucursales: la lectura de calcularMes (leer + conRappi con Rappi del portal día por día) y consumir con todos los
 * pedidos como evidencia. consumoMesSucursal separa por origen; aquí se calcula una vez con todos, que es su suma.
 * Nunca lanza: un error de lectura o de cálculo se devuelve como motivo.
 */
export type ConsumoTienda =
  | {
      ok: true;
      desde: string;
      hasta: string;
      dias: number;
      completa: boolean;
      avisos: string[];
      pedidos: number;
      /** Unidades vendidas que entran al consumo ÷ todas (cobertura de recetas); null sin ventas. */
      cobertura: number | null;
      insumos: InsumoConsumido[];
    }
  | { ok: false; motivo: string };

export interface DepsConsumoTienda {
  leer: (cfg: ConfigSucursal, desde: string, hasta: string) => Promise<LecturaNormal>;
  rappi: (cfg: ConfigSucursal) => FuenteRappi | undefined;
}

export async function consumoVentana(a: {
  cfg: ConfigSucursal;
  desde: string;
  hasta: string;
  datos: DatosConsumo;
  catalogo?: CatalogoNombres;
  deps: DepsConsumoTienda;
}): Promise<ConsumoTienda> {
  try {
    const l = await conRappi(await a.deps.leer(a.cfg, a.desde, a.hasta), rappiPorDias(a.deps.rappi(a.cfg)));
    if (l.estado === 'error') return { ok: false, motivo: l.avisos[0] ?? l.error ?? 'No se pudo leer el POS.' };
    const dias = diasEntre(a.desde, a.hasta) + 1;
    const fechas = Array.from({ length: dias }, (_, i) => sumarDias(a.desde, i));
    const r = consumir(l.pedidos, a.datos, l.pedidos, a.catalogo, fechas, !!a.cfg.rappiPortal);
    return {
      ok: true,
      desde: a.desde,
      hasta: a.hasta,
      dias,
      completa: l.estado === 'completa',
      avisos: l.avisos,
      pedidos: l.pedidos.length,
      cobertura: r.cobertura.sobreTotal,
      insumos: r.insumos
        .filter((i) => i.cantidad > 0)
        .map((i) => ({ insumoId: i.insumoId, insumo: i.insumo, cantidad: i.cantidad }))
        .sort((x, y) => x.insumoId.localeCompare(y.insumoId)),
    };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run tests/portal/ov-consumo.test.ts tests/portal/consumo-mes-servidor.test.ts`
Expected: PASS (4 nuevas; las de `calcularMes` sin cambios).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/ovConsumo.ts tests/portal/ov-consumo.test.ts
git commit -m "feat(comercializadora): consumo de 28 días por tienda con el motor de Sucursales"
```

---

### Task 4: Correo de la OV sugerida y envío desde el portal

**Files:**
- Create: `lib/comercializadora/ovCorreo.ts`
- Create: `lib/comercializadora/correoServidor.ts`
- Test: `tests/portal/ov-correo.test.ts`, `tests/portal/correo-servidor.test.ts`

**Interfaces:**
- Consumes: Task 2: `LineaOv`, `Medicion`; `lib/comercializadora/fechas.ts`: `fechaCorta(iso)` ("16 nov"); `lib/comercializadora/formato.ts`: `pesos(x)` (`$5,460.00`).
- Produces:
  - `ovCorreo.ts`: `interface TiendaCorreo { nombre: string; estado: 'ok' | 'error'; error: string | null; cadencia: number | null; cadenciaPorDefecto: boolean; ultimoPedido: string | null; cobertura: number | null; lineas: LineaOv[]; medicion: Medicion | null; inactivos: { sku: string; nombre: string | null }[]; sinMapeo: string[]; avisos: string[] }`, `esc(s: unknown): string`, `asuntoOvs(semana: string): string`, `correoOvs(semana: string, tiendas: TiendaCorreo[]): { asunto: string; html: string }`;
  - `correoServidor.ts`: `type ResultadoCorreo = 'enviado' | 'no-configurado' | 'fallo'`, `enviarCorreoInterno(para: string[], asunto: string, html: string, enviadoPor?: string): Promise<ResultadoCorreo>` (nunca lanza).

- [ ] **Step 1: Escribir las pruebas (fallan)**

Crear `tests/portal/ov-correo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asuntoOvs, correoOvs, type TiendaCorreo } from '../../lib/comercializadora/ovCorreo';
import { pesos } from '../../lib/comercializadora/formato';
import type { LineaOv } from '../../lib/comercializadora/ovSugerida';

const linea = (o: Partial<LineaOv> = {}): LineaOv => ({
  sku: 'INS-CAF-003',
  nombre: 'Cafe en Grano White 1.5 Kg',
  origen: 'receta',
  k: 1.2,
  diario: 1.2,
  necesidad: 16.8,
  ya_pedido: 0,
  arrastre: 0.1,
  sugerido: 13,
  monto: 5460,
  ...o,
});
const tienda = (o: Partial<TiendaCorreo> = {}): TiendaCorreo => ({
  nombre: 'La Mexicana',
  estado: 'ok',
  error: null,
  cadencia: 14,
  cadenciaPorDefecto: false,
  ultimoPedido: '2026-11-09',
  cobertura: 0.91,
  lineas: [linea()],
  medicion: null,
  inactivos: [],
  sinMapeo: [],
  avisos: [],
  ...o,
});
const SEMANA = '2026-11-16';

describe('correo de la OV sugerida', () => {
  it('asunto con el lunes de la semana', () => {
    expect(asuntoOvs(SEMANA)).toBe('Orden de venta sugerida (piloto) — semana del 16 nov 2026');
    expect(correoOvs(SEMANA, [tienda()]).asunto).toBe(asuntoOvs(SEMANA));
  });

  it('encabezado y tabla por tienda: solo lo sugerido, por monto, con total y sin costo aparte', () => {
    const { html } = correoOvs(SEMANA, [
      tienda({
        lineas: [
          linea({ sku: 'INS-DES-021', nombre: 'Vaso 12 oz', k: 1, sugerido: 2, monto: 1136.38 }),
          linea(),
          linea({ sku: 'INS-DES-002', nombre: 'Vaso Espresso', sugerido: 0, monto: 0 }),
          linea({ sku: 'MP-OPE-022', nombre: 'Acrilico', origen: 'historial', k: null, sugerido: 2, monto: null }),
        ],
      }),
    ]);
    expect(html).toContain('La Mexicana');
    expect(html).toContain('Cadencia: 14 días');
    expect(html).toContain('Último pedido: 9 nov 2026');
    expect(html).toContain('Cobertura de recetas de sus ventas: 91 %');
    expect(html).not.toContain('INS-DES-002');
    expect(html.indexOf('INS-CAF-003')).toBeLessThan(html.indexOf('INS-DES-021'));
    expect(html).toContain('1.20');
    expect(html).toContain('historial');
    expect(html).toContain('sin costo');
    expect(html).toContain(pesos(5460 + 1136.38));
    expect(html).toContain('1 sin costo en el catálogo (no suman al total).');
  });

  it('medición contra la semana anterior, o el aviso de primera semana', () => {
    const con = correoOvs(SEMANA, [
      tienda({
        medicion: {
          desde: '2026-11-09',
          filas: [{ sku: 'INS-CAF-003', nombre: 'Cafe', sugerido: 13, pedido: 12, diferencia: -1 }],
          montoSugerido: 5460,
          montoPedido: 5040,
        },
      }),
    ]).html;
    expect(con).toContain(
      `La semana pasada (9 nov 2026) sugerimos ${pesos(5460)}; desde entonces pidió ${pesos(5040)}.`,
    );
    expect(con).toMatch(/>-1</);
    expect(correoOvs(SEMANA, [tienda()]).html).toContain('Primera semana del piloto para esta tienda');
  });

  it('avisos: inactivos, insumos sin SKU, cadencia por omisión, lectura incompleta y tienda que falló', () => {
    const { html } = correoOvs(SEMANA, [
      tienda({
        cadenciaPorDefecto: true,
        inactivos: [{ sku: 'INS-BEB-032', nombre: 'Pulpa de Maracuya 500ml' }],
        sinMapeo: ['LECHE ENTERA'],
        avisos: ['Lectura del POS incompleta (el consumo puede quedar bajo): 2 de 28 días con lectura incompleta.'],
      }),
      tienda({ nombre: 'Avándaro', estado: 'error', error: 'POS: El proveedor no respondió.', cadencia: null, lineas: [] }),
    ]);
    expect(html).toContain('Inactivos en el catálogo que la receta pide: INS-BEB-032 (Pulpa de Maracuya 500ml)');
    expect(html).toContain('Insumos de receta sin SKU (no entran): LECHE ENTERA');
    expect(html).toContain('cadencia por omisión de 14 días');
    expect(html).toContain('Lectura del POS incompleta');
    expect(html).toContain('Avándaro');
    expect(html).toContain('No se calculó esta semana: POS: El proveedor no respondió.');
  });

  it('escapa el HTML de nombres y motivos', () => {
    const { html } = correoOvs(SEMANA, [
      tienda({ nombre: '<script>alert(1)</script> & Co', lineas: [linea({ nombre: 'Vaso "12" <b>' })] }),
      tienda({ nombre: 'Otra', estado: 'error', error: '<img src=x onerror=alert(1)>', lineas: [] }),
    ]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(html).toContain('Vaso &quot;12&quot; &lt;b&gt;');
  });
});
```

Crear `tests/portal/correo-servidor.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { enviarCorreoInterno } from '../../lib/comercializadora/correoServidor';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('envío de correo desde el portal', () => {
  it('sin CORREO_URL o CORREO_LLAVE no envía y dice "correo no configurado"', async () => {
    vi.stubEnv('CORREO_URL', '');
    vi.stubEnv('CORREO_LLAVE', 'x');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await enviarCorreoInterno(['a@b.mx'], 'Asunto', '<p>x</p>')).toBe('no-configurado');
    expect(f).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('correo no configurado'));
  });

  it('envía uno por destinatario con el cuerpo de send-email, aunque COM_EFECTOS_EXTERNOS esté apagado', async () => {
    vi.stubEnv('CORREO_URL', 'https://correo.example/functions/v1/send-email');
    vi.stubEnv('CORREO_LLAVE', 'llave-secreta');
    vi.stubEnv('COM_EFECTOS_EXTERNOS', '');
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', f);
    expect(await enviarCorreoInterno(['a@b.mx', 'c@d.mx'], 'Asunto', '<p>x</p>')).toBe('enviado');
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://correo.example/functions/v1/send-email');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer llave-secreta');
    expect(JSON.parse(String(init?.body))).toEqual({
      area: 'comercializadora',
      to: 'a@b.mx',
      subject: 'Asunto',
      body_html: '<p>x</p>',
      apertura_id: null,
      enviado_por: 'OV sugerida (piloto)',
    });
  });

  it('un envío fallido devuelve "fallo", sigue con los demás y no imprime la llave', async () => {
    vi.stubEnv('CORREO_URL', 'https://correo.example/send');
    vi.stubEnv('CORREO_LLAVE', 'llave-secreta');
    const f = vi
      .fn(async (_u: string, _i?: RequestInit) => new Response('{}'))
      .mockResolvedValueOnce(new Response('mal', { status: 500 }));
    vi.stubGlobal('fetch', f);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await enviarCorreoInterno(['a@b.mx', 'c@d.mx'], 'Asunto', '<p>x</p>')).toBe('fallo');
    expect(f).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain('llave-secreta');
  });
});
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Run: `npx vitest run tests/portal/ov-correo.test.ts tests/portal/correo-servidor.test.ts`
Expected: FAIL con `Failed to resolve import "../../lib/comercializadora/ovCorreo"` y `"../../lib/comercializadora/correoServidor"`.

- [ ] **Step 3: Escribir el armado del correo**

Crear `lib/comercializadora/ovCorreo.ts`:

```ts
import { fechaCorta } from './fechas';
import { pesos } from './formato';
import type { LineaOv, Medicion } from './ovSugerida';

/**
 * Correo semanal del piloto de OV sugerida (spec §7). Todo texto que viene de datos (nombres, motivos) pasa por esc.
 * Sin datos de clientes del POS: solo cantidades y montos por SKU.
 */
export interface TiendaCorreo {
  nombre: string;
  estado: 'ok' | 'error';
  error: string | null;
  cadencia: number | null;
  cadenciaPorDefecto: boolean;
  ultimoPedido: string | null;
  cobertura: number | null;
  lineas: LineaOv[];
  medicion: Medicion | null;
  inactivos: { sku: string; nombre: string | null }[];
  sinMapeo: string[];
  avisos: string[];
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const fechaLarga = (iso: string) => `${fechaCorta(iso)} ${iso.slice(0, 4)}`;
const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const conSigno = (n: number) => `${n > 0 ? '+' : ''}${n}`;
const TABLA = 'style="border-collapse:collapse;margin:8px 0"';
const TH = 'style="padding:4px 8px;text-align:left;background:#f3f4f6;border-bottom:1px solid #d1d5db"';
const TD = 'style="padding:4px 8px;border-bottom:1px solid #e5e7eb"';
const TDN = 'style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:right"';
const celdas = (xs: string[], estilo = TD) => xs.map((x) => `<td ${estilo}>${x}</td>`).join('');
const encabezado = (xs: string[]) => `<tr>${xs.map((x) => `<th ${TH}>${x}</th>`).join('')}</tr>`;

export const asuntoOvs = (semana: string) => `Orden de venta sugerida (piloto) — semana del ${fechaLarga(semana)}`;

function tablaSugerido(lineas: LineaOv[]): string {
  const filas = lineas
    .filter((l) => l.sugerido > 0)
    .sort((x, y) => (y.monto ?? 0) - (x.monto ?? 0) || x.sku.localeCompare(y.sku));
  if (!filas.length) return '<p>Esta semana no hay nada que sugerir.</p>';
  const total = filas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const sinCosto = filas.filter((l) => l.monto == null).length;
  const cuerpo = filas
    .map(
      (l) =>
        `<tr>${celdas([esc(l.sku), esc(l.nombre ?? '')])}${celdas([String(l.sugerido)], TDN)}${celdas([
          l.origen,
        ])}${celdas([l.k == null ? '—' : l.k.toFixed(2), l.monto == null ? 'sin costo' : esc(pesos(l.monto))], TDN)}</tr>`,
    )
    .join('');
  return (
    `<table ${TABLA}><thead>${encabezado(['SKU', 'Producto', 'Sugerido (paquetes)', 'Origen', 'k', 'Monto aprox.'])}</thead>` +
    `<tbody>${cuerpo}</tbody><tfoot><tr><td ${TD} colspan="5"><strong>Total</strong></td><td ${TDN}><strong>${esc(
      pesos(total),
    )}</strong></td></tr></tfoot></table>` +
    (sinCosto ? `<p>${sinCosto} sin costo en el catálogo (no suman al total).</p>` : '')
  );
}

function tablaMedicion(m: Medicion | null): string {
  if (!m) return '<p>Primera semana del piloto para esta tienda: todavía no hay sugerencia anterior con qué comparar.</p>';
  const resumen = `<p>La semana pasada (${fechaLarga(m.desde)}) sugerimos ${esc(pesos(m.montoSugerido))}; desde entonces pidió ${esc(
    pesos(m.montoPedido),
  )}.</p>`;
  if (!m.filas.length) return resumen;
  const cuerpo = m.filas
    .map(
      (f) =>
        `<tr>${celdas([esc(f.sku), esc(f.nombre ?? '')])}${celdas(
          [String(f.sugerido), String(f.pedido), conSigno(f.diferencia)],
          TDN,
        )}</tr>`,
    )
    .join('');
  return (
    resumen +
    `<table ${TABLA}><thead>${encabezado(['SKU', 'Producto', 'Sugerimos', 'Pidió', 'Diferencia'])}</thead><tbody>${cuerpo}</tbody></table>`
  );
}

function avisos(t: TiendaCorreo): string {
  const xs: string[] = [];
  if (t.inactivos.length)
    xs.push(
      `Inactivos en el catálogo que la receta pide: ${t.inactivos
        .map((i) => `${esc(i.sku)} (${esc(i.nombre ?? 'sin nombre')})`)
        .join(', ')}`,
    );
  if (t.sinMapeo.length) xs.push(`Insumos de receta sin SKU (no entran): ${t.sinMapeo.map(esc).join(', ')}`);
  if (t.cadenciaPorDefecto)
    xs.push('Menos de 2 pedidos de resurtido en 90 días: cadencia por omisión de 14 días.');
  xs.push(...t.avisos.map(esc));
  return xs.length ? `<h3>Avisos</h3><ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';
}

function seccionTienda(t: TiendaCorreo): string {
  const titulo = `<h2 style="font-size:16px;margin:16px 0 4px">${esc(t.nombre)}</h2>`;
  if (t.estado === 'error')
    return `${titulo}<p style="color:#b91c1c">No se calculó esta semana: ${esc(t.error)}</p>`;
  const datos = `<p>Cadencia: ${t.cadencia} días · Último pedido: ${
    t.ultimoPedido ? fechaLarga(t.ultimoPedido) : 'sin pedidos en 90 días'
  } · Cobertura de recetas de sus ventas: ${pct(t.cobertura)}</p>`;
  return `${titulo}${datos}${tablaSugerido(t.lineas)}<h3>Medición</h3>${tablaMedicion(t.medicion)}${avisos(t)}`;
}

export function correoOvs(semana: string, tiendas: TiendaCorreo[]): { asunto: string; html: string } {
  const asunto = asuntoOvs(semana);
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827">` +
    `<h1 style="font-size:18px">${esc(asunto)}</h1>` +
    '<p>Piloto interno: sugerencia calculada con las ventas del POS de los últimos 28 días, las recetas y el historial ' +
    'de pedidos de cada tienda. No se envió nada al franquiciatario.</p>' +
    tiendas.map(seccionTienda).join('<hr>') +
    '</div>';
  return { asunto, html };
}
```

- [ ] **Step 4: Escribir el envío**

Crear `lib/comercializadora/correoServidor.ts`:

```ts
import 'server-only';

export type ResultadoCorreo = 'enviado' | 'no-configurado' | 'fallo';

/**
 * Envía a cada destinatario por el mismo servicio que las funciones (supabase/functions/_shared/correo.ts: CORREO_URL y
 * CORREO_LLAVE, mismo cuerpo). EXCEPCIÓN documentada (spec OV sugerida §7): no pasa por COM_EFECTOS_EXTERNOS porque
 * solo va a direcciones internas. Sin variables no envía ("correo no configurado"). Nunca lanza ni imprime la llave.
 */
export async function enviarCorreoInterno(
  para: string[],
  asunto: string,
  html: string,
  enviadoPor = 'OV sugerida (piloto)',
): Promise<ResultadoCorreo> {
  const url = process.env.CORREO_URL;
  const llave = process.env.CORREO_LLAVE;
  if (!url || !llave) {
    console.log(`[comercializadora] correo no configurado: no se envió "${asunto}" (${para.length} destinatarios)`);
    return 'no-configurado';
  }
  let ok = true;
  for (const to of para) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave}` },
        body: JSON.stringify({
          area: 'comercializadora',
          to,
          subject: asunto,
          body_html: html,
          apertura_id: null,
          enviado_por: enviadoPor,
        }),
      });
      if (!r.ok) {
        ok = false;
        console.error(`[comercializadora] send-email ${to}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`);
      }
    } catch (e) {
      ok = false;
      console.error(`[comercializadora] send-email ${to}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ok ? 'enviado' : 'fallo';
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run tests/portal/ov-correo.test.ts tests/portal/correo-servidor.test.ts`
Expected: PASS (5 + 3 pruebas).

- [ ] **Step 6: Commit**

```bash
git add lib/comercializadora/ovCorreo.ts lib/comercializadora/correoServidor.ts tests/portal/ov-correo.test.ts tests/portal/correo-servidor.test.ts
git commit -m "feat(comercializadora): correo semanal de la OV sugerida y envío desde el portal"
```

---

### Task 5: Orquestación, ruta del cron y `vercel.json`

**Files:**
- Create: `lib/cron.ts`
- Create: `lib/comercializadora/ovSugeridaServidor.ts`
- Create: `app/api/comercializadora/ov-sugerida/route.ts`
- Modify: `app/api/sucursales/corte/route.ts:1-15` (usa `autorizadoCron`)
- Modify: `vercel.json`
- Test: `tests/portal/ov-sugerida-servidor.test.ts`, `tests/portal/ov-sugerida-ruta.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `public.com_ovs_guardar(p_semana, p_company, p_cadencia, p_estado, p_error, p_lineas)`, tablas `com_ovs_tiendas`, `com_ovs_corridas`, `com_ovs_lineas`, `com_insumo_sku`;
  - Task 2: `CORREOS_OVS`, `DIAS_CONSUMO`, `DIAS_HISTORIA`, `cadencia`, `calcularLineas`, `correosOvs`, `diarioPorSku`, `lunesDe`, `medicion`, `pedidosResurtido`, `ultimoPedido`, tipos `FilaCatalogoOv`, `InsumoSku`, `LineaOv`;
  - Task 3: `consumoVentana`, `ConsumoTienda`; Task 4: `correoOvs`, `TiendaCorreo`, `enviarCorreoInterno`, `ResultadoCorreo`;
  - existentes: `clienteServicio(): SupabaseClient | null`, `catalogoServicio(db)`, `rappiServicio(db, cfg)` (`lib/sucursales/corte-servidor.ts`); `recetasServicio(db): Promise<DatosConsumo | null>` (`consumo-mes-servidor.ts`); `leerDias` (`datos.ts`); `configDe(companyId)` (`config.ts`); `com(db)`, `leerTodoCom(db, tabla, columnas, orden, filtro?)` (`consultas.ts`); `pedidosPlanLegado(filtro)`, `pedidosAperturaLegado()` (`legado.ts`, devuelven `Lectura<T>`); `hoyCdmx(ahora)`, `masDias` (`fechas.ts`).
- Produces:
  - `lib/cron.ts`: `autorizadoCron(req: Request): boolean`;
  - `ovSugeridaServidor.ts`: `PROCESO_OVS = 'com-ovs'`, tipos `TiendaOvs`, `ComunesOvs`, `CorridaAnterior`, `CorridaGuardar`, `FilaBitacora`, `DepsOvs`, `ResumenOvs`; `correrOvs(deps: DepsOvs): Promise<ResumenOvs>`; `depsReales(db: SupabaseClient): DepsOvs`;
  - ruta `GET /api/comercializadora/ov-sugerida` → 401 sin `Bearer CRON_SECRET`, 503 sin llave de servicio, 500 si `correrOvs` lanza, 200 con el `ResumenOvs`;
  - cron de Vercel `{ "path": "/api/comercializadora/ov-sugerida", "schedule": "0 12 * * 1" }`.

- [ ] **Step 1: Escribir la prueba de la orquestación (falla)**

Crear `tests/portal/ov-sugerida-servidor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  correrOvs,
  depsReales,
  type ComunesOvs,
  type CorridaAnterior,
  type CorridaGuardar,
  type DepsOvs,
  type FilaBitacora,
  type TiendaOvs,
} from '../../lib/comercializadora/ovSugeridaServidor';
import type { ConsumoTienda } from '../../lib/comercializadora/ovConsumo';
import { CORREOS_OVS } from '../../lib/comercializadora/ovSugerida';
import { pesos } from '../../lib/comercializadora/formato';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';

const AHORA = new Date('2026-11-16T12:00:00Z'); // lunes 06:00 en CDMX
const TIENDAS: TiendaOvs[] = [
  { company_id: 519, apertura_id: '411', nombre: 'La Mexicana' },
  { company_id: 460, apertura_id: '354', nombre: 'Pasaje Parián' },
];
const COMUNES: ComunesOvs = {
  catalogo: [{ sku: 'INS-CAF-003', nombre: 'Cafe en Grano White 1.5 Kg', estatus: 'Compra Recurrente', costo_unitario: 420 }],
  mapa: [],
  insumoSku: [{ insumo_id: 'cafe', sku: 'INS-CAF-003', factor: 1500, activo: true }],
  pedidosApertura: [],
  correos: ['compras@mx.thecoffee.jp'],
};
const consumoOk = (): ConsumoTienda => ({
  ok: true,
  desde: '2026-10-19',
  hasta: '2026-11-15',
  dias: 28,
  completa: true,
  avisos: [],
  pedidos: 1000,
  cobertura: 0.9,
  insumos: [{ insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', cantidad: 42000 }],
});

function falsas(o: Partial<DepsOvs> = {}) {
  const guardadas: CorridaGuardar[] = [];
  const bitacora: FilaBitacora[] = [];
  const correos: { para: string[]; asunto: string; html: string }[] = [];
  const deps: DepsOvs = {
    ahora: () => AHORA,
    tiendas: async () => TIENDAS,
    comunes: async () => COMUNES,
    pedidos: async () => [],
    consumo: async () => consumoOk(),
    anterior: async () => null,
    guardar: async (c) => {
      guardadas.push(c);
    },
    bitacora: async (f) => {
      bitacora.push(f);
    },
    enviar: async (para, asunto, html) => {
      correos.push({ para, asunto, html });
      return 'enviado';
    },
    ...o,
  };
  return { deps, guardadas, bitacora, correos };
}

describe('corrida semanal de la OV sugerida', () => {
  it('calcula cada tienda con sus ventanas y guarda una corrida por (semana, tienda)', async () => {
    const consumo = vi.fn(async (_id: number, _desde: string, _hasta: string) => consumoOk());
    const pedidos = vi.fn(async (_apertura: string, _desde: string) => [] as PedidoPlan[]);
    const anterior = vi.fn(async (_id: number, _semana: string) => null as CorridaAnterior | null);
    const f = falsas({ consumo, pedidos, anterior });
    const r = await correrOvs(f.deps);
    expect(consumo).toHaveBeenCalledWith(519, '2026-10-19', '2026-11-15');
    expect(pedidos).toHaveBeenCalledWith('411', '2026-08-17');
    expect(anterior).toHaveBeenCalledWith(519, '2026-11-16');
    expect(f.guardadas.map((g) => [g.semana, g.company_id, g.estado, g.cadencia])).toEqual([
      ['2026-11-16', 519, 'ok', 14],
      ['2026-11-16', 460, 'ok', 14],
    ]);
    expect(f.guardadas[0].lineas).toEqual([
      {
        sku: 'INS-CAF-003',
        nombre: 'Cafe en Grano White 1.5 Kg',
        origen: 'receta',
        k: 1,
        diario: 1,
        necesidad: 14,
        ya_pedido: 0,
        arrastre: 0,
        sugerido: 14,
        monto: 5880,
      },
    ]);
    expect(r.semana).toBe('2026-11-16');
    expect(r.correo).toBe('enviado');
    expect(f.correos[0].para).toEqual(['compras@mx.thecoffee.jp']);
    expect(f.correos[0].asunto).toBe('Orden de venta sugerida (piloto) — semana del 16 nov 2026');
    expect(f.bitacora).toEqual([
      expect.objectContaining({ inicio: AHORA.toISOString(), ok: true, error: null }),
    ]);
  });

  it('una tienda que falla no detiene a las demás: queda en error con su motivo y el correo lo dice', async () => {
    const f = falsas({
      consumo: async (companyId) =>
        companyId === 519 ? { ok: false, motivo: 'El proveedor no respondió.' } : consumoOk(),
    });
    const r = await correrOvs(f.deps);
    expect(f.guardadas[0]).toMatchObject({
      company_id: 519,
      estado: 'error',
      error: 'POS: El proveedor no respondió.',
      cadencia: null,
      lineas: [],
    });
    expect(f.guardadas[1]).toMatchObject({ company_id: 460, estado: 'ok' });
    expect(f.correos[0].html).toContain('No se calculó esta semana: POS: El proveedor no respondió.');
    expect(f.correos[0].html).toContain('Pasaje Parián');
    expect(r.tiendas.map((t) => t.estado)).toEqual(['error', 'ok']);
    expect(f.bitacora[0]).toMatchObject({ ok: false, error: expect.stringContaining('519') });
  });

  it('el puente caído en una tienda también la deja en error sin frenar a la otra', async () => {
    const f = falsas({
      pedidos: async (apertura) => {
        if (apertura === '411') throw new Error('No se pudieron leer los pedidos del sitio viejo.');
        return [];
      },
    });
    await correrOvs(f.deps);
    expect(f.guardadas.map((g) => [g.company_id, g.estado, g.error])).toEqual([
      [519, 'error', 'No se pudieron leer los pedidos del sitio viejo.'],
      [460, 'ok', null],
    ]);
  });

  it('arrastre y medición de la semana anterior; repetir la semana no acumula el arrastre', async () => {
    const pedido: PedidoPlan = {
      id: 'p1',
      apertura_id: '411',
      fecha_pedido: '2026-11-12T17:00:00Z',
      status: 'pagado',
      items: [{ sku: 'INS-CAF-003', nombre: 'Cafe', cantidad: 9 }],
      items_editados: null,
    };
    const anterior = vi.fn(
      async (_id: number, _semana: string): Promise<CorridaAnterior | null> => ({
        semana: '2026-11-09',
        lineas: [{ sku: 'INS-CAF-003', sugerido: 10, arrastre: 0.5 }],
      }),
    );
    const f = falsas({ pedidos: async () => [pedido], anterior });
    await correrOvs(f.deps);
    await correrOvs(f.deps);
    const mexicana = f.guardadas.filter((g) => g.company_id === 519);
    expect(mexicana).toHaveLength(2);
    expect(mexicana[1].lineas).toEqual(mexicana[0].lineas);
    expect(mexicana[0].lineas[0]).toMatchObject({ k: 0.8, diario: 0.8, necesidad: 11.2, arrastre: -0.3, sugerido: 12 });
    expect(anterior.mock.calls.every(([, semana]) => semana === '2026-11-16')).toBe(true);
    expect(f.correos[0].html).toContain(`sugerimos ${pesos(4200)}; desde entonces pidió ${pesos(3780)}`);
  });

  it('sin variables de correo: guarda las corridas y la bitácora dice "correo no configurado"', async () => {
    const f = falsas({ enviar: async () => 'no-configurado' });
    const r = await correrOvs(f.deps);
    expect(f.guardadas).toHaveLength(2);
    expect(r.correo).toBe('no-configurado');
    expect(f.bitacora[0]).toMatchObject({ ok: true, resumen: expect.objectContaining({ correo: 'correo no configurado' }) });
  });

  it('si fallan los datos comunes, cada tienda queda en error y el correo sale a las direcciones por omisión', async () => {
    const f = falsas({
      comunes: async () => {
        throw new Error('No se pudieron leer los pedidos del sitio viejo. Intenta de nuevo en unos minutos.');
      },
    });
    await correrOvs(f.deps);
    expect(f.guardadas.map((g) => g.estado)).toEqual(['error', 'error']);
    expect(f.correos[0].para).toEqual(CORREOS_OVS);
  });

  it('si guardar falla, la tienda sigue en el correo y la bitácora marca el error', async () => {
    const f = falsas({
      guardar: async (c) => {
        if (c.company_id === 460) throw new Error('com_ovs_guardar: timeout');
      },
    });
    const r = await correrOvs(f.deps);
    expect(r.tiendas.map((t) => t.guardada)).toEqual([true, false]);
    expect(f.correos[0].html).toContain('No se pudo guardar la corrida: com_ovs_guardar: timeout');
    expect(f.bitacora[0]).toMatchObject({ ok: false, error: expect.stringContaining('460') });
  });
});

describe('dependencias reales (escrituras)', () => {
  it('guardar llama com_ovs_guardar y la bitácora escribe com_sync_log con proceso com-ovs', async () => {
    const llamadas: unknown[][] = [];
    const db = {
      rpc: async (fn: string, args: unknown) => {
        llamadas.push(['rpc', fn, args]);
        return { data: 1, error: null };
      },
      from: (tabla: string) => ({
        insert: async (fila: unknown) => {
          llamadas.push(['insert', tabla, fila]);
          return { error: null };
        },
      }),
    };
    const deps = depsReales(db as never);
    await deps.guardar({ semana: '2026-11-16', company_id: 519, cadencia: 14, estado: 'ok', error: null, lineas: [] });
    await deps.bitacora({ inicio: 'a', fin: 'b', ok: true, resumen: { x: 1 }, error: null });
    expect(llamadas).toEqual([
      [
        'rpc',
        'com_ovs_guardar',
        { p_semana: '2026-11-16', p_company: 519, p_cadencia: 14, p_estado: 'ok', p_error: null, p_lineas: [] },
      ],
      ['insert', 'com_sync_log', { proceso: 'com-ovs', inicio: 'a', fin: 'b', ok: true, resumen: { x: 1 }, error: null }],
    ]);
  });
});
```

Cuentas de la prueba de arrastre: compras de 90 días = 9 → `k = 9 / (1 × 90) = 0.1` → 0.8; diario 0.8; necesidad `0.8 × 14 = 11.2`; bruto `11.2 − 0 + 0.5 = 11.7`; sugerido `⌈11.5⌉ = 12`; arrastre `−0.3`. Medición: sugerimos `10 × 420 = 4,200`, pidió `9 × 420 = 3,780`.

- [ ] **Step 2: Escribir la prueba de la ruta (falla)**

Crear `tests/portal/ov-sugerida-ruta.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ correrOvs: vi.fn(), cliente: vi.fn() }));
vi.mock('@/lib/comercializadora/ovSugeridaServidor', () => ({
  correrOvs: m.correrOvs,
  depsReales: () => ({}),
}));
vi.mock('@/lib/sucursales/corte-servidor', () => ({ clienteServicio: m.cliente }));
import { GET } from '@/app/api/comercializadora/ov-sugerida/route';
import { autorizadoCron } from '@/lib/cron';

const pedir = (auth?: string) =>
  new Request('https://portal.example/api/comercializadora/ov-sugerida', {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'secreto-cron');
  m.cliente.mockReturnValue({});
  m.correrOvs.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('autorización de cron', () => {
  it('solo con Bearer CRON_SECRET; sin CRON_SECRET configurado, nunca', () => {
    expect(autorizadoCron(pedir('Bearer secreto-cron'))).toBe(true);
    expect(autorizadoCron(pedir('Bearer otro'))).toBe(false);
    expect(autorizadoCron(pedir())).toBe(false);
    vi.stubEnv('CRON_SECRET', '');
    expect(autorizadoCron(pedir('Bearer '))).toBe(false);
  });
});

describe('GET /api/comercializadora/ov-sugerida', () => {
  it('401 sin el secreto del cron, sin correr nada', async () => {
    const r = await GET(pedir('Bearer otro'));
    expect(r.status).toBe(401);
    expect(m.correrOvs).not.toHaveBeenCalled();
  });

  it('503 sin la llave de servicio', async () => {
    m.cliente.mockReturnValue(null);
    expect((await GET(pedir('Bearer secreto-cron'))).status).toBe(503);
  });

  it('200 con el resumen de la corrida', async () => {
    m.correrOvs.mockResolvedValue({ semana: '2026-11-16', hoy: '2026-11-16', tiendas: [], correo: 'enviado' });
    const r = await GET(pedir('Bearer secreto-cron'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ semana: '2026-11-16', correo: 'enviado' });
  });

  it('500 sin detalles si la corrida lanza', async () => {
    m.correrOvs.mockRejectedValue(new Error('detalle interno con llave'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await GET(pedir('Bearer secreto-cron'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('llave');
  });

  it('el cron de Vercel la llama los lunes a las 12:00 UTC (06:00 CDMX)', () => {
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
    expect(v.crons).toContainEqual({ path: '/api/comercializadora/ov-sugerida', schedule: '0 12 * * 1' });
  });
});
```

- [ ] **Step 3: Correr las pruebas para verlas fallar**

Run: `npx vitest run tests/portal/ov-sugerida-servidor.test.ts tests/portal/ov-sugerida-ruta.test.ts`
Expected: FAIL con `Failed to resolve import "../../lib/comercializadora/ovSugeridaServidor"` y `"@/app/api/comercializadora/ov-sugerida/route"`.

- [ ] **Step 4: Escribir `lib/cron.ts` y usarlo en el corte**

Crear `lib/cron.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';

/** Llamada de Vercel Cron: `Authorization: Bearer CRON_SECRET`. Sin CRON_SECRET configurado, nada corre. */
export function autorizadoCron(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

En `app/api/sucursales/corte/route.ts`, reemplazar:

```ts
import { timingSafeEqual } from 'node:crypto';
import { clienteServicio, cortar } from '@/lib/sucursales/corte-servidor';
```

por:

```ts
import { autorizadoCron } from '@/lib/cron';
import { clienteServicio, cortar } from '@/lib/sucursales/corte-servidor';
```

borrar la constante `autorizado` completa (de `const autorizado = (req: Request) => {` hasta su `};`) y en `GET` cambiar `if (!autorizado(req))` por `if (!autorizadoCron(req))`.

- [ ] **Step 5: Escribir la orquestación**

Crear `lib/comercializadora/ovSugeridaServidor.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';
import { configDe } from '../sucursales/config';
import type { DatosConsumo } from '../sucursales/consumo';
import { recetasServicio } from '../sucursales/consumo-mes-servidor';
import { catalogoServicio, rappiServicio } from '../sucursales/corte-servidor';
import { leerDias } from '../sucursales/datos';
import type { CatalogoNombres } from '../sucursales/metricas';
import { com, leerTodoCom } from './consultas';
import { enviarCorreoInterno, type ResultadoCorreo } from './correoServidor';
import { hoyCdmx, masDias } from './fechas';
import { pedidosAperturaLegado, pedidosPlanLegado } from './legado';
import { consumoVentana, type ConsumoTienda } from './ovConsumo';
import { correoOvs, type TiendaCorreo } from './ovCorreo';
import {
  CORREOS_OVS,
  DIAS_CONSUMO,
  DIAS_HISTORIA,
  cadencia,
  calcularLineas,
  correosOvs,
  diarioPorSku,
  lunesDe,
  medicion,
  pedidosResurtido,
  ultimoPedido,
  type FilaCatalogoOv,
  type InsumoSku,
  type LineaOv,
} from './ovSugerida';

/**
 * Corrida semanal del piloto de OV sugerida (spec §5): por cada tienda activa de com_ovs_tiendas lee pedidos (puente),
 * ventas del POS (28 días) y la corrida de la semana anterior, calcula, guarda (com_ovs_guardar) y manda un correo con
 * todas. Una tienda que falla no detiene a las demás. Solo escribe com_ovs_* y com_sync_log; nada en Shopify ni Zoho.
 */
export const PROCESO_OVS = 'com-ovs';

export interface TiendaOvs {
  company_id: number;
  apertura_id: string;
  nombre: string;
}
export interface ComunesOvs {
  catalogo: FilaCatalogoOv[];
  mapa: { shopify_nombre: string; sku: string }[];
  insumoSku: InsumoSku[];
  pedidosApertura: string[];
  correos: string[];
}
export interface CorridaAnterior {
  semana: string;
  lineas: { sku: string; sugerido: number; arrastre: number }[];
}
export interface CorridaGuardar {
  semana: string;
  company_id: number;
  cadencia: number | null;
  estado: 'ok' | 'error';
  error: string | null;
  lineas: LineaOv[];
}
export interface FilaBitacora {
  inicio: string;
  fin: string;
  ok: boolean;
  resumen: unknown;
  error: string | null;
}
export interface DepsOvs {
  ahora: () => Date;
  tiendas: () => Promise<TiendaOvs[]>;
  comunes: () => Promise<ComunesOvs>;
  /** Pedidos vigentes de una apertura con fecha_pedido ≥ desde. */
  pedidos: (aperturaId: string, desde: string) => Promise<PedidoPlan[]>;
  consumo: (companyId: number, desde: string, hasta: string) => Promise<ConsumoTienda>;
  /** La corrida 'ok' de la semana anterior (semana − 7) de la tienda, o null. */
  anterior: (companyId: number, semana: string) => Promise<CorridaAnterior | null>;
  guardar: (c: CorridaGuardar) => Promise<void>;
  bitacora: (f: FilaBitacora) => Promise<void>;
  enviar: (para: string[], asunto: string, html: string) => Promise<ResultadoCorreo>;
}
export interface ResumenTiendaOvs {
  company_id: number;
  nombre: string;
  estado: 'ok' | 'error';
  error: string | null;
  guardada: boolean;
  lineas: number;
  sugeridas: number;
  monto: number;
}
export interface ResumenOvs {
  semana: string;
  hoy: string;
  tiendas: ResumenTiendaOvs[];
  correo: ResultadoCorreo | 'sin-tiendas';
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function calcularTienda(
  t: TiendaOvs,
  c: ComunesOvs,
  hoy: string,
  semana: string,
  deps: DepsOvs,
): Promise<{ correo: TiendaCorreo; corrida: CorridaGuardar }> {
  const [crudos, consumo, anterior] = await Promise.all([
    // Un día de más: fecha_pedido es timestamptz y el día que cuenta es el de CDMX (pedidosResurtido lo recorta).
    deps.pedidos(t.apertura_id, masDias(hoy, -(DIAS_HISTORIA + 1))),
    deps.consumo(t.company_id, masDias(hoy, -DIAS_CONSUMO), masDias(hoy, -1)),
    deps.anterior(t.company_id, semana),
  ]);
  if (!consumo.ok) throw new Error(`POS: ${consumo.motivo}`);
  const r = pedidosResurtido({
    pedidos: crudos,
    aperturaId: t.apertura_id,
    pedidosApertura: c.pedidosApertura,
    mapa: c.mapa,
    catalogo: c.catalogo,
  });
  const cad = cadencia(r.pedidos, hoy);
  const receta = diarioPorSku({ insumos: consumo.insumos, dias: consumo.dias, mapeo: c.insumoSku });
  const { lineas, inactivos } = calcularLineas({
    hoy,
    cadencia: cad.dias,
    recetaDiaria: receta.porSku,
    skusReceta: new Set(c.insumoSku.filter((m) => m.activo).map((m) => m.sku)),
    pedidos: r.pedidos,
    catalogo: c.catalogo,
    arrastrePrevio: new Map((anterior?.lineas ?? []).map((l) => [l.sku, l.arrastre])),
  });
  const avisos: string[] = [];
  if (!consumo.completa)
    avisos.push(`Lectura del POS incompleta (el consumo puede quedar bajo): ${consumo.avisos.join(' ')}`);
  if (!consumo.pedidos) avisos.push('Sin ventas del POS en los últimos 28 días: solo se sugiere lo de historial.');
  if (!cad.diasConPedido) avisos.push('Sin pedidos de resurtido en 90 días.');
  if (r.sinSku) avisos.push(`${r.sinSku} artículos de pedidos sin SKU (no se cuentan).`);
  if (r.fueraDeCatalogo.length)
    avisos.push(`SKUs pedidos que no están en el catálogo (no se cuentan): ${r.fueraDeCatalogo.join(', ')}.`);
  return {
    correo: {
      nombre: t.nombre,
      estado: 'ok',
      error: null,
      cadencia: cad.dias,
      cadenciaPorDefecto: cad.porDefecto,
      ultimoPedido: ultimoPedido(r.pedidos, hoy),
      cobertura: consumo.cobertura,
      lineas,
      medicion: anterior
        ? medicion({ anteriores: anterior.lineas, desde: anterior.semana, hoy, pedidos: r.pedidos, catalogo: c.catalogo })
        : null,
      inactivos,
      sinMapeo: receta.sinMapeo,
      avisos,
    },
    corrida: { semana, company_id: t.company_id, cadencia: cad.dias, estado: 'ok', error: null, lineas },
  };
}

function conError(t: TiendaOvs, semana: string, motivo: string): { correo: TiendaCorreo; corrida: CorridaGuardar } {
  return {
    correo: {
      nombre: t.nombre,
      estado: 'error',
      error: motivo,
      cadencia: null,
      cadenciaPorDefecto: false,
      ultimoPedido: null,
      cobertura: null,
      lineas: [],
      medicion: null,
      inactivos: [],
      sinMapeo: [],
      avisos: [],
    },
    corrida: { semana, company_id: t.company_id, cadencia: null, estado: 'error', error: motivo, lineas: [] },
  };
}

export async function correrOvs(deps: DepsOvs): Promise<ResumenOvs> {
  const inicio = deps.ahora().toISOString();
  const hoy = hoyCdmx(deps.ahora());
  const semana = lunesDe(hoy);
  const anotar = async (f: Omit<FilaBitacora, 'inicio' | 'fin'>) => {
    try {
      await deps.bitacora({ inicio, fin: deps.ahora().toISOString(), ...f });
    } catch (e) {
      console.error('[comercializadora] ov-sugerida: no se pudo escribir la bitácora', mensaje(e));
    }
  };
  let tiendas: TiendaOvs[];
  try {
    tiendas = await deps.tiendas();
  } catch (e) {
    await anotar({ ok: false, resumen: { semana, hoy }, error: mensaje(e) });
    throw e;
  }
  let comunes: ComunesOvs | null = null;
  let errorComun = '';
  try {
    comunes = await deps.comunes();
  } catch (e) {
    errorComun = mensaje(e);
  }
  const resumen: ResumenOvs = { semana, hoy, tiendas: [], correo: 'sin-tiendas' };
  const paraCorreo: TiendaCorreo[] = [];
  const errores: string[] = [];
  for (const t of tiendas) {
    let r: { correo: TiendaCorreo; corrida: CorridaGuardar };
    try {
      if (!comunes) throw new Error(errorComun);
      r = await calcularTienda(t, comunes, hoy, semana, deps);
    } catch (e) {
      r = conError(t, semana, mensaje(e));
    }
    let guardada = true;
    try {
      await deps.guardar(r.corrida);
    } catch (e) {
      guardada = false;
      r.correo.avisos.push(`No se pudo guardar la corrida: ${mensaje(e)}`);
      errores.push(`${t.company_id}: no se guardó (${mensaje(e)})`);
    }
    if (r.corrida.estado === 'error') errores.push(`${t.company_id}: ${r.corrida.error}`);
    paraCorreo.push(r.correo);
    const sugeridas = r.corrida.lineas.filter((l) => l.sugerido > 0);
    resumen.tiendas.push({
      company_id: t.company_id,
      nombre: t.nombre,
      estado: r.corrida.estado,
      error: r.corrida.error,
      guardada,
      lineas: r.corrida.lineas.length,
      sugeridas: sugeridas.length,
      monto: Math.round(sugeridas.reduce((s, l) => s + (l.monto ?? 0), 0) * 100) / 100,
    });
  }
  if (tiendas.length) {
    const { asunto, html } = correoOvs(semana, paraCorreo);
    resumen.correo = await deps.enviar(comunes?.correos ?? CORREOS_OVS, asunto, html);
  }
  await anotar({
    ok: !errores.length && resumen.correo !== 'fallo',
    resumen: { ...resumen, correo: resumen.correo === 'no-configurado' ? 'correo no configurado' : resumen.correo },
    error: errores.length ? errores.join(' · ') : null,
  });
  return resumen;
}

/** Dependencias de producción: llave de servicio (portal) y el puente al sitio viejo (legado.ts). */
export function depsReales(db: SupabaseClient): DepsOvs {
  let recetas: Promise<{ datos: DatosConsumo | null; catalogo: CatalogoNombres | undefined }> | null = null;
  return {
    ahora: () => new Date(),
    tiendas: async () => {
      const r = await com(db)
        .from('com_ovs_tiendas')
        .select('company_id,apertura_id,nombre')
        .eq('activo', true)
        .order('company_id');
      if (r.error) throw new Error('No se pudieron leer las tiendas del piloto.');
      return (r.data ?? []).map((x: { company_id: unknown; apertura_id: unknown; nombre: unknown }) => ({
        company_id: Number(x.company_id),
        apertura_id: String(x.apertura_id),
        nombre: String(x.nombre),
      }));
    },
    comunes: async () => {
      const [catalogo, mapa, insumoSku, cfg, apertura] = await Promise.all([
        leerTodoCom<FilaCatalogoOv>(db, 'com_catalogo', 'sku,nombre,estatus,costo_unitario', 'sku'),
        leerTodoCom<{ shopify_nombre: string; sku: string }>(db, 'com_sku_mapping', 'shopify_nombre,sku', 'id'),
        leerTodoCom<InsumoSku>(db, 'com_insumo_sku', 'insumo_id,sku,factor,activo', 'sku'),
        com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
        pedidosAperturaLegado(),
      ]);
      if (!apertura.ok) throw new Error(apertura.error);
      return {
        catalogo: catalogo.map((c) => ({
          ...c,
          costo_unitario: c.costo_unitario == null ? null : Number(c.costo_unitario),
        })),
        mapa,
        insumoSku: insumoSku.map((m) => ({ ...m, factor: Number(m.factor) })),
        pedidosApertura: apertura.datos.map((p) => p.pedido_id),
        correos: correosOvs(cfg.error ? null : cfg.data?.config),
      };
    },
    pedidos: async (aperturaId, desde) => {
      const r = await pedidosPlanLegado((q) => q.eq('apertura_id', aperturaId).gte('fecha_pedido', desde));
      if (!r.ok) throw new Error(r.error);
      return r.datos;
    },
    consumo: async (companyId, desde, hasta) => {
      const cfg = configDe(companyId);
      if (!cfg) return { ok: false, motivo: 'La sucursal no está configurada en Sucursales.' };
      recetas ??= (async () => ({ datos: await recetasServicio(db), catalogo: await catalogoServicio(db) }))();
      const { datos, catalogo } = await recetas;
      if (!datos) return { ok: false, motivo: 'No se pudieron leer las recetas.' };
      // Sin catálogo POS el consumo saldría menor (productos sin código): mejor no calcular (como consumo-mes).
      if (!catalogo) return { ok: false, motivo: 'No se pudo leer el catálogo POS.' };
      return consumoVentana({
        cfg,
        desde,
        hasta,
        datos,
        catalogo,
        deps: { leer: leerDias, rappi: (c) => rappiServicio(db, c) },
      });
    },
    anterior: async (companyId, semana) => {
      const previa = masDias(semana, -7);
      const c = await com(db)
        .from('com_ovs_corridas')
        .select('id')
        .eq('company_id', companyId)
        .eq('semana', previa)
        .eq('estado', 'ok')
        .maybeSingle();
      if (c.error) throw new Error('No se pudo leer la corrida de la semana anterior.');
      if (!c.data) return null;
      const l = await com(db).from('com_ovs_lineas').select('sku,sugerido,arrastre').eq('corrida_id', c.data.id);
      if (l.error) throw new Error('No se pudieron leer las líneas de la semana anterior.');
      return {
        semana: previa,
        lineas: (l.data ?? []).map((x: { sku: string; sugerido: unknown; arrastre: unknown }) => ({
          sku: x.sku,
          sugerido: Number(x.sugerido),
          arrastre: Number(x.arrastre),
        })),
      };
    },
    guardar: async (c) => {
      const r = await com(db).rpc('com_ovs_guardar', {
        p_semana: c.semana,
        p_company: c.company_id,
        p_cadencia: c.cadencia,
        p_estado: c.estado,
        p_error: c.error,
        p_lineas: c.lineas,
      });
      if (r.error) throw new Error(`com_ovs_guardar: ${r.error.message}`);
    },
    bitacora: async (f) => {
      const r = await com(db).from('com_sync_log').insert({ proceso: PROCESO_OVS, ...f });
      if (r.error) throw new Error(`com_sync_log: ${r.error.message}`);
    },
    enviar: (para, asunto, html) => enviarCorreoInterno(para, asunto, html),
  };
}
```

- [ ] **Step 6: Escribir la ruta y el cron**

Crear `app/api/comercializadora/ov-sugerida/route.ts`:

```ts
import { correrOvs, depsReales } from '@/lib/comercializadora/ovSugeridaServidor';
import { autorizadoCron } from '@/lib/cron';
import { clienteServicio } from '@/lib/sucursales/corte-servidor';

export const runtime = 'nodejs';
// Tres tiendas × 28 días del POS (4 lecturas a la vez) más el puente: holgado dentro de 300 s.
export const maxDuration = 300;

/**
 * Piloto de orden de venta sugerida (spec 2026-11-18): Vercel Cron los lunes 12:00 UTC (06:00 CDMX) con
 * `Authorization: Bearer CRON_SECRET`. Solo escribe sus tablas (com_ovs_*), la bitácora y manda el correo interno.
 */
export async function GET(req: Request) {
  if (!autorizadoCron(req)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = clienteServicio();
  if (!db) return Response.json({ error: 'Falta la llave de servicio de Supabase.' }, { status: 503 });
  try {
    return Response.json(await correrOvs(depsReales(db)));
  } catch (e) {
    console.error('[comercializadora] ov-sugerida', e instanceof Error ? e.message : e);
    return Response.json({ error: 'La orden de venta sugerida no se pudo calcular.' }, { status: 500 });
  }
}
```

Reemplazar `vercel.json` completo:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/sucursales/corte", "schedule": "*/10 * * * *" },
    { "path": "/api/sucursales/corte?dias=8", "schedule": "30 11 * * *" },
    { "path": "/api/comercializadora/ov-sugerida", "schedule": "0 12 * * 1" }
  ]
}
```

- [ ] **Step 7: Correr las pruebas**

Run: `npx vitest run tests/portal/ov-sugerida-servidor.test.ts tests/portal/ov-sugerida-ruta.test.ts tests/portal/bi-corte.test.ts tests/portal/corte-catalogo.test.ts`
Expected: PASS (8 + 6 nuevas; las del corte sin cambios).

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add lib/cron.ts lib/comercializadora/ovSugeridaServidor.ts app/api/comercializadora/ov-sugerida/route.ts app/api/sucursales/corte/route.ts vercel.json tests/portal/ov-sugerida-servidor.test.ts tests/portal/ov-sugerida-ruta.test.ts
git commit -m "feat(comercializadora): corrida semanal de la OV sugerida (ruta, cron de los lunes y bitácora com-ovs)"
```

---

### Task 6: Guía y verificación final

**Files:**
- Modify: `docs/migracion/comercializadora.md` (sección 15 al final)

**Interfaces:**
- Consumes: todo lo anterior. Produces: la guía de operación del piloto.

- [ ] **Step 1: Agregar la sección 15 a la guía**

Al final de `docs/migracion/comercializadora.md`:

```markdown
## 15. Orden de venta sugerida, piloto (spec 2026-11-18)

- **Qué hace:** cada lunes 06:00 CDMX (cron de Vercel `0 12 * * 1` → `GET /api/comercializadora/ov-sugerida`, con `CRON_SECRET`) calcula la orden sugerida de las tiendas activas de `com_ovs_tiendas` (La Mexicana 519/411, Pasaje Parián 460/354, Avándaro 463/347), la guarda en `com_ovs_corridas`/`com_ovs_lineas` y manda un correo. No escribe nada en Shopify ni en Zoho.
- **Cálculo** (`lib/comercializadora/ovSugerida.ts`): pedidos de resurtido de la apertura (reglas de `serieDiaria`), cadencia = mediana de días entre pedidos de 90 días en [7, 30] (14 con menos de 2), consumo por receta de `hoy-28 … hoy-1` con el motor de Sucursales, insumo → SKU con `com_insumo_sku`, calibración `k` en [0.8, 1.5], fuera de receta por historial (÷ 90), menos lo pedido hoy, más el arrastre de la semana anterior (±1 paquete). Inactivos fuera (se avisan).
- **Variables en Vercel:** `CORREO_URL` y `CORREO_LLAVE` (las mismas de las funciones). Sin ellas la corrida se guarda y `com_sync_log` dice "correo no configurado". **Excepción:** este correo sale aunque `COM_EFECTOS_EXTERNOS` esté apagado, porque solo va a direcciones internas.
- **Destinatarios:** `com_plan_config.config.ovs.correos`; si no está, `compras@mx.thecoffee.jp` y `scervera@mx.thecoffee.jp`. Para cambiarlos (SQL Editor del portal):
  `update com_plan_config set config = jsonb_set(config, '{ovs}', '{"correos":["compras@mx.thecoffee.jp"]}'::jsonb), version = version + 1 where id = 1;`
- **Mapeo insumo → SKU:** `com_insumo_sku` (`factor` = unidades del insumo por paquete; un solo SKU activo por insumo). La migración 72 cargó el del ejercicio por nombre exacto del insumo; para ver qué no resolvió:
  `select count(*) from com_insumo_sku;` (esperado 50) y el correo lista "Insumos de receta sin SKU". Se corrige con insert/update en el SQL Editor (todavía no hay pantalla).
- **Bitácora:** `select inicio, ok, error, resumen from com_sync_log where proceso = 'com-ovs' order by inicio desc limit 5;`
- **Correr a mano** (repite la semana, no duplica): `curl.exe -H "Authorization: Bearer <CRON_SECRET>" https://<dominio del portal>/api/comercializadora/ov-sugerida`. Lo hace el usuario; el secreto no se pega en chats ni en commits.
- **Apagar el piloto:** `update com_ovs_tiendas set activo = false;` (la ruta corre y no hace nada) o quitar el cron de `vercel.json`.
```

- [ ] **Step 2: Formato**

Run: `npx prettier --write lib/cron.ts lib/comercializadora/ovSugerida.ts lib/comercializadora/ovConsumo.ts lib/comercializadora/ovCorreo.ts lib/comercializadora/correoServidor.ts lib/comercializadora/ovSugeridaServidor.ts app/api/comercializadora/ov-sugerida/route.ts app/api/sucursales/corte/route.ts tests/portal/ov-sugerida.test.ts tests/portal/ov-consumo.test.ts tests/portal/ov-correo.test.ts tests/portal/correo-servidor.test.ts tests/portal/ov-sugerida-servidor.test.ts tests/portal/ov-sugerida-ruta.test.ts`
Expected: lista de archivos formateados, sin errores.

Run: `npm run format:check`
Expected: "All matched files use Prettier code style!". En Windows, si solo reporta archivos que este plan no tocó (fin de línea CRLF de la copia de trabajo), revisar los del plan con `npx prettier --check --end-of-line auto <los archivos del Step 2>` y esperar el mismo mensaje.

- [ ] **Step 3: Suite completa, tipos y build**

Run: `npm test`
Expected: todo verde. Si algo falla fuera de los archivos de este plan, confirmar que también falla en `origin/main` antes de seguir (`git worktree add $env:TEMP\ovs-main origin/main`, `npm ci` y la misma prueba ahí; luego `git worktree remove $env:TEMP\ovs-main`) y anotarlo en el PR.

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto; la lista de rutas incluye `ƒ /api/comercializadora/ov-sugerida`.

Run: `git diff origin/main --stat -- package.json package-lock.json`
Expected: vacío (sin dependencias nuevas).

- [ ] **Step 4: Commit**

```bash
git add docs/migracion/comercializadora.md lib app tests/portal
git commit -m "docs(comercializadora): guía del piloto de OV sugerida"
```

(Si Step 2 no cambió nada, el commit lleva solo la guía.)

- [ ] **Step 5: PR (con OK del usuario)**

Con OK del usuario: `git push -u origin feat/ov-sugerida-piloto` y PR contra `main`. La descripción dice:
- que **integrar aplica la migración 72 en producción** (tablas nuevas, carga del mapeo por nombre y las 3 tiendas; no toca `insumos` ni `com_catalogo`);
- que el cron corre el siguiente lunes 12:00 UTC y que hay que poner `CORREO_URL` y `CORREO_LLAVE` en Vercel (si no, guarda y no manda);
- las decisiones 1 (ya pedido = lo pedido hoy) y 2 (arrastre de la semana anterior) para revisión;
- la verificación de después del merge: `select count(*) from com_insumo_sku;` (50 esperado) y la primera fila `com-ovs` de `com_sync_log`.
```
