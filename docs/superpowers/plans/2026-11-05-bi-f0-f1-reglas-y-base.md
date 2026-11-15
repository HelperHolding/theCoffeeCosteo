# BI «The Coffee México» — F0 (reglas de Zoho) y F1 (base de datos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tener por escrito y en el repo las reglas de Zoho que definen los 17 filtros, y la base de datos del BI: hechos por línea, catálogos, metas, P.E. y funciones de lectura con acceso por sucursal. Todo con pruebas PGlite y sin cargar datos todavía.

**Architecture:** F0 es extracción de evidencia y la hace el controlador, porque necesita el navegador con Zoho y una lectura de solo lectura de la API del POS. Deja archivos semilla en `docs/bi/zoho/`. F1 es una migración con tablas cerradas y una RPC de guardado solo para `service_role`. También trae dos RPC de lectura, `bi_tablero` y `bi_tendencias`, que reciben los filtros en `jsonb` y devuelven cada bloque ya agregado. Al final, una segunda migración siembra los catálogos con lo extraído en F0. La carga de datos es F2, la importación de Rappi de Zoho es F3 y el tablero es F4: cada una lleva su propio plan.

**Tech Stack:** Supabase Postgres (PGlite + Vitest para pruebas), TypeScript (scripts con `tsx`). Leer `node_modules/next/dist/docs/` solo si una tarea toca Next (ninguna de este plan lo hace).

**Spec:** `docs/superpowers/specs/2026-11-05-bi-the-coffee-mexico-design.md`

## Global Constraints

- **Idioma:** textos, nombres y comentarios en español.
- **Sin datos de clientes** en ninguna tabla (ni nombre, ni teléfono, ni correo, ni `refundId` crudo).
- **Tablas `bi_*` cerradas:**
  - `revoke all` a `anon` y `authenticated`, con RLS activa y sin políticas;
  - escritura solo por RPC de `service_role`;
  - lectura solo por RPC `security definer` con `set search_path = public, pg_temp`.
- **Filtro de acceso:** toda lectura filtra con `public.sucursales_acceso(company_id)`. Esa función ya niega los tokens OAuth: exige `client_id` nulo (migración 24).
- **Rappi sin doble conteo:** las líneas `zoho_rappi` de una tienda y día se ignoran si ese día tiene carga `pos` con `rappi_en_pos = true`.
- **Tickets:** siempre `count(distinct (fuente, company_id, pedido))`. Promedios y porcentajes se calculan; nunca se guardan.
- **UPT:** líneas ÷ tickets (como la QT «Ticket Promedio y UPT» de Zoho).
- **Ventas:** `importe_cent` es la línea más sus modificadores, IVA incluido (= «Net Amount (Local)» de Zoho).
- **Restricciones de trabajo:**
  - no tocar `.env.local`;
  - no correr nada contra producción ni hacer push o merge sin OK;
  - leer la API del POS solo con OK explícito de Sebastián y en modo lectura.
- **Migraciones:**
  - `supabase/migrations/20261105000039_bi_base.sql`;
  - `supabase/migrations/20261105000040_bi_semillas.sql`.

## Review Focus

1. **Filtros de producto y tickets.** Con «Product = X», el número de tickets debe ser los pedidos que contienen X, no todos los tickets. Además, el ticket promedio debe salir de la venta de esas líneas. Así lo hace Zoho, que cuenta `Order ID` distintos sobre las filas filtradas. Prueba en Task 5.
2. **Rappi doble.** Una tienda con Rappi del portal no debe sumar además el Rappi de Zoho del mismo día. Una tienda sin portal sí lo suma. Prueba en Task 5.
3. **Un día sin carga no es cero.** La lectura debe decir qué días del rango no tienen carga por tienda. Prueba en Task 5.
4. **Reemplazo de un día.** Volver a guardar una tienda y día reemplaza sus líneas: no duplica ni deja líneas viejas. Prueba en Task 3.
5. **Clasificación versionada.** Una venta de agosto usa la versión vigente en agosto aunque exista una más nueva. Prueba en Task 5.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `docs/bi/zoho/README.md` | Qué se extrajo de Zoho, cuándo y cómo (evidencia de F0) |
| `docs/bi/zoho/reglas-columnas.md` | Texto completo de las fórmulas de columna de «Looker Sucursales» que usan los filtros |
| `docs/bi/zoho/tiendas.json` | Store ID → Nombre de Tienda, Franquiciatario, Propia/Franquicia (de las reglas CASE) |
| `docs/bi/zoho/productos.json` | Nombre de producto (normalizado como Zoho) → categoría Master MX, grupo, café, promoción |
| `docs/bi/zoho/filtros.json` | Opciones de Fecha Relativa, tramos de Maduración, definición de semana con muestras, valores de Método de Pago, y qué filtros ignora cada reporte |
| `docs/bi/zoho/pagos.json` | (métodoPOS, tipoPOS, fromSmartphone) → etiqueta de Zoho, con la evidencia por pedido |
| `docs/bi/zoho/api-campos.md` | Campos crudos de un pedido de la API (¿hay opción de consumo?) |
| `supabase/migrations/20261105000039_bi_base.sql` | Tablas, guardado y lectura |
| `supabase/migrations/20261105000040_bi_semillas.sql` | Datos de catálogos (generado) |
| `scripts/bi/semillas.ts` | Genera la migración 40 a partir de `docs/bi/zoho/*.json` y de `producto_codigo_pos` local (nombres → códigos) |
| `lib/bi/filtros.ts` | Tipos de filtros, Fecha Relativa → rango, validación (lo usarán F2/F4) |
| `tests/db/bi-base.test.ts` | Pruebas de la migración 39 |
| `tests/portal/bi-filtros.test.ts` | Pruebas de `lib/bi/filtros.ts` |
| `tests/portal/bi-semillas.test.ts` | Pruebas del generador de semillas |
| `docs/bi/01-BASE.md` | Documento operativo de F0–F1 |

---

### Task 1 (controlador): Reglas de Zoho

**Lo hace el controlador en el navegador; no se delega.** Zoho Analytics ya está abierto. Es solo lectura: no se guarda nada en Zoho.

**Files:**
- Create: `docs/bi/zoho/README.md`, `reglas-columnas.md`, `tiendas.json`, `productos.json`, `filtros.json`

**Interfaces:**
- Produces:
  - `tiendas.json`: `[{ "store_id": number, "nombre": string, "franquiciatario": string|null, "tipo": "Sucursales Propias"|"Franquicia" }]`
  - `productos.json`: `[{ "nombre_zoho": string, "categoria_master": string, "grupo": "Bebida"|"Comida"|"Combo"|"Merch"|"Otros", "contiene_cafe": "Sí"|"No"|null, "promocion": "Producto regular"|"Promoción alimentos y bebidas"|"Promoción café" }]`. `nombre_zoho` va normalizado como lo hace Zoho: mayúsculas, recortado y espacios no separables unificados.
  - `filtros.json`:
    ```json
    {
      "fechaRelativa": ["Esta semana", "…"],
      "maduracion": [{ "etiqueta": "…", "minMeses": 0, "maxMeses": 6 }],
      "semana": { "definicion": "weekofyear(Date,2)", "muestras": [{ "fecha": "2026-01-01", "semana": 1 }] },
      "metodosPago": ["APP - CARD", "…"],
      "reportes": [{ "id": "R9", "titulo": "Ventas por Año", "ignora": ["Fecha Relativa", "Rango de Fechas"] }]
    }
    ```

- [ ] **Step 1: Fórmulas completas.**
  - En «Looker Sucursales», abre la definición de las columnas de fórmula (Editar columna de fórmula): `Nombre de Tienda`, `Franquicia o Sucursales Propias`, `Franquiciatario`, `Categoría Master Franchise MX`, `Comida, Bebida, Combo y Merch`, `Contiene Café`, `Promoción alimento bebida, café, producto regular` y `Semana`.
  - Copia el texto completo de cada una a `reglas-columnas.md` con un encabezado por columna. En el anexo de la auditoría (`origin/wip/analytics-respaldo-2026-10-28:docs/analytics-zoho/anexo-columnas-looker-sucursales.csv`) vienen truncadas.
  - Haz lo mismo con las columnas que definen «Comparable», «Años Operando» y «Estatus de Maduración». Están en la QT «Tiendas Comparables» o en la tabla que use el filtro del dashboard: ábrelas desde los filtros del dashboard.
- [ ] **Step 2: Filtros del dashboard.**
  - En «Dashboard The Coffee México», en modo edición o en la configuración de filtros, anota las opciones de «Fecha Relativa» y los valores de «Método de Pago».
  - Para cada reporte, anota qué filtros ignora (configuración «Aplicar a»).
  - Guarda todo en `filtros.json`.
- [ ] **Step 3: Muestras de semana.** Con una consulta de vista previa sin guardar en una «Tabla de consulta nueva», saca 20 fechas con su `weekofyear(Date,2)`. Incluye todos los 1 de enero y 31 de diciembre de 2024 a 2026, y fechas alrededor de domingo y lunes. Guárdalas en `filtros.json.semana.muestras`.
- [ ] **Step 4: Convertir reglas a JSON.**
  - `tiendas.json`: una entrada por cada rama del CASE de `Nombre de Tienda` (Store ID → nombre). El franquiciatario y el tipo salen de las otras dos reglas.
  - `productos.json`:
    - aplica la regla de categoría y las demás a cada nombre de producto que aparezca en «Looker Sucursales» de 2026 (vista previa: `SELECT DISTINCT "Product" …`);
    - para obtener el valor de cada regla, consulta las columnas de fórmula ya calculadas con `SELECT DISTINCT "Product", "Categoría Master Franchise MX", … FROM "Looker Sucursales" WHERE "Date" >= '2026-01-01'`;
    - no reimplementes los CASE a mano.
- [ ] **Step 5: README.** Describe qué consultas de vista previa se usaron (texto SQL), la fecha y que no se guardó nada en Zoho.
- [ ] **Step 6: Commit**

```bash
git add docs/bi/zoho
git commit -m "BI F0: reglas de Zoho (tiendas, productos, filtros y semanas) como evidencia y semilla"
```

### Task 2 (controlador): Campos de la API y mapeo de pagos

**Lo hace el controlador. Necesita el OK de Sebastián para leer la API del POS (solo lectura).**

**Files:**
- Create: `docs/bi/zoho/api-campos.md`, `docs/bi/zoho/pagos.json`

**Interfaces:**
- Produces: `pagos.json`: `[{ "metodo_pos": "CARTAO", "tipo_pos": "EMV"|"" , "smartphone": boolean, "etiqueta": "TABLET - CARD", "evidencia": ["<companyId>:<id>", …] }]`

- [ ] **Step 1: Campos crudos.**
  - Con OK de Sebastián, corre:
    ```bash
    npx.cmd tsx --conditions=react-server scripts/sucursales/explorar-api.ts
    ```
    Revisa primero su ayuda u opciones en el archivo. Usa un día cerrado de Polanco (545) y uno de Rubén Darío (532).
  - Si el script no imprime las llaves crudas, usa una lectura de una página (`perPage=5`) del mismo cliente (`lib/sucursales/proveedor.ts`) en un script temporal fuera del repo.
  - Anota en `api-campos.md` todas las llaves de un pedido, con su tipo. Indica si alguna es la opción de consumo (Eat Here / To Go).
- [ ] **Step 2: Mapeo de pagos.**
  - Para esos dos días, cruza cada pedido por id (`Order ID` de Zoho = `id` del POS) contra una vista previa sin guardar de Zoho: `SELECT "Order ID", "Payment Method", "Place or Sale", "Dining Option" FROM "Looker Sucursales" WHERE "Store ID" IN (432, 455) AND "Date" = '…'`.
  - Llena `pagos.json` con cada combinación vista y 3 ids de evidencia.
  - Si `Dining Option` de Zoho tiene equivalente en la API, anota en `api-campos.md` cuál es.
- [ ] **Step 3: Commit**

```bash
git add docs/bi/zoho/api-campos.md docs/bi/zoho/pagos.json
git commit -m "BI F0: campos crudos de la API y mapeo verificado de métodos de pago"
```

---

### Task 3: Migración 39 — tablas, guardado de un día y reemplazo

**Files:**
- Create: `supabase/migrations/20261105000039_bi_base.sql` (parte 1: tablas y guardado)
- Test: `tests/db/bi-base.test.ts`

**Interfaces:**
- Produces (SQL):
  - Tablas `bi_lineas`, `bi_cargas`, `bi_tiendas`, `bi_clasificacion_producto`, `bi_mapeo_pago`, `bi_metas`, `bi_punto_equilibrio`, con las columnas exactas de abajo.
  - `public.bi_guardar_dia(p_fuente text, p_company integer, p_fecha date, p_completa boolean, p_leido_en timestamptz, p_lineas jsonb) returns integer`. Solo `service_role`. Recibe `p_lineas = [{pedido, linea, hora, canal, metodo_pago, tipo_pago, smartphone, opcion_consumo, codigo, nombre, unidades, importe_cent, descuento_cent}]` y devuelve las líneas escritas.

- [ ] **Step 1: Prueba que falla**

```ts
// tests/db/bi-base.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 39: base del BI. Tablas cerradas; un día se guarda y reemplaza por RPC de servicio.
let db: PGlite;
let u: string;
export const linea = (pedido: string, n: number, extra: Record<string, unknown> = {}) => ({
  pedido,
  linea: n,
  hora: 9,
  canal: 'mostrador',
  metodo_pago: 'CARTAO',
  tipo_pago: 'EMV',
  smartphone: false,
  opcion_consumo: null,
  codigo: '5IL',
  nombre: 'Iced Latte',
  unidades: 1,
  importe_cent: 8000,
  descuento_cent: 0,
  ...extra,
});
const guardar = async (fuente: string, company: number, fecha: string, lineas: unknown[], completa = true) => {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ n: number }>('select public.bi_guardar_dia($1, $2, $3, $4, now(), $5) n', [
        fuente,
        company,
        fecha,
        completa,
        JSON.stringify(lineas),
      ])
    ).rows[0].n;
  } finally {
    await db.exec('reset role');
  }
};

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513)', [u]);
});
afterAll(async () => db.close());

describe('migración 39: base del BI', () => {
  it('tablas y guardado cerrados al portal', async () => {
    for (const t of ['bi_lineas', 'bi_cargas', 'bi_tiendas', 'bi_clasificacion_producto', 'bi_mapeo_pago', 'bi_metas', 'bi_punto_equilibrio'])
      await expect(comoUsuario(db, u, () => db.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, u, () => db.query(`select public.bi_guardar_dia('pos', 513, '2026-10-01', true, now(), '[]')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('guarda un día con su carga y marca si trae Rappi', async () => {
    expect(await guardar('pos', 513, '2026-10-01', [linea('1', 1), linea('1', 2, { codigo: 'BRO13', nombre: 'Brownie' }), linea('2', 1, { canal: 'rappi', metodo_pago: 'RAPPI' })])).toBe(3);
    const c = await db.query<{ completa: boolean; rappi_en_pos: boolean }>(
      `select completa, rappi_en_pos from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-01'`,
    );
    expect(c.rows[0]).toEqual({ completa: true, rappi_en_pos: true });
  });

  it('volver a guardar el día lo reemplaza: sin duplicados ni líneas viejas', async () => {
    expect(await guardar('pos', 513, '2026-10-01', [linea('9', 1)], false)).toBe(1);
    const r = await db.query<{ pedido: string }>(`select pedido from bi_lineas where company_id = 513 and fecha = '2026-10-01'`);
    expect(r.rows.map((x) => x.pedido)).toEqual(['9']);
    const c = await db.query<{ completa: boolean; rappi_en_pos: boolean }>(
      `select completa, rappi_en_pos from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-01'`,
    );
    expect(c.rows[0]).toEqual({ completa: false, rappi_en_pos: false });
  });

  it('rechaza fuente, canal u hora inválidos', async () => {
    await expect(guardar('uber', 513, '2026-10-02', [])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-02', [linea('1', 1, { canal: 'uber' })])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-02', [linea('1', 1, { hora: 24 })])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/db/bi-base.test.ts`
Expected: FAIL. `relation "bi_lineas" does not exist` / `function bi_guardar_dia does not exist`.

- [ ] **Step 3: Migración (parte 1)**

```sql
-- BI «The Coffee México» (docs/superpowers/specs/2026-11-05-bi-the-coffee-mexico-design.md, docs/bi/01-BASE.md).
-- Hechos por línea de producto, sin datos de clientes. Tablas cerradas al portal: se escriben solo por RPC de
-- service_role y se leen solo por RPC con sucursales_acceso (que ya niega tokens OAuth, migración 24).

create table public.bi_lineas (
  fuente text not null check (fuente in ('pos', 'zoho_rappi')),
  company_id integer not null check (company_id > 0),
  fecha date not null,
  pedido text not null check (btrim(pedido) <> ''),
  linea smallint not null check (linea > 0),
  hora smallint not null check (hora between 0 and 23),
  canal text not null check (canal in ('mostrador', 'app', 'rappi', 'desconocido')),
  metodo_pago text not null,
  tipo_pago text not null default '',
  smartphone boolean not null default false,
  opcion_consumo text,
  codigo text not null,
  nombre text not null,
  unidades numeric not null check (unidades >= 0),
  importe_cent bigint not null,
  descuento_cent bigint not null default 0,
  primary key (fuente, company_id, fecha, pedido, linea)
);
create index bi_lineas_fecha on public.bi_lineas (fecha, company_id);

-- Un día cargado por fuente y tienda. Sin fila = sin datos (nunca cero). rappi_en_pos: ese día el POS ya trae Rappi
-- (del portal o del propio POS); entonces el Rappi de Zoho de ese día se ignora al leer.
create table public.bi_cargas (
  fuente text not null check (fuente in ('pos', 'zoho_rappi')),
  company_id integer not null check (company_id > 0),
  fecha date not null,
  leido_en timestamptz not null,
  completa boolean not null,
  rappi_en_pos boolean not null default false,
  lineas integer not null,
  primary key (fuente, company_id, fecha)
);

create table public.bi_tiendas (
  company_id integer primary key check (company_id > 0),
  store_id integer not null unique check (store_id > 0),
  nombre text not null check (btrim(nombre) <> ''),
  franquiciatario text,
  tipo text not null check (tipo in ('Sucursales Propias', 'Franquicia')),
  fecha_apertura date,
  origen_apertura text check (origen_apertura in ('crm', 'pos', 'zoho')),
  actualizado_en timestamptz not null default now()
);

create table public.bi_clasificacion_producto (
  codigo text not null check (btrim(codigo) <> ''),
  vigente_desde date not null,
  categoria_master text not null,
  grupo text not null check (grupo in ('Bebida', 'Comida', 'Combo', 'Merch', 'Otros')),
  contiene_cafe text check (contiene_cafe in ('Sí', 'No')),
  promocion text not null default 'Producto regular'
    check (promocion in ('Producto regular', 'Promoción alimentos y bebidas', 'Promoción café')),
  origen text not null,
  primary key (codigo, vigente_desde)
);

create table public.bi_mapeo_pago (
  metodo_pos text not null,
  tipo_pos text not null default '',
  smartphone boolean not null,
  etiqueta text not null check (btrim(etiqueta) <> ''),
  primary key (metodo_pos, tipo_pos, smartphone)
);

create table public.bi_metas (
  company_id integer not null check (company_id > 0),
  mes date not null check (extract(day from mes) = 1),
  venta_cent bigint not null check (venta_cent >= 0),
  tickets integer not null check (tickets >= 0),
  ticket_promedio_cent bigint not null check (ticket_promedio_cent >= 0),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now(),
  primary key (company_id, mes)
);

create table public.bi_punto_equilibrio (
  company_id integer not null check (company_id > 0),
  mes date not null check (extract(day from mes) = 1),
  pe_cent bigint not null check (pe_cent >= 0),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now(),
  primary key (company_id, mes)
);

alter table public.bi_lineas enable row level security;
alter table public.bi_cargas enable row level security;
alter table public.bi_tiendas enable row level security;
alter table public.bi_clasificacion_producto enable row level security;
alter table public.bi_mapeo_pago enable row level security;
alter table public.bi_metas enable row level security;
alter table public.bi_punto_equilibrio enable row level security;
revoke all on public.bi_lineas, public.bi_cargas, public.bi_tiendas, public.bi_clasificacion_producto,
  public.bi_mapeo_pago, public.bi_metas, public.bi_punto_equilibrio from anon, authenticated;

-- Guarda un día de una tienda y fuente, reemplazando lo anterior en una sola transacción.
create function public.bi_guardar_dia(p_fuente text, p_company integer, p_fecha date, p_completa boolean,
  p_leido_en timestamptz, p_lineas jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if p_fuente not in ('pos', 'zoho_rappi') then
    raise exception 'Fuente inválida: %', p_fuente;
  end if;
  delete from public.bi_lineas where fuente = p_fuente and company_id = p_company and fecha = p_fecha;
  insert into public.bi_lineas (fuente, company_id, fecha, pedido, linea, hora, canal, metodo_pago, tipo_pago,
    smartphone, opcion_consumo, codigo, nombre, unidades, importe_cent, descuento_cent)
  select p_fuente, p_company, p_fecha, x.pedido, x.linea, x.hora, x.canal, x.metodo_pago, coalesce(x.tipo_pago, ''),
    coalesce(x.smartphone, false), x.opcion_consumo, x.codigo, x.nombre, x.unidades, x.importe_cent,
    coalesce(x.descuento_cent, 0)
  from jsonb_to_recordset(p_lineas) as x(pedido text, linea smallint, hora smallint, canal text, metodo_pago text,
    tipo_pago text, smartphone boolean, opcion_consumo text, codigo text, nombre text, unidades numeric,
    importe_cent bigint, descuento_cent bigint);
  get diagnostics n = row_count;
  insert into public.bi_cargas (fuente, company_id, fecha, leido_en, completa, rappi_en_pos, lineas)
  values (p_fuente, p_company, p_fecha, p_leido_en, p_completa,
    p_fuente = 'pos' and exists (select 1 from jsonb_to_recordset(p_lineas) as y(canal text) where y.canal = 'rappi'),
    n)
  on conflict (fuente, company_id, fecha) do update set leido_en = excluded.leido_en, completa = excluded.completa,
    rappi_en_pos = excluded.rappi_en_pos, lineas = excluded.lineas;
  return n;
end $$;

revoke all on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb) to service_role;
```

`rappi_en_pos` también debe quedar en `true` cuando la tienda tiene `rappiPortal` ese día aunque no haya vendido Rappi. Así un día sin pedidos de Rappi no deja pasar el Rappi de Zoho. Ese dato lo pasa la carga (F2). Por eso el guardado acepta un `p_lineas` con canal `rappi` o, si no hubo ventas de Rappi, la carga lo marca con la RPC de la Task 4. Para este paso basta con lo de arriba.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/db/bi-base.test.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000039_bi_base.sql tests/db/bi-base.test.ts
git commit -m "Migración 39 (1/3): tablas del BI y guardado de un día por tienda"
```

### Task 4: Migración 39 — semana de Zoho, tienda y marca de Rappi del portal

**Files:**
- Modify: `supabase/migrations/20261105000039_bi_base.sql` (agregar al final)
- Test: `tests/db/bi-base.test.ts` (agregar `describe`)

**Interfaces:**
- Consumes: `docs/bi/zoho/filtros.json` (Task 1): `semana.muestras` y `maduracion`.
- Produces (SQL):
  - `public.bi_semana(p date) returns integer immutable`: replica `weekofyear(Date, 2)` de Zoho.
  - `public.bi_anio_semana(p date) returns integer immutable`: el año al que pertenece esa semana, si Zoho lo asigna distinto del año calendario. Si en las muestras de Zoho la semana de los primeros días de enero pertenece al año calendario, devuelve `extract(year from p)`.
  - `public.bi_maduracion(p_apertura date, p_ref date) returns text immutable`: aplica los tramos de `filtros.json`.
  - `public.bi_marcar_rappi_portal(p_company integer, p_fecha date) returns void`: solo `service_role`. Pone `rappi_en_pos = true` en la carga `pos` de ese día.

- [ ] **Step 1: Prueba que falla.** Las muestras se copian literalmente de `filtros.json`; no se inventan. Dos de ellas quedan como ejemplo de forma:

```ts
// en tests/db/bi-base.test.ts
import muestras from '../../docs/bi/zoho/filtros.json';

describe('semana y maduración como en Zoho', () => {
  it('bi_semana reproduce weekofyear(Date,2) de Zoho en todas las muestras', async () => {
    for (const m of muestras.semana.muestras) {
      const r = await db.query<{ s: number }>('select public.bi_semana($1::date) s', [m.fecha]);
      expect([m.fecha, r.rows[0].s]).toEqual([m.fecha, m.semana]);
    }
  });
  it('bi_maduracion aplica los tramos de Zoho', async () => {
    for (const t of muestras.maduracion) {
      const r = await db.query<{ m: string }>(
        `select public.bi_maduracion('2026-01-01'::date, ('2026-01-01'::date + make_interval(months => $1::int))::date) m`,
        [t.minMeses],
      );
      expect(r.rows[0].m).toBe(t.etiqueta);
    }
  });
  it('marca Rappi del portal en un día sin ventas Rappi (solo servicio)', async () => {
    await guardar('pos', 513, '2026-10-03', [linea('1', 1)]);
    await expect(comoUsuario(db, u, () => db.query(`select public.bi_marcar_rappi_portal(513, '2026-10-03')`))).rejects.toThrow(/permission denied/);
    await db.exec('set role service_role');
    await db.query(`select public.bi_marcar_rappi_portal(513, '2026-10-03')`);
    await db.exec('reset role');
    const c = await db.query<{ r: boolean }>(`select rappi_en_pos r from bi_cargas where fuente='pos' and company_id=513 and fecha='2026-10-03'`);
    expect(c.rows[0].r).toBe(true);
  });
});
```

Si `tsconfig` no permite importar JSON en pruebas (`resolveJsonModule`), léelo con `readFileSync` y `JSON.parse`.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/db/bi-base.test.ts -t "semana"`
Expected: FAIL. `function bi_semana does not exist`.

- [ ] **Step 3: Implementar.**
  - **`bi_semana`:** el `weekofyear(Date,2)` de Zoho sigue el modo 2 de MySQL `WEEK()`: la semana empieza en domingo, va de 1 a 53 y la semana 1 es la primera con domingo en ese año. Implementa esa definición:

```sql
create function public.bi_semana(p date) returns integer
language sql immutable set search_path = public, pg_temp as $$
  -- MySQL WEEK(date, 2): semana que empieza en domingo; la semana 1 es la que contiene el primer domingo del año;
  -- los días anteriores a ese domingo pertenecen a la última semana del año anterior (52 o 53).
  select case
    when p < (date_trunc('year', p)::date + ((7 - extract(dow from date_trunc('year', p))::int) % 7))
      then public.bi_semana((date_trunc('year', p)::date - 1))
    else ((p - (date_trunc('year', p)::date + ((7 - extract(dow from date_trunc('year', p))::int) % 7))) / 7) + 1
  end;
$$;
```

  - **Si una muestra no cuadra:** la definición de Zoho es otra. Ajusta la función hasta que todas las muestras pasen; las muestras son la autoridad. Explica en un comentario la regla final.
  - **`bi_anio_semana`:** cuando la semana proviene del año anterior (como en la rama recursiva de arriba), devuelve `extract(year from p) - 1`; en otro caso, `extract(year from p)`. Ajústalo igual que `bi_semana` si las muestras dicen otra cosa.
  - **`bi_maduracion`:** un `case` sobre los meses completos entre `p_apertura` y `p_ref`, con los tramos de `filtros.json` en orden. Si `p_apertura` es null, devuelve `null`.
  - **`bi_marcar_rappi_portal`:** `update public.bi_cargas set rappi_en_pos = true where fuente = 'pos' and company_id = p_company and fecha = p_fecha;`. Es `security definer` y se otorga solo a `service_role`, con su revoke a `public`, `anon` y `authenticated`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/db/bi-base.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000039_bi_base.sql tests/db/bi-base.test.ts
git commit -m "Migración 39 (2/3): semana y maduración como en Zoho, marca de Rappi del portal"
```

### Task 5: Migración 39 — lectura del tablero con filtros

**Files:**
- Modify: `supabase/migrations/20261105000039_bi_base.sql` (agregar al final)
- Create: `lib/bi/filtros.ts`
- Test: `tests/db/bi-lectura.test.ts`, `tests/portal/bi-filtros.test.ts`

**Interfaces:**
- Produces:
  - **`public.bi_tablero(p jsonb) returns jsonb`** (`security definer`, `authenticated`).
    - **Entrada `p`:**
      - `desde`, `hasta` (date; requeridas; máximo 1,100 días);
      - `companias` (int[]; requerida; se filtra con `sucursales_acceso`);
      - opcionales, todas como arreglo; null o vacío significa sin filtro: `dias` (int[] con 0 = domingo … 6 = sábado), `horas` (int[]), `semanas` (text[] `'AAAA-SS'` con `bi_anio_semana`/`bi_semana`), `franquiciatarios`, `tipos`, `anios_operando` (int[]), `comparable` (bool, opcional), `maduracion`, `categorias`, `grupos`, `cafe` (text[] 'Sí'/'No'), `productos` (text[] con el nombre de la línea), `pagos` (text[] de etiquetas de Zoho);
      - `monto_min` y `monto_max` (numeric en pesos, sobre `importe_cent/100` de cada línea).
    - **Salida:**
      - `{ cargas: { esperados, con_carga, incompletos } }`: días × tiendas en el rango, cuántos tienen carga `pos` y cuántos son incompletos;
      - `kpis: { venta_cent, tickets, lineas, unidades }`;
      - `por_grupo: [{grupo, venta_cent}]`, `por_cafe: [{cafe, venta_cent}]` (solo grupo Bebida), `por_master: [{categoria, venta_cent}]`;
      - `por_dia: [{dow, venta_cent, tickets}]`, `por_hora: [{hora, venta_cent, tickets}]`;
      - `por_pago: [{etiqueta, venta_cent, tickets}]`, `por_pago_tienda: [{etiqueta, company_id, venta_cent}]`;
      - `por_tienda_dia: [{company_id, dow, venta_cent, tickets}]`;
      - `promociones: [{company_id, promocion, unidades, venta_cent}]`;
      - `ranking: [{codigo, nombre, mes, unidades, venta_cent, lineas}]`;
      - `fuentes: [{fuente, venta_cent}]`.
  - **`public.bi_tendencias(p jsonb) returns jsonb`:** los mismos filtros, pero sin `desde`/`hasta`/`semanas`; siempre desde 2024-01-01 hasta hoy. Devuelve `por_mes: [{anio, mes, venta_cent}]` y `por_semana: [{anio, semana, venta_cent}]`. Así lo hace Zoho, si `filtros.json` lo confirma para R9/R10. Si Zoho aplica el rango de fechas a esos reportes, `bi_tendencias` no hace falta: documéntalo y usa `bi_tablero`.
  - **`lib/bi/filtros.ts`:**

```ts
export interface FiltrosBi { desde: string; hasta: string; companias: number[]; dias?: number[]; horas?: number[]; semanas?: string[]; franquiciatarios?: string[]; tipos?: string[]; aniosOperando?: number[]; comparable?: boolean; maduracion?: string[]; categorias?: string[]; grupos?: string[]; cafe?: ('Sí' | 'No')[]; productos?: string[]; pagos?: string[]; montoMin?: number; montoMax?: number }
export function fechaRelativa(opcion: string, hoy: string): { desde: string; hasta: string } | null; // opciones de filtros.json
export function aJsonRpc(f: FiltrosBi): Record<string, unknown>; // camelCase → snake_case de la RPC, sin claves vacías
```

- [ ] **Step 1: Pruebas de lectura que fallan**

```ts
// tests/db/bi-lectura.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

let db: PGlite;
let u: string;
let otro: string;
const L = (pedido: string, n: number, x: Record<string, unknown> = {}) => ({
  pedido, linea: n, hora: 9, canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 8000, descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (fuente: string, c: number, f: string, ls: unknown[], completa = true) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,$4,now(),$5)', [fuente, c, f, completa, JSON.stringify(ls)]);
type T = Record<string, any>;
const tablero = (user: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>('select public.bi_tablero($1) r', [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-10-05', hasta: '2026-10-06', companias: [513, 384, 532] };

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  otro = await crearUsuario(db, 'sucursales');
  for (const x of [u, otro]) await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'sucursales','lectura')`, [x]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,513),($1,384),($2,532)', [u, otro]);
  await servicio(`insert into bi_tiendas (company_id, store_id, nombre, franquiciatario, tipo, fecha_apertura, origen_apertura) values
    (513, 394, 'Namora', null, 'Sucursales Propias', '2024-03-01', 'crm'),
    (384, 301, 'Ventura', null, 'Sucursales Propias', '2023-11-27', 'pos'),
    (532, 455, 'Ruben Dario', null, 'Sucursales Propias', '2025-01-10', 'crm')`);
  await servicio(`insert into bi_mapeo_pago values ('CARTAO','EMV',false,'TABLET - CARD'),('RAPPI','',false,'RAPPI')`);
  await servicio(`insert into bi_clasificacion_producto values
    ('5IL','2026-01-01','Bebida Fría','Bebida','Sí','Producto regular','prueba'),
    ('5IL','2026-10-06','Bebidas Calientes','Bebida','Sí','Producto regular','prueba'),
    ('BRO13','2026-01-01','Panadería Dulce','Comida',null,'Producto regular','prueba')`);
  // Lunes 5-oct: Namora (513) con Rappi del portal; Ventura (384) sin portal; 532 no es del usuario.
  await guardar('pos', 513, '2026-10-05', [
    L('A', 1), L('A', 2, { codigo: 'BRO13', nombre: 'Brownie', importe_cent: 5000 }),
    L('B', 1, { hora: 15 }),
    L('R1', 1, { canal: 'rappi', metodo_pago: 'RAPPI', tipo_pago: '', importe_cent: 9000 }),
  ]);
  await guardar('pos', 384, '2026-10-05', [L('C', 1, { importe_cent: 7000 })]);
  await guardar('pos', 532, '2026-10-05', [L('Z', 1, { importe_cent: 99900 })]);
  // Rappi de Zoho: se ignora en 513 (ya trae Rappi del POS ese día) y se suma en 384.
  await guardar('zoho_rappi', 513, '2026-10-05', [L('ZR1', 1, { canal: 'rappi', metodo_pago: 'RAPPI', tipo_pago: '', importe_cent: 9000 })]);
  await guardar('zoho_rappi', 384, '2026-10-05', [L('ZR2', 1, { canal: 'rappi', metodo_pago: 'RAPPI', tipo_pago: '', importe_cent: 4000 })]);
  // Martes 6-oct: solo 513, con la clasificación nueva; 384 sin carga ese día.
  await guardar('pos', 513, '2026-10-06', [L('D', 1)], false);
});
afterAll(async () => db.close());

describe('bi_tablero', () => {
  it('solo sucursales del usuario; tablas cerradas', async () => {
    const r = await tablero(u, base);
    expect(r.kpis.venta_cent).toBe(8000 + 5000 + 8000 + 9000 + 7000 + 4000 + 8000);
    const o = await tablero(otro, base);
    expect(o.kpis.venta_cent).toBe(99900);
    await expect(comoUsuario(db, u, () => db.query('select * from bi_lineas'))).rejects.toThrow(/permission denied/);
  });

  it('Rappi de Zoho solo donde el POS no trae Rappi ese día', async () => {
    const r = await tablero(u, base);
    expect(r.fuentes).toEqual(expect.arrayContaining([{ fuente: 'zoho_rappi', venta_cent: 4000 }]));
    expect(r.kpis.tickets).toBe(6); // A, B, R1, C, ZR2, D
  });

  it('un filtro de producto cuenta los tickets que lo contienen', async () => {
    const r = await tablero(u, { ...base, productos: ['Brownie'] });
    expect(r.kpis).toMatchObject({ venta_cent: 5000, tickets: 1, lineas: 1 });
  });

  it('filtros de pago, hora, día y monto se combinan en todos los bloques', async () => {
    const r = await tablero(u, { ...base, pagos: ['TABLET - CARD'], horas: [9], dias: [1], monto_min: 60, monto_max: 100 });
    // Lunes, 9 h, tarjeta, línea entre $60 y $100: A1 (80), C (70). B es 15 h; Brownie es $50; D es martes.
    expect(r.kpis).toMatchObject({ venta_cent: 15000, tickets: 2 });
    expect(r.por_hora).toEqual([{ hora: 9, venta_cent: 15000, tickets: 2 }]);
  });

  it('clasificación vigente en la fecha de la venta', async () => {
    const r = await tablero(u, { ...base, categorias: ['Bebidas Calientes'] });
    expect(r.kpis.venta_cent).toBe(8000); // solo D (6-oct); las del 5-oct eran «Bebida Fría»
  });

  it('dice qué días no tienen carga (nunca cero)', async () => {
    const r = await tablero(u, base);
    expect(r.cargas).toEqual({ esperados: 4, con_carga: 3, incompletos: 1 });
  });

  it('rechaza rangos inválidos', async () => {
    await expect(tablero(u, { ...base, desde: '2026-10-07' })).rejects.toThrow(/Periodo inválido/);
  });
});
```

Agrega también pruebas de `por_dia`, `por_pago_tienda`, `promociones`, `ranking` (mes) y `comparable`/`anios_operando`. Usa los mismos datos y valores calculados a mano. Para `comparable`: Ruben Dario abrió el 2025-01-10, así que cuenta como comparable en oct-2026, con 12 meses o más; Namora también. Usa la regla exacta de `filtros.json`.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/db/bi-lectura.test.ts`
Expected: FAIL. `function bi_tablero(unknown) does not exist`.

- [ ] **Step 3: Implementar `bi_tablero`** al final de la migración 39:

```sql
-- Líneas visibles para un usuario con sus filtros: una sola definición que usan bi_tablero y bi_tendencias.
create function public.bi_lineas_filtradas(p jsonb, p_desde date, p_hasta date, p_con_semanas boolean)
returns table (fuente text, company_id integer, fecha date, pedido text, hora smallint, codigo text, nombre text,
  unidades numeric, importe_cent bigint, etiqueta_pago text, grupo text, categoria_master text, contiene_cafe text,
  promocion text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  v := array(select c::integer from jsonb_array_elements_text(p->'companias') c where public.sucursales_acceso(c::integer));
  return query
  select l.fuente, l.company_id, l.fecha, l.pedido, l.hora, l.codigo, l.nombre, l.unidades, l.importe_cent,
    coalesce(mp.etiqueta, l.metodo_pago), coalesce(cl.grupo, 'Otros'), coalesce(cl.categoria_master, 'Sin clasificar'),
    cl.contiene_cafe, coalesce(cl.promocion, 'Producto regular')
  from public.bi_lineas l
  join public.bi_tiendas t on t.company_id = l.company_id
  left join public.bi_mapeo_pago mp on mp.metodo_pos = l.metodo_pago and mp.tipo_pos = l.tipo_pago and mp.smartphone = l.smartphone
  left join lateral (select c.* from public.bi_clasificacion_producto c
    where c.codigo = l.codigo and c.vigente_desde <= l.fecha order by c.vigente_desde desc limit 1) cl on true
  where l.company_id = any(v) and l.fecha between p_desde and p_hasta
    -- Rappi de Zoho solo si ese día el POS no trae Rappi.
    and (l.fuente <> 'zoho_rappi' or not exists (select 1 from public.bi_cargas k where k.fuente = 'pos'
      and k.company_id = l.company_id and k.fecha = l.fecha and k.rappi_en_pos))
    and (jsonb_array_length(coalesce(p->'dias', '[]')) = 0 or extract(dow from l.fecha)::int in (select x::int from jsonb_array_elements_text(p->'dias') x))
    and (jsonb_array_length(coalesce(p->'horas', '[]')) = 0 or l.hora in (select x::smallint from jsonb_array_elements_text(p->'horas') x))
    and (not p_con_semanas or jsonb_array_length(coalesce(p->'semanas', '[]')) = 0
      or (public.bi_anio_semana(l.fecha) || '-' || lpad(public.bi_semana(l.fecha)::text, 2, '0')) in (select x from jsonb_array_elements_text(p->'semanas') x))
    and (jsonb_array_length(coalesce(p->'franquiciatarios', '[]')) = 0 or t.franquiciatario in (select x from jsonb_array_elements_text(p->'franquiciatarios') x))
    and (jsonb_array_length(coalesce(p->'tipos', '[]')) = 0 or t.tipo in (select x from jsonb_array_elements_text(p->'tipos') x))
    and (jsonb_array_length(coalesce(p->'anios_operando', '[]')) = 0
      or (extract(year from age(l.fecha, t.fecha_apertura)))::int in (select x::int from jsonb_array_elements_text(p->'anios_operando') x))
    and (p->'comparable' is null or jsonb_typeof(p->'comparable') = 'null'
      or ((t.fecha_apertura is not null and age(l.fecha, t.fecha_apertura) >= interval '12 months') = (p->>'comparable')::boolean))
    and (jsonb_array_length(coalesce(p->'maduracion', '[]')) = 0 or public.bi_maduracion(t.fecha_apertura, l.fecha) in (select x from jsonb_array_elements_text(p->'maduracion') x))
    and (jsonb_array_length(coalesce(p->'categorias', '[]')) = 0 or coalesce(cl.categoria_master, 'Sin clasificar') in (select x from jsonb_array_elements_text(p->'categorias') x))
    and (jsonb_array_length(coalesce(p->'grupos', '[]')) = 0 or coalesce(cl.grupo, 'Otros') in (select x from jsonb_array_elements_text(p->'grupos') x))
    and (jsonb_array_length(coalesce(p->'cafe', '[]')) = 0 or cl.contiene_cafe in (select x from jsonb_array_elements_text(p->'cafe') x))
    and (jsonb_array_length(coalesce(p->'productos', '[]')) = 0 or l.nombre in (select x from jsonb_array_elements_text(p->'productos') x))
    and (jsonb_array_length(coalesce(p->'pagos', '[]')) = 0 or coalesce(mp.etiqueta, l.metodo_pago) in (select x from jsonb_array_elements_text(p->'pagos') x))
    and (p->>'monto_min' is null or l.importe_cent >= (p->>'monto_min')::numeric * 100)
    and (p->>'monto_max' is null or l.importe_cent <= (p->>'monto_max')::numeric * 100);
end $$;
revoke all on function public.bi_lineas_filtradas(jsonb, date, date, boolean) from public, anon, authenticated;
```

`bi_lineas_filtradas` **no se otorga a `authenticated`**. Solo la llaman `bi_tablero` y `bi_tendencias`, que son del mismo dueño. Agrega a `bi-lectura.test.ts` una prueba de que `authenticated` no la puede llamar directamente.

```sql
create function public.bi_tablero(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := (p->>'desde')::date;
  h date := (p->>'hasta')::date;
  v integer[];
  r jsonb;
begin
  if d is null or h is null or d > h or h - d > 1100 then
    raise exception 'Periodo inválido (máximo 1,100 días).';
  end if;
  v := array(select c::integer from jsonb_array_elements_text(p->'companias') c where public.sucursales_acceso(c::integer));
  with bi_f as materialized (select * from public.bi_lineas_filtradas(p, d, h, true))
  select jsonb_build_object(
    'cargas', (select jsonb_build_object('esperados', count(*), 'con_carga', count(k.*), 'incompletos', count(*) filter (where not k.completa))
      from unnest(v) c(company_id) cross join generate_series(d, h, interval '1 day') g(fecha)
      left join public.bi_cargas k on k.fuente = 'pos' and k.company_id = c.company_id and k.fecha = g.fecha::date),
    'kpis', (select jsonb_build_object('venta_cent', coalesce(sum(importe_cent), 0), 'tickets', count(distinct (fuente, company_id, pedido)),
      'lineas', count(*), 'unidades', coalesce(sum(unidades), 0)) from bi_f),
    'por_grupo', coalesce((select jsonb_agg(jsonb_build_object('grupo', grupo, 'venta_cent', s) order by s desc) from (select grupo, sum(importe_cent) s from bi_f group by 1) x), '[]'),
    'por_cafe', coalesce((select jsonb_agg(jsonb_build_object('cafe', cafe, 'venta_cent', s) order by s desc) from (select coalesce(contiene_cafe, 'Sin dato') cafe, sum(importe_cent) s from bi_f where grupo = 'Bebida' group by 1) x), '[]'),
    'por_master', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria_master, 'venta_cent', s) order by s desc) from (select categoria_master, sum(importe_cent) s from bi_f group by 1) x), '[]'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'venta_cent', s, 'tickets', t) order by dow) from (select extract(dow from fecha)::int dow, sum(importe_cent) s, count(distinct (fuente, company_id, pedido)) t from bi_f group by 1) x), '[]'),
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('hora', hora, 'venta_cent', s, 'tickets', t) order by hora) from (select hora, sum(importe_cent) s, count(distinct (fuente, company_id, pedido)) t from bi_f group by 1) x), '[]'),
    'por_pago', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', etiqueta_pago, 'venta_cent', s, 'tickets', t) order by s desc) from (select etiqueta_pago, sum(importe_cent) s, count(distinct (fuente, company_id, pedido)) t from bi_f group by 1) x), '[]'),
    'por_pago_tienda', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', etiqueta_pago, 'company_id', company_id, 'venta_cent', s) order by etiqueta_pago, s desc) from (select etiqueta_pago, company_id, sum(importe_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_tienda_dia', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'dow', dow, 'venta_cent', s, 'tickets', t) order by company_id, dow) from (select company_id, extract(dow from fecha)::int dow, sum(importe_cent) s, count(distinct (fuente, company_id, pedido)) t from bi_f group by 1, 2) x), '[]'),
    'promociones', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'promocion', promocion, 'unidades', u, 'venta_cent', s) order by company_id, promocion) from (select company_id, promocion, sum(unidades) u, sum(importe_cent) s from bi_f group by 1, 2) x), '[]'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'mes', mes, 'unidades', u, 'venta_cent', s, 'lineas', n) order by mes, s desc) from (select codigo, min(nombre) nombre, date_trunc('month', fecha)::date mes, sum(unidades) u, sum(importe_cent) s, count(*) n from bi_f group by codigo, 3) x), '[]'),
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object('fuente', fuente, 'venta_cent', s) order by fuente) from (select fuente, sum(importe_cent) s from bi_f group by 1) x), '[]')
  ) into r;
  return r;
end $$;
```

El CTE `bi_f` se materializa una sola vez y lo leen todos los bloques; no usa tablas temporales, así que la función puede ser `stable`.

`bi_tendencias(p)` usa el mismo CTE con `bi_lineas_filtradas(p, '2024-01-01', current_date, false)` y devuelve `por_mes` y `por_semana`, con `bi_anio_semana` y `bi_semana`. Las dos se otorgan a `authenticated` y se revocan a `public` y `anon`.

- [ ] **Step 4: `lib/bi/filtros.ts` y sus pruebas.** `fechaRelativa` cubre exactamente las opciones de `filtros.json.fechaRelativa`. Las semanas de «Esta semana» y «Semana pasada» empiezan en domingo, como `bi_semana`; si F0 dice otra cosa, se ajusta a lo que diga F0. Prueba cada opción con `hoy = '2026-11-05'` (jueves) y valores calculados a mano. `aJsonRpc` convierte camelCase a snake_case y omite los arreglos vacíos y los `undefined`.

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run tests/db/bi-lectura.test.ts tests/db/bi-base.test.ts tests/portal/bi-filtros.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261105000039_bi_base.sql lib/bi/filtros.ts tests/db/bi-lectura.test.ts tests/portal/bi-filtros.test.ts
git commit -m "Migración 39 (3/3): lectura del BI con los 17 filtros y acceso por sucursal"
```

### Task 6: Semillas — migración 40 generada desde F0

**Files:**
- Create: `scripts/bi/semillas.ts`, `supabase/migrations/20261105000040_bi_semillas.sql` (generado), `tests/portal/bi-semillas.test.ts`

**Interfaces:**
- Consumes: `docs/bi/zoho/{tiendas,productos,pagos}.json` (Tasks 1–2), `lib/sucursales/config.ts` (`sucursalesConfiguradas`: `companyId`, `lookerStoreId`) y los enlaces POS por nombre.
- Produces:
  - `export function generarSemillas(e: { tiendas; productos; pagos; configuradas: {companyId:number; lookerStoreId:number}[]; codigosPorNombre: Map<string, string[]> }): { sql: string; sinCodigo: string[]; tiendasSinConfig: number[] }`
  - CLI `npx.cmd tsx scripts/bi/semillas.ts`: escribe la migración 40 e imprime los productos sin código y las tiendas sin configuración.

- [ ] **Step 1: Prueba que falla.** `generarSemillas` cumple esto:
  - Una tienda con `store_id` configurado → una fila de `bi_tiendas` con su `company_id`. `fecha_apertura` queda en `null` aquí; la llena la carga de F2 desde el CRM o el primer pedido.
  - Un producto de Zoho cuyo nombre normalizado coincide con uno o más códigos → una fila de `bi_clasificacion_producto` por código, con `vigente_desde = '2024-01-01'` y `origen = 'zoho-<fecha de F0>'`.
  - Un producto sin código → aparece en `sinCodigo` y no genera fila.
  - Los pagos → filas de `bi_mapeo_pago`.
  - El SQL usa `insert … on conflict do nothing`, escapa las comillas simples (`'Pain au Chocolat'`, `'Grilled Ham & Cheese'`) y es determinista: el mismo orden siempre.

  Escribe la prueba con 2 tiendas, 3 productos (uno con apóstrofo, uno sin código) y 2 pagos. Comprueba el SQL exacto y las listas.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/bi-semillas.test.ts`
Expected: FAIL. No se puede resolver `scripts/bi/semillas`.

- [ ] **Step 3: Implementar `generarSemillas` y el CLI.**
  - **`codigosPorNombre`:** se arma con los nombres observados del POS. Usa `producto_codigo_pos.nombre_observado` → `codigo` de la base local (PGlite con las migraciones) y el catálogo POS de `lib/sucursales/catalogo-pos.ts`, si da nombres por código. Normaliza igual que Zoho: mayúsculas, recortado y espacios no separables a espacio.
  - **Datos de producción:** el CLI no los lee. Si hace falta un nombre que solo existe en producción, se lista en `sinCodigo` para resolverlo a mano.

- [ ] **Step 4: Generar y probar la migración**

Run: `npx.cmd tsx scripts/bi/semillas.ts`, luego `npx vitest run tests/db/bi-base.test.ts tests/db/bi-lectura.test.ts tests/portal/bi-semillas.test.ts`
Expected: la migración 40 queda escrita y todas las pruebas pasan. La 40 corre sobre PGlite junto con las demás.

- [ ] **Step 5: Commit**

```bash
git add scripts/bi/semillas.ts supabase/migrations/20261105000040_bi_semillas.sql tests/portal/bi-semillas.test.ts
git commit -m "Migración 40: semillas del BI (tiendas, clasificación de productos y pagos) desde las reglas de Zoho"
```

### Task 7: Documento y verificación

**Files:**
- Create: `docs/bi/01-BASE.md`

- [ ] **Step 1: Doc** en el estilo de `docs/sucursales/16-TABLERO-MEXICO.md`, con estas secciones:
  - qué hay en F0 y de dónde salió;
  - tablas y funciones;
  - regla de Rappi sin doble conteo;
  - semana de Zoho;
  - lista de productos sin código y de tiendas sin configuración que dejó la Task 6;
  - qué sigue: F2 (carga y piloto), F3 (Rappi de Zoho), F4 (tablero) y F5 (metas y P.E.).
- [ ] **Step 2: Verificación completa**
  - `npx vitest run`: solo puede fallar `tests/migracion/paridad.test.ts`, que ya fallaba antes.
  - `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`: sin salida.
- [ ] **Step 3: Commit**

```bash
git add docs/bi/01-BASE.md
git commit -m "Doc BI 01: base de datos y reglas de Zoho (F0–F1)"
```
