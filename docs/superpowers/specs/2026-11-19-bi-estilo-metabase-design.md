# BI «The Coffee México» con estilo de Metabase

**Fecha:** 2026-11-19 · **Estado:** aprobado en conversación, pendiente de revisión escrita
**Antecedentes:** `docs/superpowers/specs/2026-11-05-bi-f4-tablero-design.md` (F4), `docs/bi/03-TABLERO.md`, `docs/bi/04-METAS-PE.md` (F5)

## Objetivo

Que el tablero `/bi/the-coffee-mexico` se vea y se use como un tablero de Metabase, sin instalar Metabase:
mosaico denso de tarjetas, números grandes con comparación contra el periodo anterior, filtros como píldoras
compactas, y gráficas y tablas más limpias. Tomamos el **lenguaje visual**; no se copia código ni CSS de Metabase
(licencia AGPL).

**Éxito:**
- En escritorio el tablero cabe en ~3–4 pantallas (hoy ~8,600 px).
- Cada KPI muestra su cambio contra el periodo anterior, calculado con las mismas fórmulas que el número principal.
- Los enlaces guardados del tablero siguen funcionando (misma URL).
- Las cifras no cambian: es un rediseño de presentación más una consulta nueva para la comparación.

## Fuera de alcance

- Colores de datos y formas de gráfica: se quedan los de `components/bi/colores-bi.ts` y `graficas-bi.tsx`
  (validados con la skill dataviz).
- Marco del portal (menú, encabezado, tema claro/noche): no se toca.
- Cálculos de `bi_tablero`, `bi_tendencias`, `bi_opciones` y metas/P.E. (F5): no se tocan.
- Comparación contra el año pasado: no (el historial de 2025 aún no está cargado).
- Instalar Metabase: descartado por ahora (ver conversación del 2026-11-19).

## 1. Mosaico

Una gráfica o tabla por tarjeta; desaparecen los encabezados grandes de sección («Mezcla de venta», «Tiempo y pago»,
etc.). Cada tarjeta lleva título chico arriba a la izquierda y, si aplica, leyenda compacta a la derecha en la misma
línea y una descripción de una línea.

Escritorio (`lg` y más), cuadrícula de 12 columnas:

| Fila | Tarjetas (columnas) |
|---|---|
| 1 | 5 KPI (una fila; ver §2) |
| 2 | Ventas vs transacciones por día (8) · Contra meta y P.E. (4) |
| 3 | Comida, Bebida, Combo y Merch (4) · Con café / sin café (4) · Método de pago (4) |
| 4 | Categoría Master Franchise MX (6) · Ranking de productos (6) |
| 5 | Venta por día de la semana (6) · Venta por hora (6) |
| 6 | Venta por tienda agrupada por tipo (8) · Promociones (4) |
| 7 | Método de pago por tienda (12) |
| 8 | Ventas por año (6) · Ventas por semana (6) |

- Tableta (`sm`–`md`): 2 columnas; las tarjetas de 8 y 12 ocupan el ancho completo.
- Celular: 1 columna; los KPI van de 2 en 2 (el quinto ocupa las 2).
- Avisos (días faltantes / carga incompleta, Rappi de Zoho pendiente) y la franja del corte con «Actualizar»: arriba
  de los KPI, compactos.
- Tablas largas (tiendas y ranking): 10 primeras filas y botón «Ver todas (N)», que despliega el resto **dentro de la
  tarjeta** con scroll interno (máx. ~600 px); «Ver menos» regresa. El ranking pasa de 20 a 10 filas visibles.

## 2. Tarjetas KPI

Ventas Netas, Ticket Promedio, # de Tickets, Promedio UPT y Total Products:

```
Ventas Netas
$9,151,138
▲ 4.2 %  vs $8,782,300
lun 9 – mié 11 nov
```

- Sin ícono; título chico, número grande, línea de comparación y periodo comparado.
- Ventas Netas conserva «Cobrado: $…» debajo, discreto.
- Cambio % = (actual − anterior) ÷ anterior. ▲ verde si sube, ▼ rojo si baja (en los 5 subir es bueno);
  |cambio| < 0.1 % se muestra gris «= 0.0 %».
- Los valores del periodo anterior se calculan con **`numerosClave`** (`lib/bi/bloques.ts`) sobre los totales que
  devuelve `bi_kpis` (mismo formato que `kpis` de `bi_tablero`), para que actual y anterior usen la misma fórmula.
- Estados de la línea de comparación (el número principal nunca espera por ella):
  - cargando: línea gris tenue (esqueleto);
  - anterior = 0 o sin ventas: «Sin comparación»;
  - al periodo anterior le faltan días de carga o tiene días incompletos: «Sin comparación: faltan días en
    lun 9 – mié 11 nov»;
  - filtro «Semanas y año» activo: «Sin comparación con filtro de semanas» (no hay un «periodo anterior» claro);
  - error de la consulta: «Sin comparación» y el resto del tablero sigue normal.
- «Contra meta y P.E.» (F5) queda como su propia tarjeta con el mismo estilo de número grande; su contenido no cambia.

### Periodo anterior

Función pura `periodoAnterior` en `lib/bi/comparacion.ts`. Recibe la opción de Fecha Relativa (o rango libre), el
periodo resuelto `{desde, hasta}` y `hoy`; devuelve `{desde, hasta}` del periodo anterior:

| Periodo actual | Periodo anterior |
|---|---|
| Hoy, Ayer | el día previo |
| Esta semana (lun → hoy) | mismos días de la semana pasada (lun → mismo día) |
| Semana anterior, 2/3/4 semanas anteriores | la semana previa a esa |
| Últimas 4 semanas | las 4 semanas previas |
| Este mes (día 1 → hoy) | día 1 → mismo día del mes anterior (recortado al fin de mes: 31 mar → 28/29 feb) |
| Mes anterior | el mes calendario previo completo |
| Últimos 3 meses | los 3 meses calendario previos |
| Este trimestre (inicio → hoy) | mismo tramo del trimestre anterior (recortado al fin de mes) |
| Trimestre anterior | el trimestre calendario previo |
| Este año (1 ene → hoy) | 1 ene → mismo día del año anterior (29 feb → 28 feb) |
| Año anterior | el año previo completo |
| Rango libre de N días | los N días inmediatamente anteriores |

**Día en curso.** Si el periodo actual termina hoy (México) y el último corte es de hoy a la hora H (de
`bi_opciones.ultimo_corte`), el **último día** del periodo anterior solo cuenta las líneas con `hora < H`. Así
«Esta semana» un miércoles a las 11:30 no se compara contra un miércoles completo. Es aproximado a la hora (hoy
incluye 11:00–11:30 y el día comparado no), y se documenta así. Si no hay corte de hoy, no se recorta.

## 3. Filtros como píldoras

Fila de píldoras compactas con los 5 principales y «Más filtros»:

```
[Esta semana ▾] [Comparable ▾] [Años Operando ▾] [Rango de fechas ▾] [Día de la semana ▾]  [Más filtros · 2 activos ▾]  Limpiar
```

- **Sin valor:** contorno, «Comparable ▾».
- **Con valor:** rellena, «Franquiciatario: Grupo Ávila ✕»; con varios valores, «Tiendas: 3 ✕». La ✕ quita ese filtro.
- **Fecha Relativa** siempre muestra su valor; se rellena solo si no es el valor por omisión («Esta semana»). Con
  rango libre muestra «2 nov – 18 nov».
- **Clic** abre un recuadro flotante anclado a la píldora:
  - opción única (Fecha Relativa, Comparable): lista que se aplica al elegir;
  - listas múltiples (Años Operando, Día de la Semana, Tiendas, Franquiciatario, Tipo, Categoría, Grupo, Contiene Café,
    Product, Método de Pago, Hora, Maduración, Semanas): el contenido de `SelectorMultiple` con su comportamiento
    actual (búsqueda donde ya la hay, casillas, Escape cierra, borradores que no se pierden);
  - Rango de Fechas y Net Amount: dos campos y «Aplicar»; «El periodo no es válido.» aparece dentro del recuadro.
- **Más filtros** despliega una segunda fila con las 12 restantes; su etiqueta cuenta los activos de esas 12.
- **Desaparece** la fila de chips de filtros activos (las píldoras rellenas la sustituyen).
- **Limpiar** solo aparece con algún filtro activo. **Actualizar** se queda en la franja del corte.
- Fija bajo el encabezado del portal en escritorio (como hoy, `lg:sticky lg:top-[65px]`); en el celular no se fija
  y las píldoras se acomodan en varias filas.
- La URL y sus parámetros **no cambian** (`lib/bi/url.ts` intacto).
- Accesibilidad: cada píldora es `button` con `aria-haspopup` y `aria-expanded`; el recuadro es un `dialog` no modal
  recorrible con teclado; Escape lo cierra y regresa el foco a su píldora; la ✕ tiene `aria-label`
  «Quitar <filtro>: <valor>».

## 4. Gráficas y tablas

**Gráficas** (`ColumnasYLinea`, `Lineas`, barras de mezcla y de pago):
- Mismos colores, formas, tooltips con teclado y tabla equivalente.
- Alto según la tarjeta: ~260 px en tarjetas de 8–12 columnas, ~220 px en las de 4–6.
- En escritorio el ancho se ajusta a la tarjeta (`useAncho`) sin scroll horizontal; en el celular se conserva el
  ancho mínimo actual con scroll para que el eje no se vuelva ilegible.
- «Ver como tabla» pasa a un ícono chico en la esquina de la tarjeta (con `aria-label`), que abre la misma tabla
  equivalente.

**Tablas** (venta por tienda, promociones por tienda, método de pago por tienda, ranking de productos):
- Filas compactas (~36 px), encabezado fijo dentro de la tarjeta, números a la derecha con `tabular-nums`.
- Columnas ordenables: Venta, Tickets, Ticket prom., Share, Unidades (según la tabla). Primer clic: mayor a menor;
  segundo: menor a mayor; `aria-sort` en el encabezado. Por omisión, por venta descendente.
- En «Venta por tienda agrupada por tipo» el orden aplica **dentro de cada grupo**; la fila de grupo (Sucursales
  propias / Franquicia) queda como subtotal en negritas.
- Barra tenue detrás del número en Share y en la Venta del ranking (proporcional al máximo de la columna, con
  transparencia para verse en claro y en noche).
- «vs meta» en verde si ≥ 100 %, rojo si < 100 %, gris si no hay meta.
- 10 primeras filas + «Ver todas (N)» (§1).

**Modo noche:** tarjetas, rejilla, texto y barras usan las variables del tema (`globals.css`); nada con color fijo
salvo los colores de datos ya validados.

## 5. Datos: `bi_kpis` y `/api/bi/kpis`

**Migración `20261120000076_bi_kpis.sql`** (la aplica el usuario en el SQL Editor y la registra):

```sql
create function public.bi_kpis(p jsonb, p_hora_corte integer default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp
```

- Usa `bi_lineas_filtradas(p, desde, hasta, false)` con los mismos filtros que `bi_tablero`, incluido el control de
  acceso (`bi_tiendas_filtradas` → `bi_acceso`); sin acceso devuelve `null`, igual que `bi_tablero`.
- Si `p_hora_corte` no es null, excluye las líneas con `fecha = hasta and hora >= p_hora_corte`.
- Devuelve `{ kpis: {venta_cent, venta_bruta_cent, tickets, lineas, unidades}, cargas: {esperados, con_carga,
  incompletos} }` con **las mismas expresiones** que `kpis` y `cargas` de `bi_tablero` (migración 74).
- `revoke all … from public, anon; grant execute … to authenticated;`
- Prueba en PGlite (`tests/db/bi-kpis.test.ts`): mismos totales que `bi_tablero` para el mismo periodo; recorte por
  hora solo en el último día; sin acceso → null; token OAuth → null.

**Ruta `app/api/bi/kpis/route.ts`**, mismo patrón que `/api/bi/tablero`: sesión con `accesoBi`, `bi_opciones`,
intersección de tiendas pedidas con las del usuario, `resolverPeriodo` + `periodoAnterior`, hora de corte, y
`bi_kpis`. Responde `{ periodo: {desde, hasta}, kpis, cargas } | { kpis: null }` con 401/403/400/503 como la
ruta del tablero; si hay filtro de semanas responde `{ sinComparacion: 'semanas' }` sin consultar. Caché
`private, no-store` (`json` de `lib/sucursales/rutas.ts`).

**Cliente:** `tablero-mexico.tsx` agrega `useLectura('/api/bi/kpis?…')` en paralelo a tablero y tendencias.

Tipos nuevos en `lib/bi/tipos.ts` (`RespuestaKpis`) y firma de `bi_kpis` en `lib/supabase/database.types.ts`.

## Archivos

- Nuevos: `lib/bi/comparacion.ts`, `app/api/bi/kpis/route.ts`, `supabase/migrations/20261120000076_bi_kpis.sql`,
  `components/bi/pildora-filtro.tsx`, `components/bi/tarjeta-bi.tsx` (tarjeta del mosaico con título, leyenda y
  acciones), `components/bi/tabla-bi.tsx` (tabla ordenable con «Ver todas»).
- Cambian: `components/bi/tablero-mexico.tsx` (mosaico y nueva lectura), `filtros.tsx`, `selector-multiple.tsx`
  (contenido reutilizable dentro del recuadro), `bloques-resumen.tsx`, `bloques-tiendas.tsx`, `bloques-tiempo.tsx`,
  `bloques-productos.tsx`, `graficas-bi.tsx` / `graficas-bi-piezas.tsx` (alto y ancho), `lib/bi/tipos.ts`,
  `lib/supabase/database.types.ts`, `tests/portal/vista/bi.tsx` (datos sintéticos de la comparación),
  `docs/bi/03-TABLERO.md` (comparación, migración 76, cómo aplicarla).

## Pruebas

- `tests/portal/bi-comparacion.test.ts`: `periodoAnterior` para las 15 opciones y rango libre, fines de mes
  (31 mar, 29 feb), cambio de año, «Hoy» con y sin corte.
- `tests/db/bi-kpis.test.ts`: ver §5.
- `tests/portal/bi-rutas.test.ts`: `/api/bi/kpis` (401, 403, 400 con periodo inválido, semanas → sin comparación,
  intersección de tiendas, hora de corte solo cuando el periodo termina hoy).
- `tests/portal/bi-filtros-ui.test.tsx`: píldoras (vacía/rellena/✕), recuadros (abrir, Escape regresa el foco,
  aplicar), «Más filtros» con conteo, Limpiar solo con filtros activos, URL igual que antes.
- `tests/portal/bi-tablero-ui.test.tsx`: KPI con ▲/▼/=, estados de la comparación, tablas ordenables (incluido el
  orden dentro de grupos), «Ver todas», ranking a 10.
- Revisión visual en la vista de prueba (`npm run prueba:visual`, `?bi` y `?bi&noche`): escritorio 1440, tableta 768,
  celular 375, claro y noche.

## Riesgos a vigilar

1. **Comparación engañosa a mitad de día** si el recorte por hora falla: la prueba de ruta cubre «periodo termina
   hoy» contra «periodo termina ayer».
2. **Fórmulas distintas** entre actual y anterior: ambas pasan por `numerosClave`; `bi_kpis` copia las expresiones
   de `bi_tablero` y la prueba de base compara ambos resultados.
3. **Filtro escondido en «Más filtros»**: el conteo de activos en el botón lo hace visible.
4. **Orden en la tabla agrupada** rompiendo subtotales: se ordena dentro de cada grupo.
5. **Modo noche** con barras en celdas: transparencia y prueba visual en `?bi&noche`.
