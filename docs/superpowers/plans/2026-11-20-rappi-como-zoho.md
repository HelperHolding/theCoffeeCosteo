# Rappi como Zoho — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la venta de cada pedido de Rappi del portal sea `bruto − descuento_venta` (descuentos de la tienda sin premios Pro Rewards), igual que Zoho, en todo el portal.

**Architecture:** Una función de SQL (`rappi_descuento_venta`, migración 79) calcula el descuento por pedido y se expone en las dos lecturas existentes. `sucursales_rappi_portal` lo agrega a cada pedido y el corte lo pide como columna calculada. `pedidoRappiAPos` resta ese descuento y lo reparte entre las líneas; la pestaña Rappi suma la venta nueva.

**Tech Stack:** Supabase Postgres (PGlite en pruebas), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-rappi-como-zoho-design.md`

## Global Constraints

- Regla: `descuento_venta = least(bruto, greatest(coalesce(descuento_aliado, 0) − Σ descuentos.value con type_description = 'order_discount', 0))`; `descuentos` nulo o no arreglo cuenta como `[]`.
- Migración `supabase/migrations/20261120000079_rappi_descuento_venta.sql`; la aplica el usuario y la registra con `insert into supabase_migrations.schema_migrations (version, name) values ('20261120000079','rappi_descuento_venta');`. Nunca se ejecuta `supabase` CLI ni nada contra la base real; no se toca `.env.local`.
- `rappi_descuento_venta`: `revoke all … from public, anon, authenticated`; `grant execute … to service_role`; no es security definer.
- `sucursales_rappi_portal` se reemplaza (`create or replace`) con su definición actual de la migración 28 **sin otro cambio** que el campo `'descuento_venta'`; conserva `revoke … from public, anon` y `grant … to authenticated`.
- No se tocan `rappi_importar`, `rappi_huella` ni las tablas `rappi_*`.
- En TS, `descuento_venta` ausente = 0 (venta = bruto, como hoy).
- Textos y comentarios en español. Commits en español terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cada tarea: sus pruebas en verde y `npx tsc --noEmit` sin errores nuevos (hay 3 preexistentes en `.next/dev/types/validator.ts`); `tests/migracion/paridad.test.ts` ya fallaba y no cuenta.

## Review Focus

1. **Pedido que no cuadraba de origen** (líneas ≠ bruto): solo se escala cada importe, sin forzar la suma ni producir negativos → prueba en Task 2.
2. **Descuento igual al bruto** (pedido regalado con oferta): venta 0, todas las líneas en 0, sin dividir entre cero → prueba en Task 2.
3. **Líneas con importe 0** (vaso del POS con 0 ¢) al final del pedido: el redondeo lo absorbe la última línea con importe > 0, nunca una de 0 que quedaría negativa → prueba en Task 2.
4. **Premio mayor que `descuento_aliado`** (detalle inconsistente): 0, no negativo → prueba en Task 1.
5. **Pedido cancelado con descuento** en la pestaña Rappi: cancelados siguen sumando su bruto → prueba en Task 2.

---

### Task 1: Migración 79 — `rappi_descuento_venta` y la lectura de Rappi

**Files:**
- Create: `supabase/migrations/20261120000079_rappi_descuento_venta.sql`
- Test: `tests/db/rappi-descuento-venta.test.ts`

**Interfaces:**
- Produces:
  - `public.rappi_descuento_venta(p public.rappi_pedidos) returns numeric` (columna calculada `descuento_venta` para PostgREST);
  - cada pedido de `sucursales_rappi_portal(...)->'pedidos'` trae `'descuento_venta'` (numeric).

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/rappi-descuento-venta.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 79: el descuento que se resta de la venta de un pedido de Rappi, como Zoho
// (docs/superpowers/specs/2026-11-20-rappi-como-zoho-design.md §1).
let db: PGlite;
let usuario: string;
const NORMAL = 'MX1930270777';

const oferta = (v: number) => ({ type: '7', value: v, type_description: 'offer_by_product', percentage_value: 20 });
const premio = (v: number) => ({ type: '6', value: v, type_description: 'order_discount', percentage_value: 0 });
const envio = (v: number) => ({ type: '5', value: v, type_description: 'prime_discount_shipping', percentage_value: 0 });

const pedido = (id: string, bruto: number, aliado: number | null, descuentos: unknown) => ({
  id,
  tienda: NORMAL,
  creado: '2026-10-27T09:00:00',
  estado: 'finished',
  estado_nombre: 'Terminada',
  en_disputa: false,
  estado_disputa: '',
  metodo_pago: 'Tarjeta',
  prime: false,
  bruto,
  descuento_aliado: aliado,
  descuentos,
  productos: [{ linea: 1, rappi_producto_id: 'MX1', nombre: 'Latte', unidades: 1, precio: bruto,
    precio_con_desc_aliado: bruto, descuento_rappi_pct: 0, opciones: [] }],
});

const CASOS: [string, number, number | null, unknown, number][] = [
  // id, bruto, descuento_aliado, descuentos, descuento_venta esperado
  ['1', 100, 0, [], 0],                                        // sin descuento
  ['2', 221, 39.8, [oferta(39.8), envio(10)], 39.8],           // solo oferta: todo el descuento del aliado
  ['3', 416, 221.04, [premio(221.04), envio(10)], 0],          // solo premio Pro Rewards: no se resta
  ['4', 296, 156.9, [oferta(39.8), oferta(39.8), premio(117.1)], 39.8], // premio + oferta (repetida en el detalle)
  ['5', 120, null, null, 0],                                   // sin detalle todavía
  ['6', 376, 23.4, [oferta(23.4), oferta(23.4)], 23.4],        // oferta repetida: manda descuento_aliado
  ['7', 150, 50, [premio(80)], 0],                             // premio mayor que el descuento: 0, no negativo
  ['8', 90, 30, { raro: true }, 30],                           // descuentos no es arreglo: cuenta como []
  ['9', 40, 55, [oferta(55)], 40],                             // descuento mayor que el bruto: tope en el bruto
];

beforeAll(async () => {
  db = await crearDbLocal();
  usuario = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [usuario]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513)', [usuario]);
  const lote = {
    tipo: 'vivo', desde: '2026-10-27', hasta: '2026-10-27', estado: 'ok',
    tiendas: [{ rappi_tienda_id: NORMAL, por_dia: { '2026-10-27': { total_rows: CASOS.length, devueltos: CASOS.length } } }],
    pedidos: CASOS.map(([id, b, a, d]) => pedido(id, b, a, d)),
  };
  await db.exec('set role service_role');
  try {
    await db.query('select public.rappi_importar($1)', [JSON.stringify(lote)]);
  } finally {
    await db.exec('reset role');
  }
});
afterAll(async () => db.close());

describe('migración 79: rappi_descuento_venta', () => {
  it('resta los descuentos de la tienda y nunca los premios Pro Rewards', async () => {
    const r = await db.query<{ id: string; d: string }>(
      'select rappi_pedido_id::text id, public.rappi_descuento_venta(p)::text d from public.rappi_pedidos p',
    );
    const por = Object.fromEntries(r.rows.map((x) => [x.id, Number(x.d)]));
    for (const [id, , , , esperado] of CASOS) expect(por[id], `pedido ${id}`).toBeCloseTo(esperado, 2);
  });

  it('solo la cuenta de servicio la llama directo', async () => {
    await expect(
      comoUsuario(db, usuario, () =>
        db.query('select public.rappi_descuento_venta(p) from public.rappi_pedidos p limit 1'),
      ),
    ).rejects.toThrow(/permission denied/);
    await db.exec('set role service_role');
    try {
      const r = await db.query('select public.rappi_descuento_venta(p) d from public.rappi_pedidos p limit 1');
      expect(r.rows).toHaveLength(1);
    } finally {
      await db.exec('reset role');
    }
  });

  it('sucursales_rappi_portal trae descuento_venta en cada pedido', async () => {
    const r = await comoUsuario(db, usuario, async () =>
      (await db.query<{ r: { pedidos: { id: string; descuento_venta: number; bruto: number }[] } }>(
        'select public.sucursales_rappi_portal(513, $1, $1) r', ['2026-10-27'],
      )).rows[0].r,
    );
    const por = Object.fromEntries(r.pedidos.map((p) => [p.id, Number(p.descuento_venta)]));
    for (const [id, , , , esperado] of CASOS) expect(por[id], `pedido ${id}`).toBeCloseTo(esperado, 2);
  });
});
```

(Si `rappi_importar` rechaza un campo del pedido de prueba, copia la forma exacta de `pedido()` en `tests/db/rappi-portal.test.ts` líneas 13–42 y solo cambia `bruto`, `descuento_aliado`, `descuentos` y `productos[0].precio`. Si la tienda 513/`MX1930270777` no existe en la base de prueba, usa la que usa `tests/db/rappi-portal.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db/rappi-descuento-venta.test.ts`
Expected: FAIL — `function public.rappi_descuento_venta(...) does not exist`.

- [ ] **Step 3: Write the migration**

Copia **literalmente** el bloque `create function public.sucursales_rappi_portal … end $$;` de `supabase/migrations/20261029000028_rappi_portal.sql` (líneas ~244–278). Antes confirma con `grep -ln "function public.sucursales_rappi_portal" supabase/migrations/*.sql` que la 28 sigue siendo la única que la define; si hay otra posterior, parte de la más reciente. Cambia solo `create function` por `create or replace function` y agrega `'descuento_venta', public.rappi_descuento_venta(p),` justo después de `'descuento_aliado', p.descuento_aliado,`.

```sql
-- Migración 79: la venta de un pedido de Rappi del portal es la de Zoho
-- (docs/superpowers/specs/2026-11-20-rappi-como-zoho-design.md): bruto menos los descuentos que paga la tienda,
-- sin restar los premios Pro Rewards («Premio The Coffee», type_description = 'order_discount').
-- Se aplica a mano en el SQL Editor y se registra:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261120000079','rappi_descuento_venta');

-- 1. Descuento que se resta de la venta. Sin detalle (descuento_aliado nulo) es 0: la venta queda en el bruto.
--    Ofertas repetidas en `descuentos`: manda descuento_aliado (la suma del portal). Nunca negativo ni mayor que el bruto.
create function public.rappi_descuento_venta(p public.rappi_pedidos) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select least(p.bruto, greatest(coalesce(p.descuento_aliado, 0) - coalesce((
    select sum((d->>'value')::numeric)
    from jsonb_array_elements(case when jsonb_typeof(p.descuentos) = 'array' then p.descuentos else '[]'::jsonb end) d
    where d->>'type_description' = 'order_discount'), 0), 0))
$$;
revoke all on function public.rappi_descuento_venta(public.rappi_pedidos) from public, anon, authenticated;
grant execute on function public.rappi_descuento_venta(public.rappi_pedidos) to service_role;

-- 2. La lectura de la pestaña Rappi (y de Ventas, Costeo y Franquiciatarios) agrega descuento_venta a cada pedido.
--    Misma definición que la migración 28; solo cambia ese campo.
create or replace function public.sucursales_rappi_portal(p_company integer, p_desde date, p_hasta date) returns jsonb
-- … (cuerpo copiado de la 28 con el campo agregado) …
```

Termina el archivo con:

```sql
revoke all on function public.sucursales_rappi_portal(integer, date, date) from public, anon;
grant execute on function public.sucursales_rappi_portal(integer, date, date) to authenticated;
```

(El comentario «cuerpo copiado» es solo de este plan: en el archivo va el cuerpo completo, sin abreviar.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/db/rappi-descuento-venta.test.ts tests/db/rappi-portal.test.ts`
Expected: PASS (las pruebas existentes de la 28 siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261120000079_rappi_descuento_venta.sql tests/db/rappi-descuento-venta.test.ts
git commit -m "Rappi como Zoho: migración 79 rappi_descuento_venta y descuento_venta en la lectura del portal"
```

---

### Task 2: Conversión del pedido y totales de la pestaña Rappi

**Files:**
- Modify: `lib/sucursales/rappi-portal.ts` (tipo `PedidoRappi`, `construirRappiPortal`)
- Modify: `lib/sucursales/rappi-pos.ts` (`pedidoRappiAPos`)
- Test: `tests/portal/rappi-pos.test.ts`, `tests/portal/rappi-portal.test.ts`

**Interfaces:**
- Consumes: `descuento_venta` en cada pedido de `sucursales_rappi_portal` (Task 1).
- Produces: `PedidoRappi.descuento_venta?: number`; `pedidoRappiAPos` devuelve `ventaCent = cent(bruto) − cent(descuento_venta)` (≥ 0), líneas escaladas y `descuentoCent = cent(descuento_venta)`.

- [ ] **Step 1: Write the failing tests**

En `tests/portal/rappi-pos.test.ts`, la prueba «origen rappi, hora local del portal, ID de Rappi y descuento del aliado; cancelados fuera» espera `descuentoCent: 1250` con `descuento_aliado: 12.5` y sin `descuento_venta`. Con la regla nueva el descuento que cuenta es `descuento_venta`: cambia esa expectativa a `descuentoCent: 0` y renómbrala a «…; sin descuento_venta la venta es el bruto». Luego agrega:

```ts
describe('venta de Rappi como Zoho (bruto menos descuento_venta)', () => {
  const con = (p: PedidoRappi, d?: number) => ({ ...p, descuento_venta: d });
  const suma = (x: ReturnType<typeof pedidoRappiAPos>) =>
    x!.lineas.reduce((s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0), 0);

  it('resta el descuento y lo reparte: la suma de líneas es exactamente la venta', () => {
    const p = pedidoRappiAPos(
      con(pedido('10', 'finished', [producto('Iced Latte', 89), producto('Brownie', 59), producto('Iced Latte', 89)]), 23.4),
    )!;
    expect(p.ventaCent).toBe(23700 - 2340);
    expect(p.descuentoCent).toBe(2340);
    expect(suma(p)).toBe(p.ventaCent);
    expect(p.cuadra).toBe(true);
  });

  it('las unidades y los códigos no cambian', () => {
    const base = pedido('11', 'finished', [producto('Iced Latte', 89, [], 2)]);
    const sin = pedidoRappiAPos(base)!;
    const conD = pedidoRappiAPos(con(base, 17.6))!;
    expect(conD.lineas.map((l) => l.codigo)).toEqual(sin.lineas.map((l) => l.codigo));
    expect(conD.lineas).toHaveLength(sin.lineas.length);
  });

  it('sin descuento_venta (base sin la migración 79) queda idéntico a hoy', () => {
    const base = pedido('12', 'finished', [producto('Iced Latte', 89)]);
    expect(pedidoRappiAPos(con(base, undefined))).toEqual(pedidoRappiAPos(con(base, 0)));
    expect(pedidoRappiAPos(con(base, 0))!.ventaCent).toBe(8900);
  });

  it('descuento igual al bruto: venta 0 y todas las líneas en 0', () => {
    const p = pedidoRappiAPos(con(pedido('13', 'finished', [producto('Brownie', 59)]), 59))!;
    expect(p.ventaCent).toBe(0);
    expect(suma(p)).toBe(0);
    expect(p.lineas.every((l) => l.importeCent >= 0)).toBe(true);
  });

  it('el redondeo lo absorbe la última línea con importe, nunca una en 0', () => {
    // Iced Latte sin tamaño lleva el vaso del POS con 0 ¢ como personalización.
    const p = pedidoRappiAPos(con(pedido('14', 'finished', [producto('Iced Latte', 33.33), producto('Iced Latte', 33.33), producto('Iced Latte', 33.34)]), 10))!;
    expect(suma(p)).toBe(p.ventaCent);
    for (const l of p.lineas) {
      expect(l.importeCent).toBeGreaterThanOrEqual(0);
      for (const c of l.customs) expect(c.importeCent).toBeGreaterThanOrEqual(0);
    }
  });

  it('pedido que no cuadraba de origen: solo se escala cada importe, sin forzar la suma', () => {
    const base = { ...pedido('15', 'finished', [producto('Iced Latte', 89)]), bruto: 90 };
    const p = pedidoRappiAPos(con(base, 9))!;
    expect(p.ventaCent).toBe(8100);
    expect(p.cuadra).toBe(false);
    expect(p.lineas[0].importeCent).toBe(Math.round(8900 * (8100 / 9000)));
  });
});
```

En `tests/portal/rappi-portal.test.ts` (el pedido de prueba ya trae `descuento_aliado: null`), agrega:

```ts
it('los totales de la pestaña usan bruto menos descuento_venta; los cancelados, su bruto', () => {
  // usa el helper de pedidos de este archivo; dos terminados y un cancelado
  const r = construirRappiPortal(
    {
      ...RPC_BASE,
      pedidos: [
        { ...PEDIDO_BASE, id: 'a', estado: 'finished', bruto: 200, descuento_venta: 39.8 },
        { ...PEDIDO_BASE, id: 'b', estado: 'finished', bruto: 100 },
        { ...PEDIDO_BASE, id: 'c', estado: 'canceled_by_user', bruto: 150, descuento_venta: 30 },
      ],
    },
    '2026-10-27',
    '2026-10-27',
  );
  expect(r.totales.ventaCent).toBe(20000 - 3980 + 10000);
  expect(r.totales.canceladosCent).toBe(15000);
});
```

(Adapta `RPC_BASE` / `PEDIDO_BASE` a los nombres de los objetos de prueba que ya existen en ese archivo, alrededor de la línea 41, y `r.totales` al nombre real de la propiedad que devuelve `construirRappiPortal`; mantén la intención: venta = bruto − descuento_venta en terminados y bruto en cancelados.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/portal/rappi-pos.test.ts tests/portal/rappi-portal.test.ts`
Expected: FAIL (venta = bruto y `descuentoCent` = `descuento_aliado`).

- [ ] **Step 3: Implementation**

`lib/sucursales/rappi-portal.ts`, en `interface PedidoRappi`, debajo de `descuento_aliado: number | null;`:

```ts
  /**
   * Descuento que se resta de la venta, como Zoho: el de la tienda sin los premios Pro Rewards (migración 79,
   * rappi_descuento_venta). Ausente (base sin la 79) cuenta como 0: la venta es el bruto.
   */
  descuento_venta?: number;
```

En `construirRappiPortal`, cambia `t.ventaCent += cent(p.bruto);` por:

```ts
        t.ventaCent += Math.max(0, cent(p.bruto) - cent(p.descuento_venta ?? 0));
```

(`t.canceladosCent += cent(p.bruto);` no cambia.) Actualiza el comentario de cabecera del archivo: «venta = suma de productos menos los descuentos de la tienda, sin premios Pro Rewards (como Zoho); el bruto (`order_product_total_price`) se conserva».

`lib/sucursales/rappi-pos.ts`, en `pedidoRappiAPos`, reemplaza el cálculo de `lineas`, `ventaCent` y `suma` por:

```ts
  const brutoCent = cent(p.bruto);
  const descuentoCent = Math.min(brutoCent, Math.max(0, cent(p.descuento_venta ?? 0)));
  const ventaCent = brutoCent - descuentoCent;
  const lineas = escalarLineas(p.productos.flatMap(lineasDe), brutoCent, ventaCent);
  const suma = lineas.reduce(
    (s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0),
    0,
  );
```

y en el objeto devuelto usa `descuentoCent,` (en lugar de `p.descuento_aliado === null ? 0 : cent(p.descuento_aliado)`). Agrega, antes de `pedidoRappiAPos`:

```ts
/**
 * Escala los importes de líneas y personalizaciones de bruto a venta (factor venta ÷ bruto). Si las líneas sumaban el
 * bruto, la última con importe > 0 absorbe el redondeo y la suma queda exactamente en la venta; si no lo sumaban (el
 * pedido no cuadraba de origen), solo se escala cada importe. Sin descuento devuelve las mismas líneas.
 */
function escalarLineas<L extends LineaNormal>(lineas: L[], brutoCent: number, ventaCent: number): L[] {
  if (ventaCent === brutoCent || brutoCent <= 0) return lineas;
  const f = ventaCent / brutoCent;
  const total = (ls: L[]) =>
    ls.reduce((s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0), 0);
  const cuadraba = total(lineas) === brutoCent;
  const escaladas = lineas.map((l) => ({
    ...l,
    importeCent: Math.round(l.importeCent * f),
    customs: l.customs.map((c) => ({ ...c, importeCent: Math.round(c.importeCent * f) })),
  }));
  if (!cuadraba) return escaladas;
  const diferencia = ventaCent - total(escaladas);
  if (diferencia !== 0) {
    for (let i = escaladas.length - 1; i >= 0; i--) {
      if (escaladas[i].importeCent + diferencia >= 0 && escaladas[i].importeCent > 0) {
        escaladas[i] = { ...escaladas[i], importeCent: escaladas[i].importeCent + diferencia };
        break;
      }
    }
  }
  return escaladas;
}
```

(Si `LineaNormal` no está importada como valor/tipo en ese archivo, ya lo está como tipo en la línea 1: `import type { CustomNormal, LineaNormal, PedidoNormal } from './normalizar';`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/portal/rappi-pos.test.ts tests/portal/rappi-portal.test.ts tests/portal/margen-rappi.test.ts tests/portal/sucursales-rappi.test.ts && npx tsc --noEmit`
Expected: PASS. Si alguna prueba de Costeo/Consumo fijaba la venta de un pedido de Rappi con `descuento_aliado` distinto de 0, revisa: con la regla nueva solo cambia si el pedido trae `descuento_venta`; los fixtures que no lo traen no cambian.

- [ ] **Step 5: Commit**

```bash
git add lib/sucursales/rappi-portal.ts lib/sucursales/rappi-pos.ts tests/portal/rappi-pos.test.ts tests/portal/rappi-portal.test.ts
git commit -m "Rappi como Zoho: venta del pedido = bruto menos descuento_venta, repartida entre líneas; totales de la pestaña"
```

---

### Task 3: El corte pide `descuento_venta`, documentación y recálculo

**Files:**
- Modify: `lib/sucursales/corte-servidor.ts` (`rappiServicio`)
- Modify: `docs/rappi-portal/` — agregar `09-VENTA-COMO-ZOHO.md`
- Test: `tests/portal/bi-corte.test.ts`

**Interfaces:**
- Consumes: columna calculada `descuento_venta` (Task 1); `PedidoRappi.descuento_venta` (Task 2).

- [ ] **Step 1: Failing test**

En `tests/portal/bi-corte.test.ts`, en `fila()` agrega `descuento_venta: 0,` y añade:

```ts
describe('rappiServicio: venta como Zoho', () => {
  it('pide descuento_venta y lo resta de la venta del pedido', async () => {
    const f = { ...fila('9', 'MX1', 'normal'), descuento_venta: 17.6 };
    const { db, selects } = clienteCon([f]);
    const fuente = rappiServicio(db, { rappiPortal: true, companyId: 1 } as never)!;
    const [p] = (await fuente('2026-11-03', '2026-11-03'))!;
    expect(selects[0]).toContain('descuento_venta');
    expect(p.ventaCent).toBe(10000 - 1760);
  });
});
```

Run: `npx vitest run tests/portal/bi-corte.test.ts` → FAIL.

- [ ] **Step 2: Implementation**

En `rappiServicio`, agrega `descuento_venta` al `select` justo después de `descuento_aliado`:

```ts
        'rappi_pedido_id, rappi_tienda_id, creado_local, fecha_local, estado, estado_nombre, en_disputa, estado_disputa, metodo_pago, bruto, descuento_aliado, descuento_venta, estado_anterior, revisar, rappi_tiendas(canal), rappi_pedido_productos(linea, nombre, unidades, precio, opciones)',
```

y en el objeto que se pasa a `pedidoRappiAPos`, debajo de `descuento_aliado: …`:

```ts
        descuento_venta: x.descuento_venta === null || x.descuento_venta === undefined ? 0 : Number(x.descuento_venta),
```

- [ ] **Step 3: Documentación**

Crea `docs/rappi-portal/09-VENTA-COMO-ZOHO.md` con:
- la regla (texto del spec §1) y por qué (evidencia del spec: 19-nov pedido por pedido y 5-oct por tienda);
- **orden de entrada:** 1) aplicar y registrar la migración 79 (SQL de registro de las Global Constraints); 2) merge; 3) recálculo;
- **recálculo:** `npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2026-10-01 --hasta <ayer>` (escribe en la base; lo corre el usuario) y que el corte diario re-corta 8 días para los pedidos que lleguen sin detalle;
- **verificación:** cotejo contra Zoho del Rappi por tienda el 5-oct, 25-oct y 19-nov (≤ 0.5 % por día), pestaña Rappi y Ventas de una sucursal, Consumo sin cambio, BI del 19-nov cerca de $756,124;
- los 3 casos sueltos de Zoho que no se imitan (spec, «Evidencia»).

- [ ] **Step 4: Suite y commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todo verde salvo `tests/migracion/paridad.test.ts` (preexistente).

```bash
git add lib/sucursales/corte-servidor.ts tests/portal/bi-corte.test.ts docs/rappi-portal/09-VENTA-COMO-ZOHO.md
git commit -m "Rappi como Zoho: el corte pide descuento_venta; doc de la regla, orden de entrada y recálculo"
```
