# 13 · Guadalajara, secciones Ventas · Costeo · Consumo y accesos de Dione y Claudia

Encargo del 2026-10-28. Rama `feat/sucursales-gdl-consumo` (desde `origin/main` 086088f).

## Estado y lo que falta de Carlo

| Pieza | Estado |
|---|---|
| 10 sucursales de GDL dadas de alta (11 con 532) | Hecho en código, identidad verificada |
| Secciones Ventas · Costeo · Consumo | Hecho; pruebas y revisión visual |
| Rango de 62 días (Productos, Costeo, Consumo) | Hecho; Pedidos sigue en 7 |
| Directorio por ciudad con lectura diferida | Hecho |
| Migración 24 (rol `sucursales`, Costeo restringido, RPC) | **Aplicada en producción** el 2026-10-28 con OK de Carlo, registrada en `supabase_migrations` |
| Acceso de Dione y Claudia | **Hecho** el 2026-10-28 y verificado como cada una (§6) |
| Migración 25 (líneas directas de insumo en la RPC de costeo) | **Ensayada en producción con ROLLBACK**, sin aplicar (§F3b) |
| Merge del PR | **Lo hace Carlo** |

La migración se numeró 24 porque la 23 de producción es la de Analytics (`20261027000023_analytics_ventas_diarias`,
de otro trabajo). Antes de aplicarla se revisó producción: las políticas de Costeo seguían iguales, no había
funciones `sucursales_*` y los 5 perfiles eran admin. La migración se verificó dentro de la misma transacción, como
admin con la 532: 171 recetas, 165 insumos, 72 enlaces y `v_resumen` visibles; RPC de costeo, consumo y catálogo
con datos; sucursal ajena en `null`.

**Hasta el merge**, el portal en producción corre el código anterior:
- Dione y Claudia ven la tarjeta de Costeo, pero sus páginas salen vacías porque la base no les deja leer nada.
- De sus 11 sucursales solo ven Rubén Darío; las otras 10 aparecen como «aún no habilitadas».
- Con el merge todo eso queda resuelto.

## F1 · Sucursales de Guadalajara

Cruce de `/company/list/all` (119 sucursales, 2026-10-28) con `crm_tiendas`: en las 10 el `lookerStoreId` de la API
es el número Jestor del CRM y el nombre coincide. Validación con `scripts/sucursales/validar-sucursal.ts`
(zona `America/Mexico_City`, `local-etiquetada-z`).

| # | Sucursal | company_id | Jestor | CRM | 27 oct: venta = suma por productos | Hoy (13:06) último pedido |
|---|---|---|---|---|---|---|
| 1 | Ventura | 384 | 301 | Ventura-301, Zapopan | $7,850.10 ✓ | 12 h |
| 2 | Aleden | 457 | 355 | Aledén- 355 | $8,393.00 ✓ | 13 h |
| 3 | Legacy | 459 | 351 | Legacy- 351 | $5,940.20 ✓ | 12 h |
| 4 | Granja | 477 | 382 | Granja- 382 (API: «Ciudad Granja») | $5,497.00 ✓ | 12 h |
| 5 | Chapu 67 | 515 | 408 | Chapu 67 - 408 | $4,298.31 (1 ¢ de redondeo del proveedor) | 13 h |
| 6 | Essentia | 514 | 397 | Essentia- 397 | $7,980.00 ✓ | 12 h |
| 7 | Rubén Darío | 532 | 455 | ya existía | — | — |
| 8 | Calle Ottawa | 518 | 428 | Ottawa- 428 (API: «Calle Otawa») | $8,428.60 ✓ | 13 h |
| 9 | Namóra | 513 | 394 | Namóra- 394 | $6,880.65 ✓ | 12 h |
| 10 | Gran Plaza | 567 | 475 | Gran Plaza - 475 | $6,172.20 ✓ | 12 h |
| 11 | Forum Tlaquepaque | 631 | 542 | Forum Tlaquepaque - 542 | $1,715.10 ✓ (abre 10 h: plaza) | 12 h |

- Hora local confirmada: a las 13:06 de Guadalajara ningún pedido es posterior a las 13 h.
- **Para revisar (no bloquea):** Essentia. El encargo da «C. Mar Caspio 2024» y el CRM «Av. Jorge Álvarez del
  Castillo 1433»; ambas en Country Club. Nombre y Jestor 397 coinciden en API y CRM, así que se dio de alta.
- Ninguna de las 10 recibe Rappi por la API: alcance «Mostrador + App», sin pestaña ni filtro de Rappi y sin estimar.
- `ciudad` es ahora la zona metropolitana («Guadalajara», también para 532) y `ubicacion` el municipio o la colonia.

**Directorio** agrupado por ciudad. Costo medido con las 13 sucursales (`scripts/sucursales/medir-directorio.ts`):
27 lecturas a la API en frío (la tarjeta más lenta 5.4 s), 0 en caliente y 13 por minuto al vencer «hoy». Se aplicó
**lectura diferida**: cada tarjeta lee cuando entra en pantalla (y se quitó el tope de 12).

## F2 · Secciones y 62 días

- Página de la sucursal: `?seccion=ventas|costeo|consumo` (Ventas por omisión; los enlaces viejos siguen igual).
  El origen y el periodo son de la sucursal y se conservan al cambiar de sección (`?origen`, `?periodo` o
  `?desde&hasta`).
- **Ventas** sin cambios de cifras. Lo único que sale de Productos es el bloque de costeo y sus columnas.
- **Puerta de 62 días (532, 28 ago–28 oct, 2,741 pedidos):** una sola lectura 16.0 s (pasa el umbral de ~15 s);
  leída **día por día** con 4 en paralelo, 6.8 s en frío y cada día cerrado en caché (6 h; hoy 45 s). No hizo falta
  persistir nada. Caché ampliada a 1,000 entradas (13 sucursales × 62 días).
- **R2 · mismas cifras:** `scripts/sucursales/comparar-dias.ts` compara lectura única contra lectura por días en 532
  (7 y 28 días al 27 oct) con los cuatro filtros de origen: pedidos, venta, conciliación y cada producto
  (clave, importe, líneas, pedidos) **idénticos**.
- Límites (`lib/sucursales/rutas.ts`): Productos, Costeo y Consumo 62 días (63 → 400); Pedidos 7 (8 → 400).

## F3 · Migración 24 (aplicada en producción el 2026-10-28)

`supabase/migrations/20261028000024_sucursales_costeo_consumo.sql`:

1. `perfiles.rol` acepta `'sucursales'`: perfil del portal sin Costeo.
2. Lectura de las tablas de Costeo (incluidas bitácora, `precio_canal_manual` y `producto_codigo_pos`) solo con rol
   de Costeo (`compras`, `operaciones`, `finanzas`, `admin`). Antes bastaba un perfil activo. Las vistas son
   `security_invoker` y heredan el cambio. `perfiles`: cada quien ve el suyo; los roles de Costeo, todos (como hoy).
   **Para los perfiles actuales no cambia nada**: todos tienen rol de Costeo.
3. `perfil_modulos.modulo` acepta `'sucursales_costeo'` (nivel lectura).
4. Funciones `security definer` (sin OAuth, perfil activo, módulo Sucursales y fila en `perfil_sucursales`):
   - `sucursales_acceso(company)`; `sucursales_puede_costeo(company)` = acceso y (rol de Costeo o `sucursales_costeo`).
   - `sucursales_datos_costeo(company)`: enlaces, costo por receta y tamaño, Únicas e IVA (lo mismo que se leía bajo RLS).
   - `sucursales_recetas_consumo(company)`: **solo cantidades**, sub-recetas expandidas con la recursión de
     `v_costo_subreceta`.
   - `sucursales_catalogo_pos(company)`: nombres del POS de los enlaces, para que la identidad de líneas sin código
     (PR #40/#42) sea la misma con o sin rol de Costeo.

Prueba local (PGlite, `tests/db/sucursales-costeo-consumo.test.ts`, 9 pruebas, y las 30 existentes de acceso y
permisos sin regresión): un perfil `sucursales` lee 0 filas de las 17 tablas y vistas de Costeo; las RPC devuelven
`null` sin la sucursal, sin módulo, sin permiso de Costeo o por OAuth; el costo de la RPC coincide con
`v_costo_producto`; el consumo no lleva costos.

El portal (`lib/supabase/sesion.ts`, `lib/portal/modulos.ts`): con rol `sucursales`, Costeo no aparece en el
tablero, sus páginas mandan a `/sucursales` y sus acciones fallan; Inicio sí entra; el CRM lo manda a Inicio.

## F3b · Migración 25 (para la etapa 1b de personalizaciones)

`supabase/migrations/20261028000025_sucursales_costeo_lineas.sql` hace `create or replace` de
`sucursales_datos_costeo` con la misma firma, el mismo permiso y las mismas claves de antes. Solo agrega `lineas`:
por cada receta enlazada y tamaño, sus líneas **directas** de insumo (sin sub-recetas). Cada línea trae
`linea_id`, `insumo_id`, nombre, unidad, cantidad, `costo_unitario` y `activo`. En TypeScript llega como
`DatosCosteo.lineas` (opcional), agrupada por `claveCosto(receta, tamaño)`. Ningún cálculo la usa todavía.

**Respaldo verificado y ensayo en producción el 2026-10-28, con ROLLBACK:**
- El respaldo guarda la definición y los permisos de la función, fuera de git, en
  `%TEMP%\thecoffee-respaldos\2026-10-28T20-22-17-457Z-sucursales_datos_costeo-antes-25.sql`. Se verificó al leerlo
  de vuelta, y restaurarlo dentro de la transacción deja la función idéntica.
- El ensayo dio 529 líneas en 72 recetas, sin insumos inactivos. Ejemplo: leche entera, Único, 100 ml a $0.022 por
  ml.
- Las claves previas quedaron idénticas, los permisos sin cambio, Dione ve las líneas en 384 y en 612 recibe `null`.
- Después del ROLLBACK, producción quedó sin cambios.

## F4 · Consumo teórico según receta

Para quien ve la sucursal (sin permiso de Costeo). Solo cantidades.

- Rotulado «Consumo teórico según receta». No es inventario ni merma.
- Misma identidad de líneas que Productos y Costeo (`identificador`, evidencia de todo el periodo).
- Una línea (unidad) entra si cumple tres condiciones:
  - su código tiene receta;
  - su tamaño está verificado (`TAMANOS_VERIFICADOS` o Único);
  - todas sus personalizaciones son neutras para esa receta. Es la misma lista que Costeo
    (`personalizaciones-verificadas.ts`, PR #47); un cambio de leche o un shot extra aún no se calcula.
- Además, la receta debe tener cantidades para ese tamaño.
- **Cobertura en unidades:** A (todas) y B (A − Generic). Fuera, con su motivo: Generic, sin código, código sin
  enlace, tamaño sin verificar, con personalización y receta sin cantidades para el tamaño. Rappi de las sucursales
  que no lo reciben no está y no se estima.
- **Vistas:**
  - cobertura (barra apilada con cifras);
  - leche por tipo (categoría LECHE, 8 insumos con color fijo por leche);
  - consumo por día de un insumo (columnas, con tooltip y teclado, y tabla);
  - por categoría (totales por unidad; g, ml y pza no se suman entre sí);
  - insumos (buscar y filtrar por categoría);
  - por producto, con cajón lateral de sus insumos.

**Dato real (532, 21–27 oct, recetas de producción leídas en solo lectura con la misma expansión de la RPC;
`scripts/sucursales/medir-consumo.ts`):**

- 537 unidades vendidas: 31 son Generic, 51 tienen código sin enlace y 455 tienen receta.
- **Entran 114:** 21.2 % de A y 22.5 % de B. Sin la lista de neutras del PR #47 eran 89.
- Fuera con receta: 290 con una personalización que cambia la receta y 51 con tamaño sin verificar.
- Las personalizaciones que todavía sacan unidades son:

  | Personalización | Unidades |
  |---|---|
  | Double shot (36ml) | 176 |
  | Lactose free | 115 |
  | Single Shot (18ml) | 72 |
  | Less Honey | 40 |
  | Oatmilk | 31 |
  | Average Honey | 23 |

**Siguiente paso (fuera de este encargo):** son shots, leches y miel, que cambian cantidades o insumos. Calcularlas
(etapa 2 de `docs/conciliacion-brasil/33`) subiría la cobertura de Consumo y de Costeo por igual, porque comparten
la regla.

## F5 · Diseño

- **Secciones:** barra negra (como el menú) con la sección activa en crema, icono y descripción. En móvil es una
  fila compacta.
- **Dentro de las placas:** paletas de la skill dataviz validadas con `validate_palette.js`.
  - Cobertura: azul `#2a78d6`, amarillo `#eda100`, magenta `#e87ba4` y violeta `#6250d6`. PASS en claro y oscuro.
    El aviso de contraste < 3:1 se cubre con leyenda y cifras.
  - Leches: la paleta categórica de 8 en orden fijo por insumo. PASS.
- No se tocó `app/globals.css`.
- El «modo noche» del portal (`html[data-luz=noche]`) oscurece el muro y deja las placas claras, así que las
  gráficas conservan su superficie.
- Capturas en `docs/sucursales/13-capturas/`. Son del banco visual con **datos sintéticos**
  (`npm run prueba:visual`, `?sucursales&gdl=1&seccion=consumo`):
  - escritorio: cobertura, leche y tendencia, productos, cajón y Costeo;
  - móvil a 375 px: secciones y cobertura;
  - estados de error y vacío;
  - modo noche.

## R6 / R7 · Permisos (pruebas en `tests/portal/sucursales-rutas.test.ts` y `modulos.test.ts`)

- **APIs `/costeo` y `/consumo`:** sin sesión 401, sin módulo 403, sucursal ajena o no configurada 404. La
  denegación ocurre antes de caché y proveedor.
- **`/costeo` sin permiso de Costeo:** 403 antes de leer la API del POS. Con permiso, 200.
- **`/consumo` sin la migración:** 503, nunca consumo cero.
- **Productos** ya no lleva ningún costo, con o sin permiso.
- **Dione o Claudia:**
  - `/sucursales/612` da 404, porque solo tendrán filas de GDL.
  - `/costeo` las manda a `/sucursales`.
  - `/crm` las manda a Inicio.

## §6 · Acceso de Dione y Claudia (aplicado el 2026-10-28)

Se aplicó con el SQL de abajo, en una transacción, después de la migración 24. Verificación hecha como cada una
(`dacuna@` y `clarios@`):

- rol `sucursales`, perfil activo;
- ve solo su perfil, 0 recetas y 0 enlaces;
- módulos `sucursales:lectura` y `sucursales_costeo:lectura`;
- 11 sucursales y sin CRM;
- Costeo de 384 sí y de 612 no; consumo de 631 sí.

```sql
-- Por cada una (<uuid-perfil> = auth.users.id de su correo). Sin rol de Costeo, sin admin, sin CRM.
insert into public.perfiles (user_id, nombre, rol, activo) values ('<uuid-perfil>', '<nombre>', 'sucursales', true);
insert into public.perfil_modulos (user_id, modulo, nivel) values
  ('<uuid-perfil>', 'sucursales', 'lectura'),
  ('<uuid-perfil>', 'sucursales_costeo', 'lectura');
insert into public.perfil_sucursales (user_id, company_id)
select '<uuid-perfil>', c from unnest(array[384, 457, 459, 477, 515, 514, 532, 518, 513, 567, 631]) c;
-- Verificación: activo, rol 'sucursales', módulos {sucursales, sucursales_costeo}, 11 sucursales, sin 'crm'.
```

## Verificación

- `tsc --noEmit` sin errores.
- `vitest`: 535 pruebas pasan (5 omitidas), ya sobre main con el PR #47. Solo falla `tests/migracion/paridad.test.ts`, que necesita el Excel y ya fallaba antes.
- Prettier sobre los archivos propios.
- Scripts de medición (solo GET y solo lectura): `medir-62.ts`, `comparar-dias.ts`, `medir-directorio.ts` y
  `medir-consumo.ts`.
