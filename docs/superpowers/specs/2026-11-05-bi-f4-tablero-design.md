# BI F4: módulo BI y tablero «The Coffee México»

**Fecha:** 2026-11-05.

**Antecedente:** la spec general del BI, `2026-11-05-bi-the-coffee-mexico-design.md`, y sobre todo sus §2 (alcance) y
§5 (fases). F0–F2 ya están en `main` (PR #102): la base, la carga, la venta neta como Zoho (migración 42) y la regla
del 2026-03-01.

**Decisiones de Sebastián en esta ronda:**
- El BI es un **módulo nuevo**.
- El tablero es **una sola página como Zoho**.
- El **margen del ranking pasa a F4.1**.

## 1. Alcance

**Entra en F4:**
- El módulo BI en `/bi`, con su permiso.
- El tablero «The Coffee México» con los 17 filtros de Zoho.
- Los bloques 1, 3, 6, 7 (sin margen) y 8 completos.
- El bloque 4 (KPI Venta The Coffee) sin metas.
- El bloque 5 (Promociones) con sus metas fijas de 6 % y 1 %.
- El bloque 2 como marcador «Disponible en F5».
- La etiqueta de pago por fecha (WALLET antes del 2026-03-01).

**Fuera de F4:**

| Qué | Dónde queda |
|---|---|
| Margen del ranking | F4.1 |
| Rappi de Zoho | F3; mientras tanto se avisa en pantalla |
| Metas y P.E. | F5 |
| Los demás tableros de Zoho | Más adelante |
| Pantalla para dar permisos de módulo | No existe hoy para Sucursales; se da por SQL |

## 2. Módulo y acceso

### 2.1 Módulo

- **Entrada «BI»:** se agrega a `lib/portal/modulos.ts` con `id: 'bi'`, `href: '/bi'` y
  `acceso: (a) => a.bi !== undefined`. También a la navegación (`components/portal/navegacion.tsx`) y a los textos del
  marco (`components/portal/marco.tsx`).
- **Route group `app/(bi)/bi/`:**
  - `layout.tsx` monta el `Marco` con `seccion="bi"`.
  - `page.tsx` es la lista de tableros; hoy tiene uno.
  - `the-coffee-mexico/page.tsx` es el tablero.
- **Sesión:** `sesionBi()` en `lib/supabase/sesion.ts`, siguiendo el patrón de `sesionSucursales`. Sin el módulo
  redirige al inicio; sin sucursales asignadas muestra «Aún no tienes sucursales asignadas».

### 2.2 Migración 43 (`20261106000043_bi_tablero.sql`)

1. **Módulo permitido:** `perfil_modulos.modulo` acepta `'bi'`. Se suelta y se vuelve a crear el check con
   `('crm', 'sucursales', 'sucursales_costeo', 'bi')`.
2. **`bi_acceso(p_company integer) returns boolean`:**
   - Es `security definer`, igual que `sucursales_acceso` pero con `m.modulo = 'bi'`.
   - Exige la asignación en `perfil_sucursales` y un perfil activo.
   - Niega tokens OAuth: `auth.jwt()->>'client_id'` es nulo.
   - Se le quita el permiso a `public` y `anon`, y se le da a `authenticated`.
3. **`bi_tiendas_filtradas`:** `create or replace` con la misma firma, cambiando `sucursales_acceso` por `bi_acceso`.
   Las lecturas `bi_tablero` y `bi_tendencias` heredan el cambio.
4. **Pago por fecha:**
   - `bi_mapeo_pago` gana las columnas `vigente_desde date not null default '2000-01-01'` y `vigente_hasta date`
     (nula = sin fin). La llave pasa a `(metodo_pos, tipo_pos, smartphone, vigente_desde)`.
   - Se siembra `WALLET_BALANCE / WALLET / true → 'WALLET'` hasta el 2026-02-28.
   - La fila actual (`APP - WALLET`) queda vigente desde el 2026-03-01.
   - `bi_lineas_filtradas` une el mapeo con `l.fecha between vigente_desde and coalesce(vigente_hasta, 'infinity')`.
     Si cambia su forma, se suelta y se vuelve a crear junto con sus dependientes, como en la 42.
5. **`bi_opciones(p jsonb) returns jsonb`:** es `security definer` y solo devuelve tiendas con `bi_acceso`. Para el
   periodo `desde..hasta` de `p` devuelve:
   - `tiendas`: `company_id`, `store_id`, nombre, franquiciatario y tipo de todas las tiendas con acceso, sin importar
     el periodo;
   - `franquiciatarios` y `tipos`: los valores distintos de esas tiendas;
   - `categorias` y `grupos`: los de `bi_clasificacion_producto`, más «Sin clasificar» y «Otros»;
   - `productos`: los `nombre` distintos con venta en el periodo y en esas tiendas;
   - `pagos`: las etiquetas con venta en el periodo;
   - `semanas`: las etiquetas `W## AAAA` con venta en el periodo.
   - Es solo para `authenticated`.
6. **Registro:** la aplica Sebastián en el SQL Editor y la registra en el mismo paso:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values ('20261106000043','bi_tablero');
   ```

### 2.3 Quién lo ve

- Cada usuario ve solo sus sucursales asignadas en `perfil_sucursales`, como en Sucursales. «México completo» es tener
  asignadas las 79.
- El permiso se da por SQL. El plan trae un script para dar `bi` (nivel `lectura`) a los 5 admins que ya tienen las
  79 sucursales.

## 3. Datos y flujo

- **Filtros en la URL.** `lib/bi/url.ts` convierte `searchParams` ↔ `FiltrosBi` (ya existe en `lib/bi/filtros.ts`),
  ida y vuelta, para los 17 filtros.

  | Parámetro | Filtro |
  |---|---|
  | `fr` | Fecha Relativa (clave de la opción) |
  | `desde`, `hasta` | Rango de Fechas |
  | `comp` | Comparable (`si` / `no`) |
  | `anios` | Años Operando |
  | `dias` | Día de la Semana |
  | `tiendas` | Nombre de Tienda (`company_id`) |
  | `franq` | Franquiciatario |
  | `tipo` | Franquicia o Sucursales Propias |
  | `cat` | Categoría Master Franchise MX |
  | `grupo` | Comida, Bebida, Combo y Merch |
  | `cafe` | Contiene Café |
  | `prod` | Product |
  | `pago` | Método de Pago |
  | `hora` | Hora |
  | `mad` | Estatus de Maduración |
  | `min`, `max` | Net Amount (Local) |
  | `sem` | Semanas y año |

  Las listas van separadas por comas.
- **Valor por omisión:** sin parámetros, `fr=esta-semana`.
- **Fechas excluyentes:** `desde`/`hasta` y `fr` se excluyen; si vienen las dos, gana el rango.
- **Route handler `app/api/bi/tablero/route.ts` (GET):**
  - Valida la sesión y el módulo: 401 sin sesión, 403 sin módulo `bi`.
  - Convierte los parámetros a `FiltrosBi` y calcula `hoy` en hora de México (`America/Mexico_City`).
  - Resuelve Fecha Relativa con `fechaRelativa(opcion, hoy)`. Si el periodo no es válido o pasa de 1,100 días,
    responde 400.
  - Si no hay filtro de tienda, `companias` son todas las tiendas con acceso, que salen de `bi_opciones`.
  - Llama `bi_tablero` con la sesión del usuario.
  - Responde `{ periodo, hoy, tablero, opciones }`.
- **Route handler `app/api/bi/tendencias/route.ts`:** es aparte, así que si falla no tumba el tablero. Llama
  `bi_tendencias`; esta lectura ignora Fecha Relativa, Rango y Semanas.
- **Cliente:** dos `useLectura` en paralelo, sin refresco periódico. Los datos se actualizan con el corte de
  10 minutos, así que basta con recargar al cambiar los filtros.
- **Armado:** `lib/bi/bloques.ts` es puro y probado. Convierte la respuesta de las RPC en lo que pinta cada bloque:
  - ticket promedio = venta ÷ tickets;
  - UPT = líneas ÷ tickets;
  - los shares, como cociente de sumas;
  - la agrupación Propias/Franquicia → tienda;
  - los nombres de tienda, desde `opciones.tiendas`.

## 4. Pantalla

**Filtros**

- Arriba y fijos al hacer scroll.
- **Visibles:** Fecha Relativa, Comparable, Años Operando, Rango de Fechas y Día de la Semana.
- **«Mostrar más filtros»:** los otros 12, con los nombres de Zoho.
- **Controles:**
  - las listas largas (tienda, producto, semana) son selectores múltiples con búsqueda;
  - Net Amount (Local) es un par mínimo/máximo en pesos.
- **Chips:** los filtros activos se muestran como chips, más un botón «Limpiar».
- **Aplicación:** cada cambio actualiza la URL con un retraso de ~400 ms.

**Frescura**

- Se muestra «Actualizado al corte de las HH:MM», con el último `bi_cargas.leido_en` del periodo.
- Si `cargas.con_carga < esperados` o hay incompletos, aparece el aviso «Faltan N de M días de tienda».
- Si hay líneas de tiendas sin `rappi_en_pos`, aparece el aviso «Rappi de Zoho pendiente (F3)».

**Bloques, en el orden de Zoho**

1. **Números clave:**
   - Ventas Netas, con «Cobrado: $X» en chico, de `venta_bruta_cent`;
   - Ticket Promedio;
   - # de Tickets;
   - Promedio UPT;
   - Total Products.
2. **Contra P.E. y meta:** tarjeta «Disponible en F5».
3. **Mezcla:**
   - Comida/Bebida/Combo/Merch, en barras con %;
   - bebidas con café y sin café;
   - Categoría Master MX, en barras ordenadas.
4. **KPI Venta The Coffee:** tabla Propias/Franquicia → tienda con venta, tickets, ticket promedio y su share. Las
   columnas de meta dicen «F5».
5. **Promociones:**
   - share de promoción de alimentos y bebidas y de café contra 6 % y 1 %;
   - resultados por tienda;
   - cantidad vendida.
6. **Tiempo y pago:**
   - ventas vs transacciones por día (columnas y línea);
   - método de pago;
   - método de pago por tienda;
   - venta por día de la semana;
   - venta por hora.
7. **Ranking de Productos:** producto × mes, con share de venta y unidades; se ordena por venta. Sin margen hasta
   F4.1.
8. **Tendencias:**
   - Ventas por Año: mes × año desde 2024, una línea por año;
   - Ventas por Semana: semana × año;
   - con la nota «Ignoran las fechas y las semanas, como en Zoho».

**Estilo de las gráficas**

- Se reusan las SVG de `components/sucursales/graficas.tsx` (tooltip, teclado y tabla equivalente).
- Las piezas de `components/portal/piezas`.
- El estilo de `tablero-mexico.css`.
- No entra ninguna librería nueva.
- Cada bloque tiene su estado de carga, error y vacío.

**Código nuevo en `components/bi/`**

| Archivo | Qué contiene |
|---|---|
| `filtros.tsx` | La barra de filtros |
| `tablero-mexico.tsx` | El orquestador |
| `bloques-*.tsx` | Un archivo por grupo de bloques |

## 5. Errores

| Caso | Qué pasa |
|---|---|
| Sin módulo | No aparece en el menú; entrar por la URL redirige al inicio |
| Sin sucursales | Mensaje de vacío |
| Tienda no asignada en la URL | Se ignora (la RPC ya la filtra) |
| Periodo inválido o > 1,100 días | Mensaje junto al filtro; no se llama a la base |
| La base falla | Se conserva la última cifra válida con su antigüedad y «No se pudo actualizar»; nunca ceros |
| Tendencias fallan | Solo ese bloque muestra el error |

## 6. Rendimiento

- **Meta:** ≤ 3 s por lectura, la del tablero y la de las tendencias, cada una por separado.
- **Medición:**
  - con el piloto;
  - con el historial completo, sobre «Este año» y con las 79 tiendas.
- **Si no se cumple:**
  - primero, índices;
  - después, el resumen diario de la spec general (§3.4), en una migración aparte (44) y solo si la medición lo pide.

## 7. Pruebas

- **PGlite:**
  - `perfil_modulos` acepta `bi`;
  - `bi_acceso` exige el módulo `bi` y la sucursal, y niega OAuth y perfiles inactivos;
  - `bi_tablero` ya no ve tiendas con solo `sucursales`;
  - `bi_opciones` respeta el acceso y el periodo;
  - el mapeo de pago por fecha: `WALLET_BALANCE` es «WALLET» el 2026-02-28 y «APP - WALLET» el 2026-03-01;
  - las pruebas existentes de BI se ajustan al módulo `bi`.
- **Vitest:**
  - URL ↔ filtros de ida y vuelta para los 17;
  - el rango le gana a la relativa;
  - el valor por omisión;
  - los bloques: ticket promedio, UPT, shares, agrupación por tipo y división entre cero;
  - el route handler: 401, 403, 400 y `hoy` en hora de México.
- **Visual:** escritorio, 375 px y modo noche, en el navegador.
- **Cotejo en pantalla:** en el piloto, con tienda, semana y pago fijos, las cifras contra Zoho.

## 8. Entrega

- **Rama y PR:** `feat/bi-f4-dashboard`, con su propia PR.
- **Producción:** la migración 43 la aplica y la registra Sebastián.
- **Permiso:** el script para dar `bi` a los admins lo corre Sebastián.
- **Después de F4:** F4.1 (margen), F3 (Rappi de Zoho) y F5 (metas y P.E.).
