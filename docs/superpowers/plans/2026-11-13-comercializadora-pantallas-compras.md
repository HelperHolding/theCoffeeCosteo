# Comercializadora: módulo y pantallas de Comprar y Pagar (plan 3 de 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El módulo Comercializadora aparece en el portal para quien tenga acceso. Trae las seis pantallas del grupo **Comprar y Pagar** del sitio viejo: Qué pedir, OC automáticas, Órdenes de compra, Mínimos de proveedor, Proveedores sin stock y Pagos proyectados. Leen las tablas `com_*` del portal y escriben lo mismo que escribía el sitio viejo.

**Architecture:** Un route group `app/(comercializadora)/comercializadora/` con la misma puerta de acceso que CRM y BI (`sesionComercializadora()` y RLS por `com_puede_leer()`/`com_puede_editar()`). Las páginas son server components que leen con la sesión del usuario. La interacción (filtros, formularios) va en client components de `components/comercializadora/`. Los cálculos que el sitio viejo hacía en el navegador se portan **tal cual** a funciones puras en `lib/comercializadora/`, con pruebas. Las escrituras van en server actions, y cuando hace falta llaman a las Edge Functions con el secreto compartido, solo desde el servidor.

**Tech Stack:** Next.js 16 (App Router, server actions), React, Tailwind, `@supabase/ssr`, Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (Fase 1 · Pantallas). Planes previos: `2026-11-12-migracion-fase-0.md` (PR #111) y `2026-11-12-migracion-fase-1-datos-funciones.md` (PR #112).

## Decisiones sobre el spec (al planear, 2026-11-13)

1. **El alcance se divide por bloques** (lo eligió el usuario). En el sitio viejo Comercializadora tiene unas 20 pantallas, no 7.
   - **Este plan (3):** el módulo y el grupo Comprar y Pagar.
   - **Plan 3b:** Inventario con conteo físico, Configuración del cálculo e historial, y edición de catálogo, lead times y kit.
   - **Plan 3c:** Planear (semanal, hoy, todo lo demás, importaciones, café), KPIs, Traspasos, Ventas/Envíos, DOH, Mapeo SKU y Crédito.
   - **Plan 4:** paridad y cutover. Espera a que todo lo que escribe exista en el portal.
2. **Los cálculos son una traducción fiel** de las funciones del HTML viejo `origin/main` `a9e4a22`. Cada función del plan cita su origen (`_qpFilas`, `_cieU`, `_pagAgrupar`…), y las pruebas fijan casos del comportamiento actual.
3. **"Poner al día con Zoho" (subir Excel) no se porta.** `zoho-sync` ya concilia las OCs con Zoho en el servidor cada 30 minutos (`_shared/conciliarOc.ts`, que es el port de `_zocConciliar`).
4. **La lista de proveedores para una OC nueva sale de `com_zoho_proveedor`.** El sitio viejo usaba `com_proveedores`, que está vacía y no se copió (decisión 6 del plan 2).
5. **El portal llama a las Edge Functions solo desde el servidor**, en `lib/comercializadora/funciones.ts`, con `COM_SECRETO`, que es una variable de entorno del servidor en Vercel y local. El secreto nunca llega al navegador.
6. **El botón "Correr ahora (real)" de OC automáticas aparece solo si `auto.modo = 'real'`.** En el portal sigue en simulación hasta el cutover, y aun en real, sin `COM_EFECTOS_EXTERNOS` la función no crea nada en Zoho (decisión 4 del plan 2).
7. **El gráfico apilado de Pagos se cambia por la tabla proveedor × periodo con barras** (`Barra`). Se conservan las mismas cifras, KPIs y filtros.
8. **Las tablas `com_*` no se agregan a `database.types.ts`** (son 17 y el resto del portal no las usa). Se leen con un acceso sin tipos (`com(db)`), y los tipos de fila de cada pantalla viven en `lib/comercializadora/tipos.ts`.

## Global Constraints

- Ruta base: `/comercializadora`. Módulo `comercializadora` en `perfil_modulos`, con niveles `lectura` (ver), `edicion` y `desarrollador` (ver y escribir).
- Sin acceso al módulo, la página redirige a `/`. Las acciones responden `{ error: 'Tu acceso a Comercializadora es de solo lectura.' }` o el error de acceso.
- "Hoy" es siempre el día de Ciudad de México (`America/Mexico_City`), igual que el sitio viejo (`_cieHoy`, `hoyCdmx`).
- Diseño: `docs/DESIGN-DIRECTION.md`, piezas de `components/portal/piezas.tsx`, tablas `.tabla` de 13–14 px, máximo 25 filas visibles por página o "Ver más", y los tres estados (cargando, vacío, error en lenguaje claro).
- Montos en MXN con 2 decimales (`Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`).
- Nada de producción se toca sin el OK del usuario. Asignar el módulo a una persona para la verificación visual también requiere OK.
- Pruebas: `npm test`, `npm run typecheck`, `npm run format:check` sobre los archivos tocados.

## Review Focus

1. **Un usuario con `lectura` intenta escribir** (guardar cierre, OC, mínimo, correr OC automática) llamando la acción directamente. Debe recibir el error de solo lectura sin tocar la base. Lo cubren las Tareas 4 a 7.
2. **No hay proyección todavía o la última es vieja** (más de 36 h, sin `calculado_at`). Qué pedir y Pagos deben mostrar el aviso del sitio viejo y no números falsos. Lo cubren las Tareas 3 y 8.
3. **Fechas cerca de medianoche o del cambio de mes.** "Hoy" CDMX, el último día para pedir (`ini − ceil(LT) − 1`) y los periodos de pago (semana lunes a domingo, quincena 1–15 y 16–fin, mes) no deben correrse un día. Lo cubren las Tareas 2, 4 y 8.
4. **Una Edge Function falla o tarda** al guardar un cierre o un mínimo. Lo guardado queda y la persona ve que el recálculo o el envío falló, sin perder su captura. Lo cubren las Tareas 4 y 7.
5. **Artículos sin costo, sin proveedor o sin venta diaria.** Qué pedir no debe dividir entre cero ni sumar piezas de artículos distintos como inventario de proveedor (`_qpProveedores` usa pesos). Lo cubre la Tarea 2.

---

### Task 1: El módulo en el portal (registro, sesión, navegación y layout)

**Files:**
- Modify: `lib/portal/modulos.ts`, `lib/supabase/database.types.ts:21`, `lib/supabase/sesion.ts`
- Modify: `components/portal/navegacion.tsx`, `components/portal/marco.tsx`, `components/portal/tarjetas-modulos.tsx`
- Create: `app/(comercializadora)/comercializadora/layout.tsx`, `app/(comercializadora)/comercializadora/loading.tsx`, `app/(comercializadora)/comercializadora/page.tsx` (provisional; la Tarea 3 lo reemplaza)
- Test: `tests/portal/modulos.test.ts`, `tests/portal/comercializadora-sesion.test.ts`

**Interfaces:**
- Produces: `IdModulo` incluye `'comercializadora'`; `Accesos` incluye `comercializadora`; `puedeEditarCom(accesos: Accesos): boolean`; `sesionComercializadora(redirigir = true): Promise<{ db; perfil; accesos; nivel: NivelModulo }>`; `Seccion` incluye `'comercializadora'`.

- [ ] **Step 1: Pruebas que fallan**

Agregar a `tests/portal/modulos.test.ts` (dentro del archivo, con los imports que ya tiene de `modulosVisibles`):

```ts
import { puedeEditarCom } from '../../lib/portal/modulos';

describe('módulo Comercializadora', () => {
  it('se ve con el acceso, con cualquier rol, y no sin él', () => {
    expect(modulosVisibles({ comercializadora: 'lectura' }, 'interno')).toContain('comercializadora');
    expect(modulosVisibles({ comercializadora: 'edicion' }, 'proveedor')).toContain('comercializadora');
    expect(modulosVisibles({}, 'admin')).not.toContain('comercializadora');
  });
  it('solo edición y desarrollador editan', () => {
    expect(puedeEditarCom({ comercializadora: 'lectura' })).toBe(false);
    expect(puedeEditarCom({ comercializadora: 'edicion' })).toBe(true);
    expect(puedeEditarCom({ comercializadora: 'desarrollador' })).toBe(true);
    expect(puedeEditarCom({})).toBe(false);
  });
});
```

Crear `tests/portal/comercializadora-sesion.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ accesos: {} as Record<string, string> }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  },
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (tabla: string) =>
      tabla === 'perfil_modulos'
        ? {
            select: () => ({
              eq: async () => ({
                data: Object.entries(m.accesos).map(([modulo, nivel]) => ({ modulo, nivel })),
                error: null,
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { user_id: 'u1', nombre: 'Ana', rol: 'interno', activo: true },
                  error: null,
                }),
              }),
            }),
          },
  }),
}));
import { sesionComercializadora } from '../../lib/supabase/sesion';

describe('sesionComercializadora', () => {
  beforeEach(() => {
    m.accesos = {};
  });
  it('sin el módulo regresa a Inicio', async () => {
    await expect(sesionComercializadora()).rejects.toThrow('REDIRECT:/');
  });
  it('con el módulo entra aunque el rol no tenga Costeo, y trae su nivel', async () => {
    m.accesos = { comercializadora: 'lectura' };
    const s = await sesionComercializadora();
    expect(s.nivel).toBe('lectura');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/modulos.test.ts tests/portal/comercializadora-sesion.test.ts`
Expected: FAIL (`puedeEditarCom` no existe y `sesionComercializadora` no existe). Si el mock de `servidor` no coincide con lo que lee `contexto()` en `lib/supabase/sesion.ts`, ajusta **el mock** a las llamadas reales (la forma de `perfiles` y `perfil_modulos`) y regístralo en el ledger. No cambies `sesion.ts` para acomodar la prueba.

- [ ] **Step 3: Implementar**

En `lib/supabase/database.types.ts:21`, el `modulo` de `PerfilModulo` pasa a:

```ts
  modulo: 'crm' | 'sucursales' | 'sucursales_costeo' | 'bi' | 'comercializadora';
```

En `lib/portal/modulos.ts`:
- `export type IdModulo = 'costeo' | 'crm' | 'sucursales' | 'bi' | 'comercializadora';`
- `export type Accesos = Partial<Record<'crm' | 'sucursales' | 'sucursales_costeo' | 'bi' | 'comercializadora', NivelModulo>>;`
- Agregar al final del arreglo `modulos`:

```ts
  {
    id: 'comercializadora',
    nombre: 'Comercializadora',
    descripcion: 'Qué pedir, órdenes de compra, mínimos, proveedores sin stock y pagos.',
    href: '/comercializadora',
    acceso: (a) => a.comercializadora !== undefined,
  },
```

- Y al final del archivo:

```ts
export const puedeEditarCom = (accesos: Accesos) =>
  accesos.comercializadora === 'desarrollador' || accesos.comercializadora === 'edicion';
```

En `lib/supabase/sesion.ts`, después de `sesionCrm`:

```ts
export async function sesionComercializadora(redirigir = true) {
  const s = await sesion(undefined, redirigir, { sinCosteo: true });
  const a = await accesos(s.db, s.perfil.user_id);
  if (!a.comercializadora) {
    if (redirigir) redirect('/');
    throw new Error('No tienes acceso a Comercializadora');
  }
  return { ...s, accesos: a, nivel: a.comercializadora };
}
```

Si `leerAccesos` filtra los módulos con una lista fija, agrega `'comercializadora'` a esa lista.

En `components/portal/navegacion.tsx`:
- Importar de `lucide-react`: `ShoppingCart, Bot, ClipboardList, Scale, CalendarX2, Wallet`.
- En `entradaModulo`, agregar `comercializadora: { href: '/comercializadora', nombre: 'Comercializadora', icono: ShoppingCart },`.
- Agregar el grupo y registrarlo en `gruposPorSeccion` como `comercializadora: gruposComercializadora,`:

```ts
const gruposComercializadora: Grupo[] = [
  {
    titulo: 'Comprar',
    enlaces: [
      { href: '/comercializadora', nombre: 'Qué pedir', icono: ShoppingCart, exacto: true },
      { href: '/comercializadora/oc-automaticas', nombre: 'OC automáticas', icono: Bot },
      { href: '/comercializadora/ordenes', nombre: 'Órdenes de compra', icono: ClipboardList },
      { href: '/comercializadora/minimos', nombre: 'Mínimos de proveedor', icono: Scale },
    ],
  },
  {
    titulo: 'Planear y pagar',
    enlaces: [
      { href: '/comercializadora/proveedores-sin-stock', nombre: 'Proveedores sin stock', icono: CalendarX2 },
      { href: '/comercializadora/pagos', nombre: 'Pagos proyectados', icono: Wallet },
    ],
  },
];
```

En `components/portal/marco.tsx`, en `textos`, agregar:

```ts
  comercializadora: {
    marca: ['The Coffee', 'comercializadora'],
    buscar: 'Buscar pantalla…',
    registros: 'Registros',
  },
```

En `components/portal/tarjetas-modulos.tsx`, importar `ShoppingCart` y agregar `comercializadora: ShoppingCart` a `iconos`.

Crear `app/(comercializadora)/comercializadora/layout.tsx`:

```tsx
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';

export default async function ComercializadoraLayout({ children }: { children: React.ReactNode }) {
  const { perfil, accesos } = await sesionComercializadora();
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="comercializadora"
      visibles={modulosVisibles(accesos, perfil.rol)}
    >
      <div className="space-y-7">{children}</div>
    </Marco>
  );
}
```

Crear `app/(comercializadora)/comercializadora/loading.tsx`, copiando `app/(crm)/crm/loading.tsx` (el esqueleto con `role="status"`). Solo cambia el texto accesible a "Cargando Comercializadora…".

Crear `app/(comercializadora)/comercializadora/page.tsx` provisional:

```tsx
import { Encabezado, Vacio } from '@/components/portal/piezas';
export default function QuePedir() {
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Qué pedir" />
      <Vacio titulo="Pantalla en construcción" />
    </>
  );
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal && npx tsc --noEmit -p .`
Expected: PASS y sin errores de tipos. Cualquier `Record<IdModulo, …>` o `Record<Seccion, …>` que no compile es un mapa que falta: complétalo con la entrada `comercializadora` y anótalo.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/modulos.ts lib/supabase/database.types.ts lib/supabase/sesion.ts components/portal "app/(comercializadora)" tests/portal/modulos.test.ts tests/portal/comercializadora-sesion.test.ts
git commit -m "feat(comercializadora): módulo en el portal con acceso por perfil_modulos y navegación"
```

---

### Task 2: Cálculos de Qué pedir (port de `_qpFilas`, `_qpProveedores`, `_comSaldoCedis`)

**Files:**
- Create: `lib/comercializadora/fechas.ts`, `lib/comercializadora/tipos.ts`, `lib/comercializadora/quepedir.ts`, `lib/comercializadora/formato.ts`
- Test: `tests/portal/com-fechas.test.ts`, `tests/portal/com-quepedir.test.ts`

**Interfaces:**
- Produces:
  - `hoyCdmx(ahora?: Date): string` (YYYY-MM-DD), `masDias(iso: string, n: number): string`, `difDias(a: string, b: string): number`, `fechaCorta(iso: string): string` ("5 dic").
  - Tipos `ArticuloCatalogo`, `CompraProyectada`, `LineaOcZoho`, `MinMax`, `ResumenProyeccion`.
  - `saldoCedis(c): number`, `enCamino(lineas): Record<string, number>`.
  - `filasQuePedir(d: DatosQuePedir, dias: number, hoy: string): FilaQuePedir[]`.
  - `proveedoresQuePedir(filas): ProveedorQuePedir[]`, `ordenQuePedir(a, b): number`.
  - `kpisQuePedir(filas, diasAlerta): { articulos; monto; proveedores; cortos }`.
  - `pesos(n: number): string`, `aCsv(filas: Record<string, unknown>[], columnas: [clave: string, titulo: string][]): string`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-fechas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { difDias, fechaCorta, hoyCdmx, masDias } from '../../lib/comercializadora/fechas';

describe('fechas de Comercializadora', () => {
  it('hoy es el día de Ciudad de México, no el de UTC', () => {
    expect(hoyCdmx(new Date('2026-11-13T05:30:00Z'))).toBe('2026-11-12'); // 23:30 del 12 en CDMX
    expect(hoyCdmx(new Date('2026-11-13T06:30:00Z'))).toBe('2026-11-13');
  });
  it('suma y resta días cruzando meses y años', () => {
    expect(masDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(masDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(difDias('2026-11-28', '2026-12-05')).toBe(7);
  });
  it('fecha corta en español', () => {
    expect(fechaCorta('2026-12-05')).toBe('5 dic');
  });
});
```

Crear `tests/portal/com-quepedir.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  enCamino,
  filasQuePedir,
  kpisQuePedir,
  ordenQuePedir,
  proveedoresQuePedir,
  saldoCedis,
  type DatosQuePedir,
} from '../../lib/comercializadora/quepedir';
import { aCsv } from '../../lib/comercializadora/formato';

const cat = (o: Record<string, unknown>) => ({
  sku: 'A', nombre: 'Café', zoho_stock: 10, zoho_stock_fisico: null, zoho_sync_at: '2026-11-12T10:00:00Z',
  saldo_cedis: 99, saldo_yulius: 0, costo_unitario: 50, zoho_vendor_id: 'v1', zoho_vendor_name: 'Prov 1', ...o,
});

describe('saldoCedis (_comSaldoCedis)', () => {
  it('sin sync de Zoho usa saldo_cedis; con sync prefiere el físico y si no el contable', () => {
    expect(saldoCedis(cat({ zoho_sync_at: null }) as never)).toBe(99);
    expect(saldoCedis(cat({ zoho_stock_fisico: 7 }) as never)).toBe(7);
    expect(saldoCedis(cat({}) as never)).toBe(10);
  });
});

describe('enCamino', () => {
  it('suma lo pendiente de OCs abiertas e ignora cerradas, canceladas, void y (sin-sku)', () => {
    expect(
      enCamino([
        { sku: 'A', status: 'open', cantidad: 10, cantidad_recibida: 4 },
        { sku: 'A', status: 'partially_received', cantidad: 5, cantidad_recibida: 0 },
        { sku: 'A', status: 'Closed', cantidad: 9, cantidad_recibida: 0 },
        { sku: 'B', status: 'cancelled', cantidad: 9, cantidad_recibida: 0 },
        { sku: '(sin-sku)', status: 'open', cantidad: 9, cantidad_recibida: 0 },
        { sku: 'C', status: 'open', cantidad: 3, cantidad_recibida: 5 },
      ]),
    ).toEqual({ A: 11 });
  });
});

const datos = (o: Partial<DatosQuePedir> = {}): DatosQuePedir => ({
  catalogo: [cat({}) as never, cat({ sku: 'B', costo_unitario: null, zoho_vendor_id: null, zoho_vendor_name: null }) as never],
  minmax: [{ sku: 'A', venta_diaria: 2 }, { sku: 'B', venta_diaria: 0 }],
  compras: [
    { sku: 'A', fecha_oc: '2026-11-12', cantidad: 5, monto: 250, adelanto_cierre: true, cierre_tarde: false, adelanto_minimo: false, bajo_minimo: false },
    { sku: 'A', fecha_oc: '2026-12-30', cantidad: 9, monto: 450 },
  ],
  camino: { A: 3 },
  yulius: true,
  resumen: { sinCosto: ['B'], sinProveedor: [] },
  ...o,
});

describe('filasQuePedir (_qpFilas)', () => {
  it('una fila por SKU del mín/máx, con compras dentro del horizonte (las vencidas cuentan)', () => {
    const [a, b] = filasQuePedir(datos(), 15, '2026-11-13');
    expect(a).toMatchObject({ sku: 'A', disp: 10, camino: 3, venta: 2, dias: 5, pedir: true, cant: 5, monto: 250, veces: 1, adelanto: true, costo: 50 });
    expect(b).toMatchObject({ sku: 'B', dias: null, pedir: false, costo: null, vendor: '(sin proveedor)', nota: 'sin costo' });
  });
  it('suma saldo de 3PL solo con inv.yulius', () => {
    const d = datos({ catalogo: [cat({ saldo_yulius: 4 }) as never], minmax: [{ sku: 'A', venta_diaria: 1 }] });
    expect(filasQuePedir(d, 7, '2026-11-13')[0].disp).toBe(14);
    expect(filasQuePedir({ ...d, yulius: false }, 7, '2026-11-13')[0].disp).toBe(10);
  });
});

describe('proveedoresQuePedir (_qpProveedores)', () => {
  it('agrupa en pesos (no suma piezas de artículos distintos) y guarda el día más corto', () => {
    const filas = filasQuePedir(datos(), 15, '2026-11-13');
    const [p] = proveedoresQuePedir(filas).filter((x) => x.vendor === 'v1');
    expect(p).toMatchObject({ aPedir: 1, piezas: 5, monto: 250, valor: 500, ventaValor: 100, dias: 5, diasMin: 5, pedir: true });
  });
});

describe('orden y KPIs', () => {
  it('primero lo que hay que pedir, luego menos días; sin venta al final', () => {
    const f = [
      { pedir: false, dias: 1, sku: 'X' },
      { pedir: true, dias: null, sku: 'Y' },
      { pedir: true, dias: 3, sku: 'Z' },
    ] as never[];
    expect([...f].sort(ordenQuePedir).map((x: { sku: string }) => x.sku)).toEqual(['Z', 'Y', 'X']);
  });
  it('KPIs: artículos, monto, proveedores con pedido y artículos con menos de N días', () => {
    const k = kpisQuePedir(filasQuePedir(datos(), 15, '2026-11-13'), 7);
    expect(k).toEqual({ articulos: 1, monto: 250, proveedores: 1, cortos: 1 });
  });
});

describe('aCsv', () => {
  it('escapa comillas, comas y saltos, con BOM para Excel', () => {
    const t = aCsv([{ a: 'x,"y"', b: 2 }], [['a', 'A'], ['b', 'B']]);
    expect(t).toBe('﻿A,B\r\n"x,""y""",2\r\n');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-fechas.test.ts tests/portal/com-quepedir.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`lib/comercializadora/fechas.ts`:

```ts
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtCdmx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Día de hoy en Ciudad de México (YYYY-MM-DD), como _cieHoy/hoyCdmx del sitio viejo. */
export const hoyCdmx = (ahora: Date = new Date()) => fmtCdmx.format(ahora);

const aUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const masDias = (iso: string, n: number) => aIso(aUtc(iso) + n * 864e5);
export const difDias = (a: string, b: string) => Math.round((aUtc(b) - aUtc(a)) / 864e5);
export const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
export const nombreMes = (m: number) => MESES[m];
export const isoUtc = aIso;
export const msUtc = aUtc;
```

`lib/comercializadora/tipos.ts`:

```ts
export interface ArticuloCatalogo {
  sku: string;
  nombre: string | null;
  zoho_stock: number | null;
  zoho_stock_fisico: number | null;
  zoho_sync_at: string | null;
  saldo_cedis: number | null;
  saldo_yulius: number | null;
  costo_unitario: number | null;
  zoho_vendor_id: string | null;
  zoho_vendor_name: string | null;
  estatus?: string | null;
}
export interface CompraProyectada {
  sku: string;
  fecha_oc: string;
  cantidad: number;
  monto: number;
  adelanto_cierre?: boolean;
  cierre_tarde?: boolean;
  adelanto_minimo?: boolean;
  bajo_minimo?: boolean;
  cierre_id?: number | null;
}
export interface LineaOcZoho {
  sku: string;
  status: string | null;
  cantidad: number | null;
  cantidad_recibida: number | null;
}
export interface MinMax {
  sku: string;
  venta_diaria: number | null;
}
export interface ResumenProyeccion {
  calculado_at?: string;
  sinCosto?: string[];
  sinProveedor?: string[];
  cierres?: { id: number; u: string | null; ini: string; fin: string; monto_adelanto?: number }[];
  filas?: number;
}
```

`lib/comercializadora/quepedir.ts`:

```ts
import { masDias } from './fechas';
import type { ArticuloCatalogo, CompraProyectada, LineaOcZoho, MinMax, ResumenProyeccion } from './tipos';

const n = (x: unknown) => Number(x) || 0;

/** _comSaldoCedis: sin sync de Zoho, saldo de plataforma; con sync, físico de Zoho y si no, contable. */
export function saldoCedis(c: ArticuloCatalogo | undefined): number {
  if (!c) return 0;
  if (c.zoho_sync_at == null) return n(c.saldo_cedis);
  return c.zoho_stock_fisico != null ? Number(c.zoho_stock_fisico) : n(c.zoho_stock);
}

const CERRADAS = ['closed', 'cancelled', 'void'];
/** Piezas en camino por SKU: lo pendiente de recibir de OCs de Zoho abiertas (renderComQuePedir). */
export function enCamino(lineas: LineaOcZoho[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lineas) {
    if (l.sku === '(sin-sku)' || CERRADAS.includes(String(l.status ?? '').toLowerCase())) continue;
    const p = n(l.cantidad) - n(l.cantidad_recibida);
    if (p > 0) r[l.sku] = (r[l.sku] ?? 0) + p;
  }
  return r;
}

export interface DatosQuePedir {
  catalogo: ArticuloCatalogo[];
  minmax: MinMax[];
  compras: CompraProyectada[];
  camino: Record<string, number>;
  yulius: boolean;
  resumen: ResumenProyeccion;
}

export interface FilaQuePedir {
  sku: string;
  nombre: string;
  vendor: string;
  vendorNombre: string;
  disp: number;
  camino: number;
  venta: number;
  dias: number | null;
  costo: number | null;
  pedir: boolean;
  cant: number;
  monto: number;
  veces: number;
  adelanto: boolean;
  tarde: boolean;
  adMin: boolean;
  bajo: boolean;
  nota: 'sin proveedor en Zoho' | 'sin costo' | null;
}

/** _qpFilas: una fila por SKU del mín/máx; las compras con fecha ≤ hoy + dias − 1 (las vencidas siguen pendientes). */
export function filasQuePedir(d: DatosQuePedir, dias: number, hoy: string): FilaQuePedir[] {
  const fin = masDias(hoy, dias - 1);
  const cat = new Map(d.catalogo.map((c) => [c.sku, c]));
  const compra = new Map<string, { cant: number; monto: number; veces: number; adelanto: boolean; tarde: boolean; adMin: boolean; bajo: boolean }>();
  for (const r of d.compras) {
    const f = String(r.fecha_oc ?? '').slice(0, 10);
    if (!f || f > fin) continue;
    const a = compra.get(r.sku) ?? { cant: 0, monto: 0, veces: 0, adelanto: false, tarde: false, adMin: false, bajo: false };
    a.cant += n(r.cantidad);
    a.monto += n(r.monto);
    a.veces++;
    if (r.adelanto_cierre) a.adelanto = true;
    if (r.cierre_tarde) a.tarde = true;
    if (r.adelanto_minimo) a.adMin = true;
    if (r.bajo_minimo) a.bajo = true;
    compra.set(r.sku, a);
  }
  const sinCosto = new Set(Array.isArray(d.resumen.sinCosto) ? d.resumen.sinCosto : []);
  const sinProv = new Set(Array.isArray(d.resumen.sinProveedor) ? d.resumen.sinProveedor : []);
  return d.minmax.map((m) => {
    const c = cat.get(m.sku);
    const disp = saldoCedis(c) + (d.yulius ? n(c?.saldo_yulius) : 0);
    const v = n(m.venta_diaria);
    const a = compra.get(m.sku);
    const costo = n(c?.costo_unitario) > 0 ? Number(c!.costo_unitario) : null;
    return {
      sku: m.sku,
      nombre: c?.nombre ?? '',
      vendor: String(c?.zoho_vendor_id || c?.zoho_vendor_name || '(sin proveedor)'),
      vendorNombre: c?.zoho_vendor_name || '(sin proveedor)',
      disp,
      camino: n(d.camino[m.sku]),
      venta: v,
      dias: v > 0 ? disp / v : null,
      costo,
      pedir: !!a,
      cant: a?.cant ?? 0,
      monto: a?.monto ?? 0,
      veces: a?.veces ?? 0,
      adelanto: !!a?.adelanto,
      tarde: !!a?.tarde,
      adMin: !!a?.adMin,
      bajo: !!a?.bajo,
      nota: sinProv.has(m.sku) ? 'sin proveedor en Zoho' : sinCosto.has(m.sku) ? 'sin costo' : null,
    };
  });
}

export interface ProveedorQuePedir {
  vendor: string;
  nombre: string;
  skus: FilaQuePedir[];
  valor: number;
  ventaValor: number;
  caminoValor: number;
  aPedir: number;
  piezas: number;
  monto: number;
  bajo: boolean;
  dias: number | null;
  diasMin: number | null;
  pedir: boolean;
}

/** _qpProveedores: disponible y días en pesos (disp × costo, venta × costo), solo artículos con costo. */
export function proveedoresQuePedir(filas: FilaQuePedir[]): ProveedorQuePedir[] {
  const g = new Map<string, ProveedorQuePedir>();
  for (const f of filas) {
    const p =
      g.get(f.vendor) ??
      { vendor: f.vendor, nombre: f.vendorNombre, skus: [], valor: 0, ventaValor: 0, caminoValor: 0, aPedir: 0, piezas: 0, monto: 0, bajo: false, dias: null, diasMin: null, pedir: false };
    p.skus.push(f);
    if (f.costo != null) {
      p.valor += Math.max(0, f.disp) * f.costo;
      p.ventaValor += f.venta * f.costo;
      p.caminoValor += f.camino * f.costo;
    }
    if (f.pedir) {
      p.aPedir++;
      p.piezas += f.cant;
      p.monto += f.monto;
      if (f.bajo) p.bajo = true;
    }
    g.set(f.vendor, p);
  }
  return [...g.values()].map((p) => ({
    ...p,
    dias: p.ventaValor > 0 ? p.valor / p.ventaValor : null,
    pedir: p.aPedir > 0,
    diasMin: p.skus.reduce<number | null>((m, f) => (f.dias != null && (m == null || f.dias < m) ? f.dias : m), null),
  }));
}

/** _qpOrden: lo que hay que pedir primero; luego menos días (sin venta = infinito); luego por SKU o nombre. */
export function ordenQuePedir(
  a: { pedir: boolean; dias: number | null; sku?: string; nombre?: string },
  b: { pedir: boolean; dias: number | null; sku?: string; nombre?: string },
): number {
  if (a.pedir !== b.pedir) return a.pedir ? -1 : 1;
  const da = a.dias ?? Infinity;
  const db = b.dias ?? Infinity;
  return da - db || String(a.sku ?? a.nombre).localeCompare(String(b.sku ?? b.nombre), 'es');
}

export function kpisQuePedir(filas: FilaQuePedir[], diasAlerta: number) {
  const pedir = filas.filter((f) => f.pedir);
  return {
    articulos: pedir.length,
    monto: pedir.reduce((s, f) => s + f.monto, 0),
    proveedores: new Set(pedir.map((f) => f.vendor)).size,
    cortos: filas.filter((f) => f.dias != null && f.dias < diasAlerta).length,
  };
}
```

`lib/comercializadora/formato.ts`:

```ts
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const num = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
export const pesos = (x: number) => mxn.format(Number(x) || 0);
export const numero = (x: number | null) => (x == null ? '—' : num.format(x));

/** CSV con BOM (Excel en español abre bien los acentos), separador coma y CRLF. */
export function aCsv(filas: Record<string, unknown>[], columnas: [clave: string, titulo: string][]): string {
  const celda = (v: unknown) => {
    const t = v == null ? '' : String(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [columnas.map(([, t]) => celda(t)).join(',')];
  for (const f of filas) lineas.push(columnas.map(([k]) => celda(f[k])).join(','));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-fechas.test.ts tests/portal/com-quepedir.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora tests/portal/com-fechas.test.ts tests/portal/com-quepedir.test.ts
git commit -m "feat(comercializadora): cálculos de Qué pedir portados del sitio viejo"
```

---

### Task 3: Pantalla Qué pedir

**Files:**
- Create: `lib/comercializadora/consultas.ts`
- Replace: `app/(comercializadora)/comercializadora/page.tsx`
- Create: `components/comercializadora/que-pedir.tsx`, `components/comercializadora/avisos-cierre.tsx`, `components/comercializadora/descargar-csv.tsx`
- Test: `tests/portal/com-que-pedir.test.tsx`

**Interfaces:**
- Consumes: Tarea 2 (`filasQuePedir`, `proveedoresQuePedir`, `ordenQuePedir`, `kpisQuePedir`, `enCamino`, `pesos`, `numero`, `aCsv`, `hoyCdmx`); Tarea 1 (`sesionComercializadora`).
- Produces:
  - `com(db): { from(tabla: string): any }`
  - `leerTodoCom<R>(db, tabla, columnas, filtro?): Promise<R[]>`
  - `ultimaProyeccion(db): Promise<{ inicio: string; resumen: ResumenProyeccion } | null>`
  - `edadHoras(iso: string, ahora?: Date): number`
  - `<AvisosCierre avisos={…} />`, `<DescargarCsv nombre filas columnas />`
  - `cierresVigentes(db, hoy)`, que también usa la Tarea 5.

- [ ] **Step 1: Prueba del componente que falla**

Crear `tests/portal/com-que-pedir.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import { QuePedir } from '../../components/comercializadora/que-pedir';

const datos = {
  catalogo: [
    { sku: 'A', nombre: 'Café molido', zoho_stock: 10, zoho_stock_fisico: null, zoho_sync_at: 'x', saldo_cedis: 0, saldo_yulius: 0, costo_unitario: 50, zoho_vendor_id: 'v1', zoho_vendor_name: 'Prov Uno' },
    { sku: 'B', nombre: 'Vasos', zoho_stock: 500, zoho_stock_fisico: null, zoho_sync_at: 'x', saldo_cedis: 0, saldo_yulius: 0, costo_unitario: 1, zoho_vendor_id: 'v2', zoho_vendor_name: 'Prov Dos' },
  ],
  minmax: [{ sku: 'A', venta_diaria: 2 }, { sku: 'B', venta_diaria: 5 }],
  compras: [{ sku: 'A', fecha_oc: '2026-11-13', cantidad: 20, monto: 1000 }],
  camino: {},
  yulius: true,
  resumen: {},
};

describe('Qué pedir', () => {
  it('muestra KPIs y por omisión solo lo que hay que pedir; el filtro muestra todo', async () => {
    render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={2} avisos={[]} />);
    expect(screen.getByText('Artículos a pedir').closest('div')).toHaveTextContent('1');
    expect(screen.getByText('Café molido')).toBeInTheDocument();
    expect(screen.queryByText('Vasos')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Solo lo que hay que pedir'));
    expect(screen.getByText('Vasos')).toBeInTheDocument();
  });
  it('avisa cuando la simulación tiene más de 36 horas', () => {
    render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={40} avisos={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/hace más de 36 horas/);
  });
  it('vista por proveedor agrupa en pesos', async () => {
    render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={2} avisos={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Por proveedor' }));
    expect(screen.getByText('Prov Uno')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-que-pedir.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Consultas y componentes**

`lib/comercializadora/consultas.ts`:

```ts
import 'server-only';
import type { ResumenProyeccion } from './tipos';

// Plan 3, decisión 8: las tablas com_* no están en database.types; se leen sin tipos y se tipan por pantalla.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SinTipos = { from: (tabla: string) => any; rpc: (fn: string, args?: object) => any };
export const com = (db: unknown) => db as SinTipos;

/** Lee todas las filas en páginas de 1000 (PostgREST corta en 1000). `orden` debe ser una columna única o estable. */
export async function leerTodoCom<R>(
  db: unknown,
  tabla: string,
  columnas: string,
  orden: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtro?: (q: any) => any,
): Promise<R[]> {
  const filas: R[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = com(db).from(tabla).select(columnas).order(orden);
    if (filtro) q = filtro(q);
    const r = await q.range(desde, desde + 999);
    if (r.error) throw new Error('No se pudieron leer los datos de Comercializadora. Intenta de nuevo.');
    filas.push(...(r.data as R[]));
    if (r.data.length < 1000) return filas;
  }
}

/** Última corrida buena de la proyección (com-minmax registra 'com-proyeccion' con calculado_at en el resumen). */
export async function ultimaProyeccion(db: unknown): Promise<{ inicio: string; resumen: ResumenProyeccion } | null> {
  const r = await com(db)
    .from('com_sync_log')
    .select('inicio,resumen')
    .eq('proceso', 'com-proyeccion')
    .eq('ok', true)
    .order('inicio', { ascending: false })
    .limit(1);
  if (r.error) throw new Error('No se pudo leer la proyección. Intenta de nuevo.');
  const fila = r.data?.[0];
  return fila?.resumen?.calculado_at ? { inicio: fila.inicio, resumen: fila.resumen } : null;
}

export const edadHoras = (iso: string, ahora: Date = new Date()) => (ahora.getTime() - new Date(iso).getTime()) / 36e5;

export interface AvisoCierre {
  id: number;
  vendor_name: string;
  ini: string;
  fin: string;
  u: string | null;
}

/** Cierres no cancelados que no han terminado, con su último día para pedir de la última proyección (_cieAvisos). */
export async function cierresVigentes(db: unknown, hoy: string, resumen: ResumenProyeccion | null): Promise<AvisoCierre[]> {
  const r = await com(db)
    .from('com_proveedor_cierre')
    .select('id,vendor_name,ini,fin')
    .eq('cancelado', false)
    .gte('fin', hoy)
    .order('ini');
  if (r.error) throw new Error('No se pudieron leer los proveedores sin stock. Intenta de nuevo.');
  const porId = new Map((resumen?.cierres ?? []).map((c) => [c.id, c]));
  return (r.data as Omit<AvisoCierre, 'u'>[]).map((c) => {
    const s = porId.get(c.id);
    const misma = s && s.ini?.slice(0, 10) === c.ini.slice(0, 10) && s.fin?.slice(0, 10) === c.fin.slice(0, 10);
    return { ...c, u: misma ? (s!.u ?? null) : null };
  });
}
```

`components/comercializadora/avisos-cierre.tsx` (franja de `_cieFranjaHtml`: cierres en curso o a 14 días o menos de su último día para pedir):

```tsx
import Link from 'next/link';
import { CalendarX2 } from 'lucide-react';
import { difDias, fechaCorta } from '@/lib/comercializadora/fechas';

export interface AvisoFranja {
  id: number;
  vendor_name: string;
  ini: string;
  fin: string;
  u: string | null;
}

export function AvisosCierre({ avisos, hoy }: { avisos: AvisoFranja[]; hoy: string }) {
  const lista = avisos.filter((c) => hoy >= c.ini.slice(0, 10) || (c.u != null && difDias(hoy, c.u) <= 14));
  if (!lista.length) return null;
  return (
    <div role="note" className="placa flex gap-3 border-warn/40 bg-warn-soft px-4 py-3 text-sm">
      <CalendarX2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <ul className="space-y-1">
        {lista.map((c) => (
          <li key={c.id}>
            <b>{c.vendor_name}</b> sin stock del {fechaCorta(c.ini)} al {fechaCorta(c.fin)}
            {hoy >= c.ini.slice(0, 10)
              ? ' (en cierre)'
              : c.u
                ? hoy > c.u
                  ? ' · ya no alcanza a llegar antes'
                  : ` · último día para pedir: ${fechaCorta(c.u)}`
                : ''}
          </li>
        ))}
        <li>
          <Link href="/comercializadora/proveedores-sin-stock" className="font-semibold underline">
            Ver proveedores sin stock
          </Link>
        </li>
      </ul>
    </div>
  );
}
```

`components/comercializadora/descargar-csv.tsx`:

```tsx
'use client';
import { Download } from 'lucide-react';
import { aCsv } from '@/lib/comercializadora/formato';

export function DescargarCsv({
  nombre,
  filas,
  columnas,
}: {
  nombre: string;
  filas: Record<string, unknown>[];
  columnas: [string, string][];
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([aCsv(filas, columnas)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold"
    >
      <Download size={15} aria-hidden="true" /> Descargar CSV
    </button>
  );
}
```

`components/comercializadora/que-pedir.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Package, Truck, Wallet } from 'lucide-react';
import { Kpi, Pill, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero, pesos } from '@/lib/comercializadora/formato';
import {
  filasQuePedir,
  kpisQuePedir,
  ordenQuePedir,
  proveedoresQuePedir,
  type DatosQuePedir,
} from '@/lib/comercializadora/quepedir';
import { AvisosCierre, type AvisoFranja } from './avisos-cierre';
import { DescargarCsv } from './descargar-csv';

const HORIZONTES = [7, 15, 30];
const POR_PAGINA = 25;

export function QuePedir({
  datos,
  hoy,
  edadHoras,
  avisos,
}: {
  datos: DatosQuePedir;
  hoy: string;
  edadHoras: number;
  avisos: AvisoFranja[];
}) {
  const [dias, setDias] = useState(15);
  const [vista, setVista] = useState<'sku' | 'proveedor'>('sku');
  const [q, setQ] = useState('');
  const [prov, setProv] = useState('');
  const [soloPedir, setSoloPedir] = useState(true);
  const [ver, setVer] = useState(POR_PAGINA);

  const filas = useMemo(() => filasQuePedir(datos, dias, hoy), [datos, dias, hoy]);
  const k = kpisQuePedir(filas, 7);
  const proveedores = useMemo(
    () => [...new Map(filas.map((f) => [f.vendor, f.vendorNombre])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [filas],
  );
  const texto = q.trim().toLowerCase();
  const visibles = filas
    .filter((f) => (!soloPedir || f.pedir) && (!prov || f.vendor === prov))
    .filter((f) => !texto || f.sku.toLowerCase().includes(texto) || f.nombre.toLowerCase().includes(texto))
    .sort(ordenQuePedir);
  const grupos = proveedoresQuePedir(visibles).sort(ordenQuePedir);

  return (
    <div className="space-y-5">
      {edadHoras > 36 ? (
        <p role="status" className="placa flex items-center gap-2 border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          <AlertTriangle size={16} aria-hidden="true" className="text-warn" /> La simulación se calculó hace más de 36
          horas: las cantidades pueden no estar al día.
        </p>
      ) : null}
      <AvisosCierre avisos={avisos} hoy={hoy} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Artículos a pedir" valor={k.articulos} icono={Package} />
        <Kpi etiqueta="Monto a comprar (sin IVA)" valor={pesos(k.monto)} icono={Wallet} />
        <Kpi etiqueta="Proveedores con pedido" valor={k.proveedores} icono={Truck} />
        <Kpi etiqueta="Con menos de 7 días" valor={k.cortos} icono={CalendarDays} tono={k.cortos ? 'bajo' : 'neutro'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Horizonte" className="flex gap-1">
          {HORIZONTES.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={dias === h}
              onClick={() => setDias(h)}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold ${dias === h ? 'bg-ink text-white' : 'border border-line-strong bg-surface'}`}
            >
              {h} días
            </button>
          ))}
        </div>
        <div role="group" aria-label="Vista" className="flex gap-1">
          {(['sku', 'proveedor'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => setVista(v)}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold ${vista === v ? 'bg-ink text-white' : 'border border-line-strong bg-surface'}`}
            >
              {v === 'sku' ? 'Por SKU' : 'Por proveedor'}
            </button>
          ))}
        </div>
        <input type="search" aria-label="Buscar artículo" placeholder="Buscar SKU o nombre" value={q} onChange={(e) => setQ(e.target.value)} className={`${claseCampo} max-w-xs`} />
        <select aria-label="Proveedor" value={prov} onChange={(e) => setProv(e.target.value)} className={`${claseCampo} max-w-xs`}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloPedir} onChange={(e) => setSoloPedir(e.target.checked)} /> Solo lo que hay que pedir
        </label>
        <DescargarCsv
          nombre={`que-pedir-${hoy}.csv`}
          filas={visibles as unknown as Record<string, unknown>[]}
          columnas={[['sku', 'SKU'], ['nombre', 'Artículo'], ['vendorNombre', 'Proveedor'], ['disp', 'Físico'], ['camino', 'En camino'], ['dias', 'Días de inventario'], ['cant', 'Cantidad'], ['monto', 'Monto']]}
        />
      </div>

      {visibles.length === 0 ? (
        <Vacio titulo={soloPedir ? 'Nada que pedir en este horizonte' : 'Sin artículos con estos filtros'}>
          {soloPedir ? 'Quita "Solo lo que hay que pedir" para ver todo el inventario.' : null}
        </Vacio>
      ) : vista === 'sku' ? (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>SKU</th><th>Proveedor</th><th className="text-right">Físico (Zoho)</th><th className="text-right">En camino</th>
                <th className="text-right">Días de inventario</th><th>¿Pedir?</th><th className="text-right">Cantidad</th><th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, ver).map((f) => (
                <tr key={f.sku}>
                  <td><div className="font-medium">{f.nombre}</div><div className="text-xs text-muted-foreground">{f.sku}</div></td>
                  <td>{f.vendorNombre}</td>
                  <td className="text-right tabular-nums">{numero(f.disp)}</td>
                  <td className="text-right tabular-nums">{numero(f.camino)}</td>
                  <td className="text-right tabular-nums">{f.dias == null ? 'Sin venta' : numero(f.dias)}</td>
                  <td className="space-x-1">
                    {f.pedir ? <Pill estado="bajo">Pedir</Pill> : <Pill estado="ok">No</Pill>}
                    {f.adelanto ? <Pill estado="neutro">Adelanto por cierre</Pill> : null}
                    {f.tarde ? <Pill estado="pierde">Cierre: ya no llega</Pill> : null}
                    {f.adMin ? <Pill estado="neutro">Adelantado por mínimo</Pill> : null}
                    {f.bajo ? <Pill estado="pierde">No llega al mínimo</Pill> : null}
                    {f.nota ? <span className="text-xs text-muted-foreground">{f.nota}</span> : null}
                  </td>
                  <td className="text-right tabular-nums">{f.pedir ? numero(f.cant) : '—'}</td>
                  <td className="text-right tabular-nums">{f.pedir ? pesos(f.monto) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th><th className="text-right">Artículos a pedir</th><th className="text-right">Disponible (MXN)</th>
                <th className="text-right">Días (promedio / más corto)</th><th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {grupos.slice(0, ver).map((p) => (
                <tr key={p.vendor}>
                  <td className="font-medium">{p.nombre} {p.bajo ? <Pill estado="pierde">No llega al mínimo</Pill> : null}</td>
                  <td className="text-right tabular-nums">{p.aPedir} de {p.skus.length}</td>
                  <td className="text-right tabular-nums">{pesos(p.valor)}</td>
                  <td className="text-right tabular-nums">{numero(p.dias)} / {numero(p.diasMin)}</td>
                  <td className="text-right tabular-nums">{pesos(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(vista === 'sku' ? visibles.length : grupos.length) > ver ? (
        <button type="button" onClick={() => setVer(ver + POR_PAGINA)} className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">
          Ver más
        </button>
      ) : null}
    </div>
  );
}
```

Reemplazar `app/(comercializadora)/comercializadora/page.tsx`:

```tsx
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { QuePedir } from '@/components/comercializadora/que-pedir';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { cierresVigentes, com, edadHoras, leerTodoCom, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { enCamino } from '@/lib/comercializadora/quepedir';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import type { ArticuloCatalogo, CompraProyectada, LineaOcZoho, MinMax } from '@/lib/comercializadora/tipos';

export default async function QuePedirPagina() {
  const { db } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const proy = await ultimaProyeccion(db);
  const encabezado = <Encabezado area="Comercializadora" titulo="Qué pedir" descripcion="Compras que propone la simulación diaria para cada artículo." />;
  if (!proy)
    return (
      <>
        {encabezado}
        <Vacio titulo="Todavía no hay proyección">Se calcula todos los días a las 06:30 (hora de Ciudad de México).</Vacio>
      </>
    );
  const calc = proy.resumen.calculado_at!;
  const [compras, minmax, catalogo, config, lineas, avisos] = await Promise.all([
    leerTodoCom<CompraProyectada>(db, 'com_pago_proyectado', 'id,sku,fecha_oc,cantidad,monto,adelanto_cierre,cierre_tarde,cierre_id,adelanto_minimo,bajo_minimo', 'id', (q) => q.eq('calculado_at', calc).eq('tipo', 'proyectado')),
    leerTodoCom<MinMax>(db, 'com_minmax', 'sku,venta_diaria', 'sku'),
    leerTodoCom<ArticuloCatalogo>(db, 'com_catalogo', 'sku,nombre,zoho_stock,zoho_stock_fisico,zoho_sync_at,saldo_cedis,saldo_yulius,costo_unitario,zoho_vendor_id,zoho_vendor_name', 'sku'),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    leerTodoCom<LineaOcZoho & { zoho_po_id: string }>(db, 'com_zoho_oc_lineas', 'zoho_po_id,sku,status,cantidad,cantidad_recibida', 'zoho_po_id', (q) => q.order('sku')),
    cierresVigentes(db, hoy, proy.resumen),
  ]);
  return (
    <>
      {encabezado}
      <QuePedir
        datos={{ catalogo, minmax, compras, camino: enCamino(lineas), yulius: config.data?.config?.inv?.yulius !== false, resumen: proy.resumen }}
        hoy={hoy}
        edadHoras={edadHoras(calc)}
        avisos={avisos}
      />
    </>
  );
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-que-pedir.test.tsx tests/portal/com-quepedir.test.ts && npx tsc --noEmit -p .`
Expected: PASS y tipos limpios.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/consultas.ts components/comercializadora "app/(comercializadora)/comercializadora/page.tsx" tests/portal/com-que-pedir.test.tsx
git commit -m "feat(comercializadora): pantalla Qué pedir"
```

---

### Task 4: Llamar Edge Functions desde el servidor, y Proveedores sin stock

**Files:**
- Create: `lib/comercializadora/funciones.ts`, `lib/comercializadora/cierres.ts`
- Create: `app/(comercializadora)/comercializadora/acciones.ts`
- Create: `app/(comercializadora)/comercializadora/proveedores-sin-stock/page.tsx`, `components/comercializadora/cierres.tsx`
- Modify: `.env.example`
- Test: `tests/portal/com-funciones.test.ts`, `tests/portal/com-cierres.test.ts`, `tests/portal/com-acciones.test.ts`

**Interfaces:**
- Consumes: `fechas.ts` (Tarea 2), `consultas.ts` (Tarea 3), `sesionComercializadora`/`puedeEditarCom` (Tarea 1).
- Produces:
  - `invocarFuncion(nombre: FuncionCom, body?: object, deps?: { fetch?: typeof fetch; url?: string; secreto?: string; timeoutMs?: number }): Promise<{ ok: true; datos: unknown } | { ok: false; error: string }>`
  - `ultimoDiaPedir(ini: string, lt: number): string`, `estadoCierre(c, hoy, u): { k; txt }`, `validarCierre(f, hoy, esNuevo): string | null`, `afectados(c, catalogo)`, `uPeriodo(c, s, uLocal)`
  - `type Resultado<T = object> = { error: string } | ({ ok: true } & T)`
  - Acciones `guardarCierre(form: FormCierre): Promise<Resultado<{ recalculo: boolean }>>` y `cancelarCierre(id: number): Promise<Resultado<{ recalculo: boolean }>>`
  - `editorCom()`, que comparten las Tareas 5 a 7.

- [ ] **Step 1: Pruebas que fallan**

`tests/portal/com-funciones.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { invocarFuncion } from '../../lib/comercializadora/funciones';

const resp = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('invocarFuncion', () => {
  it('manda x-com-secreto, sin Authorization, al URL de funciones', async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) => resp(200, { ok: true, skus: 3 }));
    const r = await invocarFuncion('com-minmax', {}, { fetch: f as never, url: 'https://x.supabase.co/functions/v1', secreto: 's3' });
    expect(r).toEqual({ ok: true, datos: { ok: true, skus: 3 } });
    const [u, init] = f.mock.calls[0];
    expect(u).toBe('https://x.supabase.co/functions/v1/com-minmax');
    expect((init!.headers as Record<string, string>)['x-com-secreto']).toBe('s3');
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('sin secreto configurado no llama y lo dice claro', async () => {
    const f = vi.fn();
    const r = await invocarFuncion('com-minmax', {}, { fetch: f as never, url: 'https://x', secreto: '' });
    expect(f).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no está configurado/) });
  });
  it('401, error de la función y red caída dan mensajes sin datos internos', async () => {
    const r401 = await invocarFuncion('com-minmax', {}, { fetch: (() => resp(401, { ok: false })) as never, url: 'u', secreto: 's' });
    expect(r401).toEqual({ ok: false, error: expect.stringMatching(/secreto/) });
    const r500 = await invocarFuncion('com-minmax', {}, { fetch: (() => resp(500, { ok: false, error: 'Zoho caído' })) as never, url: 'u', secreto: 's' });
    expect(r500).toEqual({ ok: false, error: 'Zoho caído' });
    const red = await invocarFuncion('com-minmax', {}, { fetch: (() => Promise.reject(new Error('ECONNRESET'))) as never, url: 'u', secreto: 's' });
    expect(red).toEqual({ ok: false, error: expect.stringMatching(/No se pudo contactar/) });
  });
});
```

`tests/portal/com-cierres.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { afectados, estadoCierre, ultimoDiaPedir, uPeriodo, validarCierre } from '../../lib/comercializadora/cierres';

describe('cierres (port de _cieU, _cieEstado, _cieValidar, _cieAfectados, _cieUPeriodo)', () => {
  it('último día para pedir = ini − ceil(LT) − 1, cruzando meses', () => {
    expect(ultimoDiaPedir('2026-12-20', 5)).toBe('2026-12-14');
    expect(ultimoDiaPedir('2026-12-03', 2.2)).toBe('2026-11-29');
    expect(ultimoDiaPedir('2026-12-20', Number.NaN)).toBe('2026-12-19');
  });
  it('estado: cancelado, terminado, en cierre, ya no alcanza, último día hoy, próximo', () => {
    const c = { ini: '2026-12-20', fin: '2027-01-05', cancelado: false };
    expect(estadoCierre({ ...c, cancelado: true }, '2026-12-01', null).k).toBe('cancelado');
    expect(estadoCierre(c, '2027-01-06', null).k).toBe('terminado');
    expect(estadoCierre(c, '2026-12-21', null)).toEqual({ k: 'encierre', txt: 'En cierre hasta 5 ene' });
    expect(estadoCierre(c, '2026-12-15', '2026-12-14').k).toBe('tarde');
    expect(estadoCierre(c, '2026-12-14', '2026-12-14').k).toBe('ultimo');
    expect(estadoCierre(c, '2026-12-01', '2026-12-14')).toEqual({ k: 'proximo', txt: 'Pide antes del 14 dic' });
    expect(estadoCierre(c, '2026-12-01', null).txt).toBe('Sin artículos afectados');
  });
  it('validación del formulario', () => {
    const f = { vendor_id: 'v1', ini: '2026-12-20', fin: '2026-12-30', todo: true, skus: [], notas: '' };
    expect(validarCierre(f, '2026-12-01', true)).toBeNull();
    expect(validarCierre({ ...f, vendor_id: '' }, '2026-12-01', true)).toBe('Elige un proveedor');
    expect(validarCierre({ ...f, fin: '2026-12-10' }, '2026-12-01', true)).toBe('La fecha final no puede ser antes de la inicial');
    expect(validarCierre({ ...f, ini: '2026-11-01', fin: '2026-11-20' }, '2026-12-01', true)).toBe('Ya terminó: la fecha final es antes de hoy');
    expect(validarCierre({ ...f, todo: false, skus: [] }, '2026-12-01', true)).toBe('Elige al menos un artículo o marca todo el proveedor');
    expect(validarCierre({ ...f, notas: 'x'.repeat(501) }, '2026-12-01', true)).toBe('Las notas son de máximo 500 caracteres');
  });
  it('afectados: activos del proveedor, o solo los de la lista', () => {
    const cat = [
      { sku: 'A', zoho_vendor_id: 'v1', estatus: 'Activo' },
      { sku: 'B', zoho_vendor_id: 'v1', estatus: 'Inactivo' },
      { sku: 'C', zoho_vendor_id: 'v2', estatus: 'Activo' },
      { sku: 'D', zoho_vendor_id: 'v1', estatus: null },
    ];
    expect(afectados({ vendor_id: 'v1', skus: null }, cat).map((a) => a.sku)).toEqual(['A', 'D']);
    expect(afectados({ vendor_id: 'v1', skus: ['D'] }, cat).map((a) => a.sku)).toEqual(['D']);
  });
  it('uPeriodo: el del servidor si es el mismo periodo; si no, el local', () => {
    const c = { ini: '2026-12-20', fin: '2026-12-30' };
    expect(uPeriodo(c, { u: '2026-12-10', ini: '2026-12-20', fin: '2026-12-30' }, '2026-12-14')).toBe('2026-12-10');
    expect(uPeriodo(c, { u: '2026-12-10', ini: '2026-12-21', fin: '2026-12-30' }, '2026-12-14')).toBe('2026-12-14');
  });
});
```

`tests/portal/com-acciones.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  nivel: 'edicion' as string,
  escrito: [] as { tabla: string; op: string; datos: unknown }[],
  error: null as null | { code: string; message: string },
  invocar: vi.fn(async () => ({ ok: true, datos: {} })),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: m.invocar }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => {
    const cadena = (tabla: string, op: string, datos: unknown) => {
      const q = {
        eq: () => q,
        select: async () => (m.error ? { data: null, error: m.error } : { data: [{ id: 1 }], error: null }),
        then: (r: (v: unknown) => void) => r(m.error ? { error: m.error } : { error: null }),
      };
      m.escrito.push({ tabla, op, datos });
      return q;
    };
    return {
      perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
      accesos: { comercializadora: m.nivel },
      nivel: m.nivel,
      db: {
        from: (tabla: string) => ({
          insert: (d: unknown) => cadena(tabla, 'insert', d),
          update: (d: unknown) => cadena(tabla, 'update', d),
          delete: () => cadena(tabla, 'delete', null),
        }),
      },
    };
  },
}));
import { cancelarCierre, guardarCierre } from '../../app/(comercializadora)/comercializadora/acciones';

const form = { vendor_id: 'v1', vendor_name: 'Prov', ini: '2099-12-20', fin: '2099-12-30', motivo: 'vacaciones', todo: true, skus: [], notas: '' };

describe('acciones de cierres', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.escrito = [];
    m.error = null;
    m.invocar.mockClear();
  });
  it('lectura no escribe ni recalcula', async () => {
    m.nivel = 'lectura';
    expect(await guardarCierre(form)).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(await cancelarCierre(1)).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(m.escrito).toEqual([]);
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('valida antes de escribir', async () => {
    expect(await guardarCierre({ ...form, fin: '2099-12-01' })).toEqual({ error: 'La fecha final no puede ser antes de la inicial' });
    expect(m.escrito).toEqual([]);
  });
  it('alta: todo el proveedor guarda skus null, con autor, y recalcula com-minmax', async () => {
    expect(await guardarCierre(form)).toEqual({ ok: true, recalculo: true });
    expect(m.escrito[0]).toMatchObject({ tabla: 'com_proveedor_cierre', op: 'insert', datos: { vendor_id: 'v1', skus: null, creado_por: 'Ana', motivo: 'vacaciones' } });
    expect(m.invocar).toHaveBeenCalledWith('com-minmax', {});
  });
  it('cambio de fechas o alcance reinicia los avisos', async () => {
    await guardarCierre({ ...form, id: 7 });
    expect(m.escrito[0]).toMatchObject({ op: 'update', datos: { aviso7_at: null, aviso0_at: null } });
  });
  it('si el recálculo falla, lo guardado queda y se avisa', async () => {
    m.invocar.mockResolvedValueOnce({ ok: false, error: 'Zoho caído' } as never);
    expect(await cancelarCierre(3)).toEqual({ ok: true, recalculo: false });
    expect(m.escrito[0]).toMatchObject({ op: 'update', datos: { cancelado: true } });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-funciones.test.ts tests/portal/com-cierres.test.ts tests/portal/com-acciones.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`lib/comercializadora/funciones.ts`:

```ts
import 'server-only';

export type FuncionCom = 'com-minmax' | 'zoho-generar-oc' | 'zoho-sync' | 'zoho-proveedor-minimo';

/**
 * Llama una Edge Function de Comercializadora con el secreto compartido (plan 2, decisión 5; plan 3, decisión 5).
 * Solo servidor: COM_SECRETO nunca llega al navegador. Nunca lanza; los errores salen en lenguaje claro.
 */
export async function invocarFuncion(
  nombre: FuncionCom,
  body: object = {},
  deps: { fetch?: typeof fetch; url?: string; secreto?: string; timeoutMs?: number } = {},
): Promise<{ ok: true; datos: unknown } | { ok: false; error: string }> {
  const secreto = deps.secreto ?? process.env.COM_SECRETO ?? '';
  const base = deps.url ?? process.env.COM_FUNCIONES_URL ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  if (!secreto) return { ok: false, error: 'El acceso a las funciones de Comercializadora no está configurado (COM_SECRETO).' };
  try {
    const r = await (deps.fetch ?? fetch)(`${base}/${nombre}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-com-secreto': secreto },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 150_000),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (r.status === 401) return { ok: false, error: 'La función rechazó la llamada: revisa el secreto compartido.' };
    if (!r.ok || j.ok === false) return { ok: false, error: j.error || `La función respondió ${r.status}.` };
    return { ok: true, datos: j };
  } catch {
    return { ok: false, error: 'No se pudo contactar la función. Intenta de nuevo en unos minutos.' };
  }
}
```

`lib/comercializadora/cierres.ts`:

```ts
import { fechaCorta, masDias } from './fechas';

/** _cieU: último día para pedir = ini − ceil(LT) − 1 (LT inválido cuenta como 0). */
export function ultimoDiaPedir(ini: string, lt: number): string {
  const x = Number(lt);
  return masDias(ini.slice(0, 10), -(Number.isFinite(x) ? Math.max(0, Math.ceil(x)) : 0) - 1);
}

export type EstadoCierre = { k: 'cancelado' | 'terminado' | 'encierre' | 'tarde' | 'ultimo' | 'proximo'; txt: string };

/** _cieEstado: u = el último día para pedir más temprano de sus artículos (o null). */
export function estadoCierre(c: { ini: string; fin: string; cancelado: boolean }, hoy: string, u: string | null): EstadoCierre {
  const ini = c.ini.slice(0, 10);
  const fin = c.fin.slice(0, 10);
  if (c.cancelado) return { k: 'cancelado', txt: 'Cancelado' };
  if (hoy > fin) return { k: 'terminado', txt: 'Terminado' };
  if (hoy >= ini) return { k: 'encierre', txt: `En cierre hasta ${fechaCorta(fin)}` };
  if (u && hoy > u) return { k: 'tarde', txt: 'Ya no alcanza' };
  if (u && u === hoy) return { k: 'ultimo', txt: 'Último día hoy' };
  return { k: 'proximo', txt: u ? `Pide antes del ${fechaCorta(u)}` : 'Sin artículos afectados' };
}

export interface FormCierre {
  id?: number;
  vendor_id: string;
  vendor_name: string;
  ini: string;
  fin: string;
  motivo: string;
  todo: boolean;
  skus: string[];
  notas: string;
}

/** _cieValidar. */
export function validarCierre(f: Pick<FormCierre, 'vendor_id' | 'ini' | 'fin' | 'todo' | 'skus' | 'notas'>, hoy: string, esNuevo: boolean): string | null {
  if (!f.vendor_id) return 'Elige un proveedor';
  if (!f.ini || !f.fin) return 'Pon las fechas';
  if (f.fin < f.ini) return 'La fecha final no puede ser antes de la inicial';
  if (esNuevo && f.fin < hoy) return 'Ya terminó: la fecha final es antes de hoy';
  if (!f.todo && !(Array.isArray(f.skus) && f.skus.length)) return 'Elige al menos un artículo o marca todo el proveedor';
  if (String(f.notas ?? '').length > 500) return 'Las notas son de máximo 500 caracteres';
  return null;
}

/** _cieAfectados: artículos no inactivos del proveedor, o solo los de la lista. */
export function afectados<T extends { sku: string; zoho_vendor_id: string | null; estatus?: string | null }>(
  c: { vendor_id: string; skus: string[] | null },
  catalogo: T[],
): T[] {
  const s = Array.isArray(c.skus) && c.skus.length ? c.skus : null;
  return catalogo.filter(
    (a) => a.estatus !== 'Inactivo' && a.zoho_vendor_id != null && String(a.zoho_vendor_id) === String(c.vendor_id) && (!s || s.includes(a.sku)),
  );
}

/** _cieUPeriodo: el último día del servidor si la proyección es del mismo periodo; si no, el calculado aquí. */
export function uPeriodo(
  c: { ini: string; fin: string },
  s: { u: string | null; ini: string; fin: string } | undefined,
  uLocal: string | null,
): string | null {
  const d10 = (x: string | null | undefined) => String(x ?? '').slice(0, 10);
  if (s?.u && d10(s.ini) === d10(c.ini) && d10(s.fin) === d10(c.fin)) return d10(s.u);
  return uLocal;
}

export const MOTIVOS: [string, string][] = [
  ['vacaciones', 'Vacaciones'],
  ['inventario', 'Inventario'],
  ['agotado', 'Agotado en fábrica'],
  ['otro', 'Otro'],
];
```

`app/(comercializadora)/comercializadora/acciones.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { invocarFuncion } from '@/lib/comercializadora/funciones';
import { validarCierre, type FormCierre } from '@/lib/comercializadora/cierres';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export type Resultado<T = object> = { error: string } | ({ ok: true } & T);

const SOLO_LECTURA = 'Tu acceso a Comercializadora es de solo lectura.';

/** Sesión con permiso de escritura; sin él, null (la acción responde SOLO_LECTURA sin tocar la base). */
export async function editorCom() {
  const s = await sesionComercializadora(false);
  return puedeEditarCom(s.accesos) ? s : null;
}

const fallo = (e: unknown): { error: string } => {
  const code = (e as { code?: string } | null)?.code;
  if (code === '42501') return { error: SOLO_LECTURA };
  return { error: 'No se pudo guardar. Intenta de nuevo.' };
};

export async function guardarCierre(f: FormCierre): Promise<Resultado<{ recalculo: boolean }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const error = validarCierre(f, hoyCdmx(), !f.id);
    if (error) return { error };
    const datos = {
      vendor_id: f.vendor_id,
      vendor_name: f.vendor_name,
      ini: f.ini,
      fin: f.fin,
      motivo: f.motivo,
      skus: f.todo ? null : f.skus,
      notas: f.notas.trim() || null,
      actualizado_at: new Date().toISOString(),
    };
    // Cambiar fechas o alcance vuelve a mandar los avisos (_cieGuardar): en una edición se reinician siempre.
    const r = f.id
      ? await s.db.from('com_proveedor_cierre' as never).update({ ...datos, aviso7_at: null, aviso0_at: null } as never).eq('id' as never, f.id as never).select('id')
      : await s.db.from('com_proveedor_cierre' as never).insert({ ...datos, creado_por: s.perfil.nombre } as never).select('id');
    if (r.error) return fallo(r.error);
    const re = await invocarFuncion('com-minmax', {});
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, recalculo: re.ok };
  } catch (e) {
    return fallo(e);
  }
}

export async function cancelarCierre(id: number): Promise<Resultado<{ recalculo: boolean }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await s.db.from('com_proveedor_cierre' as never).update({ cancelado: true, actualizado_at: new Date().toISOString() } as never).eq('id' as never, id as never).select('id');
    if (r.error) return fallo(r.error);
    const re = await invocarFuncion('com-minmax', {});
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, recalculo: re.ok };
  } catch (e) {
    return fallo(e);
  }
}
```

Si los casts `as never` de `s.db.from` no compilan con el cliente tipado, usa `com(s.db).from('com_proveedor_cierre')` desde `lib/comercializadora/consultas.ts`. Como ese archivo es `server-only`, también se puede importar en acciones. Regístralo en el ledger.

`app/(comercializadora)/comercializadora/proveedores-sin-stock/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Cierres } from '@/components/comercializadora/cierres';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export default async function ProveedoresSinStock() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const [cierres, proyeccion, proveedores, catalogo, minmax] = await Promise.all([
    leerTodoCom<CierreFila>(db, 'com_proveedor_cierre', '*', 'id'),
    ultimaProyeccion(db),
    leerTodoCom<{ vendor_id: string; nombre: string | null }>(db, 'com_zoho_proveedor', 'vendor_id,nombre', 'vendor_id'),
    leerTodoCom<{ sku: string; nombre: string | null; zoho_vendor_id: string | null; estatus: string | null }>(db, 'com_catalogo', 'sku,nombre,zoho_vendor_id,estatus', 'sku'),
    leerTodoCom<{ sku: string; lead_time: number }>(db, 'com_minmax', 'sku,lead_time', 'sku'),
  ]);
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Proveedores sin stock" descripcion="Periodos en que un proveedor no entrega, con el último día para pedir antes del cierre." />
      <Cierres
        cierres={cierres}
        resumen={proyeccion?.resumen.cierres ?? []}
        proveedores={proveedores}
        catalogo={catalogo}
        leadTimes={Object.fromEntries(minmax.map((x) => [x.sku, Number(x.lead_time)]))}
        hoy={hoy}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}

export interface CierreFila {
  id: number;
  vendor_id: string;
  vendor_name: string;
  ini: string;
  fin: string;
  motivo: string;
  skus: string[] | null;
  notas: string | null;
  cancelado: boolean;
  aviso7_at: string | null;
  aviso0_at: string | null;
}
```

`components/comercializadora/cierres.tsx` es la lista con secciones Próximos, En curso y Pasados (90 días), más el formulario de alta y edición. El estado y el último día salen de `afectados`, `ultimoDiaPedir`, `uPeriodo` y `estadoCierre`:

```tsx
'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Pill, Tarjeta, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { afectados, estadoCierre, MOTIVOS, ultimoDiaPedir, uPeriodo, validarCierre, type FormCierre } from '@/lib/comercializadora/cierres';
import { difDias, fechaCorta, masDias } from '@/lib/comercializadora/fechas';
import { cancelarCierre, guardarCierre } from '@/app/(comercializadora)/comercializadora/acciones';
import type { CierreFila } from '@/app/(comercializadora)/comercializadora/proveedores-sin-stock/page';

const TONO: Record<string, Estado> = { cancelado: 'neutro', terminado: 'neutro', encierre: 'neutro', tarde: 'pierde', ultimo: 'bajo', proximo: 'ok' };
const vacio = (): FormCierre => ({ vendor_id: '', vendor_name: '', ini: '', fin: '', motivo: 'vacaciones', todo: true, skus: [], notas: '' });

export function Cierres(p: {
  cierres: CierreFila[];
  resumen: { id: number; u: string | null; ini: string; fin: string; monto_adelanto?: number }[];
  proveedores: { vendor_id: string; nombre: string | null }[];
  catalogo: { sku: string; nombre: string | null; zoho_vendor_id: string | null; estatus: string | null }[];
  leadTimes: Record<string, number>;
  hoy: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormCierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const filas = useMemo(
    () =>
      p.cierres.map((c) => {
        const arts = afectados(c, p.catalogo);
        const uLocal = arts.reduce<string | null>((m, a) => {
          const u = ultimoDiaPedir(c.ini, p.leadTimes[a.sku] ?? 0);
          return m == null || u < m ? u : m;
        }, null);
        const s = p.resumen.find((x) => x.id === c.id);
        const u = uPeriodo(c, s, uLocal);
        return { c, arts, u, estado: estadoCierre(c, p.hoy, u), monto: s?.monto_adelanto ?? 0 };
      }),
    [p],
  );
  const proximos = filas.filter((f) => ['proximo', 'ultimo', 'tarde'].includes(f.estado.k));
  const enCurso = filas.filter((f) => f.estado.k === 'encierre');
  const pasados = filas.filter((f) => ['terminado', 'cancelado'].includes(f.estado.k) && f.c.fin.slice(0, 10) >= masDias(p.hoy, -90));

  const guardar = () =>
    iniciar(async () => {
      if (!form) return;
      const v = validarCierre(form, p.hoy, !form.id);
      if (v) return setError(v);
      const r = await guardarCierre(form);
      if ('error' in r) return setError(r.error);
      setForm(null);
      setError(null);
      setAviso(r.recalculo ? 'Guardado. La simulación ya se recalculó.' : 'Guardado, pero no se pudo recalcular la simulación: se hará en la corrida diaria.');
      router.refresh();
    });
  const cancelar = (id: number) =>
    iniciar(async () => {
      const r = await cancelarCierre(id);
      if ('error' in r) return setAviso(r.error);
      setAviso(r.recalculo ? 'Cancelado. La simulación ya se recalculó.' : 'Cancelado, pero no se pudo recalcular la simulación.');
      router.refresh();
    });

  const tabla = (titulo: string, lista: typeof filas) => (
    <Tarjeta titulo={titulo} cuerpo={false}>
      {lista.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Ninguno.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr><th>Proveedor</th><th>Fechas</th><th>Motivo</th><th>Alcance</th><th>Último día para pedir</th><th className="text-right">Monto adelantado</th><th>Estado</th>{p.editable ? <th /> : null}</tr>
            </thead>
            <tbody>
              {lista.map(({ c, arts, u, estado, monto }) => (
                <tr key={c.id}>
                  <td><div className="font-medium">{c.vendor_name}</div>{c.notas ? <div className="text-xs text-muted-foreground">{c.notas}</div> : null}</td>
                  <td>{fechaCorta(c.ini)} al {fechaCorta(c.fin)}</td>
                  <td>{MOTIVOS.find(([k]) => k === c.motivo)?.[1] ?? c.motivo}</td>
                  <td>{c.skus?.length ? `${arts.length} artículo(s)` : `Todo el proveedor (${arts.length})`}</td>
                  <td>{u ? `${fechaCorta(u)}${u >= p.hoy ? ` · faltan ${difDias(p.hoy, u)} días` : ''}` : '—'}</td>
                  <td className="text-right tabular-nums">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto)}</td>
                  <td><Pill estado={TONO[estado.k]}>{estado.txt}</Pill></td>
                  {p.editable ? (
                    <td className="whitespace-nowrap text-right">
                      {!c.cancelado && estado.k !== 'terminado' ? (
                        <>
                          <button type="button" className="text-sm font-semibold underline" onClick={() => setForm({ id: c.id, vendor_id: c.vendor_id, vendor_name: c.vendor_name, ini: c.ini.slice(0, 10), fin: c.fin.slice(0, 10), motivo: c.motivo, todo: !c.skus?.length, skus: c.skus ?? [], notas: c.notas ?? '' })}>Editar</button>{' '}
                          <button type="button" className="text-sm font-semibold text-bad underline" disabled={pendiente} onClick={() => cancelar(c.id)}>Cancelar</button>
                        </>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );

  const articulosDelProveedor = form ? p.catalogo.filter((a) => a.zoho_vendor_id === form.vendor_id && a.estatus !== 'Inactivo') : [];
  return (
    <div className="space-y-5">
      {aviso ? <p role="status" className="placa px-4 py-3 text-sm">{aviso}</p> : null}
      {p.editable && !form ? (
        <button type="button" onClick={() => { setForm(vacio()); setError(null); }} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          <Plus size={15} aria-hidden="true" /> Registrar periodo sin stock
        </button>
      ) : null}
      {form ? (
        <Tarjeta titulo={form.id ? 'Editar periodo' : 'Nuevo periodo sin stock'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Proveedor
              <select className={claseCampo} value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value, vendor_name: p.proveedores.find((x) => x.vendor_id === e.target.value)?.nombre ?? '', skus: [] })}>
                <option value="">Elige…</option>
                {p.proveedores.map((x) => <option key={x.vendor_id} value={x.vendor_id}>{x.nombre ?? x.vendor_id}</option>)}
              </select>
            </label>
            <label className="text-sm">Motivo
              <select className={claseCampo} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
                {MOTIVOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm">Desde<input type="date" className={claseCampo} value={form.ini} onChange={(e) => setForm({ ...form, ini: e.target.value })} /></label>
            <label className="text-sm">Hasta<input type="date" className={claseCampo} value={form.fin} onChange={(e) => setForm({ ...form, fin: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.todo} onChange={(e) => setForm({ ...form, todo: e.target.checked })} /> Todo el proveedor</label>
            {!form.todo ? (
              <fieldset className="max-h-48 overflow-y-auto rounded-[10px] border border-line p-3 text-sm sm:col-span-2">
                <legend className="px-1">Artículos</legend>
                {articulosDelProveedor.map((a) => (
                  <label key={a.sku} className="flex items-center gap-2">
                    <input type="checkbox" checked={form.skus.includes(a.sku)} onChange={(e) => setForm({ ...form, skus: e.target.checked ? [...form.skus, a.sku] : form.skus.filter((s) => s !== a.sku) })} /> {a.nombre ?? a.sku} <span className="text-muted-foreground">{a.sku}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="text-sm sm:col-span-2">Notas<textarea maxLength={500} className={claseCampo} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>
          </div>
          {error ? <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={pendiente} onClick={guardar} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">{pendiente ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => setForm(null)} className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold">Cerrar</button>
          </div>
        </Tarjeta>
      ) : null}
      {filas.length === 0 ? <Vacio titulo="Sin periodos registrados">Registra cuando un proveedor no vaya a entregar (vacaciones, inventario, agotado).</Vacio> : (
        <>
          {tabla('Próximos', proximos)}
          {tabla('En curso', enCurso)}
          {tabla('Pasados (90 días)', pasados)}
        </>
      )}
    </div>
  );
}
```

En `.env.example`, al final:

```
# Comercializadora (solo servidor): el mismo valor que el secreto COM_SECRETO de las Edge Functions.
COM_SECRETO=
# Opcional: por omisión es ${NEXT_PUBLIC_SUPABASE_URL}/functions/v1
COM_FUNCIONES_URL=
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-funciones.test.ts tests/portal/com-cierres.test.ts tests/portal/com-acciones.test.ts && npx tsc --noEmit -p .`
Expected: PASS y tipos limpios. Si el mock de `db` en `com-acciones.test.ts` no refleja la cadena real (`update(...).eq(...).select('id')`), ajusta el mock y no la acción.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora "app/(comercializadora)" components/comercializadora .env.example tests/portal/com-funciones.test.ts tests/portal/com-cierres.test.ts tests/portal/com-acciones.test.ts
git commit -m "feat(comercializadora): Proveedores sin stock y llamadas a funciones desde el servidor"
```

---

### Task 5: OC automáticas

**Files:**
- Create: `lib/comercializadora/ocauto.ts`, `app/(comercializadora)/comercializadora/oc-automaticas/page.tsx`, `components/comercializadora/oc-automaticas.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`correrOcAuto`)
- Test: `tests/portal/com-ocauto.test.ts`, agregar a `tests/portal/com-acciones.test.ts`

**Interfaces:**
- Consumes: `invocarFuncion`, `editorCom`, `Resultado` (Tarea 4); `cierresVigentes`, `AvisosCierre` (Tarea 3).
- Produces: `corridasOcAuto(filas: OcAutoFila[]): Corrida[]`; acción `correrOcAuto(modo: 'simulacion' | 'real'): Promise<Resultado<{ ocs: number; modo: string }>>`.

- [ ] **Step 1: Pruebas que fallan**

`tests/portal/com-ocauto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { corridasOcAuto } from '../../lib/comercializadora/ocauto';

const fila = (o: Record<string, unknown>) => ({
  id: 1, corrida_id: 'c1', creada_at: '2026-11-12T13:05:00Z', fecha: '2026-11-12', origen: 'cron', modo: 'real',
  vendor_id: 'v1', vendor_name: 'Prov', zoho_po_id: null, po_number: null, lineas: [], monto: 100, estado: 'creada', error: null, ...o,
});

describe('corridasOcAuto (renderComAuto)', () => {
  it('agrupa por corrida, la más reciente primero, con totales', () => {
    const r = corridasOcAuto([
      fila({ id: 1, corrida_id: 'c1', monto: 100 }),
      fila({ id: 2, corrida_id: 'c1', monto: 50, estado: 'error', error: 'Zoho' }),
      fila({ id: 3, corrida_id: 'c2', creada_at: '2026-11-13T13:05:00Z', modo: 'simulacion', estado: 'simulada' }),
    ] as never);
    expect(r.map((c) => [c.corrida_id, c.ocs.length, c.monto, c.errores])).toEqual([['c2', 1, 100, 0], ['c1', 2, 150, 1]]);
    expect(r[1]).toMatchObject({ fecha: '2026-11-12', origen: 'cron', modo: 'real' });
  });
});
```

Agregar a `tests/portal/com-acciones.test.ts` (importando `correrOcAuto` junto a las otras acciones):

```ts
describe('correr OC automática', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.invocar.mockReset();
  });
  it('lectura no corre', async () => {
    m.nivel = 'lectura';
    expect(await correrOcAuto('simulacion')).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('simulación llama zoho-generar-oc manual y regresa el resumen', async () => {
    m.invocar.mockResolvedValueOnce({ ok: true, datos: { ok: true, ocs: 5, modo: 'simulacion' } } as never);
    expect(await correrOcAuto('simulacion')).toEqual({ ok: true, ocs: 5, modo: 'simulacion' });
    expect(m.invocar).toHaveBeenCalledWith('zoho-generar-oc', { origen: 'manual', modo: 'simulacion' });
  });
  it('el error de la función llega tal cual', async () => {
    m.invocar.mockResolvedValueOnce({ ok: false, error: 'Las OCs automáticas están en modo simulación' } as never);
    expect(await correrOcAuto('real')).toEqual({ error: 'Las OCs automáticas están en modo simulación' });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-ocauto.test.ts tests/portal/com-acciones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`lib/comercializadora/ocauto.ts`:

```ts
export interface LineaOcAuto {
  sku: string;
  nombre?: string;
  cantidad: number;
  costo?: number;
  monto?: number;
  disponible?: number;
  enCamino?: number;
  minimo?: number;
  maximo?: number;
  adelanto_cierre?: boolean;
  cierre_tarde?: boolean;
  bajo_minimo?: boolean;
}
export interface OcAutoFila {
  id: number;
  corrida_id: string;
  creada_at: string;
  fecha: string;
  origen: 'cron' | 'manual';
  modo: 'simulacion' | 'real';
  vendor_id: string | null;
  vendor_name: string | null;
  zoho_po_id: string | null;
  po_number: string | null;
  lineas: LineaOcAuto[];
  monto: number;
  estado: 'creada' | 'simulada' | 'error';
  error: string | null;
}
export interface Corrida {
  corrida_id: string;
  creada_at: string;
  fecha: string;
  origen: string;
  modo: string;
  ocs: OcAutoFila[];
  monto: number;
  errores: number;
}

/** Agrupa las OCs automáticas por corrida (renderComAuto), de la más reciente a la más vieja. */
export function corridasOcAuto(filas: OcAutoFila[]): Corrida[] {
  const g = new Map<string, Corrida>();
  for (const f of filas) {
    const c = g.get(f.corrida_id) ?? { corrida_id: f.corrida_id, creada_at: f.creada_at, fecha: f.fecha, origen: f.origen, modo: f.modo, ocs: [], monto: 0, errores: 0 };
    c.ocs.push(f);
    c.monto += Number(f.monto) || 0;
    if (f.estado === 'error') c.errores++;
    if (f.creada_at < c.creada_at) c.creada_at = f.creada_at;
    g.set(f.corrida_id, c);
  }
  return [...g.values()].sort((a, b) => b.creada_at.localeCompare(a.creada_at));
}
```

Agregar a `acciones.ts`:

```ts
export async function correrOcAuto(modo: 'simulacion' | 'real'): Promise<Resultado<{ ocs: number; modo: string }>> {
  const s = await editorCom().catch(() => null);
  if (!s) return { error: SOLO_LECTURA };
  const r = await invocarFuncion('zoho-generar-oc', { origen: 'manual', modo: modo === 'real' ? 'real' : 'simulacion' });
  if (!r.ok) return { error: r.error };
  const d = r.datos as { ocs?: number; modo?: string };
  revalidatePath('/comercializadora', 'layout');
  return { ok: true, ocs: Number(d.ocs) || 0, modo: String(d.modo ?? modo) };
}
```

`app/(comercializadora)/comercializadora/oc-automaticas/page.tsx`:

```tsx
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { OcAutomaticas } from '@/components/comercializadora/oc-automaticas';
import { AvisosCierre } from '@/components/comercializadora/avisos-cierre';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { cierresVigentes, com, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { corridasOcAuto, type OcAutoFila } from '@/lib/comercializadora/ocauto';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export default async function OcAutomaticasPagina() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const [ocs, config, proy] = await Promise.all([
    com(db).from('com_oc_auto').select('*').order('creada_at', { ascending: false }).limit(200),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    ultimaProyeccion(db),
  ]);
  if (ocs.error) throw new Error('No se pudieron leer las OCs automáticas. Intenta de nuevo.');
  const avisos = await cierresVigentes(db, hoy, proy?.resumen ?? null);
  const corridas = corridasOcAuto(ocs.data as OcAutoFila[]);
  return (
    <>
      <Encabezado area="Comercializadora" titulo="OC automáticas" descripcion="Borradores de órdenes de compra que se generan todos los días a las 07:05." />
      <AvisosCierre avisos={avisos} hoy={hoy} />
      {corridas.length === 0 ? (
        <Vacio titulo="Todavía no hay corridas" />
      ) : (
        <OcAutomaticas corridas={corridas} modo={config.data?.config?.auto?.modo === 'real' ? 'real' : 'simulacion'} editable={puedeEditarCom(accesos)} />
      )}
    </>
  );
}
```

`components/comercializadora/oc-automaticas.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Tarjeta } from '@/components/portal/piezas';
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Corrida } from '@/lib/comercializadora/ocauto';
import { correrOcAuto } from '@/app/(comercializadora)/comercializadora/acciones';

export function OcAutomaticas({ corridas, modo, editable }: { corridas: Corrida[]; modo: 'simulacion' | 'real'; editable: boolean }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (m: 'simulacion' | 'real') =>
    iniciar(async () => {
      const r = await correrOcAuto(m);
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: `Listo: ${r.ocs} OC(s) en ${r.modo === 'real' ? 'modo real' : 'simulación'}.` });
      router.refresh();
    });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Modo actual: <b>{modo === 'real' ? 'Real (crea borradores en Zoho)' : 'Simulación (no crea nada en Zoho)'}</b></p>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pendiente} onClick={() => correr('simulacion')} className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">{pendiente ? 'Corriendo…' : 'Simular ahora'}</button>
          {modo === 'real' ? (
            <button type="button" disabled={pendiente} onClick={() => confirm('Se crearán borradores reales en Zoho. ¿Continuar?') && correr('real')} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Correr ahora (real)</button>
          ) : null}
        </div>
      ) : null}
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}>{msg.t}</p> : null}
      {corridas.map((c) => (
        <Tarjeta key={c.corrida_id} titulo={`${fechaCorta(c.fecha)} · ${c.origen === 'cron' ? 'Automática' : 'Manual'} · ${c.modo === 'real' ? 'Real' : 'Simulación'}`} descripcion={`${c.ocs.length} proveedor(es) · ${pesos(c.monto)}${c.errores ? ` · ${c.errores} con error` : ''}`} cuerpo={false}>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Proveedor</th><th>OC Zoho</th><th className="text-right">Artículos</th><th className="text-right">Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {c.ocs.map((o) => (
                  <tr key={o.id} className="cursor-pointer" onClick={() => setAbierta(abierta === String(o.id) ? null : String(o.id))}>
                    <td className="font-medium">{o.vendor_name ?? o.vendor_id}{o.lineas.some((l) => l.bajo_minimo) ? <> <Pill estado="pierde">No llega al mínimo</Pill></> : null}
                      {abierta === String(o.id) ? (
                        <ul className="mt-2 space-y-1 text-xs font-normal">
                          {o.lineas.map((l) => (
                            <li key={l.sku}>{l.nombre ?? l.sku} · {l.cantidad} pzas{l.monto != null ? ` · ${pesos(l.monto)}` : ''}{l.adelanto_cierre ? ' · adelanto por cierre' : ''}{l.cierre_tarde ? ' · cierre: ya no llega' : ''}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td>{o.po_number ?? o.zoho_po_id ?? '—'}</td>
                    <td className="text-right tabular-nums">{o.lineas.length}</td>
                    <td className="text-right tabular-nums">{pesos(o.monto)}</td>
                    <td>{o.estado === 'error' ? <Pill estado="pierde">{o.error ?? 'Error'}</Pill> : <Pill estado={o.estado === 'creada' ? 'ok' : 'neutro'}>{o.estado === 'creada' ? 'Creada' : 'Simulada'}</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-ocauto.test.ts tests/portal/com-acciones.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/ocauto.ts "app/(comercializadora)" components/comercializadora/oc-automaticas.tsx tests/portal/com-ocauto.test.ts tests/portal/com-acciones.test.ts
git commit -m "feat(comercializadora): OC automáticas con simulación desde el portal"
```

---

### Task 6: Órdenes de compra de la plataforma

**Files:**
- Create: `lib/comercializadora/ordenes.ts`, `app/(comercializadora)/comercializadora/ordenes/page.tsx`, `components/comercializadora/ordenes.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`guardarOc`, `recibirOc`, `eliminarOc`)
- Test: `tests/portal/com-ordenes.test.ts`, agregar a `tests/portal/com-acciones.test.ts`

**Interfaces:**
- Produces:
  - `estadoOc(items): 'emitida' | 'parcial' | 'recibida'`
  - `agruparOcs(filas: MovCompra[]): OcGrupo[]`
  - `resumenOcs(filas, hoy): { abiertas; montoAbiertas; atrasadas; montoAtrasadas }`
  - `validarOc(f: FormOc): string | null`
  - Acciones `guardarOc(f: FormOc)`, `recibirOc(folio: string, recibido: Record<string, number>)` y `eliminarOc(folio: string)`.

- [ ] **Step 1: Pruebas que fallan**

`tests/portal/com-ordenes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparOcs, estadoOc, resumenOcs, validarOc } from '../../lib/comercializadora/ordenes';

const mov = (o: Record<string, unknown>) => ({
  id: 'x', folio: 'OC-1', fecha: '2026-11-01', sku: 'A', cantidad: 10, cantidad_recibida: 0, monto: null,
  destino: 'CEDIS', fecha_arribo: '2026-11-20', proveedor: 'Prov', estado: 'emitida', ...o,
});

describe('órdenes (_ocEstadoCalculado, agrupar, _ocResumenHtml)', () => {
  it('estado por lo recibido del folio completo', () => {
    expect(estadoOc([{ cantidad: 10, cantidad_recibida: 0 }])).toBe('emitida');
    expect(estadoOc([{ cantidad: 10, cantidad_recibida: 4 }, { cantidad: 5, cantidad_recibida: 0 }])).toBe('parcial');
    expect(estadoOc([{ cantidad: 10, cantidad_recibida: 10 }, { cantidad: 5, cantidad_recibida: 6 }])).toBe('recibida');
  });
  it('agrupa por folio con SKUs, unidades y monto (solo el de las filas que lo traen)', () => {
    const [g] = agruparOcs([mov({ id: '1', monto: 500 }), mov({ id: '2', sku: 'B', cantidad: 3 })] as never);
    expect(g).toMatchObject({ folio: 'OC-1', skus: 2, uds: 13, monto: 500, estado: 'emitida' });
  });
  it('KPIs: abiertas con monto, y atrasadas si la fecha de arribo ya pasó', () => {
    const r = resumenOcs([
      mov({ id: '1', monto: 500 }),
      mov({ id: '2', folio: 'OC-2', monto: 200, fecha_arribo: '2026-11-30' }),
      mov({ id: '3', folio: 'OC-3', monto: 90, cantidad_recibida: 10 }),
    ] as never, '2026-11-25');
    expect(r).toEqual({ abiertas: 2, montoAbiertas: 700, atrasadas: 1, montoAtrasadas: 500 });
  });
  it('validación de una OC nueva', () => {
    const f = { folio: 'OC-9', proveedor: 'Prov', fecha: '2026-11-13', fecha_arribo: '2026-11-20', destino: 'CEDIS', monto: 100, lineas: [{ sku: 'A', cantidad: 5 }] };
    expect(validarOc(f)).toBeNull();
    expect(validarOc({ ...f, folio: ' ' })).toBe('Pon el folio de la OC');
    expect(validarOc({ ...f, lineas: [] })).toBe('Agrega al menos un artículo con cantidad');
    expect(validarOc({ ...f, monto: 0 })).toBe('Pon el monto total de la OC');
  });
});
```

Agregar a `tests/portal/com-acciones.test.ts`:

```ts
import { eliminarOc, guardarOc } from '../../app/(comercializadora)/comercializadora/acciones';

describe('acciones de órdenes', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.escrito = [];
    m.error = null;
  });
  it('lectura no escribe', async () => {
    m.nivel = 'lectura';
    expect(await eliminarOc('OC-1')).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(m.escrito).toEqual([]);
  });
  it('OC nueva: una fila compra por artículo, el monto solo en la primera, estado emitida', async () => {
    const r = await guardarOc({ folio: 'OC-9', proveedor: 'Prov', fecha: '2026-11-13', fecha_arribo: '2026-11-20', destino: 'CEDIS', monto: 100, lineas: [{ sku: 'A', cantidad: 5 }, { sku: 'B', cantidad: 2 }] });
    expect(r).toEqual({ ok: true });
    expect(m.escrito[0]).toMatchObject({ tabla: 'com_movimientos', op: 'insert' });
    const filas = m.escrito[0].datos as Record<string, unknown>[];
    expect(filas.map((f) => [f.sku, f.monto, f.tipo, f.estado])).toEqual([['A', 100, 'compra', 'emitida'], ['B', null, 'compra', 'emitida']]);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-ordenes.test.ts tests/portal/com-acciones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`lib/comercializadora/ordenes.ts`:

```ts
export interface MovCompra {
  id: string;
  folio: string;
  fecha: string | null;
  sku: string;
  cantidad: number | null;
  cantidad_recibida: number | null;
  monto: number | null;
  destino: string | null;
  fecha_arribo: string | null;
  proveedor: string | null;
  estado: string | null;
}
export interface OcGrupo {
  folio: string;
  fecha: string | null;
  proveedor: string | null;
  destino: string | null;
  fecha_arribo: string | null;
  skus: number;
  uds: number;
  monto: number;
  estado: 'emitida' | 'parcial' | 'recibida';
  items: MovCompra[];
}
export interface FormOc {
  folio: string;
  proveedor: string;
  fecha: string;
  fecha_arribo: string;
  destino: string;
  monto: number;
  lineas: { sku: string; cantidad: number }[];
}

const n = (x: unknown) => Number(x) || 0;

/** _ocEstadoCalculado. */
export function estadoOc(items: { cantidad: number | null; cantidad_recibida: number | null }[]): OcGrupo['estado'] {
  const pedido = items.reduce((s, r) => s + n(r.cantidad), 0);
  const recibido = items.reduce((s, r) => s + n(r.cantidad_recibida), 0);
  if (recibido <= 0) return 'emitida';
  if (recibido >= pedido) return 'recibida';
  return 'parcial';
}

/** agrupar() de la pestaña Órdenes: un grupo por folio, de la fecha más reciente a la más vieja. */
export function agruparOcs(filas: MovCompra[]): OcGrupo[] {
  const g = new Map<string, OcGrupo>();
  for (const r of filas) {
    const x = g.get(r.folio) ?? { folio: r.folio, fecha: r.fecha, proveedor: r.proveedor, destino: r.destino, fecha_arribo: r.fecha_arribo, skus: 0, uds: 0, monto: 0, estado: 'emitida' as const, items: [] };
    x.skus++;
    x.uds += n(r.cantidad);
    if (r.monto) x.monto += n(r.monto);
    x.items.push(r);
    g.set(r.folio, x);
  }
  return [...g.values()].map((x) => ({ ...x, estado: estadoOc(x.items) })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/** _ocResumenHtml: abiertas = con algo por recibir; atrasadas = abiertas con fecha de arribo antes de hoy. */
export function resumenOcs(filas: MovCompra[], hoy: string) {
  const f = new Map<string, { monto: number; abierta: boolean; tarde: boolean }>();
  for (const r of filas) {
    if (!r.folio) continue;
    const x = f.get(r.folio) ?? { monto: 0, abierta: false, tarde: false };
    x.monto += n(r.monto);
    if (n(r.cantidad) - n(r.cantidad_recibida) > 0) {
      x.abierta = true;
      if (r.fecha_arribo && r.fecha_arribo.slice(0, 10) < hoy) x.tarde = true;
    }
    f.set(r.folio, x);
  }
  let abiertas = 0, montoAbiertas = 0, atrasadas = 0, montoAtrasadas = 0;
  for (const x of f.values()) {
    if (!x.abierta) continue;
    abiertas++;
    montoAbiertas += x.monto;
    if (x.tarde) {
      atrasadas++;
      montoAtrasadas += x.monto;
    }
  }
  return { abiertas, montoAbiertas, atrasadas, montoAtrasadas };
}

/** Validación de _comGuardarOC: folio, proveedor, monto total (> 0) y al menos un artículo con cantidad. */
export function validarOc(f: FormOc): string | null {
  if (!f.folio.trim()) return 'Pon el folio de la OC';
  if (!f.proveedor.trim()) return 'Elige el proveedor';
  if (!f.lineas.some((l) => l.sku && Number(l.cantidad) > 0)) return 'Agrega al menos un artículo con cantidad';
  if (!(Number(f.monto) > 0)) return 'Pon el monto total de la OC';
  return null;
}
```

Agregar a `acciones.ts` (y el import `import { validarOc, type FormOc } from '@/lib/comercializadora/ordenes';`):

```ts
/** OC de plataforma (_comGuardarOC): una fila tipo compra por artículo; el monto total va en la primera. */
export async function guardarOc(f: FormOc, folioAnterior?: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const error = validarOc(f);
    if (error) return { error };
    const filas = f.lineas
      .filter((l) => l.sku && Number(l.cantidad) > 0)
      .map((l, i) => ({
        tipo: 'compra', folio: f.folio.trim(), sku: l.sku, cantidad: Number(l.cantidad), cantidad_recibida: 0,
        fecha: f.fecha, fecha_arribo: f.fecha_arribo || null, destino: f.destino, estado: 'emitida',
        monto: i === 0 ? Number(f.monto) : null, proveedor: f.proveedor,
      }));
    const ins = await s.db.from('com_movimientos' as never).insert(filas as never).select('id');
    if (ins.error) return fallo(ins.error);
    // Editar = insertar las nuevas y borrar las anteriores (_comEditarOC), solo si el alta salió bien.
    if (folioAnterior) {
      const ids = new Set((ins.data as { id: string }[]).map((x) => x.id));
      const viejas = await s.db.from('com_movimientos' as never).select('id').eq('tipo' as never, 'compra' as never).eq('folio' as never, folioAnterior as never);
      const borrar = ((viejas.data ?? []) as { id: string }[]).map((x) => x.id).filter((id) => !ids.has(id));
      if (borrar.length) await s.db.from('com_movimientos' as never).delete().in('id' as never, borrar as never);
    }
    revalidatePath('/comercializadora/ordenes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comGuardarRecepcion: actualiza cantidad_recibida por fila (Zoho manda en el saldo: no toca com_catalogo). */
export async function recibirOc(folio: string, recibido: Record<string, number>): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    for (const [id, cant] of Object.entries(recibido)) {
      if (!(Number(cant) >= 0)) return { error: 'La cantidad recibida no es válida' };
      const r = await s.db.from('com_movimientos' as never).update({ cantidad_recibida: Number(cant) } as never).eq('id' as never, id as never).eq('folio' as never, folio as never).select('id');
      if (r.error) return fallo(r.error);
    }
    revalidatePath('/comercializadora/ordenes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarOc(folio: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await s.db.from('com_movimientos' as never).delete().eq('tipo' as never, 'compra' as never).eq('folio' as never, folio as never).select('id');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/ordenes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

Extiende el mock de `db` de `com-acciones.test.ts` con `select`, `in` y `delete().eq().eq().select()` según haga falta para estas cadenas (sin cambiar las acciones).

`app/(comercializadora)/comercializadora/ordenes/page.tsx` lee los movimientos `tipo='compra'`, los proveedores de `com_zoho_proveedor` (decisión 4), los SKUs del catálogo y el último `zoho-sync` (frescura). Muestra los KPIs y la tabla con filtros de estado y mes (search params, en lista blanca):

```tsx
import { ClipboardList, Clock } from 'lucide-react';
import { Encabezado, Kpi } from '@/components/portal/piezas';
import { Ordenes } from '@/components/comercializadora/ordenes';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { agruparOcs, resumenOcs, type MovCompra } from '@/lib/comercializadora/ordenes';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { pesos } from '@/lib/comercializadora/formato';

const ESTADOS = ['emitida', 'parcial', 'recibida'];

export default async function OrdenesPagina({ searchParams }: { searchParams: Promise<{ estado?: string; mes?: string }> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const hoy = hoyCdmx();
  const [movs, proveedores, catalogo, sync] = await Promise.all([
    leerTodoCom<MovCompra>(db, 'com_movimientos', 'id,folio,fecha,sku,cantidad,cantidad_recibida,monto,destino,fecha_arribo,proveedor,estado', 'id', (q) => q.eq('tipo', 'compra')),
    leerTodoCom<{ vendor_id: string; nombre: string | null }>(db, 'com_zoho_proveedor', 'vendor_id,nombre', 'vendor_id'),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku', (q) => q.neq('estatus', 'Inactivo')),
    com(db).from('com_sync_log').select('inicio,ok').eq('proceso', 'zoho-sync').order('inicio', { ascending: false }).limit(1),
  ]);
  const k = resumenOcs(movs, hoy);
  const estado = ESTADOS.includes(sp.estado ?? '') ? sp.estado : undefined;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes : undefined;
  const grupos = agruparOcs(movs).filter((g) => (!estado || g.estado === estado) && (!mes || String(g.fecha).startsWith(mes)));
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Órdenes de compra" descripcion="OCs de la plataforma y su recepción. Zoho las concilia cada 30 minutos." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi etiqueta="OCs abiertas (por recibir)" valor={k.abiertas} nota={pesos(k.montoAbiertas)} icono={ClipboardList} />
        <Kpi etiqueta="Atrasadas" valor={k.atrasadas} nota={k.atrasadas ? `${pesos(k.montoAtrasadas)} con fecha de arribo vencida` : 'Ninguna con fecha de arribo vencida'} icono={Clock} tono={k.atrasadas ? 'pierde' : 'ok'} />
      </div>
      <Ordenes
        grupos={grupos}
        estado={estado}
        mes={mes}
        proveedores={proveedores.map((p) => p.nombre ?? p.vendor_id).sort((a, b) => a.localeCompare(b, 'es'))}
        catalogo={catalogo}
        ultimoSync={sync.data?.[0]?.inicio ?? null}
        editable={puedeEditarCom(accesos)}
        hoy={hoy}
      />
    </>
  );
}
```

`components/comercializadora/ordenes.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Pill, Tarjeta, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { validarOc, type FormOc, type OcGrupo } from '@/lib/comercializadora/ordenes';
import { eliminarOc, guardarOc, recibirOc } from '@/app/(comercializadora)/comercializadora/acciones';

const TONO: Record<OcGrupo['estado'], Estado> = { emitida: 'neutro', parcial: 'bajo', recibida: 'ok' };
const NOMBRE: Record<OcGrupo['estado'], string> = { emitida: 'Emitida', parcial: 'Parcial', recibida: 'Recibida' };
const POR_PAGINA = 25;

export function Ordenes(p: {
  grupos: OcGrupo[];
  estado?: string;
  mes?: string;
  proveedores: string[];
  catalogo: { sku: string; nombre: string | null }[];
  ultimoSync: string | null;
  editable: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [recibido, setRecibido] = useState<Record<string, number>>({});
  const [form, setForm] = useState<(FormOc & { anterior?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ver, setVer] = useState(POR_PAGINA);
  const [pendiente, iniciar] = useTransition();
  const minutos = p.ultimoSync ? Math.round((Date.now() - new Date(p.ultimoSync).getTime()) / 60000) : null;

  const correr = (fn: () => Promise<{ error: string } | { ok: true }>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if ('error' in r) return setError(r.error);
      setError(null);
      alTerminar?.();
      router.refresh();
    });
  const nueva = (): FormOc => ({ folio: '', proveedor: '', fecha: p.hoy, fecha_arribo: '', destino: 'CEDIS', monto: 0, lineas: [{ sku: '', cantidad: 0 }] });

  return (
    <div className="space-y-5">
      <p className={`text-sm ${minutos != null && minutos > 120 ? 'text-warn' : 'text-muted-foreground'}`} role="status">
        {minutos == null ? 'Todavía no hay sincronización con Zoho.' : `Última sincronización con Zoho: hace ${minutos} min${minutos > 120 ? ' (revisa la conexión)' : ''}.`}
      </p>
      <form action="/comercializadora/ordenes" className="flex flex-wrap items-center gap-2">
        <select name="estado" defaultValue={p.estado ?? ''} aria-label="Estado" className={`${claseCampo} max-w-48`}>
          <option value="">Todos los estados</option>
          <option value="emitida">Emitida</option>
          <option value="parcial">Parcial</option>
          <option value="recibida">Recibida</option>
        </select>
        <input type="month" name="mes" defaultValue={p.mes ?? ''} aria-label="Mes" className={`${claseCampo} max-w-48`} />
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Filtrar</button>
        {p.editable && !form ? (
          <button type="button" onClick={() => { setForm(nueva()); setError(null); }} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">
            <Plus size={15} aria-hidden="true" /> Nueva OC
          </button>
        ) : null}
      </form>
      {error ? <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}

      {form ? (
        <Tarjeta titulo={form.anterior ? `Editar ${form.anterior}` : 'Nueva orden de compra'}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Folio<input className={claseCampo} value={form.folio} onChange={(e) => setForm({ ...form, folio: e.target.value })} /></label>
            <label className="text-sm">Proveedor
              <select className={claseCampo} value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}>
                <option value="">Elige…</option>
                {p.proveedores.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-sm">Destino
              <select className={claseCampo} value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}>
                <option value="CEDIS">CEDIS</option>
                <option value="3PL">3PL</option>
              </select>
            </label>
            <label className="text-sm">Fecha<input type="date" className={claseCampo} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
            <label className="text-sm">Fecha de arribo<input type="date" className={claseCampo} value={form.fecha_arribo} onChange={(e) => setForm({ ...form, fecha_arribo: e.target.value })} /></label>
            <label className="text-sm">Monto total (MXN)<input type="number" min="0" step="0.01" className={claseCampo} value={form.monto || ''} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} /></label>
          </div>
          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-semibold">Artículos</legend>
            {form.lineas.map((l, i) => (
              <div key={i} className="flex gap-2">
                <select aria-label={`Artículo ${i + 1}`} className={claseCampo} value={l.sku} onChange={(e) => setForm({ ...form, lineas: form.lineas.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)) })}>
                  <option value="">Elige…</option>
                  {p.catalogo.map((a) => <option key={a.sku} value={a.sku}>{a.nombre ?? a.sku} · {a.sku}</option>)}
                </select>
                <input aria-label={`Cantidad ${i + 1}`} type="number" min="0" className={`${claseCampo} max-w-32`} value={l.cantidad || ''} onChange={(e) => setForm({ ...form, lineas: form.lineas.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)) })} />
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, lineas: [...form.lineas, { sku: '', cantidad: 0 }] })} className="text-sm font-semibold underline">Agregar artículo</button>
          </fieldset>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                const v = validarOc(form);
                if (v) return setError(v);
                const { anterior, ...datos } = form;
                correr(() => guardarOc(datos, anterior), () => setForm(null));
              }}
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
            >
              {pendiente ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold">Cerrar</button>
          </div>
        </Tarjeta>
      ) : null}

      {p.grupos.length === 0 ? (
        <Vacio titulo="Sin órdenes con estos filtros" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Folio</th><th>Proveedor</th><th className="text-right">SKUs</th><th className="text-right">Uds.</th><th className="text-right">Monto</th><th>Destino</th><th>F. Arribo</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {p.grupos.slice(0, ver).map((g) => (
                <tr key={g.folio} className="align-top">
                  <td>{g.fecha ? fechaCorta(g.fecha) : '—'}</td>
                  <td>
                    <button type="button" className="font-semibold underline" aria-expanded={abierto === g.folio} onClick={() => { setAbierto(abierto === g.folio ? null : g.folio); setRecibido({}); }}>{g.folio}</button>
                    {abierto === g.folio ? (
                      <div className="mt-2 space-y-2 text-xs">
                        {g.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-2">
                            <span className="min-w-24">{it.sku}</span>
                            <span>{it.cantidad} pedidas ·</span>
                            {p.editable ? (
                              <input aria-label={`Recibido ${it.sku}`} type="number" min="0" className={`${claseCampo} h-8 max-w-24`} defaultValue={it.cantidad_recibida ?? 0} onChange={(e) => setRecibido({ ...recibido, [it.id]: Number(e.target.value) })} />
                            ) : (
                              <span>{it.cantidad_recibida ?? 0} recibidas</span>
                            )}
                          </div>
                        ))}
                        {p.editable ? (
                          <div className="flex gap-3">
                            <button type="button" disabled={pendiente || !Object.keys(recibido).length} onClick={() => correr(() => recibirOc(g.folio, recibido), () => setRecibido({}))} className="font-semibold underline">Guardar recepción</button>
                            <button type="button" onClick={() => setForm({ anterior: g.folio, folio: g.folio, proveedor: g.proveedor ?? '', fecha: g.fecha ?? p.hoy, fecha_arribo: g.fecha_arribo ?? '', destino: g.destino ?? 'CEDIS', monto: g.monto, lineas: g.items.map((x) => ({ sku: x.sku, cantidad: Number(x.cantidad) || 0 })) })} className="font-semibold underline">Editar</button>
                            <button type="button" disabled={pendiente} onClick={() => confirm(`¿Eliminar la OC ${g.folio}?`) && correr(() => eliminarOc(g.folio))} className="font-semibold text-bad underline">Eliminar</button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td>{g.proveedor ?? '—'}</td>
                  <td className="text-right tabular-nums">{g.skus}</td>
                  <td className="text-right tabular-nums">{g.uds}</td>
                  <td className="text-right tabular-nums">{pesos(g.monto)}</td>
                  <td>{g.destino ?? '—'}</td>
                  <td>{g.fecha_arribo ? fechaCorta(g.fecha_arribo) : '—'}</td>
                  <td><Pill estado={TONO[g.estado]}>{NOMBRE[g.estado]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.grupos.length > ver ? (
        <button type="button" onClick={() => setVer(ver + POR_PAGINA)} className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold">Ver más</button>
      ) : null}
    </div>
  );
}
```


- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-ordenes.test.ts tests/portal/com-acciones.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/ordenes.ts "app/(comercializadora)" components/comercializadora/ordenes.tsx tests/portal/com-ordenes.test.ts tests/portal/com-acciones.test.ts
git commit -m "feat(comercializadora): órdenes de compra de la plataforma con recepción"
```

---

### Task 7: Mínimos de proveedor

**Files:**
- Create: `lib/comercializadora/minimos.ts`, `app/(comercializadora)/comercializadora/minimos/page.tsx`, `components/comercializadora/minimos.tsx`
- Modify: `acciones.ts` (`guardarMinimo`)
- Test: `tests/portal/com-minimos.test.ts`, agregar a `tests/portal/com-acciones.test.ts`

**Interfaces:**
- Produces: `estadoMinimo(p): { k: 'ok' | 'pendiente' | 'error'; txt }`, `origenMinimo(p): string`, `validarMonto(txt: string): number | null`; acción `guardarMinimo(vendor_id: string, monto: string): Promise<Resultado<{ enviado: boolean; aviso?: string }>>`.

- [ ] **Step 1: Pruebas que fallan**

`tests/portal/com-minimos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estadoMinimo, origenMinimo, validarMonto } from '../../lib/comercializadora/minimos';

describe('mínimos (port de _minEstado, _minOrigenTxt, _minValidar)', () => {
  it('estado: error gana a pendiente; si no, sincronizado', () => {
    expect(estadoMinimo({ minimo_error: 'sin campo', minimo_pendiente: true })).toEqual({ k: 'error', txt: 'Error: sin campo' });
    expect(estadoMinimo({ minimo_pendiente: true })).toEqual({ k: 'pendiente', txt: 'Pendiente de enviar' });
    expect(estadoMinimo({})).toEqual({ k: 'ok', txt: 'Sincronizado' });
  });
  it('origen con fecha corta', () => {
    expect(origenMinimo({ minimo_origen: 'migracion' })).toBe('Migrado');
    expect(origenMinimo({ minimo_origen: 'zoho', minimo_editado_at: '2026-11-12T18:00:00Z' })).toBe('Zoho, 12 nov');
    expect(origenMinimo({})).toBe('—');
  });
  it('monto: miles con coma, $ y hasta 2 decimales; lo demás es inválido', () => {
    expect(validarMonto('15000')).toBe(15000);
    expect(validarMonto('$15,000.50')).toBe(15000.5);
    expect(validarMonto('15.123')).toBeNull();
    expect(validarMonto('1,5')).toBeNull();
    expect(validarMonto('-3')).toBeNull();
    expect(validarMonto('1e5')).toBeNull();
  });
});
```

Agregar a `tests/portal/com-acciones.test.ts`:

```ts
import { guardarMinimo } from '../../app/(comercializadora)/comercializadora/acciones';

describe('guardar mínimo', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.invocar.mockReset();
  });
  it('lectura no llama la función', async () => {
    m.nivel = 'lectura';
    expect(await guardarMinimo('v1', '1000')).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('monto inválido no llama la función', async () => {
    expect(await guardarMinimo('v1', '1,5')).toEqual({ error: 'Monto inválido: usa pesos con hasta 2 decimales' });
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('llama zoho-proveedor-minimo con autor; si Zoho falla queda guardado y pendiente', async () => {
    m.invocar.mockResolvedValueOnce({ ok: true, datos: { ok: true, enviado: false, error: 'Zoho en modo sin efectos externos' } } as never);
    expect(await guardarMinimo('v1', '$2,500')).toEqual({ ok: true, enviado: false, aviso: 'Zoho en modo sin efectos externos' });
    expect(m.invocar).toHaveBeenCalledWith('zoho-proveedor-minimo', { vendor_id: 'v1', monto: 2500, por: 'Ana' });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-minimos.test.ts tests/portal/com-acciones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`lib/comercializadora/minimos.ts`:

```ts
import { fechaCorta } from './fechas';

export interface MinimoProveedor {
  vendor_id?: string;
  nombre?: string | null;
  minimo_compra?: number;
  minimo_origen?: string | null;
  minimo_editado_at?: string | null;
  minimo_pendiente?: boolean;
  minimo_error?: string | null;
}

export function estadoMinimo(p: MinimoProveedor): { k: 'ok' | 'pendiente' | 'error'; txt: string } {
  if (p.minimo_error) return { k: 'error', txt: `Error: ${p.minimo_error}` };
  if (p.minimo_pendiente) return { k: 'pendiente', txt: 'Pendiente de enviar' };
  return { k: 'ok', txt: 'Sincronizado' };
}

export function origenMinimo(p: MinimoProveedor): string {
  if (p.minimo_origen === 'migracion') return 'Migrado';
  const o = p.minimo_origen === 'zoho' ? 'Zoho' : p.minimo_origen === 'plataforma' ? 'Plataforma' : null;
  if (!o) return '—';
  const d = p.minimo_editado_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(p.minimo_editado_at)) : null;
  return d ? `${o}, ${fechaCorta(d)}` : o;
}

/** _minValidar: "15000", "15,000.50", "$15,000" → número ≥ 0 con hasta 2 decimales; si no, null. */
export function validarMonto(txt: string): number | null {
  let t = String(txt ?? '').replace(/[\s$]/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
```

Agregar a `acciones.ts` (con `import { validarMonto } from '@/lib/comercializadora/minimos';`):

```ts
/** _minGuardar: la función guarda en la plataforma y envía a Zoho; lo guardado queda aunque Zoho falle. */
export async function guardarMinimo(vendor_id: string, monto: string): Promise<Resultado<{ enviado: boolean; aviso?: string }>> {
  const s = await editorCom().catch(() => null);
  if (!s) return { error: SOLO_LECTURA };
  const valor = validarMonto(monto);
  if (valor === null) return { error: 'Monto inválido: usa pesos con hasta 2 decimales' };
  const r = await invocarFuncion('zoho-proveedor-minimo', { vendor_id, monto: valor, por: s.perfil.nombre });
  if (!r.ok) return { error: r.error };
  const d = r.datos as { enviado?: boolean; error?: string };
  revalidatePath('/comercializadora', 'layout');
  return d.enviado ? { ok: true, enviado: true } : { ok: true, enviado: false, aviso: d.error };
}
```

`app/(comercializadora)/comercializadora/minimos/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Minimos } from '@/components/comercializadora/minimos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { hoyCdmx, masDias } from '@/lib/comercializadora/fechas';
import type { MinimoProveedor } from '@/lib/comercializadora/minimos';

export default async function MinimosPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [proveedores, ocs, sync] = await Promise.all([
    leerTodoCom<MinimoProveedor & { vendor_id: string }>(db, 'com_zoho_proveedor', 'vendor_id,nombre,minimo_compra,minimo_origen,minimo_editado_at,minimo_pendiente,minimo_error', 'vendor_id'),
    leerTodoCom<{ id: number; vendor_id: string | null; lineas: { bajo_minimo?: boolean }[] }>(db, 'com_oc_auto', 'id,vendor_id,lineas', 'id', (q) => q.gte('fecha', masDias(hoyCdmx(), -30))),
    com(db).from('com_sync_log').select('resumen').eq('proceso', 'zoho-sync').eq('ok', true).not('fin', 'is', null).order('inicio', { ascending: false }).limit(1),
  ]);
  const ocsBajo: Record<string, number> = {};
  for (const o of ocs) if (o.vendor_id && o.lineas?.some((l) => l.bajo_minimo)) ocsBajo[o.vendor_id] = (ocsBajo[o.vendor_id] ?? 0) + 1;
  return (
    <>
      <Encabezado area="Comercializadora" titulo="Mínimos de proveedor" descripcion="Monto mínimo de compra por proveedor. Se guarda aquí y se envía a Zoho." />
      <Minimos proveedores={proveedores} ocsBajo={ocsBajo} minimoCampo={sync.data?.[0]?.resumen?.minimoCampo ?? null} editable={puedeEditarCom(accesos)} />
    </>
  );
}
```

`components/comercializadora/minimos.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { estadoMinimo, origenMinimo, type MinimoProveedor } from '@/lib/comercializadora/minimos';
import { guardarMinimo } from '@/app/(comercializadora)/comercializadora/acciones';

type Filtro = 'todos' | 'con' | 'sin' | 'pendientes';
const TONO: Record<string, Estado> = { ok: 'ok', pendiente: 'bajo', error: 'pierde' };
const FILTROS: [Filtro, string][] = [['todos', 'Todos'], ['con', 'Con mínimo'], ['sin', 'Sin mínimo'], ['pendientes', 'Pendientes o con error']];

export function Minimos(p: {
  proveedores: (MinimoProveedor & { vendor_id: string })[];
  ocsBajo: Record<string, number>;
  minimoCampo: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [edicion, setEdicion] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({});
  const [pendiente, iniciar] = useTransition();
  const texto = q.trim().toLowerCase();
  const lista = p.proveedores
    .filter((x) => {
      const m = Number(x.minimo_compra) || 0;
      const e = estadoMinimo(x).k;
      return filtro === 'todos' || (filtro === 'con' && m > 0) || (filtro === 'sin' && m === 0) || (filtro === 'pendientes' && e !== 'ok');
    })
    .filter((x) => !texto || String(x.nombre ?? x.vendor_id).toLowerCase().includes(texto))
    .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'));

  const guardar = (vendor: string, monto: string) =>
    iniciar(async () => {
      const r = await guardarMinimo(vendor, monto);
      setMsg((m) => ({
        ...m,
        [vendor]: 'error' in r ? { ok: false, t: r.error } : { ok: true, t: r.enviado ? 'Guardado y enviado a Zoho.' : `Guardado; queda pendiente de enviar${r.aviso ? `: ${r.aviso}` : '.'}` },
      }));
      if (!('error' in r)) router.refresh();
    });

  return (
    <div className="space-y-5">
      {p.minimoCampo === 'falta' ? (
        <p role="note" className="placa border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          En Zoho no existe el campo «Mínimo de compra (MXN)» en los proveedores: los mínimos se guardan aquí y quedan pendientes de enviar.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtro" className="flex gap-1">
          {FILTROS.map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={`h-10 rounded-[10px] px-3 text-sm font-semibold ${filtro === k ? 'bg-ink text-white' : 'border border-line-strong bg-surface'}`}>{t}</button>
          ))}
        </div>
        <input type="search" aria-label="Buscar proveedor" placeholder="Buscar proveedor" value={q} onChange={(e) => setQ(e.target.value)} className={`${claseCampo} max-w-xs`} />
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Sin proveedores con este filtro" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr><th>Proveedor</th><th className="text-right">Mínimo (MXN)</th><th>Origen</th><th>Estado</th><th className="text-right">OCs bajo el mínimo (30 días)</th>{p.editable ? <th>Editar</th> : null}</tr>
            </thead>
            <tbody>
              {lista.map((x) => {
                const e = estadoMinimo(x);
                const m = msg[x.vendor_id];
                return (
                  <tr key={x.vendor_id}>
                    <td className="font-medium">{x.nombre ?? x.vendor_id}</td>
                    <td className="text-right tabular-nums">{Number(x.minimo_compra) > 0 ? pesos(Number(x.minimo_compra)) : '—'}</td>
                    <td>{origenMinimo(x)}</td>
                    <td><Pill estado={TONO[e.k]}>{e.txt}</Pill></td>
                    <td className="text-right tabular-nums">{p.ocsBajo[x.vendor_id] ?? 0}</td>
                    {p.editable ? (
                      <td className="min-w-64">
                        <div className="flex gap-2">
                          <input aria-label={`Mínimo de ${x.nombre ?? x.vendor_id}`} inputMode="decimal" className={`${claseCampo} h-9 max-w-32`} placeholder="0.00" value={edicion[x.vendor_id] ?? ''} onChange={(ev) => setEdicion({ ...edicion, [x.vendor_id]: ev.target.value })} />
                          <button type="button" disabled={pendiente || !edicion[x.vendor_id]} onClick={() => guardar(x.vendor_id, edicion[x.vendor_id])} className="h-9 rounded-[10px] bg-ink px-3 text-sm font-semibold text-white">Guardar</button>
                          {e.k !== 'ok' ? (
                            <button type="button" disabled={pendiente} onClick={() => guardar(x.vendor_id, String(Number(x.minimo_compra) || 0))} className="h-9 text-sm font-semibold underline">Reintentar</button>
                          ) : null}
                        </div>
                        {m ? <p role={m.ok ? 'status' : 'alert'} className={`mt-1 text-xs ${m.ok ? 'text-muted-foreground' : 'text-bad'}`}>{m.t}</p> : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```


- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-minimos.test.ts tests/portal/com-acciones.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/minimos.ts "app/(comercializadora)" components/comercializadora/minimos.tsx tests/portal/com-minimos.test.ts tests/portal/com-acciones.test.ts
git commit -m "feat(comercializadora): mínimos de compra por proveedor"
```

---

### Task 8: Pagos proyectados

**Files:**
- Create: `lib/comercializadora/pagos.ts`, `app/(comercializadora)/comercializadora/pagos/page.tsx`, `components/comercializadora/pagos.tsx`
- Test: `tests/portal/com-pagos.test.ts`

**Interfaces:**
- Produces:
  - `periodoPago(fecha: string, modo: 'semana' | 'quincena' | 'mes'): { clave; ini; fin; etiqueta }`
  - `agruparPagos(filas: PagoFila[], modo, campoFecha: 'fecha_pago' | 'fecha_oc', conComprometido: boolean, hoy: string): { periodos; provs; tot }`
  - `kpisPagos(filas, hoy): { estaSemana; proximos30; pesado: { etiqueta; monto } | null; comprometido }`

- [ ] **Step 1: Pruebas que fallan**

`tests/portal/com-pagos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparPagos, kpisPagos, periodoPago } from '../../lib/comercializadora/pagos';

const p = (o: Record<string, unknown>) => ({ tipo: 'proyectado', sku: 'A', nombre: 'Café', vendor_id: 'v1', vendor_name: 'Prov', fecha_oc: '2026-11-13', fecha_pago: '2026-11-20', cantidad: 1, monto: 100, ...o });

describe('periodos de pago (_pagPeriodo)', () => {
  it('semana de lunes a domingo', () => {
    expect(periodoPago('2026-11-13', 'semana')).toMatchObject({ ini: '2026-11-09', fin: '2026-11-15', etiqueta: '9 nov' });
    expect(periodoPago('2026-11-15', 'semana').ini).toBe('2026-11-09'); // domingo
  });
  it('quincena 1–15 y 16–fin de mes, y mes completo', () => {
    expect(periodoPago('2026-02-20', 'quincena')).toMatchObject({ ini: '2026-02-16', fin: '2026-02-28', etiqueta: '16–28 feb' });
    expect(periodoPago('2026-11-03', 'quincena')).toMatchObject({ ini: '2026-11-01', fin: '2026-11-15' });
    expect(periodoPago('2026-12-31', 'mes')).toMatchObject({ ini: '2026-12-01', fin: '2026-12-31', etiqueta: 'dic 2026' });
  });
});

describe('agruparPagos (_pagAgrupar)', () => {
  it('columnas desde el periodo de hoy; lo vencido cae en hoy; sin comprometido si se pide', () => {
    const filas = [
      p({ fecha_pago: '2026-11-01', monto: 50, tipo: 'comprometido' }),
      p({ fecha_pago: '2026-11-20', monto: 100 }),
      p({ fecha_pago: '2026-11-25', monto: 30, vendor_id: 'v2', vendor_name: 'Otro' }),
    ];
    const r = agruparPagos(filas as never, 'semana', 'fecha_pago', true, '2026-11-13');
    expect(r.periodos.map((x) => x.ini)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
    expect(r.tot['2026-11-09']).toEqual({ proy: 0, comp: 50, cant: 1 });
    expect(r.provs.map((x) => [x.nombre, x.total])).toEqual([['Prov', 150], ['Otro', 30]]);
    const sin = agruparPagos(filas as never, 'semana', 'fecha_pago', false, '2026-11-13');
    expect(sin.tot['2026-11-09']).toBeUndefined();
  });
});

describe('kpisPagos', () => {
  it('esta semana (hasta el domingo, con lo vencido), próximos 30 días, periodo más pesado y comprometido', () => {
    const k = kpisPagos([
      p({ fecha_pago: '2026-11-10', monto: 40, tipo: 'comprometido' }),
      p({ fecha_pago: '2026-11-15', monto: 60 }),
      p({ fecha_pago: '2026-12-01', monto: 500 }),
      p({ fecha_pago: '2027-01-30', monto: 900 }),
    ] as never, '2026-11-13');
    expect(k).toEqual({ estaSemana: 100, proximos30: 600, pesado: { etiqueta: '25 ene', monto: 900 }, comprometido: 40 });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-pagos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`lib/comercializadora/pagos.ts`:

```ts
import { fechaCorta, isoUtc, masDias, msUtc, nombreMes } from './fechas';

export interface PagoFila {
  tipo: 'proyectado' | 'comprometido';
  sku: string;
  nombre: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  fecha_oc: string;
  fecha_pago: string;
  fecha_llegada?: string;
  cantidad: number;
  monto: number;
  zoho_po_id?: string | null;
}
export type ModoPeriodo = 'semana' | 'quincena' | 'mes';
export interface Periodo {
  clave: string;
  ini: string;
  fin: string;
  etiqueta: string;
}

/** _pagPeriodo: semana lunes–domingo, quincena 1–15 / 16–fin, mes. */
export function periodoPago(fecha: string, modo: ModoPeriodo): Periodo {
  const ms = msUtc(fecha);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  let ini: number, fin: number, etiqueta: string;
  if (modo === 'mes') {
    ini = Date.UTC(y, m, 1);
    fin = Date.UTC(y, m + 1, 0);
    etiqueta = `${nombreMes(m)} ${y}`;
  } else if (modo === 'quincena') {
    const seg = d.getUTCDate() > 15;
    ini = Date.UTC(y, m, seg ? 16 : 1);
    fin = seg ? Date.UTC(y, m + 1, 0) : Date.UTC(y, m, 15);
    etiqueta = `${new Date(ini).getUTCDate()}–${new Date(fin).getUTCDate()} ${nombreMes(m)}`;
  } else {
    ini = ms - ((d.getUTCDay() + 6) % 7) * 864e5;
    fin = ini + 6 * 864e5;
    etiqueta = fechaCorta(isoUtc(ini));
  }
  const i = isoUtc(ini);
  return { clave: i, ini: i, fin: isoUtc(fin), etiqueta };
}

type Celda = { proy: number; comp: number; cant: number };
export interface ProvPagos {
  vendor: string;
  nombre: string;
  total: number;
  celdas: Record<string, Celda>;
  skus: { sku: string; nombre: string; total: number; cantidad: number; celdas: Record<string, Celda> }[];
}

/** _pagAgrupar: proveedor × periodo, del periodo de hoy al último con datos; una fecha anterior cuenta en hoy. */
export function agruparPagos(filas: PagoFila[], modo: ModoPeriodo, campoFecha: 'fecha_pago' | 'fecha_oc', conComprometido: boolean, hoy: string) {
  const hoyP = periodoPago(hoy, modo);
  let ultimo = hoyP.ini;
  const porProv = new Map<string, ProvPagos & { porSku: Map<string, ProvPagos['skus'][number]> }>();
  const tot: Record<string, Celda> = {};
  const celda = (o: Record<string, Celda>, k: string) => (o[k] ??= { proy: 0, comp: 0, cant: 0 });
  for (const r of filas) {
    const comp = r.tipo === 'comprometido';
    if (comp && !conComprometido) continue;
    const f = r[campoFecha]?.slice(0, 10);
    const per = f && f >= hoyP.ini ? periodoPago(f, modo) : hoyP;
    const monto = Number(r.monto) || 0;
    const cant = Number(r.cantidad) || 0;
    if (per.ini > ultimo) ultimo = per.ini;
    const vk = String(r.vendor_id || r.vendor_name || '(sin proveedor)');
    const g = porProv.get(vk) ?? { vendor: vk, nombre: r.vendor_name || '(sin proveedor)', total: 0, celdas: {}, skus: [], porSku: new Map() };
    const sk = String(r.sku ?? '');
    const a = g.porSku.get(sk) ?? { sku: sk, nombre: r.nombre ?? '', total: 0, cantidad: 0, celdas: {} };
    for (const c of [celda(g.celdas, per.clave), celda(a.celdas, per.clave), celda(tot, per.clave)]) {
      c[comp ? 'comp' : 'proy'] += monto;
      c.cant += cant;
    }
    g.total += monto;
    a.total += monto;
    a.cantidad += cant;
    g.porSku.set(sk, a);
    porProv.set(vk, g);
  }
  const periodos: Periodo[] = [];
  for (let p = hoyP, n = 0; p.ini <= ultimo && n < 400; p = periodoPago(masDias(p.fin, 1), modo), n++) periodos.push(p);
  const desc = (a: { total: number }, b: { total: number }) => b.total - a.total;
  const provs = [...porProv.values()].map(({ porSku, ...g }) => ({ ...g, skus: [...porSku.values()].sort(desc) })).sort(desc);
  return { periodos, provs, tot };
}

/** KPIs de renderComPagos: esta semana (hasta el domingo; lo vencido cuenta), 30 días, periodo semanal más pesado y comprometido. */
export function kpisPagos(filas: PagoFila[], hoy: string) {
  const domingo = periodoPago(hoy, 'semana').fin;
  const en30 = masDias(hoy, 30);
  let estaSemana = 0, proximos30 = 0, comprometido = 0;
  for (const r of filas) {
    const f = r.fecha_pago.slice(0, 10);
    const monto = Number(r.monto) || 0;
    if (f <= domingo) estaSemana += monto;
    if (f <= en30) proximos30 += monto;
    if (r.tipo === 'comprometido') comprometido += monto;
  }
  const g = agruparPagos(filas, 'semana', 'fecha_pago', true, hoy);
  let pesado: { etiqueta: string; monto: number } | null = null;
  for (const p of g.periodos) {
    const c = g.tot[p.clave];
    const m = c ? c.proy + c.comp : 0;
    if (m > 0 && (!pesado || m > pesado.monto)) pesado = { etiqueta: p.etiqueta, monto: m };
  }
  return { estaSemana, proximos30, pesado, comprometido };
}
```

`app/(comercializadora)/comercializadora/pagos/page.tsx`:

```tsx
import { AlertTriangle } from 'lucide-react';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { Pagos } from '@/components/comercializadora/pagos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { edadHoras, leerTodoCom, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import type { PagoFila } from '@/lib/comercializadora/pagos';

export default async function PagosPagina() {
  const { db } = await sesionComercializadora();
  const proy = await ultimaProyeccion(db);
  const encabezado = <Encabezado area="Comercializadora" titulo="Pagos proyectados" descripcion="Lo que toca pagar a cada proveedor por las compras propuestas y las OCs abiertas." />;
  if (!proy)
    return (
      <>
        {encabezado}
        <Vacio titulo="Todavía no hay proyección">Se calcula todos los días a las 06:30 (hora de Ciudad de México).</Vacio>
      </>
    );
  const calc = proy.resumen.calculado_at!;
  const filas = await leerTodoCom<PagoFila & { id: number }>(db, 'com_pago_proyectado', '*', 'id', (q) => q.eq('calculado_at', calc));
  const incompleta = typeof proy.resumen.filas === 'number' && proy.resumen.filas !== filas.length;
  return (
    <>
      {encabezado}
      {edadHoras(calc) > 36 || incompleta ? (
        <p role="status" className="placa flex items-center gap-2 border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          <AlertTriangle size={16} aria-hidden="true" className="text-warn" />
          {incompleta ? 'La última proyección quedó incompleta: los montos pueden faltar.' : 'La proyección se calculó hace más de 36 horas.'}
        </p>
      ) : null}
      <Pagos filas={filas} hoy={hoyCdmx()} sinCosto={proy.resumen.sinCosto ?? []} sinProveedor={proy.resumen.sinProveedor ?? []} />
    </>
  );
}
```

`components/comercializadora/pagos.tsx` (`Barra` recibe `valor` y `max`, ver `components/portal/piezas.tsx:155`):

```tsx
'use client';
import { Fragment, useMemo, useState } from 'react';
import { CalendarClock, CalendarRange, Flame, Lock } from 'lucide-react';
import { Barra, Kpi, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { agruparPagos, kpisPagos, type ModoPeriodo, type PagoFila } from '@/lib/comercializadora/pagos';
import { DescargarCsv } from './descargar-csv';

export function Pagos({ filas, hoy, sinCosto, sinProveedor }: { filas: PagoFila[]; hoy: string; sinCosto: string[]; sinProveedor: string[] }) {
  const [modo, setModo] = useState<ModoPeriodo>('semana');
  const [fecha, setFecha] = useState<'fecha_pago' | 'fecha_oc'>('fecha_pago');
  const [comp, setComp] = useState(true);
  const [prov, setProv] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const k = kpisPagos(filas, hoy);
  const filtradas = useMemo(() => filas.filter((f) => !prov || String(f.vendor_id || f.vendor_name) === prov), [filas, prov]);
  const g = useMemo(() => agruparPagos(filtradas, modo, fecha, comp, hoy), [filtradas, modo, fecha, comp, hoy]);
  const proveedores = [...new Map(filas.map((f) => [String(f.vendor_id || f.vendor_name), f.vendor_name || '(sin proveedor)'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const maximo = Math.max(1, ...g.provs.map((x) => x.total));
  const total = (c?: { proy: number; comp: number }) => (c ? c.proy + c.comp : 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="A pagar esta semana" valor={pesos(k.estaSemana)} nota="Hasta el domingo, con lo vencido" icono={CalendarClock} />
        <Kpi etiqueta="Próximos 30 días" valor={pesos(k.proximos30)} icono={CalendarRange} />
        <Kpi etiqueta="Periodo más pesado" valor={k.pesado ? pesos(k.pesado.monto) : '—'} nota={k.pesado ? `Semana del ${k.pesado.etiqueta}` : undefined} icono={Flame} />
        <Kpi etiqueta="Ya comprometido" valor={pesos(k.comprometido)} nota="OCs abiertas en Zoho" icono={Lock} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Periodo" value={modo} onChange={(e) => setModo(e.target.value as ModoPeriodo)} className={`${claseCampo} max-w-40`}>
          <option value="semana">Por semana</option>
          <option value="quincena">Por quincena</option>
          <option value="mes">Por mes</option>
        </select>
        <select aria-label="Fecha" value={fecha} onChange={(e) => setFecha(e.target.value as 'fecha_pago' | 'fecha_oc')} className={`${claseCampo} max-w-48`}>
          <option value="fecha_pago">Fecha de pago</option>
          <option value="fecha_oc">Fecha de compra</option>
        </select>
        <select aria-label="Proveedor" value={prov} onChange={(e) => setProv(e.target.value)} className={`${claseCampo} max-w-xs`}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} /> Incluir comprometido</label>
        <DescargarCsv
          nombre={`pagos-${hoy}.csv`}
          filas={filtradas as unknown as Record<string, unknown>[]}
          columnas={[['vendor_name', 'Proveedor'], ['sku', 'SKU'], ['nombre', 'Artículo'], ['tipo', 'Tipo'], ['fecha_oc', 'Fecha de compra'], ['fecha_pago', 'Fecha de pago'], ['cantidad', 'Cantidad'], ['monto', 'Monto']]}
        />
      </div>
      {g.provs.length === 0 ? (
        <Vacio titulo="Sin pagos con estos filtros" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                {g.periodos.map((x) => <th key={x.clave} className="text-right">{x.etiqueta}</th>)}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {g.provs.map((x) => (
                <Fragment key={x.vendor}>
                  <tr className="cursor-pointer" onClick={() => setAbierto(abierto === x.vendor ? null : x.vendor)} aria-expanded={abierto === x.vendor}>
                    <td className="min-w-56">
                      <div className="font-medium">{x.nombre}</div>
                      <Barra valor={x.total} max={maximo} />
                    </td>
                    {g.periodos.map((per) => <td key={per.clave} className="text-right tabular-nums">{total(x.celdas[per.clave]) ? pesos(total(x.celdas[per.clave])) : ''}</td>)}
                    <td className="text-right font-semibold tabular-nums">{pesos(x.total)}</td>
                  </tr>
                  {abierto === x.vendor
                    ? x.skus.map((s) => (
                        <tr key={`${x.vendor}-${s.sku}`} className="text-xs text-muted-foreground">
                          <td className="pl-8">{s.nombre || s.sku} · {s.cantidad} pzas</td>
                          {g.periodos.map((per) => <td key={per.clave} className="text-right tabular-nums">{total(s.celdas[per.clave]) ? pesos(total(s.celdas[per.clave])) : ''}</td>)}
                          <td className="text-right tabular-nums">{pesos(s.total)}</td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                {g.periodos.map((per) => <td key={per.clave} className="text-right tabular-nums">{pesos(total(g.tot[per.clave]))}</td>)}
                <td className="text-right tabular-nums">{pesos(g.provs.reduce((s, x) => s + x.total, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {sinCosto.length || sinProveedor.length ? (
        <p className="text-xs text-muted-foreground">
          {sinCosto.length ? `Sin costo (no suman): ${sinCosto.join(', ')}. ` : ''}
          {sinProveedor.length ? `Sin proveedor en Zoho: ${sinProveedor.join(', ')}.` : ''}
        </p>
      ) : null}
    </div>
  );
}
```


- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-pagos.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/pagos.ts "app/(comercializadora)" components/comercializadora/pagos.tsx tests/portal/com-pagos.test.ts
git commit -m "feat(comercializadora): pagos proyectados por proveedor y periodo"
```

---

### Task 9: Verificación en el navegador, guía y PR

**Files:**
- Modify: `docs/migracion/comercializadora.md` (sección "Pantallas del portal")

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck && npx prettier --check "app/(comercializadora)" components/comercializadora lib/comercializadora "tests/portal/com-*"`
Expected: todo en verde salvo la falla previa de `tests/migracion/paridad.test.ts`. Si prettier marca archivos nuevos, `npx prettier --write` solo sobre esos archivos y vuelve a correr.

- [ ] **Step 2: Acceso para revisar (con OK del usuario).** Para ver las pantallas con datos reales, alguien necesita el módulo. Pide al usuario a quién dárselo, normalmente su cuenta de admin. Con su OK, inserta con `DATABASE_URL`, en una transacción:

```sql
insert into public.perfil_modulos (user_id, modulo, nivel)
select user_id, 'comercializadora', 'desarrollador' from public.perfiles where user_id = '<id de la cuenta elegida>'
on conflict (user_id, modulo) do update set nivel = excluded.nivel;
```

Agrega `COM_SECRETO` al `.env.local` del portal (el usuario pone el valor) para probar los botones que llaman funciones.

- [ ] **Step 3: Recorrido en el navegador (dev server `portal-costeos`)**, en escritorio y a 375 px. En cada pantalla, una captura y `read_console_messages` sin errores:
  1. Inicio muestra la tarjeta Comercializadora; la navegación lleva a las 6 pantallas.
  2. Qué pedir: los KPIs coinciden con los de la pestaña del sitio viejo, abierta el mismo día (mismos artículos a pedir y monto con la misma proyección). Revisa los filtros, la vista por proveedor y el CSV.
  3. OC automáticas: aparecen las corridas copiadas y la de prueba del plan 2. **Simular ahora** crea una corrida `simulada`; no aparece "Correr ahora (real)".
  4. Órdenes: los KPIs de abiertas y atrasadas y la tabla. **No** crear OCs en producción durante la revisión, salvo que el usuario lo pida.
  5. Mínimos: la lista con estados. **No** guardar mínimos durante la revisión (enviaría a Zoho al activar efectos), salvo que el usuario lo pida.
  6. Proveedores sin stock: el cierre copiado con su último día para pedir. **No** crear ni cancelar cierres sin el OK del usuario.
  7. Pagos: KPIs y tabla; comparar "A pagar esta semana" con el sitio viejo.
  8. Una cuenta con `lectura` (si el usuario da una) no ve botones de edición.

- [ ] **Step 4: Guía**

Agrega a `docs/migracion/comercializadora.md`:

```markdown
## 8. Pantallas del portal (plan 3)

- Ruta: `/comercializadora`. Acceso: el admin da el módulo `comercializadora` en `perfil_modulos` (`lectura` ve; `edicion`/`desarrollador` editan).
- Vercel (Production y Preview) necesita `COM_SECRETO` con el mismo valor que el secreto de las funciones; sin él, los botones que recalculan o envían a Zoho muestran "no está configurado".
- Mientras el sitio viejo siga en Real, en el portal no se capturan OCs, mínimos ni cierres de verdad: el espejo de la copia los borraría y el viejo sigue siendo la fuente.
```

- [ ] **Step 5: Commit y PR**

```bash
git add docs/migracion/comercializadora.md
git commit -m "docs(migracion): pantallas de Comercializadora en el portal"
```

Abre el PR encima del PR del plan 2 (#112), con el resumen, las decisiones y las capturas.

---

## Self-review (hecho al escribir)

- **Cobertura:** las pantallas Qué pedir, Órdenes y Proveedores sin stock del spec, más OC automáticas, Mínimos y Pagos del grupo Comprar y Pagar, están en las Tareas 3 a 8. El resto queda en los planes 3b y 3c (decisión 1). Las funciones puras de `lib/comercializadora/` llevan pruebas Vitest con casos del comportamiento actual. Los niveles de acceso controlan los botones (`editable`) y las acciones (`editorCom`). Cada pantalla se revisa en el navegador (Tarea 9).
- **Sin marcadores pendientes.** Todas las páginas y los client components van completos. Lo único que la ejecución debe confirmar contra el código real son las formas de las consultas de `contexto()` en los mocks y la estructura del DOM de `Kpi` en la prueba de Qué pedir; cada caso trae su instrucción de cómo resolverlo y registrarlo.
- **Tipos consistentes:**
  - `Resultado`, `editorCom`, `SOLO_LECTURA` y `fallo` se definen en la Tarea 4 y se usan en las Tareas 5 a 7.
  - `invocarFuncion` se define en la Tarea 4 y se usa en las Tareas 4, 5 y 7.
  - `leerTodoCom`, `com`, `ultimaProyeccion` y `cierresVigentes` se definen en la Tarea 3 y se usan en las Tareas 4 a 8.
  - `fechas.ts` se define en la Tarea 2 y se usa en todas.
