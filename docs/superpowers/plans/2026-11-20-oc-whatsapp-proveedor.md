# OC confirmada → PDF por WhatsApp al proveedor — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando una OC pasa a emitida en Zoho Books, n8n manda su PDF por WhatsApp al proveedor una sola vez, y el portal registra y muestra el estado del envío.

**Architecture:** El portal pone una tabla `com_oc_whatsapp` y una Edge Function `com-oc-whatsapp` con secreto propio que es la única puerta de n8n al portal: reserva cada OC (llave primaria = no duplicar), registra resultados y avisos de Meta, y manda a compras@ los correos de fallas y respuestas. n8n (dos flujos JSON versionados en el repo) hace lo de Zoho y WhatsApp. La pantalla de Órdenes muestra el estado y Configuración el interruptor.

**Tech Stack:** Supabase (Postgres + RLS, Edge Functions Deno), Next.js 15 (server actions, React), vitest + PGlite, deno test, n8n (WhatsApp Business Cloud node, HTTP Request), Zoho Books API v3.

**Spec:** `docs/superpowers/specs/2026-11-20-oc-whatsapp-proveedor-design.md`

## Global Constraints

- Tabla `com_oc_whatsapp` con estados exactamente `reservado, enviado, entregado, leido, fallido, sin_numero, omitido`; solo avanzan `reservado → enviado → entregado → leido`.
- Lectura con `com_puede_leer()`; escritura solo `service_role` (la función) y la RPC de reintento con `com_puede_editar()`.
- La función acepta **solo** el header `x-oc-whatsapp-secreto` contra `OC_WHATSAPP_SECRETO`; `x-com-secreto`/`COM_SECRETO` no sirven. Comparación en tiempo constante. `verify_jwt = false` en `supabase/config.toml`.
- Bandera en `com_plan_config.config.whatsapp = { activo: boolean, solo_vendor_ids: string[] }`; por omisión `activo = false`. No se agrega a `planCfgDef`/`mergeCfg` (tienen prueba de paridad con el HTML viejo).
- Una OC se manda una sola vez (la fila existe ⇒ no se manda), aunque se reemita.
- Nunca se imprimen secretos ni números completos: en logs y correos solo los últimos 4 dígitos (`…1234`).
- Correos a `config.auto.correos` con `enviarCorreo` de `_shared/correo.ts` (sale solo con `COM_EFECTOS_EXTERNOS=si`, igual que los demás correos de funciones).
- Migración nueva: `supabase/migrations/20261120000078_comercializadora_oc_whatsapp.sql` (la 77 es de la consolidación de borradores).
- El JSON de n8n no lleva credenciales ni URLs con secretos: credenciales por nombre (`Zoho Books OAuth2`, `WhatsApp Cloud`, `Portal OC WhatsApp`) y el host del portal por variable de n8n `PORTAL_FUNCIONES_URL`.
- Texto de la plantilla `oc_emitida` (es_MX, utilidad, encabezado documento): `Hola {{1}}, te compartimos la orden de compra {{2}} de The Coffee por {{3}}, con entrega esperada el {{4}}. Para cualquier duda escríbenos a compras@mx.thecoffee.jp.`

## Review Focus

1. **Dos webhooks simultáneos de la misma OC** → uno solo recibe `enviar: true` (la inserción por llave primaria es la reserva; un 23505 es "ya registrada", no un error). Prueba en Task 2.
2. **Aviso de Meta fuera de orden** (`read` antes que `delivered`, o `delivered` después de `read`) → nunca retrocede. Prueba en Task 2.
3. **Número en Zoho con espacios, guiones, lada `+52`, `52`, `044`/`045` o 10 dígitos** → se normaliza a `+52` + 10 dígitos; cualquier otra cosa es `sin_numero`. Prueba en Task 2.
4. **Bandera apagada o proveedor fuera de `solo_vendor_ids`** → `omitido`, y prenderla después no manda esas OCs. Prueba en Task 2.
5. **Reintento** solo borra filas `fallido`/`sin_numero`/`omitido`, solo con permiso de edición; nunca una `enviado`. Prueba en Task 1.

---

## Mapa de archivos

| Archivo | Tarea | Qué |
|---|---|---|
| `supabase/migrations/20261120000078_comercializadora_oc_whatsapp.sql` | 1 | tabla, RLS, RPC de reintento |
| `tests/db/comercializadora-whatsapp.test.ts` | 1 | migración |
| `supabase/functions/com-oc-whatsapp/whatsapp.ts` | 2 | lógica pura + acciones |
| `supabase/functions/com-oc-whatsapp/whatsapp_test.ts` | 2 | pruebas Deno |
| `supabase/functions/com-oc-whatsapp/index.ts`, `supabase/config.toml` | 3 | entrada HTTP |
| `lib/comercializadora/whatsapp.ts`, `tests/portal/com-whatsapp.test.ts` | 4 | etiquetas y bandera (puras) |
| `components/comercializadora/ordenes.tsx`, `app/(comercializadora)/comercializadora/ordenes/page.tsx`, `app/(comercializadora)/comercializadora/acciones.ts`, `tests/portal/com-ordenes-whatsapp.test.tsx` | 5 | columna y reintento |
| `components/comercializadora/whatsapp-config.tsx`, `app/(comercializadora)/comercializadora/configuracion/page.tsx`, `tests/portal/com-whatsapp-config.test.tsx` | 6 | interruptor |
| `n8n/oc-whatsapp-envio.json`, `n8n/oc-whatsapp-avisos.json`, `scripts/n8n/validar.ts`, `tests/portal/n8n-whatsapp.test.ts` | 7 | flujos |
| `docs/migracion/whatsapp-oc.md`, `docs/migracion/comercializadora.md` | 8 | guía de puesta en marcha |

---

### Task 1: Migración 78 — tabla `com_oc_whatsapp` y reintento

**Files:**
- Create: `supabase/migrations/20261120000078_comercializadora_oc_whatsapp.sql`
- Test: `tests/db/comercializadora-whatsapp.test.ts`

**Interfaces:**
- Produces: tabla `public.com_oc_whatsapp` (columnas de la spec §3 más `po_number`), función `public.com_oc_whatsapp_reintentar(p_zoho_po_id text) returns boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/comercializadora-whatsapp.test.ts
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

async function comoServicio<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const fila = (db: PGlite, id: string, estado: string) =>
  comoServicio(db, () =>
    db.query(
      `insert into com_oc_whatsapp (zoho_po_id, po_number, vendor_id, vendor_name, estado) values ($1, $2, 'v1', 'Prov', $3)`,
      [id, 'COM-OC-' + id, estado],
    ),
  );

describe('migración 78: envíos de OC por WhatsApp', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
  });
  afterAll(async () => db.close());

  it('solo acepta los estados de la spec', async () => {
    await fila(db, '1', 'reservado');
    await expect(fila(db, '2', 'otro')).rejects.toThrow();
  });

  it('una OC es una sola fila (la llave es la reserva)', async () => {
    await expect(fila(db, '1', 'reservado')).rejects.toThrow(/duplicate key|unique/);
  });

  it('wa_message_id es único', async () => {
    await comoServicio(db, () => db.query(`update com_oc_whatsapp set wa_message_id = 'w1' where zoho_po_id = '1'`));
    await fila(db, '3', 'enviado');
    await expect(
      comoServicio(db, () => db.query(`update com_oc_whatsapp set wa_message_id = 'w1' where zoho_po_id = '3'`)),
    ).rejects.toThrow();
  });

  it('lectura con Comercializadora; sin módulo no ve nada; nadie autenticado escribe', async () => {
    const lector = await crearUsuario(db, 'lector-wa@x.mx');
    await darModulo(db, lector, 'comercializadora', 'lectura');
    const otro = await crearUsuario(db, 'otro-wa@x.mx');
    const n = await comoUsuario(db, lector, () => db.query('select count(*)::int n from com_oc_whatsapp'));
    expect((n.rows[0] as { n: number }).n).toBeGreaterThan(0);
    const m = await comoUsuario(db, otro, () => db.query('select count(*)::int n from com_oc_whatsapp'));
    expect((m.rows[0] as { n: number }).n).toBe(0);
    await expect(
      comoUsuario(db, lector, () =>
        db.query(`insert into com_oc_whatsapp (zoho_po_id, po_number, estado) values ('9', 'X', 'reservado')`),
      ),
    ).rejects.toThrow();
  });

  it('reintentar: con edición borra fallido/sin_numero/omitido; nunca enviado; sin edición falla', async () => {
    await fila(db, '10', 'fallido');
    await fila(db, '11', 'sin_numero');
    await fila(db, '12', 'enviado');
    const editor = await crearUsuario(db, 'editor-wa@x.mx');
    await darModulo(db, editor, 'comercializadora', 'edicion');
    const lector = await crearUsuario(db, 'lector2-wa@x.mx');
    await darModulo(db, lector, 'comercializadora', 'lectura');
    const r = (u: string, id: string) =>
      comoUsuario(db, u, () => db.query<{ ok: boolean }>('select public.com_oc_whatsapp_reintentar($1) ok', [id]));
    expect((await r(editor, '10')).rows[0].ok).toBe(true);
    expect((await r(editor, '11')).rows[0].ok).toBe(true);
    expect((await r(editor, '12')).rows[0].ok).toBe(false);
    await expect(r(lector, '12')).rejects.toThrow();
    const quedan = await db.query<{ zoho_po_id: string }>(
      `select zoho_po_id from com_oc_whatsapp where zoho_po_id in ('10','11','12') order by 1`,
    );
    expect(quedan.rows.map((x) => x.zoho_po_id)).toEqual(['12']);
  });
});
```

Antes de correrlo, confirma los nombres de los helpers en `tests/db/utilidades.ts` (`comoUsuario`, `crearUsuario`, `darModulo` y el nivel `'lectura'`/`'edicion'`) leyendo cómo los usa `tests/db/comercializadora-ovs.test.ts`; si difieren, usa los de ese archivo (ruling en el ledger).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/comercializadora-whatsapp.test.ts`
Expected: FAIL con `relation "com_oc_whatsapp" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261120000078_comercializadora_oc_whatsapp.sql
-- OC emitida → PDF por WhatsApp al proveedor (spec 2026-11-20-oc-whatsapp-proveedor-design.md, §3).
-- n8n orquesta; la Edge Function com-oc-whatsapp (secreto propio) es la única que escribe aquí.
-- Una fila por OC de Zoho: la llave primaria es la reserva, así una OC se manda una sola vez.
create table public.com_oc_whatsapp (
  zoho_po_id text primary key,
  po_number text not null,
  vendor_id text,
  vendor_name text,
  telefono text,
  estado text not null check (estado in ('reservado', 'enviado', 'entregado', 'leido', 'fallido', 'sin_numero', 'omitido')),
  wa_message_id text unique,
  error text,
  reservado_at timestamptz not null default now(),
  enviado_at timestamptz,
  entregado_at timestamptz,
  leido_at timestamptz,
  actualizado_at timestamptz not null default now()
);
create index com_oc_whatsapp_po_number on public.com_oc_whatsapp (po_number);
create index com_oc_whatsapp_telefono on public.com_oc_whatsapp (telefono, enviado_at desc);

alter table public.com_oc_whatsapp enable row level security;
revoke all on public.com_oc_whatsapp from anon, authenticated;
grant all on public.com_oc_whatsapp to service_role;
grant select on public.com_oc_whatsapp to authenticated;
create policy lectura on public.com_oc_whatsapp for select to authenticated using ((select public.com_puede_leer()));

-- Reintento desde Órdenes: borra la fila para que el siguiente webhook de Zoho la vuelva a reservar.
-- Nunca borra un envío que sí salió.
create function public.com_oc_whatsapp_reintentar(p_zoho_po_id text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.com_puede_editar() then
    raise exception 'sin permiso de edición' using errcode = '42501';
  end if;
  delete from public.com_oc_whatsapp
  where zoho_po_id = p_zoho_po_id and estado in ('fallido', 'sin_numero', 'omitido');
  return found;
end $$;
revoke all on function public.com_oc_whatsapp_reintentar(text) from public, anon;
grant execute on function public.com_oc_whatsapp_reintentar(text) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/db/comercializadora-whatsapp.test.ts tests/db/guardia-lectura.test.ts`
Expected: PASS (la guardia de lecturas ya conoce `com_puede_leer()`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261120000078_comercializadora_oc_whatsapp.sql tests/db/comercializadora-whatsapp.test.ts
git commit -m "feat(comercializadora): tabla de envíos de OC por WhatsApp y reintento"
```

---

### Task 2: Lógica de la función `com-oc-whatsapp`

**Files:**
- Create: `supabase/functions/com-oc-whatsapp/whatsapp.ts`
- Test: `supabase/functions/com-oc-whatsapp/whatsapp_test.ts`

**Interfaces:**
- Consumes: tabla de Task 1; `leerConfig` y `SupabaseClient` de `../_shared/db.ts`; `enviarCorreo` de `../_shared/correo.ts`.
- Produces:
  - `autorizadoWhatsapp(req: Request): boolean`
  - `normalizarTelefono(x: unknown): string | null` (→ `+52XXXXXXXXXX`)
  - `mascara(tel: string | null): string` (→ `…1234`)
  - `manejar(db: SupabaseClient, body: Record<string, unknown>, deps?: { correo?: typeof enviarCorreo }): Promise<{ status: number; json: unknown }>`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/com-oc-whatsapp/whatsapp_test.ts
import { assertEquals } from "@std/assert";
import { autorizadoWhatsapp, manejar, mascara, normalizarTelefono } from "./whatsapp.ts";

type Fila = Record<string, unknown>;
// Base falsa: com_plan_config (bandera) y com_oc_whatsapp en memoria, con la llave primaria de verdad.
function dbFalsa(whatsapp: unknown, filas: Fila[] = [], correos = ["compras@x.mx"]) {
  const tabla = new Map<string, Fila>(filas.map((f) => [String(f.zoho_po_id), { ...f }]));
  const db = {
    from(t: string) {
      if (t === "com_plan_config") {
        const q: Record<string, unknown> = {};
        q.select = () => q; q.eq = () => q;
        q.single = () => Promise.resolve({ data: { config: { whatsapp, auto: { correos } } }, error: null });
        return q;
      }
      if (t !== "com_oc_whatsapp") throw new Error("tabla inesperada " + t);
      const filtros: [string, unknown][] = [];
      let orden: string | null = null;
      const coincide = (f: Fila) => filtros.every(([k, v]) => f[k] === v);
      const q: Record<string, unknown> = {};
      q.eq = (k: string, v: unknown) => { filtros.push([k, v]); return q; };
      q.order = (k: string) => { orden = k; return q; };
      q.limit = () => q;
      q.select = () => q;
      q.insert = (row: Fila) => {
        const id = String(row.zoho_po_id);
        if (tabla.has(id)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
        tabla.set(id, { ...row });
        return Promise.resolve({ error: null });
      };
      q.update = (cambios: Fila) => {
        const u: Record<string, unknown> = {};
        u.eq = (k: string, v: unknown) => { filtros.push([k, v]); return u; };
        u.in = (k: string, vs: unknown[]) => { filtros.push([k, { in: vs }]); return u; };
        u.select = () => {
          const hechas: Fila[] = [];
          for (const f of tabla.values()) {
            const ok = filtros.every(([k, v]) =>
              v && typeof v === "object" && "in" in (v as object) ? ((v as { in: unknown[] }).in).includes(f[k]) : f[k] === v);
            if (ok) { Object.assign(f, cambios); hechas.push(f); }
          }
          return Promise.resolve({ data: hechas, error: null });
        };
        return u;
      };
      q.maybeSingle = () => {
        let xs = [...tabla.values()].filter(coincide);
        if (orden) xs = xs.sort((a, b) => String(b[orden!] ?? "").localeCompare(String(a[orden!] ?? "")));
        return Promise.resolve({ data: xs[0] ?? null, error: null });
      };
      return q;
    },
  } as never;
  return { db, tabla };
}
const sinCorreo = { correo: () => Promise.resolve(true) };
const OC = { accion: "reservar", zoho_po_id: "po1", po_number: "COM-OC-01500", vendor_id: "v1", vendor_name: "ODISA" };

Deno.test("autorizadoWhatsapp: solo con OC_WHATSAPP_SECRETO; COM_SECRETO no sirve", () => {
  Deno.env.set("OC_WHATSAPP_SECRETO", "s3creto-wa");
  Deno.env.set("COM_SECRETO", "otro");
  const req = (h: Record<string, string>) => new Request("https://x", { headers: h });
  assertEquals(autorizadoWhatsapp(req({ "x-oc-whatsapp-secreto": "s3creto-wa" })), true);
  assertEquals(autorizadoWhatsapp(req({ "x-oc-whatsapp-secreto": "s3creto-wb" })), false);
  assertEquals(autorizadoWhatsapp(req({ "x-com-secreto": "otro" })), false);
  assertEquals(autorizadoWhatsapp(req({})), false);
  Deno.env.delete("OC_WHATSAPP_SECRETO");
  assertEquals(autorizadoWhatsapp(req({ "x-oc-whatsapp-secreto": "" })), false);
});

Deno.test("normalizarTelefono: formatos de México a +52 y 10 dígitos; lo demás null", () => {
  for (const x of ["55 1234 5678", "55-1234-5678", "+52 55 1234 5678", "52 5512345678", "+521 55 1234 5678", "044 55 1234 5678", "045 5512345678", "5512345678"]) {
    assertEquals(normalizarTelefono(x), "+525512345678", String(x));
  }
  for (const x of ["", null, undefined, "12345", "+1 415 555 0101", "55123456789", "abc"]) {
    assertEquals(normalizarTelefono(x), null, String(x));
  }
});

Deno.test("mascara deja solo los últimos 4 dígitos", () => {
  assertEquals(mascara("+525512345678"), "…5678");
  assertEquals(mascara(null), "—");
});

Deno.test("reservar: nueva → enviar; repetida → ya registrada, sin duplicar", async () => {
  const { db, tabla } = dbFalsa({ activo: true, solo_vendor_ids: [] });
  assertEquals((await manejar(db, OC, sinCorreo)).json, { enviar: true });
  assertEquals((await manejar(db, OC, sinCorreo)).json, { enviar: false, motivo: "ya registrada", estado: "reservado" });
  assertEquals(tabla.size, 1);
});

Deno.test("reservar concurrente: solo una de dos recibe enviar", async () => {
  const { db } = dbFalsa({ activo: true });
  const [a, b] = await Promise.all([manejar(db, OC, sinCorreo), manejar(db, OC, sinCorreo)]);
  assertEquals([a.json, b.json].filter((j) => (j as { enviar: boolean }).enviar).length, 1);
});

Deno.test("reservar con bandera apagada o fuera de la lista: omitido y no se manda después", async () => {
  const apagada = dbFalsa({ activo: false });
  assertEquals((await manejar(apagada.db, OC, sinCorreo)).json, { enviar: false, motivo: "WhatsApp apagado" });
  assertEquals(apagada.tabla.get("po1")?.estado, "omitido");
  const lista = dbFalsa({ activo: true, solo_vendor_ids: ["v9"] });
  assertEquals((await manejar(lista.db, OC, sinCorreo)).json, { enviar: false, motivo: "proveedor fuera de la prueba" });
  // Prenderla después no la manda: la fila ya existe.
  const despues = dbFalsa({ activo: true }, [...apagada.tabla.values()]);
  assertEquals((await manejar(despues.db, OC, sinCorreo)).json, { enviar: false, motivo: "ya registrada", estado: "omitido" });
});

Deno.test("sin configuración de whatsapp cuenta como apagado", async () => {
  const { db } = dbFalsa(undefined);
  assertEquals((await manejar(db, OC, sinCorreo)).json, { enviar: false, motivo: "WhatsApp apagado" });
});

Deno.test("resultado enviado guarda teléfono e id; fallido y sin_numero avisan a compras con número enmascarado", async () => {
  const { db, tabla } = dbFalsa({ activo: true }, [{ zoho_po_id: "po1", po_number: "COM-OC-01500", vendor_name: "ODISA", estado: "reservado" }]);
  await manejar(db, { accion: "resultado", zoho_po_id: "po1", estado: "enviado", telefono: "55 1234 5678", wa_message_id: "wamid.1" }, sinCorreo);
  assertEquals([tabla.get("po1")?.estado, tabla.get("po1")?.telefono, tabla.get("po1")?.wa_message_id], ["enviado", "+525512345678", "wamid.1"]);

  const correos: { asunto: string; html: string }[] = [];
  const correo = (_to: string[], asunto: string, html: string) => { correos.push({ asunto, html }); return Promise.resolve(true); };
  const f = dbFalsa({ activo: true }, [{ zoho_po_id: "po2", po_number: "COM-OC-01501", vendor_name: "MAHA", estado: "reservado" }]);
  await manejar(f.db, { accion: "resultado", zoho_po_id: "po2", estado: "fallido", telefono: "5598765432", error: "Meta 131026" }, { correo });
  assertEquals(f.tabla.get("po2")?.estado, "fallido");
  assertEquals(correos[0].asunto, "WhatsApp: no se mandó la OC COM-OC-01501");
  assertEquals(correos[0].html.includes("…5432"), true);
  assertEquals(correos[0].html.includes("5598765432"), false);

  const g = dbFalsa({ activo: true }, [{ zoho_po_id: "po3", po_number: "COM-OC-01502", vendor_name: "B&<C>", estado: "reservado" }]);
  await manejar(g.db, { accion: "resultado", zoho_po_id: "po3", estado: "sin_numero" }, { correo });
  assertEquals(correos[1].html.includes("B&amp;&lt;C&gt;"), true);
  assertEquals(correos[1].html.includes("WhatsApp OCs"), true);
});

Deno.test("resultado solo actúa sobre una fila reservada", async () => {
  const { db, tabla } = dbFalsa({ activo: true }, [{ zoho_po_id: "po1", po_number: "X", estado: "leido" }]);
  const r = await manejar(db, { accion: "resultado", zoho_po_id: "po1", estado: "fallido" }, sinCorreo);
  assertEquals(r.status, 409);
  assertEquals(tabla.get("po1")?.estado, "leido");
});

Deno.test("estado_meta avanza y nunca retrocede; failed avisa", async () => {
  const { db, tabla } = dbFalsa({ activo: true }, [{ zoho_po_id: "po1", po_number: "COM-OC-01500", vendor_name: "ODISA", estado: "enviado", wa_message_id: "w1" }]);
  await manejar(db, { accion: "estado_meta", wa_message_id: "w1", estado: "read" }, sinCorreo);
  assertEquals(tabla.get("po1")?.estado, "leido");
  await manejar(db, { accion: "estado_meta", wa_message_id: "w1", estado: "delivered" }, sinCorreo);
  assertEquals(tabla.get("po1")?.estado, "leido");
  let avisos = 0;
  const f = dbFalsa({ activo: true }, [{ zoho_po_id: "po2", po_number: "COM-OC-01501", vendor_name: "MAHA", estado: "enviado", wa_message_id: "w2" }]);
  await manejar(f.db, { accion: "estado_meta", wa_message_id: "w2", estado: "failed", error: "no entregable" }, { correo: () => { avisos++; return Promise.resolve(true); } });
  assertEquals([f.tabla.get("po2")?.estado, avisos], ["fallido", 1]);
});

Deno.test("respuesta: liga al último envío del número y reenvía a compras; sin OC dice sin OC ligada", async () => {
  const correos: { asunto: string; html: string }[] = [];
  const correo = (_to: string[], asunto: string, html: string) => { correos.push({ asunto, html }); return Promise.resolve(true); };
  const { db } = dbFalsa({ activo: true }, [
    { zoho_po_id: "a", po_number: "COM-OC-01", vendor_name: "ODISA", telefono: "+525512345678", estado: "leido", enviado_at: "2026-11-20T10:00:00Z" },
    { zoho_po_id: "b", po_number: "COM-OC-02", vendor_name: "ODISA", telefono: "+525512345678", estado: "enviado", enviado_at: "2026-11-21T10:00:00Z" },
  ]);
  const r = await manejar(db, { accion: "respuesta", telefono: "5215512345678", texto: "Recibido <ok>" }, { correo });
  assertEquals((r.json as { po_number: string }).po_number, "COM-OC-02");
  assertEquals(correos[0].asunto, "WhatsApp de ODISA sobre COM-OC-02");
  assertEquals(correos[0].html.includes("Recibido &lt;ok&gt;"), true);
  await manejar(db, { accion: "respuesta", telefono: "5500000000", texto: "hola" }, { correo });
  assertEquals(correos[1].asunto, "WhatsApp de …0000 sin OC ligada");
});

Deno.test("acción desconocida o datos faltantes → 400", async () => {
  const { db } = dbFalsa({ activo: true });
  assertEquals((await manejar(db, { accion: "x" }, sinCorreo)).status, 400);
  assertEquals((await manejar(db, { accion: "reservar", zoho_po_id: "" }, sinCorreo)).status, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/com-oc-whatsapp`
Expected: FAIL con `Module not found ".../whatsapp.ts"`.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/com-oc-whatsapp/whatsapp.ts
import { enviarCorreo } from "../_shared/correo.ts";
import { leerConfig, type SupabaseClient } from "../_shared/db.ts";

/** n8n manda x-oc-whatsapp-secreto; COM_SECRETO no abre esta función (spec §4). */
export function autorizadoWhatsapp(req: Request): boolean {
  const esperado = Deno.env.get("OC_WHATSAPP_SECRETO") ?? "";
  const recibido = req.headers.get("x-oc-whatsapp-secreto") ?? "";
  if (!esperado || recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}

/** Número de México a +52 y 10 dígitos; quita lada 52, 521 y los prefijos 044/045. */
export function normalizarTelefono(x: unknown): string | null {
  let d = String(x ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("044")) d = d.slice(3);
  else if (d.length === 13 && d.startsWith("045")) d = d.slice(3);
  else if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return d.length === 10 ? "+52" + d : null;
}

export const mascara = (tel: string | null | undefined) => (tel ? "…" + String(tel).slice(-4) : "—");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const ORDEN: Record<string, number> = { reservado: 0, enviado: 1, entregado: 2, leido: 3 };
const META: Record<string, "entregado" | "leido" | "fallido"> = { delivered: "entregado", read: "leido", failed: "fallido" };

type Resp = { status: number; json: unknown };
const ok = (json: unknown): Resp => ({ status: 200, json });
const mal = (error: string, status = 400): Resp => ({ status, json: { error } });

export async function manejar(db: SupabaseClient, body: Record<string, unknown>,
  deps: { correo?: typeof enviarCorreo } = {}): Promise<Resp> {
  const correo = deps.correo ?? enviarCorreo;
  const txt = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  // deno-lint-ignore no-explicit-any
  const cfg: any = await leerConfig(db);
  const destinos: string[] = Array.isArray(cfg?.auto?.correos) ? cfg.auto.correos : [];
  const avisar = (asunto: string, html: string) => correo(destinos, asunto, html, "WhatsApp de OCs");

  switch (body.accion) {
    case "reservar": {
      const id = txt("zoho_po_id"), folio = txt("po_number");
      if (!id || !folio) return mal("faltan zoho_po_id o po_number");
      const wa = cfg?.whatsapp ?? {};
      const lista: string[] = Array.isArray(wa.solo_vendor_ids) ? wa.solo_vendor_ids.map(String) : [];
      const motivo = wa.activo !== true ? "WhatsApp apagado"
        : lista.length && !lista.includes(txt("vendor_id")) ? "proveedor fuera de la prueba" : null;
      const fila = { zoho_po_id: id, po_number: folio, vendor_id: txt("vendor_id") || null, vendor_name: txt("vendor_name") || null,
        estado: motivo ? "omitido" : "reservado", ...(motivo ? { error: motivo } : {}) };
      const { error } = await db.from("com_oc_whatsapp").insert(fila);
      if (error && (error as { code?: string }).code === "23505") {
        const { data } = await db.from("com_oc_whatsapp").select("estado").eq("zoho_po_id", id).maybeSingle();
        return ok({ enviar: false, motivo: "ya registrada", estado: (data as { estado?: string } | null)?.estado ?? null });
      }
      if (error) throw error;
      return ok(motivo ? { enviar: false, motivo } : { enviar: true });
    }
    case "resultado": {
      const id = txt("zoho_po_id"), estado = txt("estado");
      if (!id || !["enviado", "fallido", "sin_numero"].includes(estado)) return mal("resultado inválido");
      const tel = normalizarTelefono(body.telefono);
      const ahora = new Date().toISOString();
      const cambios = { estado, telefono: tel, actualizado_at: ahora, error: txt("error") || null,
        ...(estado === "enviado" ? { wa_message_id: txt("wa_message_id") || null, enviado_at: ahora } : {}) };
      const { data, error } = await db.from("com_oc_whatsapp").update(cambios).eq("zoho_po_id", id).eq("estado", "reservado").select();
      if (error) throw error;
      const f = (data as Record<string, unknown>[] | null)?.[0];
      if (!f) return mal("la OC no está reservada", 409);
      if (estado !== "enviado") {
        const porque = estado === "sin_numero"
          ? "el proveedor no tiene número en el campo <b>WhatsApp OCs</b> de Zoho"
          : `falló el envío al ${esc(mascara(tel))}: ${esc(txt("error"))}`;
        await avisar(`WhatsApp: no se mandó la OC ${f.po_number}`,
          `<p>La OC <b>${esc(f.po_number)}</b> de ${esc(f.vendor_name)} no se mandó por WhatsApp: ${porque}.</p><p>Mándala a mano y, si corriges el número, usa "Reintentar WhatsApp" en Órdenes.</p>`);
      }
      return ok({ ok: true });
    }
    case "estado_meta": {
      const wid = txt("wa_message_id"), nuevo = META[txt("estado")];
      if (!wid || !nuevo) return mal("estado de Meta inválido");
      const { data: f } = await db.from("com_oc_whatsapp").select("*").eq("wa_message_id", wid).maybeSingle();
      const fila = f as Record<string, unknown> | null;
      if (!fila) return ok({ ok: false, motivo: "mensaje desconocido" });
      const actual = String(fila.estado);
      const avanza = nuevo === "fallido" ? actual === "enviado" || actual === "entregado" : (ORDEN[nuevo] ?? -1) > (ORDEN[actual] ?? 99);
      if (!avanza) return ok({ ok: true, sin_cambio: true });
      const ahora = new Date().toISOString();
      await db.from("com_oc_whatsapp").update({ estado: nuevo, actualizado_at: ahora,
        ...(nuevo === "entregado" ? { entregado_at: ahora } : nuevo === "leido" ? { leido_at: ahora } : { error: txt("error") || "Meta: no entregado" }) })
        .eq("wa_message_id", wid).eq("estado", actual).select();
      if (nuevo === "fallido") {
        await avisar(`WhatsApp: no se entregó la OC ${fila.po_number}`,
          `<p>Meta no entregó la OC <b>${esc(fila.po_number)}</b> a ${esc(fila.vendor_name)} (${esc(mascara(fila.telefono as string))}): ${esc(txt("error"))}.</p><p>Mándala a mano.</p>`);
      }
      return ok({ ok: true });
    }
    case "respuesta": {
      const tel = normalizarTelefono(body.telefono);
      if (!tel) return mal("teléfono inválido");
      const { data } = await db.from("com_oc_whatsapp").select("zoho_po_id,po_number,vendor_name")
        .eq("telefono", tel).order("enviado_at", { ascending: false }).limit(1).maybeSingle();
      const f = data as { zoho_po_id: string; po_number: string; vendor_name: string | null } | null;
      const asunto = f ? `WhatsApp de ${f.vendor_name ?? mascara(tel)} sobre ${f.po_number}` : `WhatsApp de ${mascara(tel)} sin OC ligada`;
      await avisar(asunto, `<p>${esc(txt("texto") || "(mensaje sin texto: puede traer un adjunto; revísalo en el panel de WhatsApp)")}</p>`);
      return ok(f ?? null);
    }
    default:
      return mal("acción desconocida");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/com-oc-whatsapp`
Expected: PASS (11 pruebas). Si la base falsa no cubre un método que el código usa, ajusta la base falsa, no el comportamiento.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/com-oc-whatsapp/whatsapp.ts supabase/functions/com-oc-whatsapp/whatsapp_test.ts
git commit -m "feat(comercializadora): función com-oc-whatsapp (reservar, resultado, avisos de Meta, respuestas)"
```

---

### Task 3: Entrada HTTP y configuración de la función

**Files:**
- Create: `supabase/functions/com-oc-whatsapp/index.ts`
- Modify: `supabase/config.toml` (después de `[functions.zoho-proveedor-minimo]`)
- Test: `supabase/functions/com-oc-whatsapp/whatsapp_test.ts` (agregar)

**Interfaces:**
- Consumes: `autorizadoWhatsapp`, `manejar` (Task 2); `admin` de `../_shared/db.ts`.
- Produces: `responder(req: Request, deps: { db: () => SupabaseClient; manejar: typeof manejar }): Promise<Response>` exportada desde `whatsapp.ts` para probarla sin servidor.

- [ ] **Step 1: Write the failing test** (agregar a `whatsapp_test.ts`)

```ts
import { responder } from "./whatsapp.ts";

Deno.test("responder: 401 sin secreto, 405 si no es POST, 200 con el JSON de manejar, 500 sin filtrar el error", async () => {
  Deno.env.set("OC_WHATSAPP_SECRETO", "s3creto-wa");
  const deps = (m: () => Promise<{ status: number; json: unknown }>) => ({ db: () => ({}) as never, manejar: m as never });
  const post = (h: Record<string, string>) => new Request("https://x", { method: "POST", headers: h, body: JSON.stringify({ accion: "reservar" }) });
  assertEquals((await responder(post({}), deps(() => Promise.resolve({ status: 200, json: {} })))).status, 401);
  assertEquals((await responder(new Request("https://x", { headers: { "x-oc-whatsapp-secreto": "s3creto-wa" } }), deps(() => Promise.resolve({ status: 200, json: {} })))).status, 405);
  const r = await responder(post({ "x-oc-whatsapp-secreto": "s3creto-wa" }), deps(() => Promise.resolve({ status: 200, json: { enviar: true } })));
  assertEquals([r.status, await r.json()], [200, { enviar: true }]);
  const e = await responder(post({ "x-oc-whatsapp-secreto": "s3creto-wa" }), deps(() => Promise.reject(new Error("detalle interno postgres://x"))));
  assertEquals([e.status, await e.json()], [500, { error: "error interno" }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/com-oc-whatsapp`
Expected: FAIL con `does not provide an export named 'responder'`.

- [ ] **Step 3: Implement** (al final de `whatsapp.ts`, e `index.ts` nuevo)

```ts
// supabase/functions/com-oc-whatsapp/whatsapp.ts (agregar)
export async function responder(req: Request,
  deps: { db: () => SupabaseClient; manejar: typeof manejar }): Promise<Response> {
  const json = (status: number, x: unknown) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });
  if (!autorizadoWhatsapp(req)) return json(401, { error: "No autorizado" });
  if (req.method !== "POST") return json(405, { error: "Solo POST" });
  const body = await req.json().catch(() => ({}));
  try {
    const r = await deps.manejar(deps.db(), (body ?? {}) as Record<string, unknown>);
    return json(r.status, r.json);
  } catch (e) {
    console.error("com-oc-whatsapp:", (e as Error).message?.slice(0, 200));
    return json(500, { error: "error interno" });
  }
}
```

```ts
// supabase/functions/com-oc-whatsapp/index.ts
import { admin } from "../_shared/db.ts";
import { manejar, responder } from "./whatsapp.ts";

// Solo n8n llama aquí, con x-oc-whatsapp-secreto (spec §4). Sin CORS: no se llama desde el navegador.
Deno.serve((req) => responder(req, { db: admin, manejar }));
```

```toml
# supabase/config.toml (agregar después de [functions.zoho-proveedor-minimo])
# n8n entra con su propio secreto x-oc-whatsapp-secreto (spec OC por WhatsApp §4), no con JWT.
[functions.com-oc-whatsapp]
verify_jwt = false
```

- [ ] **Step 4: Run the whole functions suite**

Run: `npm run test:funciones`
Expected: PASS, incluida `com-oc-whatsapp`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/com-oc-whatsapp supabase/config.toml
git commit -m "feat(comercializadora): entrada HTTP de com-oc-whatsapp con secreto propio"
```

---

### Task 4: Etiquetas y bandera (puras, portal)

**Files:**
- Create: `lib/comercializadora/whatsapp.ts`
- Test: `tests/portal/com-whatsapp.test.ts`

**Interfaces:**
- Produces:
  - `type EnvioWhatsapp = { zoho_po_id: string; po_number: string; estado: string; error: string | null; enviado_at: string | null; leido_at: string | null }`
  - `etiquetaWhatsapp(e: EnvioWhatsapp | undefined): { texto: string; tono: 'ok' | 'bajo' | 'neutro'; reintentable: boolean }`
  - `leerBanderaWhatsapp(cfg: unknown): { activo: boolean; solo_vendor_ids: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/portal/com-whatsapp.test.ts
import { describe, expect, it } from 'vitest';
import { etiquetaWhatsapp, leerBanderaWhatsapp } from '../../lib/comercializadora/whatsapp';

const e = (o: Record<string, unknown>) =>
  ({ zoho_po_id: 'p', po_number: 'COM-OC-1', estado: 'enviado', error: null, enviado_at: '2026-11-24T14:12:00Z', leido_at: null, ...o }) as never;

describe('WhatsApp de OCs (pantalla)', () => {
  it('etiqueta por estado, con hora de CDMX y reintento solo en fallas', () => {
    expect(etiquetaWhatsapp(undefined)).toEqual({ texto: '—', tono: 'neutro', reintentable: false });
    expect(etiquetaWhatsapp(e({}))).toEqual({ texto: 'Enviado 08:12', tono: 'ok', reintentable: false });
    expect(etiquetaWhatsapp(e({ estado: 'leido', leido_at: '2026-11-24T15:00:00Z' }))).toEqual({ texto: 'Leído 09:00', tono: 'ok', reintentable: false });
    expect(etiquetaWhatsapp(e({ estado: 'entregado' })).texto).toBe('Entregado');
    expect(etiquetaWhatsapp(e({ estado: 'reservado' })).texto).toBe('Enviando…');
    expect(etiquetaWhatsapp(e({ estado: 'fallido', error: 'Meta 131026' }))).toEqual({ texto: 'Falló: Meta 131026', tono: 'bajo', reintentable: true });
    expect(etiquetaWhatsapp(e({ estado: 'sin_numero' }))).toEqual({ texto: 'Sin número', tono: 'bajo', reintentable: true });
    expect(etiquetaWhatsapp(e({ estado: 'omitido', error: 'WhatsApp apagado' }))).toEqual({ texto: 'No se mandó (WhatsApp apagado)', tono: 'neutro', reintentable: true });
  });
  it('bandera: apagada por omisión; lista solo de textos no vacíos', () => {
    expect(leerBanderaWhatsapp({})).toEqual({ activo: false, solo_vendor_ids: [] });
    expect(leerBanderaWhatsapp({ whatsapp: { activo: 'si' } })).toEqual({ activo: false, solo_vendor_ids: [] });
    expect(leerBanderaWhatsapp({ whatsapp: { activo: true, solo_vendor_ids: ['v1', '', 3] } })).toEqual({ activo: true, solo_vendor_ids: ['v1', '3'] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/portal/com-whatsapp.test.ts`
Expected: FAIL con `Failed to resolve import "../../lib/comercializadora/whatsapp"`.

- [ ] **Step 3: Implement**

```ts
// lib/comercializadora/whatsapp.ts
// Envío de OCs por WhatsApp (spec 2026-11-20-oc-whatsapp-proveedor-design.md §7): textos de la pantalla y bandera.
export type EnvioWhatsapp = {
  zoho_po_id: string;
  po_number: string;
  estado: string;
  error: string | null;
  enviado_at: string | null;
  leido_at: string | null;
};

const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' })
    : '';

export function etiquetaWhatsapp(e: EnvioWhatsapp | undefined): {
  texto: string;
  tono: 'ok' | 'bajo' | 'neutro';
  reintentable: boolean;
} {
  if (!e) return { texto: '—', tono: 'neutro', reintentable: false };
  switch (e.estado) {
    case 'enviado':
      return { texto: `Enviado ${hora(e.enviado_at)}`.trim(), tono: 'ok', reintentable: false };
    case 'entregado':
      return { texto: 'Entregado', tono: 'ok', reintentable: false };
    case 'leido':
      return { texto: `Leído ${hora(e.leido_at)}`.trim(), tono: 'ok', reintentable: false };
    case 'reservado':
      return { texto: 'Enviando…', tono: 'neutro', reintentable: false };
    case 'fallido':
      return { texto: `Falló${e.error ? `: ${e.error}` : ''}`, tono: 'bajo', reintentable: true };
    case 'sin_numero':
      return { texto: 'Sin número', tono: 'bajo', reintentable: true };
    default:
      return { texto: `No se mandó${e.error ? ` (${e.error})` : ''}`, tono: 'neutro', reintentable: true };
  }
}

export function leerBanderaWhatsapp(cfg: unknown): { activo: boolean; solo_vendor_ids: string[] } {
  const w = (cfg as { whatsapp?: { activo?: unknown; solo_vendor_ids?: unknown } } | null)?.whatsapp ?? {};
  const lista = Array.isArray(w.solo_vendor_ids) ? w.solo_vendor_ids.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  return { activo: w.activo === true, solo_vendor_ids: lista };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/portal/com-whatsapp.test.ts`
Expected: PASS (2 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/whatsapp.ts tests/portal/com-whatsapp.test.ts
git commit -m "feat(comercializadora): etiquetas de WhatsApp de OCs y lectura de la bandera"
```

---

### Task 5: Columna "WhatsApp" y reintento en Órdenes

**Files:**
- Modify: `app/(comercializadora)/comercializadora/ordenes/page.tsx` (leer `com_oc_whatsapp`, pasar `whatsapp`)
- Modify: `components/comercializadora/ordenes.tsx` (prop `whatsapp?: Record<string, EnvioWhatsapp>`, columna, botón)
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (acción `reintentarWhatsapp`)
- Test: `tests/portal/com-ordenes-whatsapp.test.tsx`

**Interfaces:**
- Consumes: `etiquetaWhatsapp`, `EnvioWhatsapp` (Task 4); RPC `com_oc_whatsapp_reintentar` (Task 1).
- Produces: `reintentarWhatsapp(zohoPoId: string): Promise<Resultado<{ borrada: boolean }>>`.

- [ ] **Step 1: Write the failing test**

Antes, lee cómo `tests/portal/com-envios.test.tsx` (o `com-crear-oc.test.tsx`) monta un componente de Comercializadora con `next/navigation` y acciones simuladas (`vi.mock`), y copia ese arranque.

```tsx
// tests/portal/com-ordenes-whatsapp.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const reintentar = vi.fn().mockResolvedValue({ ok: true, borrada: true });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/(comercializadora)/comercializadora/acciones', async (orig) => ({
  ...(await orig<object>()),
  reintentarWhatsapp: (id: string) => reintentar(id),
}));

import { Ordenes } from '../../components/comercializadora/ordenes';

const grupo = (folio: string) =>
  ({ folio, fecha: '2026-11-24', proveedor: 'ODISA', skus: 1, uds: 10, monto: 100, destino: 'CEDIS', fecha_arribo: null, estado: 'emitida', items: [] }) as never;
const base = { proveedores: ['ODISA'], catalogo: [], ultimoSync: null, hoy: '2026-11-24' };

describe('Órdenes: columna WhatsApp', () => {
  it('muestra el estado por folio y el reintento solo con edición y en fallas', async () => {
    render(
      <Ordenes
        {...base}
        editable
        grupos={[grupo('COM-OC-1'), grupo('COM-OC-2'), grupo('COM-OC-3')]}
        whatsapp={{
          'COM-OC-1': { zoho_po_id: 'p1', po_number: 'COM-OC-1', estado: 'leido', error: null, enviado_at: null, leido_at: '2026-11-24T15:00:00Z' },
          'COM-OC-2': { zoho_po_id: 'p2', po_number: 'COM-OC-2', estado: 'sin_numero', error: null, enviado_at: null, leido_at: null },
        }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.getByText('Leído 09:00')).toBeTruthy();
    expect(screen.getByText('Sin número')).toBeTruthy();
    const botones = screen.getAllByRole('button', { name: /Reintentar WhatsApp/ });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    expect(reintentar).toHaveBeenCalledWith('p2');
  });

  it('sin edición no hay botón', () => {
    render(
      <Ordenes
        {...base}
        editable={false}
        grupos={[grupo('COM-OC-2')]}
        whatsapp={{ 'COM-OC-2': { zoho_po_id: 'p2', po_number: 'COM-OC-2', estado: 'fallido', error: 'x', enviado_at: null, leido_at: null } }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Reintentar WhatsApp/ })).toBeNull();
  });
});
```

Si `OcGrupo` tiene más campos obligatorios que los de `grupo()`, agrégalos copiando `lib/comercializadora/ordenes.ts` (ruling si cambia la forma).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/portal/com-ordenes-whatsapp.test.tsx`
Expected: FAIL: no existe la columna "WhatsApp".

- [ ] **Step 3: Implement**

Acción (en `acciones.ts`, junto a `eliminarOc`):

```ts
/** Reintento de WhatsApp (spec OC por WhatsApp §7): borra el registro fallido para que el próximo webhook lo reserve. */
export async function reintentarWhatsapp(zohoPoId: string): Promise<Resultado<{ borrada: boolean }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await s.db.rpc('com_oc_whatsapp_reintentar', { p_zoho_po_id: zohoPoId });
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/ordenes');
    return { ok: true, borrada: r.data === true };
  } catch (e) {
    return fallo(e);
  }
}
```

Página (`ordenes/page.tsx`): agregar al `Promise.all` la lectura y pasarla como mapa por folio.

```ts
    leerTodoCom<EnvioWhatsapp>(
      db,
      'com_oc_whatsapp',
      'zoho_po_id,po_number,estado,error,enviado_at,leido_at',
      'zoho_po_id',
    ),
```

```ts
  const whatsapp = Object.fromEntries(envios.map((w) => [w.po_number, w]));
  // … y en el JSX: <Ordenes … whatsapp={whatsapp} />
```

(con `import type { EnvioWhatsapp } from '@/lib/comercializadora/whatsapp';` y desestructurando `envios` del `Promise.all`).

Componente (`ordenes.tsx`):
- prop nueva `whatsapp?: Record<string, EnvioWhatsapp>`;
- `<th>WhatsApp</th>` después de `<th>Estado</th>`;
- celda por fila:

```tsx
                  <td>
                    {(() => {
                      const w = etiquetaWhatsapp(p.whatsapp?.[g.folio]);
                      const fila = p.whatsapp?.[g.folio];
                      return (
                        <div className="space-y-1">
                          <Pill tono={w.tono}>{w.texto}</Pill>
                          {p.editable && w.reintentable && fila ? (
                            <button
                              type="button"
                              className="block text-xs underline"
                              aria-label={`Reintentar WhatsApp ${g.folio}`}
                              onClick={async () => {
                                const r = await reintentarWhatsapp(fila.zoho_po_id);
                                if ('error' in r) setError(r.error);
                                else router.refresh();
                              }}
                            >
                              Reintentar WhatsApp
                            </button>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
```

Revisa la firma real de `Pill` en `components/portal/piezas` (prop `tono` con tipo `Estado`): si sus valores no son `ok`/`bajo`/`neutro`, mapea en el componente (ruling).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/portal/com-ordenes-whatsapp.test.tsx tests/portal/com-ordenes.test.ts && npx tsc --noEmit -p .`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add "app/(comercializadora)/comercializadora/ordenes/page.tsx" components/comercializadora/ordenes.tsx "app/(comercializadora)/comercializadora/acciones.ts" tests/portal/com-ordenes-whatsapp.test.tsx
git commit -m "feat(comercializadora): columna WhatsApp y reintento en Órdenes"
```

---

### Task 6: Interruptor en Configuración

**Files:**
- Create: `components/comercializadora/whatsapp-config.tsx`
- Modify: `app/(comercializadora)/comercializadora/configuracion/page.tsx` (render del bloque)
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (acción `guardarWhatsapp`)
- Test: `tests/portal/com-whatsapp-config.test.tsx`

**Interfaces:**
- Consumes: `leerBanderaWhatsapp` (Task 4).
- Produces: `guardarWhatsapp(activo: boolean, soloVendorIds: string[]): Promise<Resultado>`; componente `WhatsappConfig(p: { activo: boolean; solo: string[]; proveedores: { vendor_id: string; nombre: string | null }[]; editable: boolean })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/portal/com-whatsapp-config.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const guardar = vi.fn().mockResolvedValue({ ok: true });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(comercializadora)/comercializadora/acciones', () => ({ guardarWhatsapp: (...a: unknown[]) => guardar(...a) }));

import { WhatsappConfig } from '../../components/comercializadora/whatsapp-config';

const provs = [
  { vendor_id: 'v1', nombre: 'ODISA' },
  { vendor_id: 'v2', nombre: 'MAHA' },
];

describe('Configuración: WhatsApp de OCs', () => {
  it('prende, elige proveedores de prueba y guarda', async () => {
    render(<WhatsappConfig activo={false} solo={[]} proveedores={provs} editable />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mandar OCs emitidas por WhatsApp' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo a ODISA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar WhatsApp' }));
    await waitFor(() => expect(guardar).toHaveBeenCalledWith(true, ['v1']));
  });
  it('sin edición todo queda deshabilitado', () => {
    render(<WhatsappConfig activo solo={['v2']} proveedores={provs} editable={false} />);
    expect((screen.getByRole('checkbox', { name: 'Mandar OCs emitidas por WhatsApp' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar WhatsApp' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/portal/com-whatsapp-config.test.tsx`
Expected: FAIL: no existe `components/comercializadora/whatsapp-config`.

- [ ] **Step 3: Implement**

```ts
// acciones.ts (junto a guardarConfig)
/** Bandera de WhatsApp de OCs (spec §3): fuera de CAMPOS_CONFIG para no tocar planCfgDef. Con historial. */
export async function guardarWhatsapp(activo: boolean, soloVendorIds: string[]): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    const antes = leerBanderaWhatsapp(actual.data.config);
    const despues = { activo: activo === true, solo_vendor_ids: [...new Set(soloVendorIds.map(String).filter(Boolean))] };
    if (JSON.stringify(antes) === JSON.stringify(despues)) return { error: 'No hay cambios que guardar' };
    const version = Number(actual.data.version);
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: { ...(actual.data.config ?? {}), whatsapp: despues }, version: version + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Otra persona guardó la configuración. Recarga y vuelve a intentarlo.' };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert({ ambito: 'config', clave: 'whatsapp', valor_anterior: antes, valor_nuevo: despues });
    revalidatePath('/comercializadora/configuracion');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

```tsx
// components/comercializadora/whatsapp-config.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { guardarWhatsapp } from '@/app/(comercializadora)/comercializadora/acciones';

export function WhatsappConfig(p: {
  activo: boolean;
  solo: string[];
  proveedores: { vendor_id: string; nombre: string | null }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [activo, setActivo] = useState(p.activo);
  const [solo, setSolo] = useState<string[]>(p.solo);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const alternar = (id: string) => setSolo((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <section className="placa space-y-3 px-4 py-3 text-sm">
      <h2 className="font-semibold">WhatsApp de OCs</h2>
      <p className="text-muted-foreground">
        Cuando una OC pasa a emitida en Zoho, n8n manda el PDF al número del campo &quot;WhatsApp OCs&quot; del proveedor.
        Si eliges proveedores abajo, solo a ellos (para probar).
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={activo} disabled={!p.editable} onChange={(e) => setActivo(e.target.checked)} />
        Mandar OCs emitidas por WhatsApp
      </label>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {p.proveedores.map((v) => (
          <label key={v.vendor_id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={solo.includes(v.vendor_id)}
              disabled={!p.editable}
              onChange={() => alternar(v.vendor_id)}
            />
            Solo a {v.nombre ?? v.vendor_id}
          </label>
        ))}
      </div>
      {p.editable ? (
        <button
          type="button"
          className="boton"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await guardarWhatsapp(activo, solo);
              setMsg('error' in r ? r.error : 'Guardado.');
              if (!('error' in r)) router.refresh();
            })
          }
        >
          Guardar WhatsApp
        </button>
      ) : null}
      {msg ? <p role="status">{msg}</p> : null}
    </section>
  );
}
```

Revisa la clase de botón que usan los demás componentes de Comercializadora (`configuracion.tsx`) y úsala en lugar de `boton` si es otra.

Página (`configuracion/page.tsx`): leer `com_zoho_proveedor (vendor_id,nombre)` con `leerTodoCom` y el `config` ya cargado, y agregar después del editor actual:

```tsx
      <WhatsappConfig
        activo={leerBanderaWhatsapp(config).activo}
        solo={leerBanderaWhatsapp(config).solo_vendor_ids}
        proveedores={proveedores}
        editable={editable}
      />
```

(los nombres `config` y `editable` son los que ya usa la página; si se llaman distinto, usa los suyos).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/portal/com-whatsapp-config.test.tsx tests/portal/com-config.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/comercializadora/whatsapp-config.tsx "app/(comercializadora)/comercializadora/configuracion/page.tsx" "app/(comercializadora)/comercializadora/acciones.ts" tests/portal/com-whatsapp-config.test.tsx
git commit -m "feat(comercializadora): interruptor de WhatsApp de OCs en Configuración"
```

---

### Task 7: Flujos de n8n (JSON) y su validación

**Files:**
- Create: `n8n/oc-whatsapp-envio.json`, `n8n/oc-whatsapp-avisos.json`
- Create: `scripts/n8n/validar.ts`
- Test: `tests/portal/n8n-whatsapp.test.ts`

**Interfaces:**
- Consumes: acciones de la función (Task 2) por HTTP `POST {{$vars.PORTAL_FUNCIONES_URL}}/com-oc-whatsapp` con header `x-oc-whatsapp-secreto` desde la credencial "Portal OC WhatsApp" (Header Auth).
- Produces: `validarFlujo(json: unknown, esperado: string[]): string[]` (lista de problemas; vacía = válido).

- [ ] **Step 1: Write the failing test**

```ts
// tests/portal/n8n-whatsapp.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validarFlujo } from '../../scripts/n8n/validar';

const leer = (f: string) => JSON.parse(readFileSync(`n8n/${f}`, 'utf8'));

describe('flujos de n8n de WhatsApp de OCs', () => {
  it('envío: nodos en orden y sin secretos', () => {
    expect(
      validarFlujo(leer('oc-whatsapp-envio.json'), [
        'Webhook Zoho',
        'Reservar en portal',
        '¿Enviar?',
        'Leer OC en Zoho',
        '¿Sigue emitida?',
        'Leer proveedor en Zoho',
        '¿Tiene número?',
        'PDF de la OC',
        'Mandar WhatsApp',
        'Resultado enviado',
        'Resultado sin número',
        'Resultado fallido',
      ]),
    ).toEqual([]);
  });
  it('avisos de Meta: verificación, estados y respuestas', () => {
    expect(
      validarFlujo(leer('oc-whatsapp-avisos.json'), ['Webhook Meta', 'Verificar Meta', 'Estados a portal', 'Respuestas a portal']),
    ).toEqual([]);
  });
  it('el validador detecta secretos y nodos faltantes', () => {
    const malo = { nodes: [{ name: 'X', parameters: { headerValue: 'Bearer abc', url: 'https://x.supabase.co?apikey=1' } }], connections: {} };
    expect(validarFlujo(malo, ['X', 'Y'])).toEqual(
      expect.arrayContaining(['falta el nodo "Y"', 'el nodo "X" trae un valor que parece secreto']),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/portal/n8n-whatsapp.test.ts`
Expected: FAIL: no existe `scripts/n8n/validar`.

- [ ] **Step 3: Implement the validator and the two flows**

```ts
// scripts/n8n/validar.ts
// Valida un flujo exportado de n8n: nodos esperados presentes y sin valores que parezcan secretos.
const SOSPECHOSO = /(bearer\s+[a-z0-9._-]{3,}|apikey=|service_role|sb_secret_|eyJ[a-zA-Z0-9_-]{10,}|password)/i;

export function validarFlujo(json: unknown, esperado: string[]): string[] {
  const f = json as { nodes?: { name: string; parameters?: unknown; credentials?: Record<string, { id?: string; name?: string }> }[]; connections?: object };
  const out: string[] = [];
  if (!Array.isArray(f?.nodes)) return ['no es un flujo de n8n (falta nodes)'];
  const nombres = new Set(f.nodes.map((n) => n.name));
  for (const e of esperado) if (!nombres.has(e)) out.push(`falta el nodo "${e}"`);
  for (const n of f.nodes) {
    if (SOSPECHOSO.test(JSON.stringify(n.parameters ?? {}))) out.push(`el nodo "${n.name}" trae un valor que parece secreto`);
    for (const c of Object.values(n.credentials ?? {})) if (c.id) out.push(`el nodo "${n.name}" trae un id de credencial; deja solo el nombre`);
  }
  return out;
}
```

`n8n/oc-whatsapp-envio.json` — flujo con estos nodos y conexiones (tipos de n8n 1.x; `typeVersion` los del n8n del usuario, ajustables al importar):

1. **Webhook Zoho** (`n8n-nodes-base.webhook`, POST, path `oc-whatsapp`, `responseMode: onReceived`). Zoho manda `purchaseorder_id`, `purchaseorder_number`, `vendor_id`, `vendor_name` (los pone la regla, Task 8).
2. **Reservar en portal** (`n8n-nodes-base.httpRequest`, POST `={{$vars.PORTAL_FUNCIONES_URL}}/com-oc-whatsapp`, auth `genericCredentialType` → `httpHeaderAuth` credencial **Portal OC WhatsApp**, body JSON `{ accion: "reservar", zoho_po_id, po_number, vendor_id, vendor_name }` desde el webhook).
3. **¿Enviar?** (`n8n-nodes-base.if`, `{{$json.enviar}} === true`); falso → fin.
4. **Leer OC en Zoho** (HTTP GET `https://www.zohoapis.com/books/v3/purchaseorders/{{id}}?organization_id={{$vars.ZOHO_ORG_ID}}`, credencial OAuth2 **Zoho Books OAuth2**).
5. **¿Sigue emitida?** (if `purchaseorder.status === "open"`); falso → **Resultado fallido** con `error: "la OC ya no está emitida"`.
6. **Leer proveedor en Zoho** (HTTP GET `/contacts/{{vendor_id}}`; el número sale de `contact.custom_fields` con `label === "WhatsApp OCs"`).
7. **¿Tiene número?** (if el valor, sin espacios, tiene 10 dígitos o más); falso → **Resultado sin número**.
8. **PDF de la OC** (HTTP GET `/purchaseorders/{{id}}?accept=pdf`, `responseFormat: file`, propiedad binaria `pdf`).
9. **Mandar WhatsApp** (`n8n-nodes-base.whatsApp`, credencial **WhatsApp Cloud**, operación enviar plantilla `oc_emitida`, idioma `es_MX`, encabezado documento con el binario `pdf` y nombre `{{po_number}}.pdf`, variables: `vendor_name`, `purchaseorder_number`, `total` formateado `$#,##0.00`, `delivery_date` o "por confirmar"; destinatario: el número del paso 6 con `+52`). Con "Continue on fail" → error a **Resultado fallido**.
10. **Resultado enviado** (HTTP POST portal `{ accion: "resultado", zoho_po_id, estado: "enviado", telefono, wa_message_id: {{$json.messages[0].id}} }`).
11. **Resultado sin número** (`{ accion: "resultado", zoho_po_id, estado: "sin_numero" }`).
12. **Resultado fallido** (`{ accion: "resultado", zoho_po_id, estado: "fallido", telefono, error: {{$json.error.message}} }`).

`n8n/oc-whatsapp-avisos.json`:

1. **Webhook Meta** (GET y POST, path `meta-whatsapp`).
2. **Verificar Meta** (GET: responde `hub.challenge` si `hub.verify_token === $vars.META_VERIFY_TOKEN`; si no, 403).
3. **Estados a portal** (por cada `entry[].changes[].value.statuses[]` → POST `{ accion: "estado_meta", wa_message_id: id, estado: status, error: errors[0].title }`).
4. **Respuestas a portal** (por cada `value.messages[]` → POST `{ accion: "respuesta", telefono: from, texto: text.body }`).

Escribe los dos JSON en formato de exportación de n8n (`{ "name", "nodes": [...], "connections": {...}, "settings": {} }`), con `credentials` solo por `name` (sin `id`) y los hosts por `$vars`. Ningún valor real de secretos, tokens, org id ni URLs de proyecto.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/portal/n8n-whatsapp.test.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 5: Commit**

```bash
git add n8n scripts/n8n/validar.ts tests/portal/n8n-whatsapp.test.ts
git commit -m "feat(comercializadora): flujos de n8n para mandar OCs por WhatsApp"
```

---

### Task 8: Guía de puesta en marcha y cierre

**Files:**
- Create: `docs/migracion/whatsapp-oc.md`
- Modify: `docs/migracion/comercializadora.md` (sección nueva al final: "OCs por WhatsApp" con enlace a la guía)

- [ ] **Step 1: Escribir la guía** con estas secciones, en este orden y con los pasos concretos:
  1. **Meta** (usuario): crear/verificar Meta Business; alta del número dedicado en WhatsApp Business Platform; plantilla `oc_emitida` (texto exacto de Global Constraints, categoría Utilidad, idioma es_MX, encabezado Documento); token permanente de sistema.
  2. **Supabase del portal** (usuario): `npx.cmd supabase secrets set OC_WHATSAPP_SECRETO=<clave larga nueva> --project-ref jpqkmnfjwzniptszjuli` (nunca pegarla en chats ni commits).
  3. **n8n** (usuario): variables `PORTAL_FUNCIONES_URL` (`https://jpqkmnfjwzniptszjuli.supabase.co/functions/v1`), `ZOHO_ORG_ID`, `META_VERIFY_TOKEN`; credenciales "Zoho Books OAuth2" (scope `ZohoBooks.purchaseorders.READ,ZohoBooks.contacts.READ`), "WhatsApp Cloud", "Portal OC WhatsApp" (Header Auth `x-oc-whatsapp-secreto`); importar los dos JSON; activar; en Meta, webhook al URL de "Webhook Meta" con el verify token, suscrito a `messages`.
  4. **Zoho Books** (usuario): campo personalizado de Contactos "WhatsApp OCs" (texto, solo proveedores); regla de flujo de trabajo de Órdenes de compra "al crear o editar, cuando Estado = Emitida", acción Webhook POST al URL de "Webhook Zoho" con los parámetros `purchaseorder_id`, `purchaseorder_number`, `vendor_id`, `vendor_name`.
  5. **Prueba** (usuario y agente): proveedor de prueba con "WhatsApp OCs" = el celular del usuario; en Configuración prender WhatsApp y elegir solo ese proveedor; emitir una OC de prueba; verificar el PDF en el celular, la columna en Órdenes y la fila en `com_oc_whatsapp` (lectura); responder el WhatsApp y ver el correo en compras@ (solo con `COM_EFECTOS_EXTERNOS=si`, es decir, después del cutover).
  6. **Arranque**: compras avisa a los proveedores y captura los números; vaciar "Solo a…"; revisar la columna los primeros días.
  7. **Apagar**: desmarcar en Configuración (n8n recibe `enviar: false`); o desactivar el flujo en n8n.

- [ ] **Step 2: Suite completa**

Run: `npm test 2>&1 | tail -20; npm run test:funciones 2>&1 | tail -5; npx tsc --noEmit -p .; npm run lint`
Expected: todo en verde salvo `tests/migracion/paridad.test.ts` (falta el Excel de costeo en worktrees; falla conocida, se anota).

- [ ] **Step 3: Commit**

```bash
git add docs/migracion/whatsapp-oc.md docs/migracion/comercializadora.md
git commit -m "docs(migracion): guía para mandar OCs por WhatsApp"
```

---

## Self-review (hecho al escribir)

- **Cobertura de la spec:** §3 datos → Task 1 y 4; §4 función → Tasks 2–3; §5 y §6 n8n → Task 7; §7 pantalla → Tasks 5–6; §8 errores/seguridad → Global Constraints, Tasks 2–3 (secreto propio, máscara, 500 sin detalle); §9 pruebas → cada tarea; §10 puesta en marcha → Task 8.
- **Decisión del plan (ruling sobre la spec):** los correos a compras@ los manda la función (con `enviarCorreo`), no n8n: un solo lugar para el texto y la lista de destinatarios (`auto.correos`), y n8n no necesita credencial de correo. Costo si es incorrecto: antes del cutover (`COM_EFECTOS_EXTERNOS` apagado) esos correos solo quedan en el log; la prueba completa de correos se hace después del martes.
- **Tipos consistentes:** `EnvioWhatsapp` (Task 4) es la fila que lee Task 5; `manejar`/`responder` (Tasks 2–3); `com_oc_whatsapp_reintentar(p_zoho_po_id)` (Tasks 1 y 5); `guardarWhatsapp(activo, soloVendorIds)` (Task 6).
- **Sin placeholders:** los JSON de n8n se describen nodo por nodo con parámetros exactos y los valida una prueba; los secretos y hosts van por credencial/variable a propósito.
