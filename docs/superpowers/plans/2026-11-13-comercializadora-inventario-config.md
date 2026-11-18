# Comercializadora: Inventario, Catálogo, Kit y Configuración (plan 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en el portal se pueda hacer lo que hoy se hace en el sitio viejo para el inventario y la configuración del cálculo:
- ver el inventario con su semáforo;
- ajustar y contar el 3PL;
- editar los datos de compra de cada artículo (lead time, piezas por apertura, mínimo, múltiplo, días de seguridad, mín/máx manual);
- editar el kit de apertura;
- cambiar la configuración del cálculo con su historial.

Antes de todo, corrige un defecto del plan 2: tres columnas que en el sitio viejo son calculadas.

**Architecture:** Igual que el plan 3: route group `app/(comercializadora)`, server components que leen con la sesión, client components en `components/comercializadora/`, cálculos puros en `lib/comercializadora/` portados del HTML viejo y escrituras en server actions con `editorCom()`.

Dos cosas cambian:
- El ajuste de 3PL pasa a una función de Postgres, para que el cambio de saldo y su movimiento queden en **una sola transacción**. El sitio viejo lo hacía en dos pasos con reversa a mano.
- La configuración reutiliza `planCfgDef`/`mergeCfg` de `supabase/functions/_shared/planEngine.ts`, que ya tiene prueba de paridad con el HTML viejo, en lugar de copiarlos.

**Tech Stack:** Next.js 16, React, Tailwind, Supabase (Postgres/RLS; PGlite en pruebas), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (Fase 1 · Pantallas). Antecede: plan 3 (`2026-11-13-comercializadora-pantallas-compras.md`, PR #113). Sigue: plan 3c (Planear, KPIs, Traspasos, Mapeo, Crédito) y plan 4 (paridad y cutover).

## Decisiones (al planear, 2026-11-13)

1. **Defecto del plan 2, se corrige primero.** En bliocjvq, `com_minmax.minimo`, `com_minmax.maximo` y `com_kit_apertura.kit` son columnas generadas (`coalesce(manual, calc)`). En la migración 45 quedaron como columnas normales: tras la corrida de `com-minmax` en el portal, 27 de 159 SKUs ya tienen `minimo` desfasado, y `zoho-generar-oc` los lee. La migración 48 las vuelve generadas, igual que en el viejo. La copia ya ignora columnas generadas (`is_generated = 'NEVER'`).
2. **El CEDIS no se ajusta en el portal.** Su inventario viene de Zoho (`COM_ZOHO_MANDA = true` en el viejo bloquea los ajustes y conteos de CEDIS). Solo se ajusta y cuenta el **3PL** (`saldo_yulius`).
3. **Ajuste y conteo de 3PL atómicos.** Van en `public.com_ajustar_3pl(...)` (security invoker, así la RLS aplica). Cambia el saldo solo si no cambió desde que se leyó (`is not distinct from`, como `_planConteoGuardar`) e inserta el movimiento `ajuste`, todo o nada. El "ajuste por línea" del viejo (`_comGuardarAjuste`, sin verificación ni reversa) y el "conteo físico" quedan en una sola pantalla con dos modos: sumar/restar y fijar saldo.
4. **Quién autoriza** sale de `public.com_autorizadores()`: perfiles activos con Comercializadora `edicion` o `desarrollador`. Sustituye a la RPC vieja, que leía `usuarios` por rol.
5. **No se portan:**
   - **Nuevo SKU y Clasificar SKU.** Escriben `tipo_producto`, que no existe en `com_catalogo`, y el catálogo lo da Zoho.
   - **Asignar proveedor e Importar costos.** `zoho-sync` ya trae el costo y el proveedor preferido (`catalogoZoho.ts`).
   - **"Actualizar desde Zoho".** `zoho-sync` corre cada 30 min.
6. **Días de crédito: solo lectura.** El servidor los toma de `com_zoho_proveedor.dias_credito`, que `zoho-sync` llena desde los términos de pago de Zoho. El viejo los editaba en `com_proveedores`, que el cálculo del servidor ni lee. En el portal se muestran con la nota "se editan en Zoho".
7. **`auto.modo` es de solo lectura en el portal hasta el cutover** (plan 4). Mientras el viejo esté en Real, nadie debe poder pasar el portal a Real desde la pantalla.
8. **Configuración: se editan** los bloques `inv`, `consumo`, `picos`, `temp.activa`/`temp.mes`, `eventos`, `seg` (sin prefijos), `aper` (sin `ajustes`), `compra` y `auto` (sin `modo`). **Se conservan sin editar** `seg.prefijo`, `temp.prefijo`, `aper.ajustes`, `imp`, `cafe`, `zoho_oc` y `kpi`: se guardan tal cual y sus pantallas llegan en el plan 3c. "Revertir" del historial regresa el valor al borrador sin guardar, igual que el viejo.

## Global Constraints

- Las del plan 3: ruta `/comercializadora/*`, acceso `perfil_modulos`, día de CDMX, piezas de `components/portal/piezas.tsx`, montos MXN, pruebas `npm test` + `npm run typecheck` + prettier sobre lo tocado.
- Migración nueva: `supabase/migrations/20261113000048_comercializadora_inventario.sql`. Se aplica en producción **solo con el OK del usuario**, igual que la 45–47: directo por `DATABASE_URL` en una transacción y registrada en `supabase_migrations.schema_migrations`.
- Mientras el viejo esté en Real, en producción no se hacen ajustes, ediciones de catálogo ni cambios de configuración durante la revisión (la copia en espejo los borraría).

## Review Focus

1. **Dos personas ajustan el mismo SKU de 3PL a la vez, o el saldo cambia entre que se lee y se guarda.** Ningún ajuste se aplica a medias. El que llegó tarde recibe "el saldo cambió" y no se escribe nada de su lote (Tarea 1).
2. **Un `lectura` llama las acciones de catálogo, kit, configuración o ajuste.** Recibe el error de solo lectura sin tocar la base (Tareas 3 a 7).
3. **Dos personas guardan la configuración a la vez.** La segunda no pisa a la primera sin saberlo: el `update` exige la misma `version` (Tarea 7).
4. **Valores fuera de rango, vacíos o con coma decimal** en catálogo, kit, configuración y conteo. Se rechazan o normalizan como en el viejo: rangos de `planEngine`, lead time 0–365 y `_planConteoCantidad` (Tareas 2, 4, 6).
5. **El portal intenta pasar a Real.** No hay control que lo permita, y una acción llamada con `auto.modo = 'real'` lo ignora (Tarea 7).

---

### Task 1: Migración 48 — columnas generadas, ajuste de 3PL atómico y autorizadores

**Files:**
- Create: `supabase/migrations/20261113000048_comercializadora_inventario.sql`
- Create: `tests/db/comercializadora-inventario.test.ts`

**Interfaces:**
- Produces:
  - `com_minmax.minimo`/`maximo` y `com_kit_apertura.kit` generadas.
  - `public.com_ajustar_3pl(p_lineas jsonb, p_realizado text, p_autorizado text, p_fecha_conteo date, p_motivo text) returns integer`. `p_lineas` es `[{sku, actual, nuevo, costo}]`; devuelve las líneas aplicadas.
  - `public.com_autorizadores() returns table(nombre text)`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/db/comercializadora-inventario.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

describe('migración 48', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
    await db.exec(`
      insert into com_catalogo (sku, nombre, saldo_yulius) values ('A', 'Café', 10), ('B', 'Vasos', null);
      insert into com_minmax (sku, lead_time, minimo_calc, maximo_calc) values ('A', 5, 20, 40);
      insert into com_kit_apertura (sku, promedio_calc) values ('A', 3);`);
  });

  it('minimo, maximo y kit son coalesce(manual, calculado) y no se pueden escribir', async () => {
    await db.exec(`update com_minmax set minimo_manual = 25 where sku = 'A'; update com_kit_apertura set manual = 7 where sku = 'A';`);
    const r = await db.query<{ minimo: string; maximo: string; kit: string }>(
      `select minimo, maximo, (select kit from com_kit_apertura where sku = 'A') kit from com_minmax where sku = 'A'`);
    expect(r.rows[0]).toEqual({ minimo: '25', maximo: '40', kit: '7' });
    await expect(db.exec(`update com_minmax set minimo = 1`)).rejects.toThrow(/can only be updated to DEFAULT|generated/i);
  });

  it('ajuste de 3PL: cambia el saldo y registra el movimiento en una sola operación', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    const n = await comoUsuario(db, id, async () =>
      num((await db.query<{ n: number }>(
        `select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', '2026-11-13', 'Conteo físico') n`,
        [JSON.stringify([{ sku: 'A', actual: 10, nuevo: 12, costo: 50 }, { sku: 'B', actual: null, nuevo: 4, costo: null }])],
      )).rows[0].n));
    expect(n).toBe(2);
    const s = await db.query<{ sku: string; saldo_yulius: string }>(`select sku, saldo_yulius from com_catalogo order by sku`);
    expect(s.rows.map((x) => [x.sku, Number(x.saldo_yulius)])).toEqual([['A', 12], ['B', 4]]);
    const m = await db.query(`select sku, tipo, cantidad::float8 c, cantidad_original::float8 o, saldo_nuevo::float8 sn, origen, destino, estado, motivo, realizado_por, autorizado_por, fecha_conteo::text f, costo_unitario_momento::float8 cu from com_movimientos order by sku`);
    expect(m.rows[0]).toMatchObject({ sku: 'A', tipo: 'ajuste', c: 2, o: 10, sn: 12, origen: 'YULIUS', destino: 'YULIUS', estado: 'aplicado', motivo: 'Conteo físico', realizado_por: 'Ana', autorizado_por: 'Luis', f: '2026-11-13', cu: 50 });
    expect(m.rows[1]).toMatchObject({ sku: 'B', c: 4, o: 0 });
  });

  it('si un saldo cambió desde que se leyó, no se aplica nada del lote', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await expect(
      comoUsuario(db, id, () =>
        db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', '2026-11-13', 'Merma')`, [
          JSON.stringify([{ sku: 'A', actual: 10, nuevo: 9, costo: 50 }, { sku: 'B', actual: 3, nuevo: 1, costo: null }]),
        ]),
      ),
    ).rejects.toThrow(/El saldo de B cambió/);
    const s = await db.query<{ saldo_yulius: string | null }>(`select saldo_yulius from com_catalogo order by sku`);
    expect(s.rows.map((x) => x.saldo_yulius)).toEqual(['10', null]);
    expect((await db.query(`select * from com_movimientos`)).rows).toHaveLength(0);
  });

  it('saldo negativo y sin diferencia se rechazan', async () => {
    await expect(db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', null, 'Merma')`, [JSON.stringify([{ sku: 'A', actual: 10, nuevo: -1 }])])).rejects.toThrow(/negativo/);
    await expect(db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', null, 'Merma')`, [JSON.stringify([])])).rejects.toThrow(/Ninguna línea/);
  });

  it('lectura no puede ajustar (la RLS de com_catalogo lo impide)', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'lectura');
    await expect(
      comoUsuario(db, id, () => db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', null, 'Merma')`, [JSON.stringify([{ sku: 'A', actual: 10, nuevo: 9 }])])),
    ).rejects.toThrow(/cambió|permission denied/);
    expect((await db.query<{ s: string }>(`select saldo_yulius s from com_catalogo where sku = 'A'`)).rows[0].s).toBe('10');
  });

  it('autorizadores: activos con edición o desarrollador; nada para quien no tiene el módulo', async () => {
    const ed = await crearUsuario(db, 'interno');
    await darModulo(db, ed, 'comercializadora', 'edicion');
    const lec = await crearUsuario(db, 'franquiciado');
    await darModulo(db, lec, 'comercializadora', 'lectura');
    const sin = await crearUsuario(db, 'admin');
    const nombres = (uid: string) => comoUsuario(db, uid, async () => (await db.query<{ nombre: string }>(`select nombre from com_autorizadores()`)).rows.map((r) => r.nombre));
    expect(await nombres(lec)).toEqual(['Usuario interno']);
    expect(await nombres(sin)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/db/comercializadora-inventario.test.ts`
Expected: FAIL (`function com_ajustar_3pl does not exist`, y el update a `minimo` sí se permite).

- [ ] **Step 3: Migración**

Crear `supabase/migrations/20261113000048_comercializadora_inventario.sql`:

```sql
-- Comercializadora · plan 3b (decisiones 1, 3 y 4).

-- 1. Defecto del plan 2: en bliocjvq estas columnas son generadas (coalesce(manual, calculado)). zoho-generar-oc lee
--    minimo/maximo; como columnas normales quedaban desfasadas tras cada corrida de com-minmax.
alter table public.com_minmax drop column minimo, drop column maximo;
alter table public.com_minmax
  add column minimo numeric generated always as (coalesce(minimo_manual, minimo_calc)) stored,
  add column maximo numeric generated always as (coalesce(maximo_manual, maximo_calc)) stored;
alter table public.com_kit_apertura drop column kit;
alter table public.com_kit_apertura add column kit numeric generated always as (coalesce(manual, promedio_calc)) stored;

-- 2. Ajuste/conteo de 3PL en una sola transacción (_planConteoGuardar sin la reversa a mano). Security invoker: la RLS
--    de com_catalogo (update) y com_movimientos (insert) exige Comercializadora con edición. El saldo solo cambia si
--    sigue igual al que vio la persona; si no, se aborta todo el lote.
create function public.com_ajustar_3pl(
  p_lineas jsonb, p_realizado text, p_autorizado text, p_fecha_conteo date, p_motivo text
) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  l jsonb;
  v_sku text;
  v_actual numeric;
  v_nuevo numeric;
  v_n integer := 0;
  v_folio text := 'AJ-' || to_char(now() at time zone 'America/Mexico_City', 'YYYYMMDDHH24MISS');
begin
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Ninguna línea para ajustar';
  end if;
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_sku := l->>'sku';
    v_actual := nullif(l->>'actual', '')::numeric;
    v_nuevo := (l->>'nuevo')::numeric;
    if v_nuevo is null or v_nuevo < 0 then
      raise exception 'El ajuste de % dejaría un saldo negativo o vacío', v_sku;
    end if;
    if coalesce(v_actual, 0) = v_nuevo then
      continue;
    end if;
    update public.com_catalogo
       set saldo_yulius = v_nuevo, yulius_actualizado_at = now()
     where sku = v_sku and saldo_yulius is not distinct from v_actual;
    if not found then
      raise exception 'El saldo de % cambió desde que lo viste; revisa y vuelve a guardar', v_sku;
    end if;
    v_n := v_n + 1;
    insert into public.com_movimientos
      (tipo, sku, folio, cantidad, cantidad_original, saldo_nuevo, origen, destino, estado, fecha, motivo,
       realizado_por, autorizado_por, fecha_conteo, costo_unitario_momento)
    values
      ('ajuste', v_sku, v_folio || '-' || v_n, v_nuevo - coalesce(v_actual, 0), coalesce(v_actual, 0), v_nuevo,
       'YULIUS', 'YULIUS', 'aplicado', (now() at time zone 'America/Mexico_City')::date, p_motivo,
       p_realizado, p_autorizado, p_fecha_conteo, nullif(l->>'costo', '')::numeric);
  end loop;
  if v_n = 0 then
    raise exception 'Ninguna línea difiere del saldo: no hay nada que ajustar';
  end if;
  return v_n;
end $$;
revoke all on function public.com_ajustar_3pl(jsonb, text, text, date, text) from public, anon;
grant execute on function public.com_ajustar_3pl(jsonb, text, text, date, text) to authenticated;

-- 3. Quién autoriza un ajuste: perfiles activos con Comercializadora edición/desarrollador (sustituye a la RPC vieja
--    com_autorizadores_inventario, que leía usuarios por rol). Solo para quien ya lee Comercializadora.
create function public.com_autorizadores() returns table (nombre text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.nombre
  from public.perfiles p
  join public.perfil_modulos pm on pm.user_id = p.user_id and pm.modulo = 'comercializadora'
  where p.activo and pm.nivel in ('desarrollador', 'edicion') and public.com_puede_leer()
  order by p.nombre
$$;
revoke all on function public.com_autorizadores() from public, anon;
grant execute on function public.com_autorizadores() to authenticated;
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/db/comercializadora-inventario.test.ts tests/db/comercializadora.test.ts tests/db/guardia-lectura.test.ts && npx vitest run tests/migracion-legado/comercializadora.test.ts`
Expected: PASS. La copia sigue pasando porque `columnasPortal` ya excluye columnas generadas. Si una prueba de la copia inserta `minimo`/`maximo`/`kit` explícitos, se ajusta la prueba (y se registra en el ledger), no la copia.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261113000048_comercializadora_inventario.sql tests/db/comercializadora-inventario.test.ts
git commit -m "fix(db): mín/máx y kit generados como en el viejo; ajuste de 3PL atómico y autorizadores"
```

---

### Task 2: Cálculos de Inventario y del conteo (port de `renderComInventario`, `_comInvSemaforo`, `_planConteoCantidad`, `_planConteoPegar`)

**Files:**
- Create: `lib/comercializadora/inventario.ts`
- Test: `tests/portal/com-inventario.test.ts`

**Interfaces:**
- Consumes: `saldoCedis`, `enCamino` (`quepedir.ts`); `ArticuloCatalogo`, `LineaOcZoho` (`tipos.ts`).
- Produces:
  - `semaforo(disp, camino, mm): 'rojo' | 'amarillo' | 'verde' | null`
  - `comprometido(ventas): Record<string, number>`
  - `filasInventario(d: DatosInventario): FilaInventario[]`
  - `valorInventario(cat): { valor: number; sinCosto: number }`
  - `cantidadConteo(txt: string): number | null`
  - `pegarConteo(txt: string): { sku: string; cantidad: number }[]`
  - `tresPlViejo(c, hoy, dias = 15): boolean`

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-inventario.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cantidadConteo,
  comprometido,
  filasInventario,
  pegarConteo,
  semaforo,
  tresPlViejo,
  valorInventario,
} from '../../lib/comercializadora/inventario';

const cat = (o: Record<string, unknown>) => ({
  sku: 'A', nombre: 'Café', categoria: 'Insumos', estatus: 'Activo', zoho_stock: 12, zoho_stock_fisico: 10,
  zoho_sync_at: 'x', saldo_cedis: 0, saldo_yulius: 5, yulius_actualizado_at: '2026-11-01T00:00:00Z', costo_unitario: 50,
  zoho_vendor_id: 'v1', zoho_vendor_name: 'Prov', ...o,
});

describe('inventario (port de renderComInventario)', () => {
  it('semáforo: rojo ≤ mínimo, amarillo ≤ mínimo + 7 × venta, verde; sin min/máx = null', () => {
    const mm = { minimo: 20, venta_diaria: 2 };
    expect(semaforo(15, 5, mm)).toBe('rojo');
    expect(semaforo(30, 0, mm)).toBe('amarillo');
    expect(semaforo(35, 0, mm)).toBe('verde');
    expect(semaforo(1, 0, null)).toBeNull();
  });
  it('comprometido = ventas por enviar por SKU', () => {
    expect(comprometido([{ sku: 'A', cantidad: 3 }, { sku: 'A', cantidad: 2 }, { sku: 'B', cantidad: 1 }])).toEqual({ A: 5, B: 1 });
  });
  it('fila: disponible con 3PL solo si inv.yulius no es false; cobertura redondeada; contable solo con sync', () => {
    const d = {
      catalogo: [cat({}) as never],
      minmax: [{ sku: 'A', minimo: 20, maximo: 40, minimo_manual: null, maximo_manual: 45, venta_diaria: 2 }],
      ventas: [{ sku: 'A', cantidad: 4 }],
      lineas: [{ sku: 'A', status: 'open', cantidad: 9, cantidad_recibida: 0 }],
      yulius: true,
    };
    const [f] = filasInventario(d);
    expect(f).toMatchObject({ fisico: 10, contable: 12, comprometido: 4, disponible: 15, camino: 9, minimo: 20, maximo: 40, maxManual: true, minManual: false, cobertura: 12, estado: 'amarillo', tresPl: 5 }); // posición 24 ≤ 20 + 7×2
    expect(filasInventario({ ...d, yulius: false })[0].disponible).toBe(10);
    expect(filasInventario({ ...d, catalogo: [cat({ zoho_sync_at: null, saldo_cedis: 7 }) as never] })[0]).toMatchObject({ fisico: 7, contable: null });
  });
  it('valor del inventario: CEDIS + 3PL siempre, solo activos con costo; cuenta los que tienen stock sin costo', () => {
    expect(valorInventario([cat({}) as never, cat({ sku: 'B', costo_unitario: null }) as never, cat({ sku: 'C', estatus: 'Inactivo' }) as never])).toEqual({ valor: 750, sinCosto: 1 });
  });
  it('3PL sin actualizar: con saldo y más de 15 días', () => {
    expect(tresPlViejo(cat({}) as never, '2026-11-20')).toBe(true);
    expect(tresPlViejo(cat({}) as never, '2026-11-10')).toBe(false);
    expect(tresPlViejo(cat({ saldo_yulius: 0 }) as never, '2026-12-30')).toBe(false);
  });
});

describe('conteo (port de _planConteoCantidad y _planConteoPegar)', () => {
  it('números al estilo es-MX', () => {
    expect(cantidadConteo('1,200')).toBe(1200);
    expect(cantidadConteo('1,5')).toBe(1.5);
    expect(cantidadConteo('1.200,50')).toBe(1200.5);
    expect(cantidadConteo('12')).toBe(12);
    expect(cantidadConteo('')).toBeNull();
    expect(cantidadConteo('-3')).toBeNull();
    expect(cantidadConteo('abc')).toBeNull();
  });
  it('pegar desde Excel: tab, ; , o espacio; suma repetidos; tolera encabezado', () => {
    expect(pegarConteo('SKU\tCantidad\nA\t3\nB;2\nA 1,5\n\n')).toEqual([{ sku: 'A', cantidad: 4.5 }, { sku: 'B', cantidad: 2 }]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-inventario.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

Crear `lib/comercializadora/inventario.ts`:

```ts
import { difDias } from './fechas';
import { enCamino, saldoCedis } from './quepedir';
import type { ArticuloCatalogo, LineaOcZoho } from './tipos';

const n = (x: unknown) => Number(x) || 0;

export interface ArticuloInventario extends ArticuloCatalogo {
  categoria: string | null;
  estatus: string | null;
  yulius_actualizado_at: string | null;
}
export interface MinMaxInventario {
  sku: string;
  minimo: number | null;
  maximo: number | null;
  minimo_manual: number | null;
  maximo_manual: number | null;
  venta_diaria: number | null;
}
export interface DatosInventario {
  catalogo: ArticuloInventario[];
  minmax: MinMaxInventario[];
  ventas: { sku: string; cantidad: number }[];
  lineas: LineaOcZoho[];
  yulius: boolean;
}
export interface FilaInventario {
  sku: string;
  nombre: string;
  categoria: string;
  estatus: string;
  proveedor: string;
  fisico: number;
  contable: number | null;
  comprometido: number;
  disponible: number;
  camino: number;
  minimo: number | null;
  maximo: number | null;
  minManual: boolean;
  maxManual: boolean;
  venta: number;
  cobertura: number | null;
  estado: 'rojo' | 'amarillo' | 'verde' | null;
  tresPl: number;
  costo: number | null;
}

/** _comInvSemaforo: con posición = disponible + en camino. */
export function semaforo(disp: number, camino: number, mm: { minimo: number | null; venta_diaria: number | null } | null) {
  if (!mm) return null;
  const pos = disp + camino;
  if (pos <= n(mm.minimo)) return 'rojo' as const;
  if (pos <= n(mm.minimo) + 7 * n(mm.venta_diaria)) return 'amarillo' as const;
  return 'verde' as const;
}

/** Comprometido por SKU: suma de ventas por enviar (renderComInventario no filtra por días). */
export function comprometido(ventas: { sku: string; cantidad: number }[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const v of ventas) r[v.sku] = (r[v.sku] ?? 0) + n(v.cantidad);
  return r;
}

/** Filas de la tabla de Inventario. El disponible no resta lo comprometido (el físico de Zoho ya lo incluye). */
export function filasInventario(d: DatosInventario): FilaInventario[] {
  const mm = new Map(d.minmax.map((m) => [m.sku, m]));
  const comp = comprometido(d.ventas);
  const cam = enCamino(d.lineas);
  return d.catalogo.map((c) => {
    const m = mm.get(c.sku) ?? null;
    const fisico = saldoCedis(c);
    const disponible = fisico + (d.yulius ? n(c.saldo_yulius) : 0);
    const camino = n(cam[c.sku]);
    const venta = n(m?.venta_diaria);
    return {
      sku: c.sku,
      nombre: c.nombre ?? '',
      categoria: c.categoria ?? '',
      estatus: c.estatus ?? '',
      proveedor: c.zoho_vendor_name ?? '',
      fisico,
      contable: c.zoho_sync_at == null ? null : n(c.zoho_stock),
      comprometido: n(comp[c.sku]),
      disponible,
      camino,
      minimo: m?.minimo ?? null,
      maximo: m?.maximo ?? null,
      minManual: m?.minimo_manual != null,
      maxManual: m?.maximo_manual != null,
      venta,
      cobertura: venta > 0 ? Math.round((disponible + camino) / venta) : null,
      estado: semaforo(disponible, camino, m),
      tresPl: n(c.saldo_yulius),
      costo: n(c.costo_unitario) > 0 ? Number(c.costo_unitario) : null,
    };
  });
}

/** KPI "Valor total de inventario (CEDIS + 3PL)": siempre suma 3PL; solo activos con costo; cuenta los que tienen stock sin costo. */
export function valorInventario(cat: ArticuloInventario[]): { valor: number; sinCosto: number } {
  let valor = 0;
  let sinCosto = 0;
  for (const c of cat) {
    if (c.estatus === 'Inactivo') continue;
    const stock = saldoCedis(c) + n(c.saldo_yulius);
    if (n(c.costo_unitario) > 0) valor += stock * Number(c.costo_unitario);
    else if (stock > 0) sinCosto++;
  }
  return { valor, sinCosto };
}

/** Etiqueta "3PL sin actualizar": saldo de 3PL y su fecha de actualización a más de `dias` días de hoy. */
export function tresPlViejo(c: ArticuloInventario, hoy: string, dias = 15): boolean {
  if (!(n(c.saldo_yulius) > 0)) return false;
  if (!c.yulius_actualizado_at) return true;
  return difDias(c.yulius_actualizado_at.slice(0, 10), hoy) > dias;
}

/** _planConteoCantidad: "1,200" → 1200, "1,5" → 1.5, "1.200,50" → 1200.5; vacío, negativo o texto → null. */
export function cantidadConteo(txt: string): number | null {
  let t = String(txt ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** _planConteoPegar: líneas "SKU<sep>cantidad" (tab, ;, coma o espacio); suma repetidos; ignora encabezado y vacías. */
export function pegarConteo(txt: string): { sku: string; cantidad: number }[] {
  const r = new Map<string, number>();
  for (const linea of String(txt ?? '').split(/\r?\n/)) {
    const m = linea.trim().match(/^(\S+?)[\t; ]+(.+)$/) ?? linea.trim().match(/^([^,]+),(.+)$/);
    if (!m) continue;
    const cant = cantidadConteo(m[2]);
    if (cant == null) continue;
    r.set(m[1], (r.get(m[1]) ?? 0) + cant);
  }
  return [...r.entries()].map(([sku, cantidad]) => ({ sku, cantidad }));
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-inventario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/inventario.ts tests/portal/com-inventario.test.ts
git commit -m "feat(comercializadora): cálculos de Inventario y del conteo portados del sitio viejo"
```

---

### Task 3: Pantalla Inventario con ajuste y conteo de 3PL

**Files:**
- Create: `app/(comercializadora)/comercializadora/inventario/page.tsx`, `components/comercializadora/inventario.tsx`, `components/comercializadora/ajuste-3pl.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`ajustar3pl`), `components/portal/navegacion.tsx`
- Test: `tests/portal/com-correcciones.test.ts` (agregar), `tests/portal/com-inventario-pantalla.test.tsx`

**Interfaces:**
- Consumes: Tarea 1 (`com_ajustar_3pl`, `com_autorizadores`), Tarea 2 (`filasInventario`, `valorInventario`, `tresPlViejo`, `cantidadConteo`, `pegarConteo`), `editorCom`/`Resultado`/`SOLO_LECTURA`/`fallo` (plan 3).
- Produces: `ajustar3pl(f: FormAjuste3pl): Promise<Resultado<{ aplicadas: number }>>`, con `FormAjuste3pl = { realizado: string; autorizado: string; fecha_conteo: string; motivo: string; lineas: { sku: string; actual: number | null; nuevo: number; costo: number | null }[] }`.

- [ ] **Step 1: Pruebas que fallan**

Agregar a `tests/portal/com-correcciones.test.ts` (importando `ajustar3pl` desde las acciones). La base falsa necesita `rpc`: agregar a `dbFalsa` en `tests/portal/db-falsa.ts` la propiedad `rpc: vi.fn()` vía un parámetro opcional `rpc?: (fn: string, args: unknown) => { data: unknown; error: unknown }`, devuelto en `db.rpc`:

```ts
describe('plan 3b · ajuste de 3PL', () => {
  const form = { realizado: 'Ana', autorizado: 'Luis', fecha_conteo: '2026-11-13', motivo: 'Conteo físico', lineas: [{ sku: 'A', actual: 10, nuevo: 12, costo: 50 }] };
  it('valida antes de llamar: autorizador, fecha futura, motivo y negativos', async () => {
    const llamadas: unknown[] = [];
    m.db = { ...dbFalsa({}).db, rpc: async (...a: unknown[]) => (llamadas.push(a), { data: 1, error: null }) };
    expect(await ajustar3pl({ ...form, autorizado: '' })).toEqual({ error: 'Selecciona quién autoriza este ajuste' });
    expect(await ajustar3pl({ ...form, fecha_conteo: '2999-01-01' })).toEqual({ error: 'La fecha del conteo no puede ser futura' });
    expect(await ajustar3pl({ ...form, lineas: [{ sku: 'A', actual: 10, nuevo: -1, costo: null }] })).toEqual({ error: 'A: el ajuste dejaría el saldo en -1 — no puede ser negativo' });
    expect(llamadas).toEqual([]);
  });
  it('llama com_ajustar_3pl con el lote y devuelve las aplicadas; el error de la base llega claro', async () => {
    let args: unknown;
    m.db = { ...dbFalsa({}).db, rpc: async (fn: string, a: unknown) => ((args = [fn, a]), { data: 1, error: null }) };
    expect(await ajustar3pl(form)).toEqual({ ok: true, aplicadas: 1 });
    expect(args).toEqual(['com_ajustar_3pl', { p_lineas: form.lineas, p_realizado: 'Ana', p_autorizado: 'Luis', p_fecha_conteo: '2026-11-13', p_motivo: 'Conteo físico' }]);
    m.db = { ...dbFalsa({}).db, rpc: async () => ({ data: null, error: { code: 'P0001', message: 'El saldo de A cambió desde que lo viste; revisa y vuelve a guardar' } }) };
    expect(await ajustar3pl(form)).toEqual({ error: 'El saldo de A cambió desde que lo viste; revisa y vuelve a guardar' });
  });
});
```

Crear `tests/portal/com-inventario-pantalla.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ ajustar3pl: vi.fn() }));
import { Inventario } from '../../components/comercializadora/inventario';

const fila = (o: Record<string, unknown>) => ({
  sku: 'A', nombre: 'Café', categoria: 'Insumos', estatus: 'Activo', proveedor: 'Prov', fisico: 10, contable: 12, comprometido: 0,
  disponible: 10, camino: 0, minimo: 20, maximo: 40, minManual: false, maxManual: false, venta: 1, cobertura: 10,
  estado: 'rojo', tresPl: 0, costo: 50, ...o,
});

describe('Inventario', () => {
  it('filtra por búsqueda y por "solo faltantes"', async () => {
    render(<Inventario filas={[fila({}), fila({ sku: 'B', nombre: 'Vasos', disponible: 0, fisico: 0 })] as never} valor={{ valor: 500, sinCosto: 0 }} viejos={[]} ultimoSync={null} hoy="2026-11-13" editable={false} autorizadores={[]} saldos3pl={{}} />);
    expect(screen.getByText('Café')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estatus'), 'faltantes');
    expect(screen.queryByText('Café')).not.toBeInTheDocument();
    expect(screen.getByText('Vasos')).toBeInTheDocument();
  });
  it('sin permiso de edición no muestra "Ajustar 3PL"', () => {
    render(<Inventario filas={[fila({})] as never} valor={{ valor: 0, sinCosto: 0 }} viejos={[]} ultimoSync={null} hoy="2026-11-13" editable={false} autorizadores={[]} saldos3pl={{}} />);
    expect(screen.queryByRole('button', { name: /Ajustar 3PL/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-correcciones.test.ts tests/portal/com-inventario-pantalla.test.tsx`
Expected: FAIL (`ajustar3pl` y `Inventario` no existen).

- [ ] **Step 3: Implementar**

En `tests/portal/db-falsa.ts`, firma `dbFalsa(tablas, fallar = [], rpc?: (fn: string, args: unknown) => { data: unknown; error: unknown })` y devolver `db: { from, rpc: async (fn: string, args: unknown) => (rpc ? rpc(fn, args) : { data: null, error: null }) }`.

Agregar a `acciones.ts`:

```ts
export interface FormAjuste3pl {
  realizado: string;
  autorizado: string;
  fecha_conteo: string;
  motivo: string;
  lineas: { sku: string; actual: number | null; nuevo: number; costo: number | null }[];
}

const MOTIVOS_AJUSTE = ['Conteo físico', 'Merma', 'Reposición', 'Corrección de error', 'Ingreso 3PL', 'Otro'];

/** Ajuste/conteo de 3PL (plan 3b, decisiones 2 y 3): valida como _comGuardarAjuste/_planConteoGuardar y aplica todo o nada. */
export async function ajustar3pl(f: FormAjuste3pl): Promise<Resultado<{ aplicadas: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    if (!f.autorizado?.trim()) return { error: 'Selecciona quién autoriza este ajuste' };
    if (f.fecha_conteo && f.fecha_conteo > hoyCdmx()) return { error: 'La fecha del conteo no puede ser futura' };
    if (!MOTIVOS_AJUSTE.includes(f.motivo)) return { error: 'Elige el motivo del ajuste' };
    if (!f.lineas.length) return { error: 'Agrega al menos una línea' };
    for (const l of f.lineas) {
      if (!(Number.isFinite(l.nuevo) && l.nuevo >= 0)) return { error: `${l.sku}: el ajuste dejaría el saldo en ${l.nuevo} — no puede ser negativo` };
    }
    const r = await com(s.db).rpc('com_ajustar_3pl', {
      p_lineas: f.lineas,
      p_realizado: f.realizado?.trim() || s.perfil.nombre,
      p_autorizado: f.autorizado.trim(),
      p_fecha_conteo: f.fecha_conteo || null,
      p_motivo: f.motivo,
    });
    if (r.error) return r.error.code === 'P0001' ? { error: String(r.error.message) } : fallo(r.error);
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, aplicadas: Number(r.data) || 0 };
  } catch (e) {
    return fallo(e);
  }
}
```

Crear `app/(comercializadora)/comercializadora/inventario/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Inventario } from '@/components/comercializadora/inventario';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { filasInventario, tresPlViejo, valorInventario, type ArticuloInventario, type MinMaxInventario } from '@/lib/comercializadora/inventario';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import type { LineaOcZoho } from '@/lib/comercializadora/tipos';

export default async function InventarioPagina() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const [catalogo, minmax, ventas, lineas, sync, config, aut] = await Promise.all([
    leerTodoCom<ArticuloInventario>(db, 'com_catalogo', 'sku,nombre,categoria,estatus,zoho_stock,zoho_stock_fisico,zoho_sync_at,saldo_cedis,saldo_yulius,yulius_actualizado_at,costo_unitario,zoho_vendor_id,zoho_vendor_name', 'sku'),
    leerTodoCom<MinMaxInventario>(db, 'com_minmax', 'sku,minimo,maximo,minimo_manual,maximo_manual,venta_diaria', 'sku'),
    leerTodoCom<{ id: string; sku: string; cantidad: number }>(db, 'com_movimientos', 'id,sku,cantidad', 'id', (q) => q.eq('tipo', 'venta').eq('estado', 'por_enviar')),
    leerTodoCom<LineaOcZoho & { zoho_po_id: string }>(db, 'com_zoho_oc_lineas', 'zoho_po_id,sku,status,cantidad,cantidad_recibida', 'zoho_po_id', (q) => q.order('sku')),
    com(db).from('com_sync_log').select('fin').eq('proceso', 'zoho-sync').eq('ok', true).order('inicio', { ascending: false }).limit(1),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    com(db).rpc('com_autorizadores'),
  ]);
  const editable = puedeEditarCom(accesos);
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Inventario" descripcion="Existencias de Zoho (CEDIS) y del 3PL, con su cobertura y semáforo." />
      <Inventario
        filas={filasInventario({ catalogo, minmax, ventas, lineas, yulius: config.data?.config?.inv?.yulius !== false })}
        valor={valorInventario(catalogo)}
        viejos={catalogo.filter((c) => tresPlViejo(c, hoy)).map((c) => c.sku)}
        ultimoSync={sync.data?.[0]?.fin ?? null}
        hoy={hoy}
        editable={editable}
        autorizadores={((aut.data ?? []) as { nombre: string }[]).map((a) => a.nombre)}
        saldos3pl={Object.fromEntries(catalogo.map((c) => [c.sku, c.saldo_yulius == null ? null : Number(c.saldo_yulius)]))}
      />
    </>
  );
}
```

Crear `components/comercializadora/inventario.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Boxes, PackageX } from 'lucide-react';
import { Kpi, Pill, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero, pesos } from '@/lib/comercializadora/formato';
import type { FilaInventario } from '@/lib/comercializadora/inventario';
import { DescargarCsv } from './descargar-csv';
import { Ajuste3pl } from './ajuste-3pl';

const POR_PAGINA = 25;
const TONO: Record<string, Estado> = { rojo: 'pierde', amarillo: 'bajo', verde: 'ok' };
const ESTATUS = ['Activo', 'Compra Recurrente', 'Prueba', 'Hasta Agotar Existencias', 'Inactivo'];

export function Inventario(p: {
  filas: FilaInventario[];
  valor: { valor: number; sinCosto: number };
  viejos: string[];
  ultimoSync: string | null;
  hoy: string;
  editable: boolean;
  autorizadores: string[];
  saldos3pl: Record<string, number | null>;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [est, setEst] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [ajuste, setAjuste] = useState(false);
  const texto = q.trim().toLowerCase();
  const categorias = [...new Set(p.filas.map((f) => f.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const visibles = p.filas.filter(
    (f) =>
      (!texto || f.sku.toLowerCase().includes(texto) || f.nombre.toLowerCase().includes(texto)) &&
      (!cat || f.categoria === cat) &&
      (!est || (est === 'faltantes' ? f.disponible <= 0 : f.estatus === est)),
  );
  const viejos = new Set(p.viejos);
  const minutos = p.ultimoSync ? Math.round((new Date(p.hoy + 'T12:00:00Z').getTime() - new Date(p.ultimoSync).getTime()) / 60000) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi etiqueta="Valor total de inventario (CEDIS + 3PL)" valor={pesos(p.valor.valor)} nota={p.valor.sinCosto ? `${p.valor.sinCosto} SKUs con stock pero sin costo no se incluyen` : undefined} icono={Boxes} />
        <Kpi etiqueta="Faltantes (disponible ≤ 0)" valor={p.filas.filter((f) => f.disponible <= 0 && f.estatus !== 'Inactivo').length} icono={PackageX} tono="bajo" />
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {p.ultimoSync ? `Última sincronización con Zoho: ${new Date(p.ultimoSync).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}` : 'Todavía no hay sincronización con Zoho.'}
        {minutos != null && minutos > 120 ? ' · revisa la conexión' : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Buscar artículo" placeholder="Buscar SKU o nombre" value={q} onChange={(e) => setQ(e.target.value)} className={`${claseCampo} max-w-xs`} />
        <select aria-label="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} className={`${claseCampo} max-w-xs`}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Estatus" value={est} onChange={(e) => setEst(e.target.value)} className={`${claseCampo} max-w-xs`}>
          <option value="">Todos los estatus</option>
          {ESTATUS.map((e) => <option key={e} value={e}>{e}</option>)}
          <option value="faltantes">Solo faltantes</option>
        </select>
        {p.editable ? (
          <button type="button" onClick={() => setAjuste(true)} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Ajustar 3PL</button>
        ) : null}
        <DescargarCsv
          nombre={`inventario-${p.hoy}.csv`}
          filas={visibles as unknown as Record<string, unknown>[]}
          columnas={[['sku', 'SKU'], ['nombre', 'Nombre'], ['categoria', 'Categoria'], ['fisico', 'CEDIS'], ['comprometido', 'Comprometido'], ['disponible', 'Disponible'], ['tresPl', '3PL'], ['estatus', 'Estatus']]}
        />
      </div>
      {ajuste ? <Ajuste3pl filas={p.filas} saldos={p.saldos3pl} autorizadores={p.autorizadores} hoy={p.hoy} alCerrar={() => setAjuste(false)} /> : null}
      {visibles.length === 0 ? (
        <Vacio titulo="Sin artículos con estos filtros" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>SKU</th><th className="text-right">Físico (Zoho)</th><th className="text-right">Contable (Zoho)</th><th className="text-right">Comprometido</th>
                <th className="text-right">Disponible</th><th className="text-right">En camino</th><th className="text-right">Mín</th><th className="text-right">Máx</th>
                <th className="text-right">Venta/día</th><th className="text-right">Cobertura (días)</th><th>Estado</th><th className="text-right">3PL</th><th>Estatus</th><th>Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => (
                <tr key={f.sku}>
                  <td><div className="font-medium">{f.nombre}</div><div className="text-xs text-muted-foreground">{f.sku} · {f.categoria}</div></td>
                  <td className="text-right tabular-nums">{numero(f.fisico)}</td>
                  <td className="text-right tabular-nums">{f.contable == null ? '—' : numero(f.contable)}</td>
                  <td className="text-right tabular-nums">{numero(f.comprometido)}</td>
                  <td className="text-right font-semibold tabular-nums">{numero(f.disponible)}</td>
                  <td className="text-right tabular-nums">{numero(f.camino)}</td>
                  <td className="text-right tabular-nums">{f.minimo == null ? '—' : `${numero(f.minimo)}${f.minManual ? ' ✎' : ''}`}</td>
                  <td className="text-right tabular-nums">{f.maximo == null ? '—' : `${numero(f.maximo)}${f.maxManual ? ' ✎' : ''}`}</td>
                  <td className="text-right tabular-nums">{numero(f.venta)}</td>
                  <td className="text-right tabular-nums">{f.cobertura == null ? '—' : f.cobertura}</td>
                  <td>{f.estado ? <Pill estado={TONO[f.estado]}>{f.estado === 'rojo' ? 'Pedir' : f.estado === 'amarillo' ? 'Atento' : 'Bien'}</Pill> : '—'}</td>
                  <td className="text-right tabular-nums">{numero(f.tresPl)}{viejos.has(f.sku) ? <div className="text-xs text-warn">3PL sin actualizar</div> : null}</td>
                  <td>{f.estatus}</td>
                  <td>{f.proveedor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visibles.length > ver ? (
        <button type="button" onClick={() => setVer(ver + POR_PAGINA)} className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">Ver más</button>
      ) : null}
    </div>
  );
}
```

Crear `components/comercializadora/ajuste-3pl.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { cantidadConteo, pegarConteo, type FilaInventario } from '@/lib/comercializadora/inventario';
import { ajustar3pl } from '@/app/(comercializadora)/comercializadora/acciones';

const MOTIVOS = ['Conteo físico', 'Merma', 'Reposición', 'Corrección de error', 'Ingreso 3PL', 'Otro'];
type Linea = { sku: string; modo: 'diff' | 'set'; cantidad: string };

export function Ajuste3pl(p: { filas: FilaInventario[]; saldos: Record<string, number | null>; autorizadores: string[]; hoy: string; alCerrar: () => void }) {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState('');
  const [fecha, setFecha] = useState(p.hoy);
  const [motivo, setMotivo] = useState('Conteo físico');
  const [lineas, setLineas] = useState<Linea[]>([{ sku: '', modo: 'set', cantidad: '' }]);
  const [pegado, setPegado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const porSku = new Map(p.filas.map((f) => [f.sku, f]));
  const calc = (l: Linea) => {
    const actual = p.saldos[l.sku] ?? null;
    const c = l.modo === 'diff' ? Number(String(l.cantidad).replace(',', '.')) : cantidadConteo(l.cantidad);
    if (!l.sku || c == null || !Number.isFinite(c)) return null;
    const nuevo = l.modo === 'set' ? c : (actual ?? 0) + c;
    return { actual, nuevo, costo: porSku.get(l.sku)?.costo ?? null };
  };
  const impacto = lineas.reduce((s, l) => {
    const r = calc(l);
    return r && r.costo != null ? s + (r.nuevo - (r.actual ?? 0)) * r.costo : s;
  }, 0);

  const guardar = () =>
    iniciar(async () => {
      const lote = [];
      for (const l of lineas.filter((x) => x.sku || x.cantidad)) {
        if (!porSku.has(l.sku)) return setError(`SKU no encontrado: ${l.sku || '(vacío)'}`);
        const r = calc(l);
        if (!r) return setError(`${l.sku}: cantidad inválida (usa un número)`);
        lote.push({ sku: l.sku, actual: r.actual, nuevo: Math.round(r.nuevo * 1e4) / 1e4, costo: r.costo });
      }
      const res = await ajustar3pl({ realizado: '', autorizado, fecha_conteo: fecha, motivo, lineas: lote });
      if ('error' in res) return setError(res.error);
      p.alCerrar();
      router.refresh();
    });

  return (
    <Tarjeta titulo="Ajuste o conteo del 3PL" descripcion="El CEDIS se ajusta en Zoho Books; aquí solo el 3PL.">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Autoriza
          <select className={claseCampo} value={autorizado} onChange={(e) => setAutorizado(e.target.value)}>
            <option value="">Elige…</option>
            {p.autorizadores.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-sm">Fecha del conteo<input type="date" max={p.hoy} className={claseCampo} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label className="text-sm">Motivo
          <select className={claseCampo} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {lineas.map((l, i) => {
          const r = calc(l);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input aria-label={`SKU ${i + 1}`} list="skus-3pl" className={`${claseCampo} max-w-48`} value={l.sku} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, sku: e.target.value.trim() } : x)))} />
              <select aria-label={`Modo ${i + 1}`} className={`${claseCampo} max-w-44`} value={l.modo} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, modo: e.target.value as Linea['modo'] } : x)))}>
                <option value="set">Fijar saldo final</option>
                <option value="diff">Sumar / restar</option>
              </select>
              <input aria-label={`Cantidad ${i + 1}`} inputMode="decimal" className={`${claseCampo} max-w-32`} value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
              <span className="text-muted-foreground">{r ? `${r.actual ?? 0} → ${r.nuevo}` : ''}</span>
            </div>
          );
        })}
        <datalist id="skus-3pl">{p.filas.map((f) => <option key={f.sku} value={f.sku}>{f.nombre}</option>)}</datalist>
        <button type="button" onClick={() => setLineas([...lineas, { sku: '', modo: 'set', cantidad: '' }])} className="text-sm font-semibold underline">Agregar línea</button>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Pegar desde Excel (SKU y cantidad)</summary>
        <textarea aria-label="Pegar conteo" className={`${claseCampo} mt-2 h-24`} value={pegado} onChange={(e) => setPegado(e.target.value)} />
        <button type="button" onClick={() => setLineas(pegarConteo(pegado).map((x) => ({ sku: x.sku, modo: 'set', cantidad: String(x.cantidad) })))} className="mt-2 text-sm font-semibold underline">Usar lo pegado</button>
      </details>
      <p className="mt-3 text-sm">Impacto: <b>{pesos(impacto)}</b></p>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={pendiente} onClick={guardar} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">{pendiente ? 'Guardando…' : 'Guardar ajuste'}</button>
        <button type="button" onClick={p.alCerrar} className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold">Cerrar</button>
      </div>
    </Tarjeta>
  );
}
```

En `components/portal/navegacion.tsx`, agregar al grupo `'Planear y pagar'` el enlace `{ href: '/comercializadora/inventario', nombre: 'Inventario', icono: Boxes }` (importar `Boxes` de `lucide-react`).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-correcciones.test.ts tests/portal/com-inventario-pantalla.test.tsx tests/portal/com-inventario.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(comercializadora)" components/comercializadora components/portal/navegacion.tsx tests/portal
git commit -m "feat(comercializadora): Inventario con ajuste y conteo de 3PL"
```

---

### Task 4: Catálogo (lead time, piezas por apertura, mínimo, múltiplo, seguridad, mín/máx manual)

**Files:**
- Create: `lib/comercializadora/catalogo.ts`, `app/(comercializadora)/comercializadora/catalogo/page.tsx`, `components/comercializadora/catalogo.tsx`
- Modify: `acciones.ts` (`guardarCampoCatalogo`, `guardarMinMaxManual`), `navegacion.tsx`
- Test: `tests/portal/com-catalogo.test.ts`, agregar a `tests/portal/com-correcciones.test.ts`

**Interfaces:**
- Produces:
  - `CAMPOS_CATALOGO: Record<CampoCatalogo, { etiqueta; min; vacio: number | null; entero: boolean }>`
  - `validarCampo(campo, txt): { valor: number | null } | { error: string }`
  - `validarMinMax(minTxt, maxTxt): { min: number | null; max: number | null } | { error: string }`
  - Acciones `guardarCampoCatalogo(sku, campo, txt)` y `guardarMinMaxManual(sku, minTxt, maxTxt)`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-catalogo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validarCampo, validarMinMax } from '../../lib/comercializadora/catalogo';

describe('catálogo (port de _planEditarCampo y _comEditarMinMax)', () => {
  it('lead time: vacío = 0, 0–365, redondeado', () => {
    expect(validarCampo('lt', '')).toEqual({ valor: 0 });
    expect(validarCampo('lt', '12.6')).toEqual({ valor: 13 });
    expect(validarCampo('lt', '400')).toEqual({ error: 'El lead time debe ser un número de 0 a 365 días (vacío o 0 = sin capturar)' });
  });
  it('apertura, mínimo y seguridad ≥ 0; múltiplo ≥ 1; seguridad vacía = null', () => {
    expect(validarCampo('apertura', '2.5')).toEqual({ valor: 2.5 });
    expect(validarCampo('minimo', '-1')).toEqual({ error: 'Ingresa un número mayor o igual a 0' });
    expect(validarCampo('multiplo', '0')).toEqual({ error: 'Ingresa un número mayor o igual a 1' });
    expect(validarCampo('dseg', '')).toEqual({ valor: null });
  });
  it('mín/máx manual: vacío = usar el calculado; ≥ 0; máx ≥ mín', () => {
    expect(validarMinMax('', '')).toEqual({ min: null, max: null });
    expect(validarMinMax('10', '')).toEqual({ min: 10, max: null });
    expect(validarMinMax('-1', '5')).toEqual({ error: 'Valores inválidos: el mínimo y el máximo deben ser números de 0 o más.' });
    expect(validarMinMax('10', '5')).toEqual({ error: 'Valores inválidos: el máximo debe ser ≥ mínimo.' });
  });
});
```

Agregar a `tests/portal/com-correcciones.test.ts` (importando `guardarCampoCatalogo, guardarMinMaxManual`):

```ts
describe('plan 3b · catálogo', () => {
  it('lead time hace upsert en com_lead_times y registra historial con el valor anterior', async () => {
    const f = dbFalsa({ com_lead_times: [{ sku: 'A', dias: 5 }], com_catalogo: [{ sku: 'A' }] });
    m.db = f.db;
    expect(await guardarCampoCatalogo('A', 'lt', '9')).toEqual({ ok: true });
    expect(f.tablas.com_lead_times).toEqual([{ sku: 'A', dias: 9 }]);
    expect(f.tablas.com_plan_config_historial[0]).toMatchObject({ ambito: 'sku', clave: 'A:lead_time', valor_anterior: 5, valor_nuevo: 9 });
    expect(await guardarCampoCatalogo('B', 'lt', '3')).toEqual({ ok: true });
    expect(f.tablas.com_lead_times).toContainEqual(expect.objectContaining({ sku: 'B', dias: 3 }));
  });
  it('campo de com_catalogo inexistente: "el artículo ya no existe"', async () => {
    m.db = dbFalsa({ com_catalogo: [] }).db;
    expect(await guardarCampoCatalogo('Z', 'multiplo', '2')).toEqual({ error: 'Sin permiso para modificar este dato o el artículo ya no existe' });
  });
  it('mín/máx manual: actualiza com_minmax y registra ambito minmax', async () => {
    const f = dbFalsa({ com_minmax: [{ sku: 'A', minimo_manual: null, maximo_manual: null }] });
    m.db = f.db;
    expect(await guardarMinMaxManual('A', '10', '20')).toEqual({ ok: true });
    expect(f.tablas.com_minmax[0]).toMatchObject({ minimo_manual: 10, maximo_manual: 20 });
    expect(f.tablas.com_plan_config_historial[0]).toMatchObject({ ambito: 'minmax', clave: 'A', valor_nuevo: { minimo_manual: 10, maximo_manual: 20 } });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-catalogo.test.ts tests/portal/com-correcciones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Crear `lib/comercializadora/catalogo.ts`:

```ts
export type CampoCatalogo = 'lt' | 'apertura' | 'minimo' | 'multiplo' | 'dseg';

/** _planEditarCampo: columna destino, mínimo permitido y qué significa "vacío". */
export const CAMPOS_CATALOGO: Record<CampoCatalogo, { etiqueta: string; columna: string; min: number; vacio: number | null; entero: boolean }> = {
  lt: { etiqueta: 'Lead time (días)', columna: 'dias', min: 0, vacio: 0, entero: true },
  apertura: { etiqueta: 'Piezas por apertura', columna: 'cantidad_por_apertura', min: 0, vacio: 0, entero: false },
  minimo: { etiqueta: 'Mínimo de compra (pzas)', columna: 'minimo_compra_pzas', min: 0, vacio: 0, entero: false },
  multiplo: { etiqueta: 'Múltiplo de compra', columna: 'multiplo_compra', min: 1, vacio: 1, entero: false },
  dseg: { etiqueta: 'Días de seguridad', columna: 'dias_seguridad', min: 0, vacio: null, entero: false },
};

const num = (txt: string) => {
  const t = String(txt ?? '').trim().replace(',', '.');
  return t === '' ? null : Number(t);
};

export function validarCampo(campo: CampoCatalogo, txt: string): { valor: number | null } | { error: string } {
  const c = CAMPOS_CATALOGO[campo];
  const v = num(txt);
  if (v === null) return { valor: c.vacio };
  if (campo === 'lt') {
    if (!Number.isFinite(v) || v < 0 || v > 365) return { error: 'El lead time debe ser un número de 0 a 365 días (vacío o 0 = sin capturar)' };
    return { valor: Math.round(v) };
  }
  if (!Number.isFinite(v) || v < c.min) return { error: `Ingresa un número mayor o igual a ${c.min}` };
  return { valor: c.entero ? Math.round(v) : v };
}

/** _comEditarMinMax: vacío = usar el calculado (null); ambos ≥ 0 y máx ≥ mín cuando los dos van. */
export function validarMinMax(minTxt: string, maxTxt: string): { min: number | null; max: number | null } | { error: string } {
  const min = num(minTxt);
  const max = num(maxTxt);
  if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)))
    return { error: 'Valores inválidos: el mínimo y el máximo deben ser números de 0 o más.' };
  if (min !== null && max !== null && max < min) return { error: 'Valores inválidos: el máximo debe ser ≥ mínimo.' };
  return { min, max };
}
```

Agregar a `acciones.ts` (`import { CAMPOS_CATALOGO, validarCampo, validarMinMax, type CampoCatalogo } from '@/lib/comercializadora/catalogo';`):

```ts
/** Historial del plan (_planCfgLog): autor y hora los pone el trigger com_plan_sello_usuario. */
async function registrarHistorial(db: unknown, ambito: string, clave: string, antes: unknown, despues: unknown) {
  await com(db).from('com_plan_config_historial').insert({ ambito, clave, valor_anterior: antes ?? null, valor_nuevo: despues ?? null });
}

/** _planEditarCampo: lead time en com_lead_times (upsert); el resto en com_catalogo. Registra historial ambito 'sku'. */
export async function guardarCampoCatalogo(sku: string, campo: CampoCatalogo, txt: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    if (!(campo in CAMPOS_CATALOGO)) return { error: 'Campo no válido' };
    const v = validarCampo(campo, txt);
    if ('error' in v) return v;
    if (campo === 'lt') {
      const antes = await com(s.db).from('com_lead_times').select('dias').eq('sku', sku).maybeSingle();
      if (antes.error) return fallo(antes.error);
      const r = antes.data
        ? await com(s.db).from('com_lead_times').update({ dias: v.valor }).eq('sku', sku).select('sku')
        : await com(s.db).from('com_lead_times').insert({ sku, dias: v.valor }).select('sku');
      if (r.error) return fallo(r.error);
      await registrarHistorial(s.db, 'sku', `${sku}:lead_time`, antes.data?.dias ?? null, v.valor);
    } else {
      const col = CAMPOS_CATALOGO[campo].columna;
      const antes = await com(s.db).from('com_catalogo').select(col).eq('sku', sku).maybeSingle();
      if (antes.error) return fallo(antes.error);
      if (!antes.data) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
      const r = await com(s.db).from('com_catalogo').update({ [col]: v.valor }).eq('sku', sku).select('sku');
      if (r.error) return fallo(r.error);
      if (!r.data?.length) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
      await registrarHistorial(s.db, 'sku', `${sku}:${col}`, antes.data[col] ?? null, v.valor);
    }
    revalidatePath('/comercializadora', 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comEditarMinMax: mínimo/máximo manual (vacío = calculado); minimo/maximo se recalculan solos (columnas generadas). */
export async function guardarMinMaxManual(sku: string, minTxt: string, maxTxt: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const v = validarMinMax(minTxt, maxTxt);
    if ('error' in v) return v;
    const antes = await com(s.db).from('com_minmax').select('minimo_manual,maximo_manual').eq('sku', sku).maybeSingle();
    if (antes.error) return fallo(antes.error);
    if (!antes.data) return { error: 'Ese artículo no tiene mín/máx calculado todavía' };
    const nuevo = { minimo_manual: v.min, maximo_manual: v.max };
    const r = await com(s.db).from('com_minmax').update(nuevo).eq('sku', sku).select('sku');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
    await registrarHistorial(s.db, 'minmax', sku, antes.data, nuevo);
    revalidatePath('/comercializadora', 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

Crear `app/(comercializadora)/comercializadora/catalogo/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Catalogo } from '@/components/comercializadora/catalogo';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';

export interface ArticuloCatalogoFila {
  sku: string;
  nombre: string | null;
  estatus: string | null;
  zoho_vendor_name: string | null;
  zoho_lead_time: number | null;
  cantidad_por_apertura: number | null;
  minimo_compra_pzas: number | null;
  multiplo_compra: number | null;
  dias_seguridad: number | null;
}

export default async function CatalogoPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [catalogo, lts, minmax] = await Promise.all([
    leerTodoCom<ArticuloCatalogoFila>(db, 'com_catalogo', 'sku,nombre,estatus,zoho_vendor_name,zoho_lead_time,cantidad_por_apertura,minimo_compra_pzas,multiplo_compra,dias_seguridad', 'sku', (q) => q.neq('estatus', 'Inactivo')),
    leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
    leerTodoCom<{ sku: string; minimo_calc: number; maximo_calc: number; minimo_manual: number | null; maximo_manual: number | null }>(db, 'com_minmax', 'sku,minimo_calc,maximo_calc,minimo_manual,maximo_manual', 'sku'),
  ]);
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Catálogo" descripcion="Datos de compra de cada artículo. El costo, el proveedor y el estatus vienen de Zoho." />
      <Catalogo
        filas={catalogo}
        leadTimes={Object.fromEntries(lts.map((l) => [l.sku, l.dias]))}
        minmax={Object.fromEntries(minmax.map((m) => [m.sku, m]))}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}
```

Crear `components/comercializadora/catalogo.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { CAMPOS_CATALOGO, type CampoCatalogo } from '@/lib/comercializadora/catalogo';
import { guardarCampoCatalogo, guardarMinMaxManual } from '@/app/(comercializadora)/comercializadora/acciones';
import type { ArticuloCatalogoFila } from '@/app/(comercializadora)/comercializadora/catalogo/page';

const POR_PAGINA = 25;
type MM = { minimo_calc: number; maximo_calc: number; minimo_manual: number | null; maximo_manual: number | null };
const COLUMNA: Record<Exclude<CampoCatalogo, 'lt'>, keyof ArticuloCatalogoFila> = {
  apertura: 'cantidad_por_apertura',
  minimo: 'minimo_compra_pzas',
  multiplo: 'multiplo_compra',
  dseg: 'dias_seguridad',
};

export function Catalogo(p: { filas: ArticuloCatalogoFila[]; leadTimes: Record<string, number | null>; minmax: Record<string, MM>; editable: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({});
  const [pendiente, iniciar] = useTransition();
  const texto = q.trim().toLowerCase();
  const visibles = p.filas.filter((f) => !texto || f.sku.toLowerCase().includes(texto) || String(f.nombre ?? '').toLowerCase().includes(texto) || String(f.zoho_vendor_name ?? '').toLowerCase().includes(texto));

  const correr = (clave: string, fn: () => Promise<{ error: string } | { ok: true }>) =>
    iniciar(async () => {
      const r = await fn();
      setMsg((m) => ({ ...m, [clave]: 'error' in r ? { ok: false, t: r.error } : { ok: true, t: 'Guardado' } }));
      if (!('error' in r)) router.refresh();
    });

  const celda = (f: ArticuloCatalogoFila, campo: CampoCatalogo) => {
    const valor = campo === 'lt' ? p.leadTimes[f.sku] : f[COLUMNA[campo as Exclude<CampoCatalogo, 'lt'>]];
    const clave = `${f.sku}:${campo}`;
    return (
      <td key={campo} className="min-w-28 text-right">
        {p.editable ? (
          <input
            aria-label={`${CAMPOS_CATALOGO[campo].etiqueta} de ${f.sku}`}
            inputMode="decimal"
            defaultValue={valor == null ? '' : String(valor)}
            onBlur={(e) => {
              if (e.target.value !== (valor == null ? '' : String(valor))) correr(clave, () => guardarCampoCatalogo(f.sku, campo, e.target.value));
            }}
            className={`${claseCampo} h-9 text-right`}
            disabled={pendiente}
          />
        ) : (
          <span className="tabular-nums">{valor == null ? '—' : numero(Number(valor))}</span>
        )}
        {msg[clave] ? <div role={msg[clave].ok ? 'status' : 'alert'} className={`text-xs ${msg[clave].ok ? 'text-muted-foreground' : 'text-bad'}`}>{msg[clave].t}</div> : null}
      </td>
    );
  };

  return (
    <div className="space-y-5">
      <input type="search" aria-label="Buscar artículo" placeholder="Buscar SKU, nombre o proveedor" value={q} onChange={(e) => setQ(e.target.value)} className={`${claseCampo} max-w-sm`} />
      {visibles.length === 0 ? (
        <Vacio titulo="Sin artículos con esta búsqueda" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th><th className="text-right">Lead time (días)</th><th className="text-right">Pzas por apertura</th>
                <th className="text-right">Mín. compra (pzas)</th><th className="text-right">Múltiplo</th><th className="text-right">Días de seguridad</th><th>Mín / Máx</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => {
                const mm = p.minmax[f.sku];
                const clave = `${f.sku}:minmax`;
                return (
                  <tr key={f.sku}>
                    <td><div className="font-medium">{f.nombre}</div><div className="text-xs text-muted-foreground">{f.sku} · {f.zoho_vendor_name ?? 'sin proveedor'}{f.zoho_lead_time != null ? ` · LT Zoho ${f.zoho_lead_time}` : ''}</div></td>
                    {(['lt', 'apertura', 'minimo', 'multiplo', 'dseg'] as CampoCatalogo[]).map((c) => celda(f, c))}
                    <td className="min-w-56">
                      {mm ? (
                        p.editable ? (
                          <form
                            className="flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const d = new FormData(e.currentTarget);
                              correr(clave, () => guardarMinMaxManual(f.sku, String(d.get('min') ?? ''), String(d.get('max') ?? '')));
                            }}
                          >
                            <input name="min" aria-label={`Mínimo manual de ${f.sku}`} placeholder={numero(mm.minimo_calc)} defaultValue={mm.minimo_manual ?? ''} className={`${claseCampo} h-9 max-w-20 text-right`} />
                            <input name="max" aria-label={`Máximo manual de ${f.sku}`} placeholder={numero(mm.maximo_calc)} defaultValue={mm.maximo_manual ?? ''} className={`${claseCampo} h-9 max-w-20 text-right`} />
                            <button type="submit" disabled={pendiente} className="h-9 rounded-[10px] border border-line-strong px-2 text-xs font-semibold">Guardar</button>
                          </form>
                        ) : (
                          <span className="tabular-nums">{numero(mm.minimo_manual ?? mm.minimo_calc)} / {numero(mm.maximo_manual ?? mm.maximo_calc)}</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin cálculo</span>
                      )}
                      {msg[clave] ? <div role={msg[clave].ok ? 'status' : 'alert'} className={`text-xs ${msg[clave].ok ? 'text-muted-foreground' : 'text-bad'}`}>{msg[clave].t}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {visibles.length > ver ? (
        <button type="button" onClick={() => setVer(ver + POR_PAGINA)} className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">Ver más</button>
      ) : null}
      <p className="text-xs text-muted-foreground">Mín/Máx vacío = usar el calculado (se muestra en gris). Los cambios entran en la próxima corrida del cálculo.</p>
    </div>
  );
}
```

En `navegacion.tsx`, agregar `{ href: '/comercializadora/catalogo', nombre: 'Catálogo', icono: Tags }` al grupo `'Planear y pagar'` (`Tags` ya está importado).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-catalogo.test.ts tests/portal/com-correcciones.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/catalogo.ts "app/(comercializadora)" components/comercializadora/catalogo.tsx components/portal/navegacion.tsx tests/portal
git commit -m "feat(comercializadora): Catálogo con datos de compra y mín/máx manual"
```

---

### Task 5: Kit de apertura

**Files:**
- Create: `app/(comercializadora)/comercializadora/kit/page.tsx`, `components/comercializadora/kit.tsx`
- Modify: `acciones.ts` (`guardarKitManual`, `recalcularKit`), `navegacion.tsx`
- Test: agregar a `tests/portal/com-correcciones.test.ts`

**Interfaces:**
- Produces: `guardarKitManual(sku: string, txt: string): Promise<Resultado>`, `recalcularKit(): Promise<Resultado<{ skus: number }>>`.

- [ ] **Step 1: Pruebas que fallan**

Agregar a `tests/portal/com-correcciones.test.ts` (importando `guardarKitManual, recalcularKit`):

```ts
describe('plan 3b · kit de apertura', () => {
  it('manual ≥ 0 o vacío (= calculado); registra historial; 0 filas = error', async () => {
    const f = dbFalsa({ com_kit_apertura: [{ sku: 'A', manual: null, promedio_calc: 3 }] });
    m.db = f.db;
    expect(await guardarKitManual('A', '-2')).toEqual({ error: 'Valor inválido: usa un número mayor o igual a 0, o déjalo vacío para usar el calculado' });
    expect(await guardarKitManual('A', '5')).toEqual({ ok: true });
    expect(f.tablas.com_kit_apertura[0].manual).toBe(5);
    expect(f.tablas.com_plan_config_historial[0]).toMatchObject({ ambito: 'kit_apertura', clave: 'A', valor_anterior: null, valor_nuevo: 5 });
    expect(await guardarKitManual('Z', '1')).toEqual({ error: 'Sin permiso para modificar este dato o el artículo ya no existe' });
  });
  it('recalcular llama com-minmax con tiempo corto', async () => {
    m.invocar.mockClear();
    m.invocar.mockResolvedValueOnce({ ok: true, datos: { ok: true, skus: 159 } });
    expect(await recalcularKit()).toEqual({ ok: true, skus: 159 });
    expect(m.invocar).toHaveBeenCalledWith('com-minmax', {}, { timeoutMs: 25_000 });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-correcciones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Agregar a `acciones.ts`:

```ts
/** _comKitEditar: kit manual ≥ 0 o vacío (= usar el promedio calculado; kit es columna generada). */
export async function guardarKitManual(sku: string, txt: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const t = String(txt ?? '').trim().replace(',', '.');
    const manual = t === '' ? null : Number(t);
    if (manual !== null && !(Number.isFinite(manual) && manual >= 0))
      return { error: 'Valor inválido: usa un número mayor o igual a 0, o déjalo vacío para usar el calculado' };
    const antes = await com(s.db).from('com_kit_apertura').select('manual').eq('sku', sku).maybeSingle();
    if (antes.error) return fallo(antes.error);
    const r = await com(s.db).from('com_kit_apertura').update({ manual }).eq('sku', sku).select('sku');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
    await registrarHistorial(s.db, 'kit_apertura', sku, antes.data?.manual ?? null, manual);
    revalidatePath('/comercializadora/kit');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comKitRecalcular: com-minmax recalcula el kit, el mín/máx y la proyección. */
export async function recalcularKit(): Promise<Resultado<{ skus: number }>> {
  const s = await editorCom().catch(() => null);
  if (!s) return { error: SOLO_LECTURA };
  const r = await invocarFuncion('com-minmax', {}, { timeoutMs: RECALCULO_MS });
  if (!r.ok) return { error: r.error };
  revalidatePath('/comercializadora', 'layout');
  return { ok: true, skus: Number((r.datos as { skus?: number }).skus) || 0 };
}
```

Crear `app/(comercializadora)/comercializadora/kit/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Kit } from '@/components/comercializadora/kit';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';

export interface KitFila {
  sku: string;
  promedio_calc: number;
  aperturas_muestra: number;
  manual: number | null;
  kit: number | null;
  calculado_at: string;
}

export default async function KitPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [kits, catalogo] = await Promise.all([
    leerTodoCom<KitFila>(db, 'com_kit_apertura', 'sku,promedio_calc,aperturas_muestra,manual,kit,calculado_at', 'sku'),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku'),
  ]);
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Kit de apertura" descripcion="Piezas que se mandan a cada apertura: el promedio calculado o el manual." />
      <Kit kits={kits} nombres={Object.fromEntries(catalogo.map((c) => [c.sku, c.nombre ?? '']))} editable={puedeEditarCom(accesos)} />
    </>
  );
}
```

Crear `components/comercializadora/kit.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { guardarKitManual, recalcularKit } from '@/app/(comercializadora)/comercializadora/acciones';
import type { KitFila } from '@/app/(comercializadora)/comercializadora/kit/page';

export function Kit({ kits, nombres, editable }: { kits: KitFila[]; nombres: Record<string, string>; editable: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({});
  const [general, setGeneral] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!kits.length) return <Vacio titulo="Todavía no hay kit calculado">Se calcula con la corrida diaria del mín/máx.</Vacio>;
  return (
    <div className="space-y-5">
      {editable ? (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await recalcularKit();
              setGeneral('error' in r ? { ok: false, t: r.error } : { ok: true, t: `Recalculado: ${r.skus} artículos.` });
              router.refresh();
            })
          }
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
        >
          {pendiente ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      ) : null}
      {general ? <p role={general.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${general.ok ? 'placa' : 'bg-bad-soft text-bad'}`}>{general.t}</p> : null}
      <div className="placa overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr><th>Artículo</th><th className="text-right">Promedio calculado</th><th className="text-right">Aperturas en la muestra</th><th className="text-right">Manual</th><th className="text-right">Kit que se usa</th></tr>
          </thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.sku}>
                <td><div className="font-medium">{nombres[k.sku] || k.sku}</div><div className="text-xs text-muted-foreground">{k.sku}</div></td>
                <td className="text-right tabular-nums">{numero(Number(k.promedio_calc))}</td>
                <td className="text-right tabular-nums">{k.aperturas_muestra}</td>
                <td className="min-w-28 text-right">
                  {editable ? (
                    <input
                      aria-label={`Kit manual de ${k.sku}`}
                      inputMode="decimal"
                      defaultValue={k.manual ?? ''}
                      placeholder="calculado"
                      onBlur={(e) => {
                        if (e.target.value !== (k.manual == null ? '' : String(k.manual)))
                          iniciar(async () => {
                            const r = await guardarKitManual(k.sku, e.target.value);
                            setMsg((m) => ({ ...m, [k.sku]: 'error' in r ? { ok: false, t: r.error } : { ok: true, t: 'Guardado' } }));
                            if (!('error' in r)) router.refresh();
                          });
                      }}
                      className={`${claseCampo} h-9 text-right`}
                    />
                  ) : (
                    <span className="tabular-nums">{k.manual == null ? '—' : numero(Number(k.manual))}</span>
                  )}
                  {msg[k.sku] ? <div role={msg[k.sku].ok ? 'status' : 'alert'} className={`text-xs ${msg[k.sku].ok ? 'text-muted-foreground' : 'text-bad'}`}>{msg[k.sku].t}</div> : null}
                </td>
                <td className="text-right font-semibold tabular-nums">{k.kit == null ? '—' : numero(Number(k.kit))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

En `navegacion.tsx`, agregar `{ href: '/comercializadora/kit', nombre: 'Kit de apertura', icono: Package }` al grupo `'Planear y pagar'` (`Package` ya está importado).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-correcciones.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(comercializadora)" components/comercializadora/kit.tsx components/portal/navegacion.tsx tests/portal/com-correcciones.test.ts
git commit -m "feat(comercializadora): kit de apertura con manual y recálculo"
```

---

### Task 6: Configuración — biblioteca (reutiliza `planCfgDef`/`mergeCfg`)

**Files:**
- Modify: `tsconfig.json` (`allowImportingTsExtensions`)
- Create: `lib/comercializadora/config.ts`
- Test: `tests/portal/com-config.test.ts`

**Interfaces:**
- Produces:
  - `configPorDefecto(): Config` y `normalizarConfig(x: unknown): Config`, re-exportados de `planEngine.ts`.
  - `CAMPOS_CONFIG: CampoConfig[]` (sección, ruta, etiqueta, tipo, rango u opciones).
  - `leerRuta(cfg, ruta)` y `ponerRuta(cfg, ruta, valor)`.
  - `difConfig(antes, despues): { clave: string; antes: unknown; despues: unknown }[]`.
  - `claveServidor(clave): boolean`.
  - `validarCorreos(txt): { correos: string[] } | { error: string }`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CAMPOS_CONFIG,
  claveServidor,
  configPorDefecto,
  difConfig,
  leerRuta,
  normalizarConfig,
  ponerRuta,
  validarCorreos,
} from '../../lib/comercializadora/config';

describe('configuración del cálculo', () => {
  it('normaliza como el servidor: rangos, opciones, booleanos; conserva imp/cafe/zoho_oc/kpi tal cual', () => {
    const c = normalizarConfig({ seg: { dias: 999 }, consumo: { metodo: 'otro', alinear: 'si' }, imp: { x: 1 }, zoho_oc: { ocs: 3 } });
    expect(c.seg.dias).toBe(120);
    expect(c.consumo.metodo).toBe('promedio');
    expect(c.consumo.alinear).toBe(false);
    expect(c.imp).toEqual({ x: 1 });
    expect(c.zoho_oc).toEqual({ ocs: 3 });
    expect(normalizarConfig({}).auto.modo).toBe('simulacion');
  });
  it('cada campo editable apunta a una ruta que existe en los valores por defecto, y auto.modo no es editable', () => {
    const def = configPorDefecto();
    for (const c of CAMPOS_CONFIG) expect(leerRuta(def, c.ruta), c.ruta).not.toBeUndefined();
    expect(CAMPOS_CONFIG.map((c) => c.ruta)).not.toContain('auto.modo');
  });
  it('ponerRuta no muta el original', () => {
    const a = configPorDefecto();
    const b = ponerRuta(a, 'seg.dias', 12);
    expect(leerRuta(a, 'seg.dias')).toBe(10);
    expect(leerRuta(b, 'seg.dias')).toBe(12);
  });
  it('diff por ruta aplanada, sin zoho_oc', () => {
    const a = configPorDefecto();
    const b = ponerRuta(ponerRuta(ponerRuta(a, 'seg.dias', 12), 'temp.mes', [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 'zoho_oc', { ocs: 1 });
    expect(difConfig(a, b)).toEqual([
      { clave: 'seg.dias', antes: 10, despues: 12 },
      { clave: 'temp.mes.0', antes: 1, despues: 2 },
    ]);
  });
  it('claves que recalculan el servidor: todas menos imp, cafe y kpi', () => {
    expect(claveServidor('seg.dias')).toBe(true);
    expect(claveServidor('imp.red')).toBe(false);
    expect(claveServidor('kpi.prec_min')).toBe(false);
  });
  it('correos: separa, valida, minúsculas, sin repetidos, máximo 20', () => {
    expect(validarCorreos('Ana@Mx.com; luis@x.mx, ana@mx.com')).toEqual({ correos: ['ana@mx.com', 'luis@x.mx'] });
    expect(validarCorreos('ana@')).toEqual({ error: 'Correo no válido: ana@. Debe tener la forma nombre@dominio.com' });
    expect(validarCorreos('')).toEqual({ correos: [] });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `tsconfig.json`, dentro de `compilerOptions`, agregar `"allowImportingTsExtensions": true` (válido porque el proyecto ya usa `"noEmit": true`). Así el portal importa `planEngine.ts`, que usa `./fechas.ts`.

Crear `lib/comercializadora/config.ts`:

```ts
// Una sola normalización para el portal y el servidor: planEngine.ts ya tiene prueba de paridad con el HTML viejo.
import { mergeCfg, planCfgDef } from '../../supabase/functions/_shared/planEngine.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Config = Record<string, any>;

export const configPorDefecto = (): Config => planCfgDef();
export const normalizarConfig = (x: unknown): Config => mergeCfg(x ?? {});

export type CampoConfig = {
  seccion: string;
  ruta: string;
  etiqueta: string;
  ayuda?: string;
} & ({ tipo: 'num'; min: number; max: number; entero?: boolean } | { tipo: 'sel'; opciones: [string, string][] } | { tipo: 'chk' });

const n = (seccion: string, ruta: string, etiqueta: string, min: number, max: number, entero = false, ayuda?: string): CampoConfig =>
  ({ seccion, ruta, etiqueta, tipo: 'num', min, max, entero, ayuda });
const s = (seccion: string, ruta: string, etiqueta: string, opciones: [string, string][], ayuda?: string): CampoConfig =>
  ({ seccion, ruta, etiqueta, tipo: 'sel', opciones, ayuda });
const b = (seccion: string, ruta: string, etiqueta: string, ayuda?: string): CampoConfig => ({ seccion, ruta, etiqueta, tipo: 'chk', ayuda });

/** Campos editables (plan 3b, decisión 8), con los rangos y opciones de _PLAN_CFG_RANGOS/_PLAN_CFG_OPC. */
export const CAMPOS_CONFIG: CampoConfig[] = [
  s('Inventario', 'inv.base', 'Inventario base', [['disponible', 'Disponible'], ['fisico', 'Físico']]),
  b('Inventario', 'inv.yulius', 'Sumar el 3PL al disponible'),
  n('Inventario', 'inv.comp_dias', 'Días de pedidos comprometidos', 0, 365, true),
  n('Consumo', 'consumo.ventana', 'Ventana de consumo (días)', 7, 180, true),
  s('Consumo', 'consumo.metodo', 'Método', [['promedio', 'Promedio'], ['mediana', 'Mediana'], ['percentil', 'Percentil'], ['ponderado', 'Ponderado']]),
  n('Consumo', 'consumo.pctl', 'Percentil', 50, 99, true, 'Solo con método percentil'),
  s('Consumo', 'consumo.divisor', 'Dividir entre', [['ventana', 'La ventana'], ['vida', 'Días de vida del artículo']]),
  b('Consumo', 'consumo.alinear', 'Alinear a semanas completas'),
  n('Consumo', 'consumo.crecimiento', 'Crecimiento (%)', 0, 20),
  s('Consumo', 'consumo.items', 'Artículos de los pedidos', [['editados', 'Editados'], ['originales', 'Originales']]),
  b('Consumo', 'consumo.tipos.resurtido', 'Contar pedidos de resurtido'),
  b('Consumo', 'consumo.tipos.sin_vincular', 'Contar pedidos sin vincular'),
  b('Consumo', 'consumo.tipos.apertura', 'Contar pedidos de apertura'),
  b('Consumo', 'consumo.tipos.marketing', 'Contar pedidos de marketing'),
  b('Consumo', 'consumo.tipos.corporativo', 'Contar pedidos corporativos'),
  b('Consumo', 'consumo.tipos.llenado', 'Contar llenado de canal'),
  n('Seguridad', 'seg.dias', 'Días de seguridad', 0, 120),
  s('Seguridad', 'seg.metodo', 'Método', [['dias', 'Días fijos'], ['estadistico', 'Estadístico']]),
  s('Seguridad', 'seg.servicio', 'Nivel de servicio', [['0.9', '90%'], ['0.95', '95%'], ['0.975', '97.5%'], ['0.99', '99%']]),
  n('Seguridad', 'seg.revision', 'Días de revisión', 1, 30, true),
  n('Seguridad', 'seg.lt_cv', 'Variabilidad del lead time (CV)', 0, 1),
  b('Aperturas', 'aper.incluir', 'Incluir aperturas en el cálculo'),
  s('Aperturas', 'aper.modo', 'Modo', [['calendario', 'Calendario'], ['tasa', 'Tasa mensual'], ['mayor', 'El mayor de los dos']]),
  n('Aperturas', 'aper.por_mes', 'Aperturas por mes', 0, 60),
  n('Aperturas', 'aper.horizonte', 'Horizonte (días)', 1, 90, true),
  b('Aperturas', 'aper.horizonte_auto', 'Horizonte automático'),
  n('Aperturas', 'aper.antelacion', 'Antelación del kit (días)', 0, 180, true),
  n('Aperturas', 'aper.peso_sin_fecha', 'Peso de aperturas sin fecha', 0, 1),
  n('Aperturas', 'aper.vencida_max', 'Días máximos de apertura vencida', 0, 365, true),
  n('Aperturas', 'aper.gracia_dias', 'Días de gracia', 0, 60, true),
  n('Compras', 'compra.lt_default', 'Lead time por omisión (días)', 1, 365, true),
  n('Compras', 'compra.entrega_max', 'Entrega máxima (días)', 1, 365, true),
  n('Compras', 'compra.prox_dias', 'Próximos días a revisar', 1, 30, true),
  n('Compras', 'compra.oc_vencida', 'Días para dar una OC por vencida', 0, 365, true),
  s('Compras', 'compra.min_prov', 'Mínimo del proveedor', [['consolidar', 'Consolidar compras'], ['avisar', 'Solo avisar']]),
  n('Compras', 'compra.min_ventana_dias', 'Ventana para consolidar (días)', 1, 60, true),
  s('Compras', 'compra.bloqueo_oc', 'Bloquear recompra con OC abierta', [['siempre', 'Siempre'], ['si_cubre', 'Si la OC cubre'], ['nunca', 'Nunca']]),
  n('Compras', 'compra.bloqueo_umbral', 'Umbral de cobertura del bloqueo', 0, 1),
  n('Compras', 'compra.h_max', 'Horizonte máximo (días)', 30, 365, true),
  n('Compras', 'compra.ciclo_nac', 'Ciclo de compra nacional (días)', 1, 120, true),
  n('Compras', 'compra.semanas', 'Semanas del plan', 4, 26, true),
  n('Compras', 'compra.bt_semanas', 'Semanas de prueba retrospectiva', 0, 12, true),
  b('Compras', 'compra.excluir_cafe', 'Excluir café del plan general'),
  s('Compras', 'compra.fuente_oc', 'Fuente de las OCs abiertas', [['plataforma', 'Plataforma'], ['zoho', 'Zoho']]),
  n('OCs automáticas', 'auto.cobertura_dias', 'Cobertura de la OC automática (días)', 0, 120),
  n('OCs automáticas', 'auto.yulius_alerta_dias', 'Alerta de 3PL sin actualizar (días)', 1, 90),
  n('Pagos', 'auto.pagos_horizonte', 'Horizonte de pagos (días)', 30, 180),
  s('Pagos', 'auto.pagos_base', 'Fecha base del pago', [['llegada', 'Llegada'], ['oc', 'Fecha de la OC']]),
  s('Avanzado', 'picos.manejo', 'Picos de venta', [['incluir', 'Incluir'], ['recortar', 'Recortar']]),
  n('Avanzado', 'picos.z', 'Umbral z de pico', 1.5, 6),
  n('Avanzado', 'picos.ratio', 'Razón de pico', 1, 5),
  n('Avanzado', 'picos.min_uds', 'Unidades mínimas de pico', 0, 100),
  b('Avanzado', 'temp.activa', 'Usar temporalidad mensual'),
];

export const SECCIONES = [...new Set(CAMPOS_CONFIG.map((c) => c.seccion))];

export function leerRuta(cfg: Config, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Config)[k]), cfg);
}

export function ponerRuta(cfg: Config, ruta: string, valor: unknown): Config {
  const [k, ...resto] = ruta.split('.');
  const copia: Config = Array.isArray(cfg) ? [...cfg] : { ...cfg };
  copia[k] = resto.length ? ponerRuta((cfg?.[k] as Config) ?? {}, resto.join('.'), valor) : valor;
  return copia;
}

function aplanar(x: unknown, pre: string, out: Map<string, unknown>) {
  if (x !== null && typeof x === 'object') {
    for (const [k, v] of Object.entries(x as Config)) aplanar(v, pre ? `${pre}.${k}` : k, out);
  } else out.set(pre, x);
}

/** _planCfgDiff: rutas aplanadas que cambiaron; zoho_oc no cuenta (lo maneja la conciliación). */
export function difConfig(antes: Config, despues: Config) {
  const a = new Map<string, unknown>();
  const d = new Map<string, unknown>();
  aplanar(antes, '', a);
  aplanar(despues, '', d);
  const claves = [...new Set([...a.keys(), ...d.keys()])].filter((k) => !/^zoho_oc(\.|$)/.test(k)).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  return claves.filter((k) => JSON.stringify(a.get(k)) !== JSON.stringify(d.get(k))).map((k) => ({ clave: k, antes: a.get(k) ?? null, despues: d.get(k) ?? null }));
}

/** _planCfgClaveServidor: todo lo que no es imp, cafe ni kpi cambia el cálculo del servidor. */
export const claveServidor = (clave: string) => !/^(imp|cafe|kpi)\./.test(clave);

/** _planCfgAutoCorreos. */
export function validarCorreos(txt: string): { correos: string[] } | { error: string } {
  const partes = String(txt ?? '').split(/[,;\s]+/).filter(Boolean);
  for (const p of partes) if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(p)) return { error: `Correo no válido: ${p}. Debe tener la forma nombre@dominio.com` };
  return { correos: [...new Set(partes.map((p) => p.toLowerCase()))].slice(0, 20) };
}
```

`planEngine.ts` exporta funciones con `any`. Si `tsc` marca algo de ese archivo por el modo estricto del portal, no se edita: se agrega `// @ts-expect-error` en el import o un archivo de declaración `lib/comercializadora/plan-engine.d.ts`. Regístralo en el ledger.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-config.test.ts && npx tsc --noEmit -p . && npm run test:funciones`
Expected: PASS. Las funciones Deno no cambian.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json lib/comercializadora/config.ts tests/portal/com-config.test.ts
git commit -m "feat(comercializadora): biblioteca de configuración sobre planEngine del servidor"
```

---

### Task 7: Configuración — pantalla, guardado con versión e historial

**Files:**
- Create: `app/(comercializadora)/comercializadora/configuracion/page.tsx`, `components/comercializadora/configuracion.tsx`
- Modify: `acciones.ts` (`guardarConfig`), `navegacion.tsx`
- Test: agregar a `tests/portal/com-correcciones.test.ts`

**Interfaces:**
- Consumes: Tarea 6.
- Produces: `guardarConfig(borrador: Config, version: number): Promise<Resultado<{ version: number; cambios: number; recalculo: boolean | null }>>`.

- [ ] **Step 1: Pruebas que fallan**

Agregar a `tests/portal/com-correcciones.test.ts` (importando `guardarConfig` y `configPorDefecto, ponerRuta` de `lib/comercializadora/config`):

```ts
describe('plan 3b · guardar configuración', () => {
  const base = () => ({ id: 1, version: 3, config: configPorDefecto() });
  beforeEach(() => m.invocar.mockClear());
  it('sin cambios no escribe', async () => {
    const f = dbFalsa({ com_plan_config: [base()] });
    m.db = f.db;
    expect(await guardarConfig(configPorDefecto(), 3)).toEqual({ error: 'No hay cambios que guardar' });
  });
  it('guarda con versión + 1, registra cada cambio y recalcula si toca el servidor', async () => {
    const f = dbFalsa({ com_plan_config: [base()] });
    m.db = f.db;
    const r = await guardarConfig(ponerRuta(configPorDefecto(), 'seg.dias', 12), 3);
    expect(r).toEqual({ ok: true, version: 4, cambios: 1, recalculo: true });
    expect(f.tablas.com_plan_config[0]).toMatchObject({ version: 4 });
    expect((f.tablas.com_plan_config[0].config as Record<string, Record<string, unknown>>).seg.dias).toBe(12);
    expect(f.tablas.com_plan_config_historial[0]).toMatchObject({ ambito: 'config', clave: 'seg.dias', valor_anterior: 10, valor_nuevo: 12 });
    expect(m.invocar).toHaveBeenCalledWith('com-minmax', {}, { timeoutMs: 25_000 });
  });
  it('si otra persona guardó antes (versión distinta), no pisa', async () => {
    const f = dbFalsa({ com_plan_config: [{ ...base(), version: 5 }] });
    m.db = f.db;
    expect(await guardarConfig(ponerRuta(configPorDefecto(), 'seg.dias', 12), 3)).toEqual({ error: 'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.' });
    expect((f.tablas.com_plan_config[0].config as Record<string, Record<string, unknown>>).seg.dias).toBe(10);
  });
  it('auto.modo no cambia desde el portal aunque venga en el borrador', async () => {
    const f = dbFalsa({ com_plan_config: [base()] });
    m.db = f.db;
    const r = await guardarConfig(ponerRuta(ponerRuta(configPorDefecto(), 'auto.modo', 'real'), 'seg.dias', 11), 3);
    expect(r).toMatchObject({ ok: true, cambios: 1 });
    expect((f.tablas.com_plan_config[0].config as Record<string, Record<string, unknown>>).auto.modo).toBe('simulacion');
  });
  it('conserva sin tocar lo que no se edita aquí (imp, prefijos, ajustes de aperturas)', async () => {
    const guardada = ponerRuta(ponerRuta(configPorDefecto(), 'imp', { red: 7 }), 'seg.prefijo', { CAF: 20 });
    const f = dbFalsa({ com_plan_config: [{ id: 1, version: 3, config: guardada }] });
    m.db = f.db;
    await guardarConfig(ponerRuta(ponerRuta(configPorDefecto(), 'seg.dias', 11), 'imp', null), 3);
    const c = f.tablas.com_plan_config[0].config as Record<string, unknown>;
    expect(c.imp).toEqual({ red: 7 });
    expect((c.seg as Record<string, unknown>).prefijo).toEqual({ CAF: 20 });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-correcciones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Agregar a `acciones.ts` (`import { CAMPOS_CONFIG, claveServidor, difConfig, leerRuta, normalizarConfig, ponerRuta, type Config } from '@/lib/comercializadora/config';`):

```ts
/**
 * _planCfgGuardar: solo los campos editables del portal se toman del borrador (lo demás se conserva tal cual de la
 * base, incluido auto.modo: plan 3b, decisiones 7 y 8). Update condicionado a la misma versión; historial por cambio;
 * recalcula com-minmax si algún cambio toca el servidor.
 */
export async function guardarConfig(
  borrador: Config,
  version: number,
): Promise<Resultado<{ version: number; cambios: number; recalculo: boolean | null }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    if (Number(actual.data.version) !== Number(version))
      return { error: 'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.' };
    const antes = normalizarConfig(actual.data.config);
    let nuevo: Config = actual.data.config ?? {};
    const normal = normalizarConfig(borrador);
    for (const c of CAMPOS_CONFIG) nuevo = ponerRuta(nuevo, c.ruta, leerRuta(normal, c.ruta));
    nuevo = ponerRuta(nuevo, 'temp.mes', leerRuta(normal, 'temp.mes'));
    nuevo = ponerRuta(nuevo, 'eventos', leerRuta(normal, 'eventos'));
    nuevo = ponerRuta(nuevo, 'auto.correos', leerRuta(normal, 'auto.correos'));
    const despues = normalizarConfig(nuevo);
    const cambios = difConfig(antes, despues);
    if (!cambios.length) return { error: 'No hay cambios que guardar' };
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: nuevo, version: Number(version) + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length)
      return { error: 'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.' };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert(cambios.map((c) => ({ ambito: 'config', clave: c.clave, valor_anterior: c.antes, valor_nuevo: c.despues })));
    const re = cambios.some((c) => claveServidor(c.clave)) ? await invocarFuncion('com-minmax', {}, { timeoutMs: RECALCULO_MS }) : null;
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, version: Number(version) + 1, cambios: cambios.length, recalculo: re ? re.ok : null };
  } catch (e) {
    return fallo(e);
  }
}
```

Para que el historial salga de un solo `insert` con arreglo, `dbFalsa` ya acepta arreglos en `insert`.

Crear `app/(comercializadora)/comercializadora/configuracion/page.tsx`:

```tsx
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { Configuracion } from '@/components/comercializadora/configuracion';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { normalizarConfig } from '@/lib/comercializadora/config';

export interface HistorialFila {
  id: number;
  ambito: string;
  clave: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  modificado_por: string | null;
  username: string | null;
  created_at: string;
}

export default async function ConfiguracionPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [cfg, hist, credito] = await Promise.all([
    com(db).from('com_plan_config').select('config,version,actualizado_por,updated_at').eq('id', 1).maybeSingle(),
    com(db).from('com_plan_config_historial').select('*').order('id', { ascending: false }).limit(60),
    leerTodoCom<{ vendor_id: string; nombre: string | null; dias_credito: number }>(db, 'com_zoho_proveedor', 'vendor_id,nombre,dias_credito', 'vendor_id'),
  ]);
  if (cfg.error || hist.error) throw new Error('No se pudo leer la configuración. Intenta de nuevo.');
  const encabezado = <Encabezado area="Comercializadora" titulo="Configuración del cálculo" descripcion="Parámetros del mín/máx, la proyección y las OCs automáticas." />;
  if (!cfg.data) return (<>{encabezado}<Vacio titulo="Todavía no hay configuración guardada" /></>);
  return (
    <>
      {encabezado}
      <Configuracion
        config={normalizarConfig(cfg.data.config)}
        version={Number(cfg.data.version)}
        actualizadoPor={cfg.data.actualizado_por}
        actualizadoEn={cfg.data.updated_at}
        historial={hist.data as HistorialFila[]}
        credito={credito.filter((c) => c.dias_credito > 0).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}
```

Crear `components/comercializadora/configuracion.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Tarjeta } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { CAMPOS_CONFIG, SECCIONES, difConfig, leerRuta, ponerRuta, validarCorreos, type CampoConfig, type Config } from '@/lib/comercializadora/config';
import { guardarConfig } from '@/app/(comercializadora)/comercializadora/acciones';
import type { HistorialFila } from '@/app/(comercializadora)/comercializadora/configuracion/page';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const txt = (v: unknown) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function Configuracion(p: {
  config: Config;
  version: number;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
  historial: HistorialFila[];
  credito: { vendor_id: string; nombre: string | null; dias_credito: number }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Config>(p.config);
  const [correos, setCorreos] = useState((p.config.auto?.correos ?? []).join(', '));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambios = difConfig(p.config, borrador);
  const poner = (ruta: string, valor: unknown) => setBorrador((b) => ponerRuta(b, ruta, valor));

  const control = (c: CampoConfig) => {
    const v = leerRuta(borrador, c.ruta);
    const id = `cfg-${c.ruta}`;
    if (c.tipo === 'chk')
      return (
        <label key={c.ruta} className="flex items-center gap-2 text-sm">
          <input id={id} type="checkbox" disabled={!p.editable} checked={v === true} onChange={(e) => poner(c.ruta, e.target.checked)} /> {c.etiqueta}
        </label>
      );
    return (
      <label key={c.ruta} htmlFor={id} className="text-sm">
        {c.etiqueta}
        {c.tipo === 'sel' ? (
          <select id={id} disabled={!p.editable} className={claseCampo} value={String(v)} onChange={(e) => poner(c.ruta, c.ruta === 'seg.servicio' ? Number(e.target.value) : e.target.value)}>
            {c.opciones.map(([val, et]) => <option key={val} value={val}>{et}</option>)}
          </select>
        ) : (
          <input id={id} type="number" disabled={!p.editable} min={c.min} max={c.max} step={c.entero ? 1 : 'any'} className={claseCampo} value={String(v ?? '')} onChange={(e) => poner(c.ruta, e.target.value === '' ? null : Number(e.target.value))} />
        )}
        {c.ayuda ? <span className="block text-xs text-muted-foreground">{c.ayuda}</span> : null}
      </label>
    );
  };

  const guardar = () =>
    iniciar(async () => {
      const v = validarCorreos(correos);
      if ('error' in v) return setMsg({ ok: false, t: v.error });
      const r = await guardarConfig(ponerRuta(borrador, 'auto.correos', v.correos), p.version);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setMsg({ ok: true, t: `Guardado (${r.cambios} cambio(s)).${r.recalculo === false ? ' No se pudo recalcular ahora: entra en la corrida diaria.' : r.recalculo ? ' El cálculo ya se actualizó.' : ''}` });
      router.refresh();
    });

  const eventos = (leerRuta(borrador, 'eventos') as Config[]) ?? [];
  const mes = (leerRuta(borrador, 'temp.mes') as number[]) ?? [];

  return (
    <div className="space-y-5">
      {!p.editable ? <p className="placa px-4 py-3 text-sm">Tu acceso puede ver esta configuración pero no cambiarla.</p> : null}
      <p className="text-sm text-muted-foreground">
        Modo de las OCs automáticas: <b>{p.config.auto?.modo === 'real' ? 'Real' : 'Simulación'}</b> · se cambia en el cutover, no desde aquí.
        {p.actualizadoPor ? ` Última edición: ${p.actualizadoPor}.` : ''}
      </p>
      {SECCIONES.map((sec) => (
        <Tarjeta key={sec} titulo={sec}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CAMPOS_CONFIG.filter((c) => c.seccion === sec).map(control)}</div>
          {sec === 'OCs automáticas' ? (
            <label className="mt-3 block text-sm">
              Correos que reciben el resumen (separados por coma)
              <input disabled={!p.editable} className={claseCampo} value={correos} onChange={(e) => setCorreos(e.target.value)} />
            </label>
          ) : null}
          {sec === 'Avanzado' ? (
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Factor de temporalidad por mes</legend>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                {MESES.map((m, i) => (
                  <label key={m} className="text-xs">{m}
                    <input type="number" step="0.05" min={0.1} max={5} disabled={!p.editable} className={`${claseCampo} h-9`} value={mes[i] ?? 1} onChange={(e) => poner('temp.mes', mes.map((x, j) => (j === i ? Number(e.target.value) : x)))} />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </Tarjeta>
      ))}
      <Tarjeta titulo="Activaciones" descripcion="Periodos con más (o menos) venta: el factor multiplica la demanda.">
        <div className="space-y-2">
          {eventos.map((ev, i) => (
            <div key={ev.id ?? i} className="flex flex-wrap items-end gap-2 text-sm">
              <label>Nombre<input disabled={!p.editable} maxLength={80} className={`${claseCampo} max-w-48`} value={ev.nombre ?? ''} onChange={(e) => poner('eventos', eventos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} /></label>
              <label>Desde<input type="date" disabled={!p.editable} className={claseCampo} value={ev.ini ?? ''} onChange={(e) => poner('eventos', eventos.map((x, j) => (j === i ? { ...x, ini: e.target.value } : x)))} /></label>
              <label>Hasta<input type="date" disabled={!p.editable} className={claseCampo} value={ev.fin ?? ''} onChange={(e) => poner('eventos', eventos.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)))} /></label>
              <label>% de cambio<input type="number" disabled={!p.editable} className={`${claseCampo} max-w-24`} value={Math.round((Number(ev.factor ?? 1) - 1) * 100)} onChange={(e) => poner('eventos', eventos.map((x, j) => (j === i ? { ...x, factor: Math.min(10, Math.max(0.1, 1 + Number(e.target.value) / 100)) } : x)))} /></label>
              <label className="flex items-center gap-1"><input type="checkbox" disabled={!p.editable} checked={ev.activo !== false} onChange={(e) => poner('eventos', eventos.map((x, j) => (j === i ? { ...x, activo: e.target.checked } : x)))} /> Activa</label>
              {p.editable ? <button type="button" aria-label="Quitar activación" onClick={() => poner('eventos', eventos.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden="true" /></button> : null}
            </div>
          ))}
          {p.editable ? (
            <button type="button" onClick={() => poner('eventos', [...eventos, { id: `ev${Date.now()}`, nombre: '', ini: '', fin: '', factor: 1.3, alcance: 'todos', valores: '', activo: true }])} className="inline-flex items-center gap-1 text-sm font-semibold underline">
              <Plus size={14} aria-hidden="true" /> Agregar activación
            </button>
          ) : null}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Días de crédito de proveedores" descripcion="Vienen de los términos de pago en Zoho y se editan allá.">
        {p.credito.length ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{p.credito.map((c) => <li key={c.vendor_id}>{c.nombre ?? c.vendor_id}: <b>{c.dias_credito} días</b></li>)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ningún proveedor tiene días de crédito en Zoho.</p>
        )}
      </Tarjeta>
      {p.editable ? (
        <div className="placa sticky bottom-3 flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm">{cambios.length ? `${cambios.length} cambio(s) sin guardar` : 'Sin cambios'}</span>
          <button type="button" disabled={pendiente || !cambios.length} onClick={guardar} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">{pendiente ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" disabled={!cambios.length} onClick={() => { setBorrador(p.config); setCorreos((p.config.auto?.correos ?? []).join(', ')); }} className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold">Descartar</button>
          {msg ? <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? '' : 'text-bad'}`}>{msg.t}</span> : null}
        </div>
      ) : null}
      <Tarjeta titulo="Historial" descripcion="Últimos 60 cambios. Revertir regresa el valor al borrador; guarda para aplicarlo." cuerpo={false}>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Antes</th><th>Después</th>{p.editable ? <th /> : null}</tr></thead>
            <tbody>
              {p.historial.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{new Date(h.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</td>
                  <td>{h.modificado_por ?? h.username ?? '—'}</td>
                  <td>{h.ambito === 'config' ? (CAMPOS_CONFIG.find((c) => c.ruta === h.clave)?.etiqueta ?? h.clave) : `${h.ambito}: ${h.clave}`}</td>
                  <td className="max-w-48 truncate">{txt(h.valor_anterior)}</td>
                  <td className="max-w-48 truncate">{txt(h.valor_nuevo)}</td>
                  {p.editable ? (
                    <td>
                      {h.ambito === 'config' && leerRuta(borrador, h.clave) !== undefined ? (
                        <button type="button" className="text-sm font-semibold underline" onClick={() => poner(h.clave, h.valor_anterior)}>Revertir</button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
```

En `navegacion.tsx`, agregar `{ href: '/comercializadora/configuracion', nombre: 'Configuración', icono: Settings2 }` al grupo `'Planear y pagar'` (`Settings2` ya está importado).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-correcciones.test.ts tests/portal/com-config.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(comercializadora)" components/comercializadora/configuracion.tsx components/portal/navegacion.tsx tests/portal/com-correcciones.test.ts
git commit -m "feat(comercializadora): configuración del cálculo con versión e historial"
```

---

### Task 8: Migración en producción, revisión en el navegador y PR

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck && npm run test:funciones && npx prettier --check "app/(comercializadora)" components/comercializadora lib/comercializadora "tests/portal/com-*" tests/portal/db-falsa.ts`
Expected: verde, salvo la falla previa de paridad Rappi.

- [ ] **Step 2: Aplicar la migración 48 en producción (con OK del usuario)**

Con `DATABASE_URL`, en una transacción:
1. Ejecutar el archivo `20261113000048_comercializadora_inventario.sql`.
2. Registrar la versión `20261113000048` en `supabase_migrations.schema_migrations`.

Verificación:
- `select count(*) from com_minmax where minimo is distinct from coalesce(minimo_manual, minimo_calc)` da 0.
- `select is_generated from information_schema.columns where table_name = 'com_minmax' and column_name = 'minimo'` da `ALWAYS`.

- [ ] **Step 3: Recorrido en el navegador** (cuenta del usuario, solo lectura, sin guardar nada):
- Inventario: KPIs, filtros y CSV; el botón "Ajustar 3PL" abre el formulario (no guardar).
- Catálogo: valores y búsqueda.
- Kit: tabla.
- Configuración: secciones y valores. El modo se ve como "Simulación" y no hay control para cambiarlo. El historial carga.
- Escritorio y 375 px, consola sin errores de la app.

- [ ] **Step 4: Guía y PR**

Agregar a `docs/migracion/comercializadora.md`:

```markdown
## 9. Inventario, catálogo, kit y configuración (plan 3b)

- El CEDIS se ajusta en Zoho Books; en el portal solo se ajusta y cuenta el 3PL (`com_ajustar_3pl`, todo o nada).
- Quién autoriza un ajuste: perfiles con Comercializadora `edicion` o `desarrollador`.
- `auto.modo` no se cambia desde la pantalla de configuración: se pasa a Real en el cutover (plan 4).
- Días de crédito: se editan en Zoho (términos de pago); el portal los muestra.
```

Commit y PR encima del #113.

---

## Self-review (hecho al escribir)

- **Cobertura del bloque 3b (decisión 1 del plan 3):**
  - Inventario: Tareas 2 y 3.
  - Conteo físico y ajustes: Tareas 1 y 3.
  - Catálogo: Tarea 4.
  - Kit: Tarea 5.
  - Configuración e historial: Tareas 6 y 7.
  - Lo que no se porta, y por qué, está en la decisión 5.
  - Se corrige el defecto del plan 2 (decisión 1, Tarea 1).
- **Sin marcadores pendientes.** Todo el código va completo. La ejecución debe confirmar dos cosas contra el código real, y cada una trae cómo resolverla: el tipado de `planEngine.ts` bajo `strict` y la firma de `rpc` en `dbFalsa`.
- **Tipos consistentes:**
  - `registrarHistorial` se define en la Tarea 4 y se usa en las Tareas 5 y 7.
  - `RECALCULO_MS`, `editorCom`, `fallo`, `SOLO_LECTURA` y `com` vienen del plan 3.
  - `FilaInventario` (Tarea 2) es lo que reciben `Inventario` y `Ajuste3pl` (Tarea 3).
  - `CAMPOS_CONFIG`, `leerRuta` y `ponerRuta` (Tarea 6) los usan la acción y el componente (Tarea 7).
