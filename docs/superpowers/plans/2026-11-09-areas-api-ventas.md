# Areas México: exportación de ventas en JSON (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script de solo lectura que convierte las ventas de Rubén Darío (`companyId` 532) de un rango de fechas en los JSON de tickets y arqueos de la API de Areas México. Los valida, los escribe en disco y genera los Excel de alta de artículos y formas de pago, más un reporte.

**Architecture:** La lógica es pura (sin red ni disco) y vive en `lib/areas/`, con un archivo por responsabilidad y pruebas en vitest (`tests/areas/`). El script `scripts/areas/exportar.ts` es lo único que toca red y disco:

1. Lee con la misma lectura del corte (`leerDias` + `conRappi`).
2. Llama a `armar`.
3. Escribe los archivos.

Todos los montos se calculan en **centavos enteros** y se pasan a pesos con 2 decimales solo al armar el JSON.

**Tech Stack:** TypeScript, zod 4, vitest 5, `xlsx` (SheetJS 0.20.3, ya instalado), `tsx` para el script.

**Spec:** `docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md`

## Global Constraints

- **Tienda y caja.** La tienda es solo Rubén Darío: `companyId` 532, `lookerStoreId` 455. `COD_TPV` = `"TC01"` en tickets y arqueos.
- **Anonimato.** Ningún texto de un JSON puede contener el nombre de la sucursal, ni «Rubén Darío» ni «Ruben Dario». La comparación no distingue mayúsculas ni acentos.
- **Productos.** Llevan su nombre real en `DES_ART`, recortado a 150 caracteres.
- **Sesión y ticket.**
  - `NUM_SES` = `AAAAMMDD` como entero.
  - `NUM_TIK` = `PedidoNormal.id` como entero.
  - `TIP_OPE` = `"V"`.
  - `ID_MVO_DTO` = `0`.
- **Fecha del ticket.** `MOM_OPE` en formato `yyyy-MM-dd HH:mm:ss`, hora local.
- **Impuestos.**
  - IVA 16%: `POR_IVA` 16, `BAS_IVA = PRE_FIN / 1.16` e `IMP_IVA = PRE_FIN − BAS_IVA`.
  - IEPS en 0: `POR_IEPS`, `BAS_IEPS` e `IMP_IEPS` en 0, y `PRE_UNI_SIN_IEPS = PRE_UNI_SIN_IVA`.
- **Línea.**
  - `UNI_VEN` = 1.
  - `PRE_UNI` es el precio con IVA **antes** del descuento de línea.
  - `IMP_DTO = PRE_FIN − importe cobrado de la línea`.
  - `IMP_DTG = Σ PRE_FIN − IMP_VEN`.
- **Descarte por cuadre.** Si las líneas suman más de 1 peso **menos** que lo cobrado, el ticket se descarta.
- **Formas de pago.**

  | Código | Descripción | Método y tipo del POS |
  |---|---|---|
  | 101 | Efectivo | `DINHEIRO` |
  | 102 | Tarjeta | `CARTAO` con `EMV`, `CONTACTLESS_EMV` o `CONTINGENCY` |
  | 103 | App - Tarjeta | `CARTAO` o `VIRTUAL_WALLET` con `WALLET` |
  | 104 | App - Saldo | `WALLET_BALANCE` |
  | 105 | Rappi | `RAPPI` |

  Cualquier otra combinación descarta el ticket. Siempre: `COD_MON` 1, `CAM_MON` 1, `IMP_DIV = IMP_VEN` e `IMP_FPG = IMP_DIV × CAM_MON`.
- **Catálogo.**
  - Vive en `datos/areas/articulos.json`.
  - Los códigos se asignan desde 1001 y nunca se reasignan.
  - Los códigos del POS se normalizan como `bi_codigo`: `upper(btrim(regexp_replace(replace(p, chr(160), ' '), '\s+', ' ', 'g')))`.
- **Arqueo.** Uno por día con tickets válidos:
  - `Hora` = la del último ticket;
  - `Monto` = `Σ IMP_VEN` de los válidos;
  - `Descuadres` = 0.
- **Tolerancia.** Los cuadres se validan con 0.01 de tolerancia.
- **Salida.**
  - Va en `datos/areas/<desde>_<hasta>/`, que es ignorada por git (`datos/areas/*/`).
  - Solo se versiona `datos/areas/articulos.json`.
- **El script no escribe en la base.** Correrlo contra la API real del POS y la base de `.env.local` (solo lectura) **requiere OK de Sebastián**.

## Review Focus

1. **Descuento de línea negativo (recargo).** Si `descuentoPct < 0`, `IMP_DTO` sale negativo. El ticket se descarta con motivo y no truena (prueba en Task 6).
2. **Pedido sin líneas**, por ejemplo un Rappi del portal sin productos: se descarta como «Sin líneas» y no manda un JSON sin `Detalles` (prueba en Task 4).
3. **El mismo producto con distinta escritura.** Si un día llega con otras mayúsculas, espacios dobles o espacio no separable, conserva su `COD_ART` (prueba en Task 2).
4. **Centavos con descuento porcentual impar** (por ejemplo $49.90 con 15%): el ticket debe pasar la validación de cuadres (prueba en Task 4).
5. **Lectura parcial del POS o de Rappi:** el reporte lo dice arriba, para que nadie mande días incompletos como si fueran completos (prueba en Task 7).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/areas/tipos.ts` | Esquemas zod y tipos de `TicketCompleto` y `ArqueoCaja`; constante `COD_TPV` |
| `lib/areas/validar.ts` | `validarTicket` y `validarArqueo`: forma, cuadres y anonimato. Devuelven la lista de motivos |
| `lib/areas/catalogo.ts` | `codigoNormal` y la clase `Catalogo` (asignación de `COD_ART` y precios) |
| `lib/areas/pagos.ts` | `FORMAS_PAGO` y `codigoPago` |
| `lib/areas/ticket.ts` | `aTicket`: de `PedidoNormal` a `TicketCompleto` o motivo de descarte |
| `lib/areas/arqueo.ts` | `aArqueo`: de los tickets de un día a `ArqueoCaja` |
| `lib/areas/armar.ts` | `armar`: de pedidos a tickets, arqueos, descartados, resumen por día y artículos vendidos |
| `lib/areas/archivos.ts` | Filas de los dos Excel en el formato de Areas y `reporte.md` |
| `scripts/areas/exportar.ts` | Lee el POS y Rappi, llama a `armar` y escribe los archivos |
| `tests/areas/*.test.ts` | Una prueba por archivo de `lib/areas/` |

Las pruebas corren con: `npx vitest run tests/areas` (en PowerShell, `npx.cmd`).

---

### Task 1: Esquemas y validación

**Files:**
- Create: `lib/areas/tipos.ts`
- Create: `lib/areas/validar.ts`
- Test: `tests/areas/validar.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `COD_TPV: 'TC01'`.
  - Tipos `TicketCompleto`, `Detalle`, `FormaPago`, `Cabecera` y `ArqueoCaja` (de `z.infer`).
  - Esquemas `TicketCompletoEsquema` y `ArqueoCajaEsquema`.
  - `validarTicket(t: TicketCompleto, prohibidos: string[]): string[]`.
  - `validarArqueo(a: ArqueoCaja, tickets: TicketCompleto[], prohibidos: string[]): string[]`.
  - Una lista vacía significa válido.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/validar.test.ts
import { describe, expect, it } from 'vitest';
import { validarArqueo, validarTicket } from '../../lib/areas/validar';
import type { ArqueoCaja, TicketCompleto } from '../../lib/areas/tipos';

const PROHIBIDOS = ['Rubén Darío'];
const ticket = (): TicketCompleto => ({
  Cabecera: {
    COD_TPV: 'TC01', NUM_SES: 20261109, NUM_TIK: 32235824, TIP_OPE: 'V', MOM_OPE: '2026-11-09 10:15:00',
    IMP_VEN: 428.5, ID_MVO_DTO: 0, IMP_DTG: 19.5,
  },
  Detalles: [
    { NUM_LIN: 1, COD_ART: 1001, DES_ART: 'Latte', UNI_VEN: 1, PRE_UNI: 348, PRE_UNI_SIN_IVA: 300,
      PRE_UNI_SIN_IEPS: 300, PRE_FIN: 348, IMP_DTO: 20, POR_IVA: 16, BAS_IVA: 300, IMP_IVA: 48, POR_IEPS: 0,
      BAS_IEPS: 0, IMP_IEPS: 0 },
    { NUM_LIN: 2, COD_ART: 1002, DES_ART: 'Croissant', UNI_VEN: 1, PRE_UNI: 100, PRE_UNI_SIN_IVA: 86.21,
      PRE_UNI_SIN_IEPS: 86.21, PRE_FIN: 100, IMP_DTO: 0, POR_IVA: 16, BAS_IVA: 86.21, IMP_IVA: 13.79, POR_IEPS: 0,
      BAS_IEPS: 0, IMP_IEPS: 0 },
  ],
  FormasDePago: [{ NUM_ORD: 1, COD_FPG: 102, COD_MON: 1, IMP_FPG: 428.5, IMP_DIV: 428.5, CAM_MON: 1 }],
});
const arqueo = (): ArqueoCaja => ({
  COD_TPV: 'TC01', NUM_SES: 20261109, Fecha: '2026-11-09', Hora: '10:15:00', Monto: 428.5, Descuadres: 0,
});

describe('validarTicket', () => {
  it('un ticket correcto no tiene motivos', () => {
    expect(validarTicket(ticket(), PROHIBIDOS)).toEqual([]);
  });
  it('rechaza un DES_ART de 151 caracteres', () => {
    const t = ticket();
    t.Detalles[0].DES_ART = 'x'.repeat(151);
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/DES_ART/);
  });
  it('rechaza un ticket sin detalles o sin formas de pago', () => {
    expect(validarTicket({ ...ticket(), Detalles: [] }, PROHIBIDOS)).not.toEqual([]);
    expect(validarTicket({ ...ticket(), FormasDePago: [] }, PROHIBIDOS)).not.toEqual([]);
  });
  it('rechaza si las formas de pago no suman IMP_VEN', () => {
    const t = ticket();
    t.FormasDePago[0].IMP_FPG = 400;
    t.FormasDePago[0].IMP_DIV = 400;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/formas de pago/i);
  });
  it('rechaza si IMP_FPG no es IMP_DIV × CAM_MON', () => {
    const t = ticket();
    t.FormasDePago[0].CAM_MON = 2;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/IMP_FPG/);
  });
  it('rechaza si Σ PRE_FIN − IMP_DTG no es IMP_VEN', () => {
    const t = ticket();
    t.Cabecera.IMP_DTG = 10;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/IMP_DTG/);
  });
  it('rechaza si IMP_IVA no es PRE_FIN − BAS_IVA', () => {
    const t = ticket();
    t.Detalles[1].IMP_IVA = 16;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/IMP_IVA/);
  });
  it('acepta diferencias de un centavo por redondeo', () => {
    const t = ticket();
    t.Detalles[1].IMP_IVA = 13.8;
    expect(validarTicket(t, PROHIBIDOS)).toEqual([]);
  });
  it('rechaza un texto con el nombre de la tienda sin importar acentos ni mayúsculas', () => {
    const t = ticket();
    t.Detalles[0].DES_ART = 'Latte RUBEN DARIO';
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/anonimato/i);
  });
  it('rechaza un IMP_DTO negativo', () => {
    const t = ticket();
    t.Detalles[0].IMP_DTO = -1;
    expect(validarTicket(t, PROHIBIDOS)).not.toEqual([]);
  });
});

describe('validarArqueo', () => {
  it('un arqueo que suma sus tickets no tiene motivos', () => {
    expect(validarArqueo(arqueo(), [ticket()], PROHIBIDOS)).toEqual([]);
  });
  it('rechaza un COD_TPV de 5 caracteres', () => {
    expect(validarArqueo({ ...arqueo(), COD_TPV: 'TC001' }, [ticket()], PROHIBIDOS).join(' ')).toMatch(/COD_TPV/);
  });
  it('rechaza un Monto que no es la suma de IMP_VEN', () => {
    expect(validarArqueo({ ...arqueo(), Monto: 500 }, [ticket()], PROHIBIDOS).join(' ')).toMatch(/Monto/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/validar.test.ts`
Expected: FAIL; no se encuentra `../../lib/areas/validar`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/tipos.ts
import { z } from 'zod';

/**
 * Cuerpos de la API de Areas México (Doc Técnico v1.1, 2026-09-08, y hoja «DATOS API 1.1»). Ver
 * docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md.
 */
export const COD_TPV = 'TC01';

const monto = z.number().finite();
const entero = z.number().int();

export const CabeceraEsquema = z.object({
  COD_TPV: z.string().min(1).max(20),
  NUM_SES: entero.positive(),
  NUM_TIK: entero.positive(),
  TIP_OPE: z.enum(['V', 'D']),
  MOM_OPE: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  IMP_VEN: monto.min(0),
  ID_MVO_DTO: entero,
  IMP_DTG: monto.min(0),
});
export const DetalleEsquema = z.object({
  NUM_LIN: entero.positive(),
  COD_ART: entero.positive(),
  DES_ART: z.string().min(1).max(150),
  UNI_VEN: monto.positive(),
  PRE_UNI: monto.min(0),
  PRE_UNI_SIN_IVA: monto.min(0),
  PRE_UNI_SIN_IEPS: monto.min(0),
  PRE_FIN: monto.min(0),
  IMP_DTO: monto.min(0),
  POR_IVA: monto.min(0),
  BAS_IVA: monto.min(0),
  IMP_IVA: monto.min(0),
  POR_IEPS: monto.min(0),
  BAS_IEPS: monto.min(0),
  IMP_IEPS: monto.min(0),
});
export const FormaPagoEsquema = z.object({
  NUM_ORD: entero.positive(),
  COD_FPG: entero.positive(),
  COD_MON: entero.positive(),
  IMP_FPG: monto,
  IMP_DIV: monto,
  CAM_MON: monto.positive(),
});
export const TicketCompletoEsquema = z.object({
  Cabecera: CabeceraEsquema,
  Detalles: z.array(DetalleEsquema).min(1),
  FormasDePago: z.array(FormaPagoEsquema).min(1),
});
export const ArqueoCajaEsquema = z.object({
  COD_TPV: z.string().min(1).max(4),
  NUM_SES: entero.positive(),
  Fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  Hora: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  Monto: monto,
  Descuadres: monto,
});

export type Cabecera = z.infer<typeof CabeceraEsquema>;
export type Detalle = z.infer<typeof DetalleEsquema>;
export type FormaPago = z.infer<typeof FormaPagoEsquema>;
export type TicketCompleto = z.infer<typeof TicketCompletoEsquema>;
export type ArqueoCaja = z.infer<typeof ArqueoCajaEsquema>;
```

```ts
// lib/areas/validar.ts
import { ArqueoCajaEsquema, TicketCompletoEsquema, type ArqueoCaja, type TicketCompleto } from './tipos';

const TOLERANCIA = 0.011;
const casi = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA;
const suma = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;
const plano = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

function textos(x: unknown): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(textos);
  if (x && typeof x === 'object') return Object.values(x).flatMap(textos);
  return [];
}

function anonimato(x: unknown, prohibidos: string[]): string[] {
  const p = prohibidos.map(plano).filter(Boolean);
  const malos = textos(x).filter((t) => p.some((n) => plano(t).includes(n)));
  return malos.length ? [`Anonimato: el texto «${malos[0]}» contiene el nombre de la tienda`] : [];
}

function forma(r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return r.success ? [] : r.error!.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`);
}

export function validarTicket(t: TicketCompleto, prohibidos: string[]): string[] {
  const motivos = forma(TicketCompletoEsquema.safeParse(t));
  if (motivos.length) return [...motivos, ...anonimato(t, prohibidos)];
  const venta = t.Cabecera.IMP_VEN;
  for (const f of t.FormasDePago)
    if (!casi(f.IMP_FPG, f.IMP_DIV * f.CAM_MON)) motivos.push(`IMP_FPG de la forma ${f.NUM_ORD} no es IMP_DIV × CAM_MON`);
  if (!casi(suma(t.FormasDePago.map((f) => f.IMP_FPG)), venta))
    motivos.push('La suma de las formas de pago no es IMP_VEN');
  if (!casi(suma(t.Detalles.map((d) => d.PRE_FIN)) - t.Cabecera.IMP_DTG, venta))
    motivos.push('Σ PRE_FIN − IMP_DTG no es IMP_VEN');
  for (const d of t.Detalles)
    if (!casi(d.IMP_IVA, d.PRE_FIN - d.BAS_IVA)) motivos.push(`IMP_IVA de la línea ${d.NUM_LIN} no es PRE_FIN − BAS_IVA`);
  return [...motivos, ...anonimato(t, prohibidos)];
}

export function validarArqueo(a: ArqueoCaja, tickets: TicketCompleto[], prohibidos: string[]): string[] {
  const motivos = forma(ArqueoCajaEsquema.safeParse(a));
  if (!casi(a.Monto, suma(tickets.map((t) => t.Cabecera.IMP_VEN))))
    motivos.push('Monto no es la suma de IMP_VEN de los tickets del día');
  return [...motivos, ...anonimato(a, prohibidos)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas/validar.test.ts`
Expected: PASS (13 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/areas/tipos.ts lib/areas/validar.ts tests/areas/validar.test.ts
git commit -m "Areas: esquemas de la API y validación de tickets y arqueos"
```

---

### Task 2: Catálogo numérico de artículos

**Files:**
- Create: `lib/areas/catalogo.ts`
- Test: `tests/areas/catalogo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface Articulo { cod_art: number; codigo: string; descripcion: string; precio: number | null }`. `precio` va en pesos.
  - `PRIMER_CODIGO = 1001`.
  - `codigoNormal(s: string): string`.
  - `class Catalogo` con:
    - `constructor(articulos?: Articulo[])`;
    - `codArt(codigo: string, descripcion: string): number`;
    - `precioDe(codigo: string): number | null`;
    - `fijarPrecio(codArt: number, precio: number): void`;
    - `nuevos(): Articulo[]`;
    - `lista(): Articulo[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/catalogo.test.ts
import { describe, expect, it } from 'vitest';
import { Catalogo, codigoNormal } from '../../lib/areas/catalogo';

describe('codigoNormal', () => {
  it('como bi_codigo: mayúsculas, sin orillas y espacios internos (también U+00A0) colapsados', () => {
    expect(codigoNormal('  crea tu the   coffee ')).toBe('CREA TU THE COFFEE');
  });
});

describe('Catalogo', () => {
  it('asigna desde 1001 en el orden en que aparecen', () => {
    const c = new Catalogo();
    expect(c.codArt('LAT', 'Latte')).toBe(1001);
    expect(c.codArt('CRO', 'Croissant')).toBe(1002);
    expect(c.nuevos().map((a) => a.cod_art)).toEqual([1001, 1002]);
  });
  it('un código existente conserva su número aunque cambie de escritura', () => {
    const c = new Catalogo([{ cod_art: 1007, codigo: 'CREA TU THE COFFEE', descripcion: 'Crea tu', precio: 90 }]);
    expect(c.codArt('crea tu  the coffee', 'Crea Tu The Coffee')).toBe(1007);
    expect(c.nuevos()).toEqual([]);
  });
  it('los nuevos siguen al mayor existente y nunca reutilizan números', () => {
    const c = new Catalogo([
      { cod_art: 1001, codigo: 'A', descripcion: 'A', precio: null },
      { cod_art: 1005, codigo: 'B', descripcion: 'B', precio: null },
    ]);
    expect(c.codArt('C', 'C')).toBe(1006);
  });
  it('la descripción se actualiza al nombre más reciente', () => {
    const c = new Catalogo();
    c.codArt('LAT', 'Latte');
    c.codArt('LAT', 'Latte Grande');
    expect(c.lista()[0].descripcion).toBe('Latte Grande');
  });
  it('precioDe y fijarPrecio', () => {
    const c = new Catalogo();
    expect(c.precioDe('LAT')).toBeNull();
    const n = c.codArt('LAT', 'Latte');
    c.fijarPrecio(n, 65);
    expect(c.precioDe('lat')).toBe(65);
  });
  it('lista ordenada por cod_art', () => {
    const c = new Catalogo([{ cod_art: 1003, codigo: 'Z', descripcion: 'Z', precio: null }]);
    c.codArt('A', 'A');
    expect(c.lista().map((a) => a.cod_art)).toEqual([1003, 1004]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/catalogo.test.ts`
Expected: FAIL; no se encuentra el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/catalogo.ts
/**
 * Catálogo numérico de artículos para Areas (COD_ART es int y nuestros códigos del POS son texto). Vive en
 * datos/areas/articulos.json. Un número nunca se reasigna ni se borra.
 */
export interface Articulo {
  cod_art: number;
  /** Código del POS normalizado como bi_codigo (defaultCode o, si falta, el nombre). */
  codigo: string;
  descripcion: string;
  /** PRE_UNI más frecuente, en pesos; null si aún no se conoce. */
  precio: number | null;
}

export const PRIMER_CODIGO = 1001;

/** Igual que bi_codigo: upper(btrim(regexp_replace(replace(p, chr(160), ' '), '\s+', ' ', 'g'))). */
export const codigoNormal = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

export class Catalogo {
  private porCodigo = new Map<string, Articulo>();
  private agregados: Articulo[] = [];
  private siguiente: number;

  constructor(articulos: Articulo[] = []) {
    for (const a of articulos) {
      const codigo = codigoNormal(a.codigo);
      this.porCodigo.set(codigo, { ...a, codigo });
    }
    this.siguiente = Math.max(PRIMER_CODIGO - 1, ...articulos.map((a) => a.cod_art)) + 1;
  }

  codArt(codigo: string, descripcion: string): number {
    const c = codigoNormal(codigo);
    const existente = this.porCodigo.get(c);
    if (existente) {
      existente.descripcion = descripcion.trim();
      return existente.cod_art;
    }
    const nuevo: Articulo = { cod_art: this.siguiente++, codigo: c, descripcion: descripcion.trim(), precio: null };
    this.porCodigo.set(c, nuevo);
    this.agregados.push(nuevo);
    return nuevo.cod_art;
  }

  precioDe(codigo: string): number | null {
    return this.porCodigo.get(codigoNormal(codigo))?.precio ?? null;
  }

  fijarPrecio(codArt: number, precio: number) {
    for (const a of this.porCodigo.values()) if (a.cod_art === codArt) a.precio = precio;
  }

  nuevos(): Articulo[] {
    return [...this.agregados];
  }

  lista(): Articulo[] {
    return [...this.porCodigo.values()].sort((a, b) => a.cod_art - b.cod_art);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas/catalogo.test.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/areas/catalogo.ts tests/areas/catalogo.test.ts
git commit -m "Areas: catálogo numérico de artículos desde 1001"
```

---

### Task 3: Formas de pago

**Files:**
- Create: `lib/areas/pagos.ts`
- Test: `tests/areas/pagos.test.ts`

**Interfaces:**
- Consumes: `PedidoNormal` de `lib/sucursales/normalizar.ts` (campos `metodo` y `tipo`).
- Produces:
  - `FORMAS_PAGO: { codigo: number; descripcion: string }[]`.
  - `codigoPago(p: { metodo: string; tipo: string }): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/pagos.test.ts
import { describe, expect, it } from 'vitest';
import { codigoPago, FORMAS_PAGO } from '../../lib/areas/pagos';

describe('codigoPago', () => {
  it.each([
    ['DINHEIRO', 'CASH', 101],
    ['DINHEIRO', 'CONTINGENCY', 101],
    ['CARTAO', 'EMV', 102],
    ['CARTAO', 'CONTACTLESS_EMV', 102],
    ['CARTAO', 'CONTINGENCY', 102],
    ['CARTAO', 'WALLET', 103],
    ['VIRTUAL_WALLET', 'WALLET', 103],
    ['WALLET_BALANCE', 'WALLET', 104],
    ['RAPPI', 'CREDIT', 105],
    ['RAPPI', 'RAPPI_PORTAL', 105],
    ['RAPPI', 'RAPPI_TURBO', 105],
  ])('%s / %s → %i', (metodo, tipo, codigo) => {
    expect(codigoPago({ metodo, tipo })).toBe(codigo);
  });
  it('una combinación desconocida no tiene código', () => {
    expect(codigoPago({ metodo: 'IFOOD', tipo: 'CONTINGENCY' })).toBeNull();
    expect(codigoPago({ metodo: 'CARTAO', tipo: 'OTRO' })).toBeNull();
    expect(codigoPago({ metodo: '', tipo: '' })).toBeNull();
  });
  it('cada código que devuelve existe en FORMAS_PAGO', () => {
    expect(FORMAS_PAGO.map((f) => f.codigo)).toEqual([101, 102, 103, 104, 105]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/pagos.test.ts`
Expected: FAIL; no se encuentra el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/pagos.ts
/**
 * Nuestros códigos externos de forma de pago (CODFPTPVEXT). Areas los traduce a los suyos; 101 Efectivo ya está en su
 * tabla. Evidencia de las combinaciones: docs/bi/zoho/pagos.json (pedidos de Rubén Darío y Polanco del 2026-11-03).
 */
export const FORMAS_PAGO = [
  { codigo: 101, descripcion: 'Efectivo' },
  { codigo: 102, descripcion: 'Tarjeta' },
  { codigo: 103, descripcion: 'App - Tarjeta' },
  { codigo: 104, descripcion: 'App - Saldo' },
  { codigo: 105, descripcion: 'Rappi' },
];

const TARJETA_FISICA = new Set(['EMV', 'CONTACTLESS_EMV', 'CONTINGENCY']);

/** null = combinación sin mapeo: el ticket se descarta y sale en el reporte para agregarla. */
export function codigoPago(p: { metodo: string; tipo: string }): number | null {
  switch (p.metodo) {
    case 'DINHEIRO':
      return 101;
    case 'CARTAO':
      return p.tipo === 'WALLET' ? 103 : TARJETA_FISICA.has(p.tipo) ? 102 : null;
    case 'VIRTUAL_WALLET':
      return p.tipo === 'WALLET' ? 103 : null;
    case 'WALLET_BALANCE':
      return 104;
    case 'RAPPI':
      return 105;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas/pagos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/areas/pagos.ts tests/areas/pagos.test.ts
git commit -m "Areas: códigos externos de forma de pago (101–105)"
```

---

### Task 4: Ticket

**Files:**
- Create: `lib/areas/ticket.ts`
- Test: `tests/areas/ticket.test.ts`

**Interfaces:**
- Consumes:
  - `PedidoNormal`, `LineaNormal` e `importeLinea` de `lib/sucursales/normalizar.ts`;
  - `Catalogo` (Task 2);
  - `codigoPago` (Task 3);
  - `COD_TPV` y `TicketCompleto` (Task 1);
  - `validarTicket` (Task 1), solo en las pruebas.
- Produces:
  - `type ResultadoTicket = { ok: true; ticket: TicketCompleto } | { ok: false; motivo: string }`.
  - `aTicket(p: PedidoNormal, catalogo: Catalogo): ResultadoTicket`.

**Cálculo (todo en centavos y luego `pesos(c) = Math.round(c) / 100`):**

- **Por línea:**
  - `importe = importeLinea(l)`.
  - Si `l.descuentoPct >= 100`: `preUni = round((catalogo.precioDe(l.codigo) ?? 0) × 100)`. Si el catálogo no tiene precio, la línea va en 0.
  - Si no: `preUni = round(importe / (1 − l.descuentoPct/100))`.
  - `dto = preUni − importe`, `bas = round(preUni / 1.16)` e `iva = preUni − bas`.
- **Por pedido:**
  - `dtg = Σ preUni − ventaCent` y `dif = dtg − Σ dto`, que es igual a `Σ importe − ventaCent`.
  - Si `dif < −100` se descarta con «Las líneas suman $X menos que lo cobrado».
  - Si `dtg < 0` se descarta con el mismo texto.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/ticket.test.ts
import { describe, expect, it } from 'vitest';
import { Catalogo } from '../../lib/areas/catalogo';
import { aTicket } from '../../lib/areas/ticket';
import { validarTicket } from '../../lib/areas/validar';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';

const linea = (codigo: string, importeCent: number, extra: Partial<LineaNormal> = {}): LineaNormal => ({
  codigo, nombre: `Producto ${codigo}`, importeCent, descuentoPct: 0, customs: [], ...extra,
});
const pedido = (extra: Partial<PedidoNormal> = {}): PedidoNormal => ({
  id: 32235824, fecha: '2026-11-09', segundo: 36900, hora: '10:15:00', origen: 'mostrador', ventaCent: 0,
  netoCent: null, descuentoCent: 0, metodo: 'CARTAO', tipo: 'EMV', lineas: [], numeroPedidoRappi: null,
  cuadra: true, ...extra,
});
const ok = (r: ReturnType<typeof aTicket>) => {
  if (!r.ok) throw new Error(r.motivo);
  return r.ticket;
};

describe('aTicket', () => {
  it('como el ejemplo del documento: precio antes del descuento, IVA sobre PRE_FIN y IMP_DTG = Σ IMP_DTO', () => {
    // Línea 1: lista $348 con 20/348 de descuento → cobrado $328. Línea 2: $100 sin descuento.
    const p = pedido({
      lineas: [linea('LAT', 32800, { descuentoPct: (20 / 348) * 100 }), linea('CRO', 10000)],
      ventaCent: 42800,
    });
    const t = ok(aTicket(p, new Catalogo()));
    expect(t.Cabecera).toEqual({
      COD_TPV: 'TC01', NUM_SES: 20261109, NUM_TIK: 32235824, TIP_OPE: 'V', MOM_OPE: '2026-11-09 10:15:00',
      IMP_VEN: 428, ID_MVO_DTO: 0, IMP_DTG: 20,
    });
    expect(t.Detalles[0]).toEqual({
      NUM_LIN: 1, COD_ART: 1001, DES_ART: 'Producto LAT', UNI_VEN: 1, PRE_UNI: 348, PRE_UNI_SIN_IVA: 300,
      PRE_UNI_SIN_IEPS: 300, PRE_FIN: 348, IMP_DTO: 20, POR_IVA: 16, BAS_IVA: 300, IMP_IVA: 48, POR_IEPS: 0,
      BAS_IEPS: 0, IMP_IEPS: 0,
    });
    expect(t.Detalles[1]).toMatchObject({ NUM_LIN: 2, COD_ART: 1002, PRE_FIN: 100, BAS_IVA: 86.21, IMP_IVA: 13.79 });
    expect(t.FormasDePago).toEqual([{ NUM_ORD: 1, COD_FPG: 102, COD_MON: 1, IMP_FPG: 428, IMP_DIV: 428, CAM_MON: 1 }]);
    expect(validarTicket(t, ['Rubén Darío'])).toEqual([]);
  });

  it('el importe de la línea incluye sus modificadores', () => {
    const p = pedido({
      lineas: [linea('LAT', 6000, { customs: [{ codigo: 'AVENA', nombre: 'Avena', importeCent: 1000, descuentoPct: 0 }] })],
      ventaCent: 7000,
    });
    expect(ok(aTicket(p, new Catalogo())).Detalles[0].PRE_FIN).toBe(70);
  });

  it('línea con 100% de descuento usa el precio del catálogo y, sin precio, va en 0', () => {
    const cat = new Catalogo([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 65 }]);
    const p = pedido({ lineas: [linea('LAT', 0, { descuentoPct: 100 }), linea('CRO', 4500)], ventaCent: 4500 });
    const t = ok(aTicket(p, cat));
    expect(t.Detalles[0]).toMatchObject({ PRE_FIN: 65, IMP_DTO: 65 });
    expect(t.Cabecera.IMP_DTG).toBe(65);
    const sinPrecio = ok(aTicket(pedido({ lineas: [linea('X', 0, { descuentoPct: 100 })], ventaCent: 0 }), new Catalogo()));
    expect(sinPrecio.Detalles[0]).toMatchObject({ PRE_FIN: 0, IMP_DTO: 0 });
  });

  it('un descuento de pedido (líneas suman más que lo cobrado) se suma a IMP_DTG', () => {
    const p = pedido({ lineas: [linea('LAT', 6000), linea('CRO', 4000)], ventaCent: 9000, cuadra: false });
    const t = ok(aTicket(p, new Catalogo()));
    expect(t.Cabecera.IMP_DTG).toBe(10);
    expect(validarTicket(t, [])).toEqual([]);
  });

  it('líneas que suman hasta $1 menos que lo cobrado pasan; más de $1, se descarta', () => {
    const casi = pedido({ lineas: [linea('LAT', 6000, { descuentoPct: 10 })], ventaCent: 6050, cuadra: false });
    expect(aTicket(casi, new Catalogo()).ok).toBe(true);
    const mal = pedido({ lineas: [linea('LAT', 6000)], ventaCent: 6200, cuadra: false });
    const r = aTicket(mal, new Catalogo());
    expect(r).toEqual({ ok: false, motivo: 'Las líneas suman $2.00 menos que lo cobrado' });
  });

  it('forma de pago sin mapeo descarta el ticket con su método y tipo', () => {
    const p = pedido({ metodo: 'IFOOD', tipo: 'CONTINGENCY', lineas: [linea('LAT', 6000)], ventaCent: 6000 });
    expect(aTicket(p, new Catalogo())).toEqual({ ok: false, motivo: 'Forma de pago sin mapeo: IFOOD / CONTINGENCY' });
  });

  it('pedido sin líneas se descarta', () => {
    expect(aTicket(pedido({ ventaCent: 5000 }), new Catalogo())).toEqual({ ok: false, motivo: 'Sin líneas' });
  });

  it('centavos con descuento porcentual impar pasan la validación', () => {
    // $49.90 con 15% → cobrado 4241.5 → 4242; tres líneas iguales.
    const l = linea('GAL', 4242, { descuentoPct: 15 });
    const p = pedido({ lineas: [l, { ...l }, { ...l }], ventaCent: 12726 });
    expect(validarTicket(ok(aTicket(p, new Catalogo())), [])).toEqual([]);
  });

  it('un número de Rappi de 10 dígitos se conserva en NUM_TIK', () => {
    const p = pedido({ id: 2485123456, metodo: 'RAPPI', tipo: 'RAPPI_PORTAL', lineas: [linea('LAT', 6000)], ventaCent: 6000 });
    const t = ok(aTicket(p, new Catalogo()));
    expect(t.Cabecera.NUM_TIK).toBe(2485123456);
    expect(t.FormasDePago[0].COD_FPG).toBe(105);
  });

  it('DES_ART se recorta a 150 caracteres', () => {
    const p = pedido({ lineas: [linea('L', 6000, { nombre: 'x'.repeat(200) })], ventaCent: 6000 });
    expect(ok(aTicket(p, new Catalogo())).Detalles[0].DES_ART).toHaveLength(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/ticket.test.ts`
Expected: FAIL; no se encuentra `../../lib/areas/ticket`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/ticket.ts
import { importeLinea, type PedidoNormal } from '../sucursales/normalizar';
import type { Catalogo } from './catalogo';
import { codigoPago } from './pagos';
import { COD_TPV, type TicketCompleto } from './tipos';

export type ResultadoTicket = { ok: true; ticket: TicketCompleto } | { ok: false; motivo: string };

const IVA = 0.16;
const pesos = (c: number) => Math.round(c) / 100;
export const sesionDe = (fecha: string) => Number(fecha.replaceAll('-', ''));

/**
 * Un pedido del POS (o de Rappi del portal) como TicketCompleto de Areas. Montos en centavos hasta el final. Precio
 * antes del descuento de línea e IVA sobre ese precio, como el ejemplo del Doc Técnico (BAS_IVA 600 = 2 × 300 con
 * IMP_DTO aparte). Spec: docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md §3.
 */
export function aTicket(p: PedidoNormal, catalogo: Catalogo): ResultadoTicket {
  const fpg = codigoPago(p);
  if (fpg === null) return { ok: false, motivo: `Forma de pago sin mapeo: ${p.metodo} / ${p.tipo}` };
  if (!p.lineas.length) return { ok: false, motivo: 'Sin líneas' };

  const lineas = p.lineas.map((l) => {
    const importe = importeLinea(l);
    const preUni =
      l.descuentoPct >= 100
        ? Math.round((catalogo.precioDe(l.codigo) ?? 0) * 100)
        : Math.round(importe / (1 - l.descuentoPct / 100));
    const bas = Math.round(preUni / (1 + IVA));
    return { l, importe, preUni, dto: preUni - importe, bas };
  });
  const dtg = lineas.reduce((s, x) => s + x.preUni, 0) - p.ventaCent;
  const dif = dtg - lineas.reduce((s, x) => s + x.dto, 0);
  if (dif < -100 || dtg < 0)
    return { ok: false, motivo: `Las líneas suman $${(-Math.min(dif, dtg) / 100).toFixed(2)} menos que lo cobrado` };

  const venta = pesos(p.ventaCent);
  return {
    ok: true,
    ticket: {
      Cabecera: {
        COD_TPV,
        NUM_SES: sesionDe(p.fecha),
        NUM_TIK: p.id,
        TIP_OPE: 'V',
        MOM_OPE: `${p.fecha} ${p.hora}`,
        IMP_VEN: venta,
        ID_MVO_DTO: 0,
        IMP_DTG: pesos(dtg),
      },
      Detalles: lineas.map((x, i) => ({
        NUM_LIN: i + 1,
        COD_ART: catalogo.codArt(x.l.codigo, x.l.nombre),
        DES_ART: x.l.nombre.trim().slice(0, 150),
        UNI_VEN: 1,
        PRE_UNI: pesos(x.preUni),
        PRE_UNI_SIN_IVA: pesos(x.bas),
        PRE_UNI_SIN_IEPS: pesos(x.bas),
        PRE_FIN: pesos(x.preUni),
        IMP_DTO: pesos(x.dto),
        POR_IVA: 16,
        BAS_IVA: pesos(x.bas),
        IMP_IVA: pesos(x.preUni - x.bas),
        POR_IEPS: 0,
        BAS_IEPS: 0,
        IMP_IEPS: 0,
      })),
      FormasDePago: [{ NUM_ORD: 1, COD_FPG: fpg, COD_MON: 1, IMP_FPG: venta, IMP_DIV: venta, CAM_MON: 1 }],
    },
  };
}
```

Nota: si `p.hora` llegara sin segundos (`HH:mm`), `MOM_OPE` no pasa el esquema y el ticket se descarta en la validación (Task 6). Hoy `normalizar` y `pedidoRappiAPos` siempre dan `HH:mm:ss`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas/ticket.test.ts`
Expected: PASS (10 pruebas). Si «centavos con descuento porcentual impar» falla, revisar que `validarTicket` use la tolerancia de 0.011 y que `suma` sume en centavos.

- [ ] **Step 5: Commit**

```bash
git add lib/areas/ticket.ts tests/areas/ticket.test.ts
git commit -m "Areas: pedido del POS a TicketCompleto (IVA 16%, descuentos y descartes)"
```

---

### Task 5: Arqueo diario

**Files:**
- Create: `lib/areas/arqueo.ts`
- Test: `tests/areas/arqueo.test.ts`

**Interfaces:**
- Consumes:
  - `TicketCompleto`, `ArqueoCaja` y `COD_TPV` (Task 1);
  - `sesionDe` (Task 4).
- Produces: `aArqueo(fecha: string, tickets: TicketCompleto[]): ArqueoCaja`. Los tickets son los válidos de ese día, en cualquier orden.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/arqueo.test.ts
import { describe, expect, it } from 'vitest';
import { aArqueo } from '../../lib/areas/arqueo';
import type { TicketCompleto } from '../../lib/areas/tipos';

const t = (mom: string, venta: number) =>
  ({ Cabecera: { MOM_OPE: mom, IMP_VEN: venta } }) as unknown as TicketCompleto;

describe('aArqueo', () => {
  it('suma IMP_VEN en centavos y toma la hora del último ticket', () => {
    expect(aArqueo('2026-11-09', [t('2026-11-09 18:40:05', 65.1), t('2026-11-09 08:01:00', 0.2), t('2026-11-09 12:00:00', 100)])).toEqual({
      COD_TPV: 'TC01', NUM_SES: 20261109, Fecha: '2026-11-09', Hora: '18:40:05', Monto: 165.3, Descuadres: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/arqueo.test.ts`
Expected: FAIL; no se encuentra el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/arqueo.ts
import { sesionDe } from './ticket';
import { COD_TPV, type ArqueoCaja, type TicketCompleto } from './tipos';

/** Nuestro POS no tiene corte Z: un arqueo por día, sin conteo físico (Descuadres 0). */
export function aArqueo(fecha: string, tickets: TicketCompleto[]): ArqueoCaja {
  const horas = tickets.map((t) => t.Cabecera.MOM_OPE.slice(11)).sort();
  const cent = tickets.reduce((s, t) => s + Math.round(t.Cabecera.IMP_VEN * 100), 0);
  return {
    COD_TPV,
    NUM_SES: sesionDe(fecha),
    Fecha: fecha,
    Hora: horas.at(-1) ?? '00:00:00',
    Monto: cent / 100,
    Descuadres: 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas/arqueo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/areas/arqueo.ts tests/areas/arqueo.test.ts
git commit -m "Areas: arqueo diario con la suma de los tickets válidos"
```

---

### Task 6: Armar la exportación

**Files:**
- Create: `lib/areas/armar.ts`
- Test: `tests/areas/armar.test.ts`

**Interfaces:**
- Consumes:
  - `aTicket` (Task 4), `aArqueo` (Task 5), `validarTicket` y `validarArqueo` (Task 1), `Catalogo` (Task 2);
  - `PedidoNormal`.
- Produces:

```ts
export interface Descartado { id: number; fecha: string; hora: string; motivo: string }
export interface Dia { fecha: string; leidos: number; validos: number; descartados: number; monto: number }
export interface Exportacion {
  tickets: TicketCompleto[];   // en orden de fecha y hora
  arqueos: ArqueoCaja[];       // uno por día con tickets válidos, en orden
  descartados: Descartado[];
  dias: Dia[];                 // todos los días con al menos un pedido leído, en orden
  vendidos: number[];          // COD_ART de los tickets válidos, sin repetir, ordenados
}
export function armar(pedidos: PedidoNormal[], catalogo: Catalogo, prohibidos: string[]): Exportacion
```

`armar` hace cuatro cosas:
- **Ordena** los pedidos por fecha y segundo, de menor a mayor, para que la descripción del catálogo sea la más reciente.
- **Arma y valida** cada pedido. Un ticket que no pasa la validación queda descartado con sus motivos unidos por «; ».
- **Arma y valida el arqueo** de cada día. Si el arqueo no pasa, lanza `Error`, porque es un error de programación.
- **Fija el precio** de cada artículo vendido con el `PRE_UNI` más frecuente. En empate gana el mayor.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/armar.test.ts
import { describe, expect, it } from 'vitest';
import { armar } from '../../lib/areas/armar';
import { Catalogo } from '../../lib/areas/catalogo';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';

const linea = (codigo: string, importeCent: number, extra: Partial<LineaNormal> = {}): LineaNormal => ({
  codigo, nombre: `Producto ${codigo}`, importeCent, descuentoPct: 0, customs: [], ...extra,
});
let id = 1;
const pedido = (fecha: string, segundo: number, extra: Partial<PedidoNormal> = {}): PedidoNormal => ({
  id: id++, fecha, segundo, hora: new Date(segundo * 1000).toISOString().slice(11, 19), origen: 'mostrador',
  ventaCent: 6000, netoCent: null, descuentoCent: 0, metodo: 'DINHEIRO', tipo: 'CASH', lineas: [linea('LAT', 6000)],
  numeroPedidoRappi: null, cuadra: true, ...extra,
});

describe('armar', () => {
  it('tickets en orden, un arqueo por día y resumen por día', () => {
    const e = armar(
      [pedido('2026-11-10', 30000), pedido('2026-11-09', 50000), pedido('2026-11-09', 40000)],
      new Catalogo(),
      ['Rubén Darío'],
    );
    expect(e.tickets.map((t) => t.Cabecera.MOM_OPE)).toEqual([
      '2026-11-09 11:06:40', '2026-11-09 13:53:20', '2026-11-10 08:20:00',
    ]);
    expect(e.arqueos.map((a) => [a.Fecha, a.Hora, a.Monto])).toEqual([
      ['2026-11-09', '13:53:20', 120], ['2026-11-10', '08:20:00', 60],
    ]);
    expect(e.dias).toEqual([
      { fecha: '2026-11-09', leidos: 2, validos: 2, descartados: 0, monto: 120 },
      { fecha: '2026-11-10', leidos: 1, validos: 1, descartados: 0, monto: 60 },
    ]);
    expect(e.vendidos).toEqual([1001]);
  });

  it('los descartados no cuentan en el arqueo y salen con su motivo', () => {
    const e = armar(
      [pedido('2026-11-09', 40000), pedido('2026-11-09', 41000, { metodo: 'IFOOD', tipo: 'X' })],
      new Catalogo(),
      [],
    );
    expect(e.arqueos[0].Monto).toBe(60);
    expect(e.descartados).toEqual([
      { id: expect.any(Number), fecha: '2026-11-09', hora: '11:23:20', motivo: 'Forma de pago sin mapeo: IFOOD / X' },
    ]);
    expect(e.dias[0]).toMatchObject({ leidos: 2, validos: 1, descartados: 1 });
  });

  it('un día solo con descartados no tiene arqueo pero sí aparece en el resumen', () => {
    const e = armar([pedido('2026-11-09', 40000, { lineas: [] })], new Catalogo(), []);
    expect(e.arqueos).toEqual([]);
    expect(e.dias).toEqual([{ fecha: '2026-11-09', leidos: 1, validos: 0, descartados: 1, monto: 0 }]);
  });

  it('un recargo (descuento negativo) descarta el ticket con motivo, sin tronar', () => {
    // −10% → PRE_UNI $54.55 < cobrado $60: las líneas suman menos que lo cobrado.
    const e = armar([pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { descuentoPct: -10 })] })], new Catalogo(), []);
    expect(e.tickets).toEqual([]);
    expect(e.descartados).toHaveLength(1);
    expect(e.descartados[0].motivo).toMatch(/menos que lo cobrado/);
  });

  it('un nombre de producto con el nombre de la tienda descarta el ticket por anonimato', () => {
    const e = armar(
      [pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { nombre: 'Latte Rubén Darío' })] })],
      new Catalogo(),
      ['Rubén Darío'],
    );
    expect(e.descartados[0].motivo).toMatch(/Anonimato/);
  });

  it('fija el precio del catálogo con el PRE_UNI más frecuente', () => {
    const cat = new Catalogo();
    armar(
      [
        pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000)] }),
        pedido('2026-11-09', 40100, { lineas: [linea('LAT', 6500)], ventaCent: 6500 }),
        pedido('2026-11-09', 40200, { lineas: [linea('LAT', 6500)], ventaCent: 6500 }),
      ],
      cat,
      [],
    );
    expect(cat.precioDe('LAT')).toBe(65);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/armar.test.ts`
Expected: FAIL; no se encuentra el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/armar.ts
import type { PedidoNormal } from '../sucursales/normalizar';
import { aArqueo } from './arqueo';
import type { Catalogo } from './catalogo';
import { aTicket } from './ticket';
import type { ArqueoCaja, TicketCompleto } from './tipos';
import { validarArqueo, validarTicket } from './validar';

export interface Descartado { id: number; fecha: string; hora: string; motivo: string }
export interface Dia { fecha: string; leidos: number; validos: number; descartados: number; monto: number }
export interface Exportacion {
  tickets: TicketCompleto[];
  arqueos: ArqueoCaja[];
  descartados: Descartado[];
  dias: Dia[];
  vendidos: number[];
}

export function armar(pedidos: PedidoNormal[], catalogo: Catalogo, prohibidos: string[]): Exportacion {
  const orden = [...pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.segundo - b.segundo);
  const tickets: TicketCompleto[] = [];
  const descartados: Descartado[] = [];
  const dias = new Map<string, Dia>();

  for (const p of orden) {
    const dia = dias.get(p.fecha) ?? { fecha: p.fecha, leidos: 0, validos: 0, descartados: 0, monto: 0 };
    dias.set(p.fecha, dia);
    dia.leidos++;
    const r = aTicket(p, catalogo);
    const motivos = r.ok ? validarTicket(r.ticket, prohibidos) : [r.motivo];
    if (!r.ok || motivos.length) {
      dia.descartados++;
      descartados.push({ id: p.id, fecha: p.fecha, hora: p.hora, motivo: motivos.join('; ') });
      continue;
    }
    dia.validos++;
    dia.monto = Math.round(dia.monto * 100 + r.ticket.Cabecera.IMP_VEN * 100) / 100;
    tickets.push(r.ticket);
  }

  const arqueos: ArqueoCaja[] = [];
  for (const fecha of [...dias.keys()]) {
    const delDia = tickets.filter((t) => t.Cabecera.MOM_OPE.startsWith(fecha));
    if (!delDia.length) continue;
    const a = aArqueo(fecha, delDia);
    const motivos = validarArqueo(a, delDia, prohibidos);
    if (motivos.length) throw new Error(`Arqueo inválido del ${fecha}: ${motivos.join('; ')}`);
    arqueos.push(a);
  }

  // Precio de lista del catálogo: el PRE_UNI más frecuente de cada artículo (empate: el mayor).
  const conteo = new Map<number, Map<number, number>>();
  for (const t of tickets)
    for (const d of t.Detalles) {
      const m = conteo.get(d.COD_ART) ?? new Map<number, number>();
      conteo.set(d.COD_ART, m.set(d.PRE_UNI, (m.get(d.PRE_UNI) ?? 0) + 1));
    }
  for (const [cod, m] of conteo) {
    const [precio] = [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    catalogo.fijarPrecio(cod, precio);
  }

  return {
    tickets,
    arqueos,
    descartados,
    dias: [...dias.values()],
    vendidos: [...conteo.keys()].sort((a, b) => a - b),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas`
Expected: PASS (todas las pruebas de `tests/areas`).

- [ ] **Step 5: Commit**

```bash
git add lib/areas/armar.ts tests/areas/armar.test.ts
git commit -m "Areas: armar tickets, arqueos, descartados y resumen por día"
```

---

### Task 7: Excel de alta y reporte

**Files:**
- Create: `lib/areas/archivos.ts`
- Test: `tests/areas/archivos.test.ts`

**Interfaces:**
- Consumes:
  - `Articulo` (Task 2), `FORMAS_PAGO` (Task 3), `Exportacion` (Task 6);
  - `COD_TPV` (Task 1).
- Produces:
  - `type Fila = (string | number | null)[]`.
  - `filasArticulos(articulos: Articulo[]): Fila[]`.
  - `filasPagos(hoy: string): Fila[]`.
  - `reporte(e: Exportacion, x: { desde: string; hasta: string; estado: 'completa' | 'parcial' | 'error'; avisos: string[]; nuevos: Articulo[] }): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/areas/archivos.test.ts
import { describe, expect, it } from 'vitest';
import { filasArticulos, filasPagos, reporte } from '../../lib/areas/archivos';
import type { Exportacion } from '../../lib/areas/armar';

describe('filasArticulos', () => {
  it('formato «Carga Art TPVs Externos»: encabezado, columnas y una fila por artículo', () => {
    expect(filasArticulos([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 65 }])).toEqual([
      ['TIPO DE SOLICITUD', null, 'A', 'ALTA DE CODIGOS', null, null, 'COMENTARIOS'],
      [null, null, null, null, null, null, 'ALTA DE CODIGOS. ASOCIAR A GAMA Y TARIFA DE PRECIO.'],
      ['CÓDIGO', 'DESCRIPCIÓN', 'CODIGO DE FAMILIA 3', 'FAMILIA 3', 'IVA', 'TIPO', 'PRECIO VENTA'],
      [1001, 'Latte', 0, null, '16%', null, 65],
    ]);
  });
});

describe('filasPagos', () => {
  it('formato «Formas de Pago y Monedas»: solo 101 trae su código de Areas', () => {
    const f = filasPagos('2026-11-09');
    expect(f[0]).toEqual(['CODFPTPVEXT', 'DESCFPTPVEXT', 'CODFPAREAS', 'DESCFAREAS', 'FechaRegistro']);
    expect(f[1]).toEqual([101, 'Efectivo', 1, 'EFECTIVO PESOS MX', '2026-11-09']);
    expect(f[2]).toEqual([102, 'Tarjeta', null, null, '2026-11-09']);
    expect(f).toHaveLength(6);
  });
});

describe('reporte', () => {
  const e: Exportacion = {
    tickets: [], arqueos: [], vendidos: [1001],
    dias: [{ fecha: '2026-11-09', leidos: 3, validos: 2, descartados: 1, monto: 120 }],
    descartados: [{ id: 7, fecha: '2026-11-09', hora: '10:00:00', motivo: 'Forma de pago sin mapeo: IFOOD / X' }],
  };
  it('lectura parcial va arriba como advertencia', () => {
    const r = reporte(e, { desde: '2026-11-09', hasta: '2026-11-09', estado: 'parcial', avisos: ['1 de 1 días con lectura incompleta.'], nuevos: [] });
    expect(r.split('\n').slice(0, 4).join('\n')).toMatch(/INCOMPLETA/);
    expect(r).toMatch(/1 de 1 días con lectura incompleta/);
  });
  it('tabla por día, descartados, pagos sin mapeo y artículos nuevos', () => {
    const r = reporte(e, { desde: '2026-11-09', hasta: '2026-11-09', estado: 'completa', avisos: [], nuevos: [{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 60 }] });
    expect(r).not.toMatch(/INCOMPLETA/);
    expect(r).toMatch(/\| 2026-11-09 \| 3 \| 2 \| 1 \| 120\.00 \|/);
    expect(r).toMatch(/\| 7 \| 2026-11-09 10:00:00 \| Forma de pago sin mapeo: IFOOD \/ X \|/);
    expect(r).toMatch(/IFOOD \/ X/);
    expect(r).toMatch(/\| 1001 \| LAT \| Latte \| 60\.00 \|/);
    expect(r).toMatch(/TC01/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/areas/archivos.test.ts`
Expected: FAIL; no se encuentra el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/areas/archivos.ts
import type { Exportacion } from './armar';
import type { Articulo } from './catalogo';
import { FORMAS_PAGO } from './pagos';
import { COD_TPV } from './tipos';

export type Fila = (string | number | null)[];

/** Formato de «Carga Art TPVs Externos.xlsx» de Areas. */
export function filasArticulos(articulos: Articulo[]): Fila[] {
  return [
    ['TIPO DE SOLICITUD', null, 'A', 'ALTA DE CODIGOS', null, null, 'COMENTARIOS'],
    [null, null, null, null, null, null, 'ALTA DE CODIGOS. ASOCIAR A GAMA Y TARIFA DE PRECIO.'],
    ['CÓDIGO', 'DESCRIPCIÓN', 'CODIGO DE FAMILIA 3', 'FAMILIA 3', 'IVA', 'TIPO', 'PRECIO VENTA'],
    ...articulos.map((a): Fila => [a.cod_art, a.descripcion, 0, null, '16%', null, a.precio]),
  ];
}

/** Formato de «Formas de Pago y Monedas.xlsx». Areas llena CODFPAREAS; solo 101 → 1 ya existe. */
export function filasPagos(hoy: string): Fila[] {
  return [
    ['CODFPTPVEXT', 'DESCFPTPVEXT', 'CODFPAREAS', 'DESCFAREAS', 'FechaRegistro'],
    ...FORMAS_PAGO.map((f): Fila =>
      f.codigo === 101 ? [101, f.descripcion, 1, 'EFECTIVO PESOS MX', hoy] : [f.codigo, f.descripcion, null, null, hoy],
    ),
  ];
}

const m = (x: number | null) => (x === null ? '—' : x.toFixed(2));

export function reporte(
  e: Exportacion,
  x: { desde: string; hasta: string; estado: 'completa' | 'parcial' | 'error'; avisos: string[]; nuevos: Articulo[] },
): string {
  const sinMapeo = [
    ...new Set(e.descartados.filter((d) => d.motivo.startsWith('Forma de pago sin mapeo: ')).map((d) => d.motivo.slice(25))),
  ];
  const l: string[] = [`# Exportación Areas · ${COD_TPV} · ${x.desde} a ${x.hasta}`, ''];
  if (x.estado !== 'completa')
    l.push(`> **LECTURA INCOMPLETA (${x.estado}).** No mandar estos días como completos.`, '');
  if (x.avisos.length) l.push('## Avisos de la lectura', '', ...x.avisos.map((a) => `- ${a}`), '');
  l.push(
    '## Por día', '',
    '| Fecha | Leídos | Válidos | Descartados | Monto |', '|---|---|---|---|---|',
    ...e.dias.map((d) => `| ${d.fecha} | ${d.leidos} | ${d.validos} | ${d.descartados} | ${m(d.monto)} |`),
    '',
    `Total: ${e.tickets.length} tickets y ${e.arqueos.length} arqueos.`, '',
    '## Descartados', '',
  );
  if (e.descartados.length)
    l.push('| Pedido | Momento | Motivo |', '|---|---|---|',
      ...e.descartados.map((d) => `| ${d.id} | ${d.fecha} ${d.hora} | ${d.motivo} |`));
  else l.push('Ninguno.');
  l.push('', '## Formas de pago sin mapeo', '', ...(sinMapeo.length ? sinMapeo.map((s) => `- ${s}`) : ['Ninguna.']), '');
  l.push('## Artículos nuevos en el catálogo', '');
  if (x.nuevos.length)
    l.push('| COD_ART | Código POS | Descripción | Precio |', '|---|---|---|---|',
      ...x.nuevos.map((a) => `| ${a.cod_art} | ${a.codigo} | ${a.descripcion} | ${m(a.precio)} |`));
  else l.push('Ninguno.');
  return l.join('\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/areas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/areas/archivos.ts tests/areas/archivos.test.ts
git commit -m "Areas: Excel de alta de artículos y formas de pago, y reporte"
```

---

### Task 8: Script de exportación y prueba real

**Files:**
- Create: `scripts/areas/exportar.ts`
- Create: `datos/areas/articulos.json` (contenido inicial `[]`)
- Modify: `.gitignore` (agregar `datos/areas/*/`)

**Interfaces:**
- Consumes:
  - `armar`, `Catalogo`, `filasArticulos`, `filasPagos` y `reporte` (Tasks 2, 6 y 7);
  - `configDe` (`lib/sucursales/config.ts`);
  - `leerDias` y `conRappi` (`lib/sucursales/datos.ts`);
  - `rappiServicio` (`lib/sucursales/corte-servidor.ts`);
  - `diasEntre` (`lib/sucursales/tiempo.ts`);
  - `leerEnvLocal` (`scripts/zoho/cliente.ts`).
- Produces: el comando

  ```bash
  npx tsx --conditions=react-server scripts/areas/exportar.ts --desde AAAA-MM-DD --hasta AAAA-MM-DD
  ```

- [ ] **Step 1: Preparar catálogo y .gitignore**

```bash
mkdir -p datos/areas
printf '[]\n' > datos/areas/articulos.json
printf 'datos/areas/*/\n' >> .gitignore
```

- [ ] **Step 2: Escribir el script**

```ts
// scripts/areas/exportar.ts
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { leerEnvLocal } from '../zoho/cliente';
import { armar } from '../../lib/areas/armar';
import { filasArticulos, filasPagos, reporte, type Fila } from '../../lib/areas/archivos';
import { Catalogo, type Articulo } from '../../lib/areas/catalogo';
import { configDe } from '../../lib/sucursales/config';
import { rappiServicio } from '../../lib/sucursales/corte-servidor';
import { conRappi, leerDias } from '../../lib/sucursales/datos';
import { diasEntre } from '../../lib/sucursales/tiempo';

/**
 * Exporta las ventas de Rubén Darío (532) en los JSON de la API de Areas México, con la tienda anónima (COD_TPV TC01).
 * SOLO LECTURA: lee el POS con THECOFFEE_API_TOKEN y Rappi del portal con la base de .env.local; no escribe en la base.
 * Escribe datos/areas/<desde>_<hasta>/ y actualiza datos/areas/articulos.json (el único archivo versionado).
 * Spec: docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md
 *
 *   npx tsx --conditions=react-server scripts/areas/exportar.ts --desde 2026-11-02 --hasta 2026-11-08
 */
const COMPANIA = 532;
const MAX_DIAS = 62;
const CATALOGO = 'datos/areas/articulos.json';

const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const desde = opcion('--desde') ?? '';
const hasta = opcion('--hasta') ?? '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta)
  throw new Error('Faltan --desde y --hasta (AAAA-MM-DD)');
if (diasEntre(desde, hasta) + 1 > MAX_DIAS) throw new Error(`El rango es de más de ${MAX_DIAS} días`);
const cfg = configDe(COMPANIA);
if (!cfg) throw new Error(`La sucursal ${COMPANIA} no está configurada`);

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const lectura = await conRappi(await leerDias(cfg, desde, hasta), rappiServicio(db, cfg));
if (lectura.estado === 'error') throw new Error(`No se pudo leer el POS: ${lectura.avisos.join(' ')}`);

const catalogo = new Catalogo(JSON.parse(await readFile(CATALOGO, 'utf8')) as Articulo[]);
const prohibidos = [cfg.nombre, 'Rubén Darío', 'Ruben Dario'];
const e = armar(lectura.pedidos, catalogo, prohibidos);

const dir = `datos/areas/${desde}_${hasta}`;
await mkdir(`${dir}/tickets`, { recursive: true });
await mkdir(`${dir}/arqueos`, { recursive: true });
for (const t of e.tickets) await writeFile(`${dir}/tickets/${t.Cabecera.NUM_TIK}.json`, JSON.stringify(t, null, 2) + '\n');
for (const a of e.arqueos) await writeFile(`${dir}/arqueos/${a.Fecha}.json`, JSON.stringify(a, null, 2) + '\n');

const libro = (filas: Fila[]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Sheet1');
  return wb;
};
const vendidos = new Set(e.vendidos);
XLSX.writeFile(libro(filasArticulos(catalogo.lista().filter((a) => vendidos.has(a.cod_art)))), `${dir}/Carga Art TPVs Externos.xlsx`);
XLSX.writeFile(libro(filasPagos(new Date().toISOString().slice(0, 10))), `${dir}/Formas de Pago y Monedas.xlsx`);

await writeFile(
  `${dir}/reporte.md`,
  reporte(e, { desde, hasta, estado: lectura.estado, avisos: lectura.avisos, nuevos: catalogo.nuevos() }),
);
await writeFile(CATALOGO, JSON.stringify(catalogo.lista(), null, 2) + '\n');

console.log(
  `${desde}…${hasta}: ${e.tickets.length} tickets, ${e.arqueos.length} arqueos, ${e.descartados.length} descartados, ` +
    `${catalogo.nuevos().length} artículos nuevos; lectura ${lectura.estado}. Salida en ${dir}`,
);
```

- [ ] **Step 3: Typecheck y pruebas**

Run: `npm run typecheck` y luego `npx vitest run tests/areas`
Expected: sin errores de tipos y todas las pruebas en PASS. Si `rappiServicio` no acepta el cliente de `createClient`, usar el mismo tipo que `scripts/sucursales/corte.ts` le pasa a `cortar`, que es el mismo `createClient`.

- [ ] **Step 4: Commit**

```bash
git add scripts/areas/exportar.ts datos/areas/articulos.json .gitignore
git commit -m "Areas: script de exportación de Rubén Darío a JSON (solo lectura)"
```

- [ ] **Step 5: Prueba real (PEDIR OK A SEBASTIÁN ANTES)**

Lee la API real del POS y la base de `.env.local`, solo en lectura. Con OK, correr una semana cerrada:

```bash
npx tsx --conditions=react-server scripts/areas/exportar.ts --desde 2026-11-02 --hasta 2026-11-08
```

Verificar:
1. **Reporte.** `datos/areas/2026-11-02_2026-11-08/reporte.md` dice «completa». Los descartados, si hay, tienen un motivo entendible.
2. **Monto por día contra el Tablero México.** Es solo lectura:

   ```sql
   select fecha, venta_cent from sucursales_resumen_dia where company_id = 532 and fecha between '2026-11-02' and '2026-11-08'
   ```

   Ajustar las columnas a las reales de la tabla. Diferencia esperada: 0, salvo los descartados.
3. **Revisión a ojo de tres tickets:**
   - uno con descuento;
   - uno de Rappi;
   - uno con modificadores.
4. **Anonimato.** Buscar «dario» y «rubén» sin distinguir mayúsculas en toda la carpeta. No debe aparecer nada.

   ```bash
   grep -ril "dar[ií]o\|rub[eé]n" "datos/areas/2026-11-02_2026-11-08" || echo "sin coincidencias"
   ```
5. **Catálogo.** `datos/areas/articulos.json` tiene los artículos con números desde 1001. Hacer commit del catálogo:

   ```bash
   git add datos/areas/articulos.json
   git commit -m "Areas: catálogo inicial de artículos de Rubén Darío"
   ```
