# Orden de venta sugerida — piloto (diseño)

Fecha: 2026-11-18 · Módulo: Comercializadora (portal) · Estado: aprobado en conversación, pendiente de revisión escrita.

## 1. Propósito

La Comercializadora quiere **proponer a cada franquiciatario su pedido** de resurtido a partir de lo que la tienda **vende**
(POS) y no solo de lo que históricamente compra. Antes de proponerlo a corporativo, se corre un **piloto interno**:
cada semana llega un correo a `compras@mx.thecoffee.jp` y `scervera@mx.thecoffee.jp` con la orden sugerida de tres
sucursales, para ver cómo funciona y medir qué tanto se parece a lo que la tienda termina pidiendo.

Lo que dijo el usuario: lo usa la Comercializadora; de inicio solo por correo a esas dos direcciones, con las 3
sucursales del ejercicio; la cadencia es la de cada tienda; enfoque "receta calibrada".

Éxito del piloto: tras unas semanas, el correo muestra para cada tienda lo sugerido contra lo que sí pidió, y con eso
se decide si se propone a corporativo (y si se hace pantalla, envío al franquiciatario, etc.).

Fuera de alcance del piloto: pantalla en el portal, enviar algo al franquiciatario, crear borradores en Shopify u OVs en
Zoho, inventario de la tienda, más tiendas que las tres.

## 2. Antecedente: el ejercicio (spike)

Anexo: [`anexos/2026-11-18-ov-sugerida-ejercicio.md`](anexos/2026-11-18-ov-sugerida-ejercicio.md). Con octubre 2026:
el café cuadra (las compras son 0.92–1.35× la receta), 80–93 % del monto que compra la tienda cae en SKUs que el método
sugiere, pero por SKU el error es alto por el redondeo a paquetes, consumibles fuera de receta, compras por fuera y SKUs
inactivos. Este diseño ataca esas cuatro causas.

## 3. Tiendas del piloto

| Sucursal (POS) | company_id | Apertura (sitio viejo) |
|---|---|---|
| La Mexicana | 519 | 411 |
| Pasaje Parián | 460 | 354 |
| Avándaro | 463 | 347 |

Las tres son del franquiciatario CDMX-MJA, que comparte correo entre tiendas: el emparejamiento es por `apertura_id`
(y nombre de sucursal), nunca por correo.

## 4. Cálculo (por tienda, cada semana)

Fecha de corrida `hoy` (CDMX). Todo en días de CDMX.

1. **Pedidos de resurtido de la tienda**: `com_legado_pedidos` de su apertura, sin cancelados (`cancelado`,
   `cancelacion_pendiente`), sin pedidos de apertura (`com_legado_pedidos_apertura` o notas "pedido/kit de apertura"),
   con `items_editados` cuando existan (igual que `serieDiaria`), nombres sin SKU resueltos con `com_sku_mapping`.
2. **Cadencia** `C`: mediana de días entre pedidos de resurtido consecutivos de los últimos 90 días, acotada a [7, 30].
   Con menos de 2 pedidos en 90 días: 14.
3. **Consumo por receta**: ventas del POS de los últimos 28 días (`hoy-28 … hoy-1`) × recetas con el **mismo motor** que
   Sucursales (`consumir` / `calcularMes` de `lib/sucursales`), por insumo; ÷ 28 = consumo diario por insumo.
4. **Insumo → SKU**: tabla `com_insumo_sku` (insumo, SKU, `factor` = unidades del insumo por paquete del SKU). Consumo
   diario por SKU = Σ consumo del insumo ÷ factor. Insumos sin SKU (leche, hielo, agua, panadería…) no entran.
5. **Calibración** `k` por tienda y SKU: compras del SKU en 90 días ÷ (consumo diario por receta del paso 4 × 90),
   acotado a [0.8, 1.5]; si no hay compras o no hay consumo, `k = 1`. Absorbe merma y calibración de recetas. Usa el
   consumo diario de los 28 días como tasa (supone venta estable): leer 90 días del POS serían 90 llamadas por tienda
   (`leerDias` lee día por día), demasiado para una corrida semanal.
6. **Fuera de receta**: SKUs que la tienda compró en 90 días y no salen de ninguna receta (servilletas, sobres,
   bolsas, limpieza, POP…): necesidad diaria = compras en 90 días ÷ 90.
7. **Necesidad del periodo** por SKU = necesidad diaria (receta × `k`, o historial) × `C`.
8. **Ya pedido**: lo que la tienda pidió desde su último pedido de resurtido hasta hoy se resta (si pidió hoy, la
   sugerencia queda en lo que falte).
9. **Arrastre** (en lugar de redondear cada semana): `bruto = necesidad − ya pedido + arrastre_anterior`;
   `sugerido = max(0, ceil(bruto − 0.2))` paquetes (tolerancia de 0.2 para no sumar un paquete por poco);
   `arrastre = bruto − sugerido` (puede ser negativo: lo que se sugirió de más se descuenta la siguiente semana),
   acotado a ±1 paquete. El arrastre anterior es el de la corrida previa de la misma tienda y SKU.
10. Se excluyen SKUs con estatus `Inactivo` en `com_catalogo` (y se listan aparte si la receta los pide).
11. Cada renglón guarda su **origen** (`receta` / `historial`), `k`, consumo diario, necesidad, ya pedido, arrastre,
    sugerido y monto aproximado (`costo_unitario`).

## 5. Ejecución

- **Ruta** `GET /api/comercializadora/ov-sugerida` (Next, `maxDuration` 300 s) llamada por un **cron de Vercel** los
  lunes 12:00 UTC = **06:00 CDMX**, antes de las OCs de las 08:00. Autenticada como las rutas de cron de Sucursales
  (`CRON_SECRET`).
- Lee con la llave de servicio: ventas del POS con el mismo lector que Sucursales (`leerDias`, configuración por
  sucursal), recetas (`recetasServicio`), catálogo POS, pedidos por el puente (`lib/comercializadora/legado.ts`).
- **Solo lee y escribe sus propias tablas**: no crea nada en Shopify ni en Zoho.
- Bitácora en `com_sync_log` con proceso `com-ovs` (resumen por tienda o error).
- Idempotente por semana: una corrida por `(semana ISO, tienda)`; repetirla la reemplaza (no duplica el arrastre).

## 6. Datos (migración nueva del portal)

- `com_insumo_sku (insumo_id uuid → insumos, sku text → com_catalogo, factor numeric > 0, activo bool, nota text)`,
  llave `(insumo_id, sku)`. Carga inicial: el mapeo del ejercicio (anexo, sección "Mapeo insumo → SKU"), corrigiendo las
  presentaciones detectadas (vaso 12 oz = 500 pzas, espresso = 2 500, chip = 500 g).
- `com_ovs_tiendas (company_id int, apertura_id text, nombre text, activo bool)`, cargada con las 3 tiendas.
- `com_ovs_corridas (id, semana date [lunes], company_id, cadencia int, estado 'ok'|'error', error text, creada_at)`,
  única por `(semana, company_id)`.
- `com_ovs_lineas (corrida_id, sku, origen, k, diario, necesidad, ya_pedido, arrastre, sugerido, monto)`.
- Permisos: solo `service_role` escribe; lectura para Comercializadora (`com_puede_leer()`), igual que las demás `com_`.
- Destinatarios en `com_plan_config.config.ovs.correos` (default las dos direcciones).

## 7. Correo

Asunto: `Orden de venta sugerida (piloto) — semana del <lunes>`. Por tienda:

- Encabezado: sucursal, cadencia (días), último pedido, cobertura de recetas de sus ventas (%).
- Tabla: SKU · producto · sugerido (paquetes) · origen · `k` · monto aprox.; total en pesos.
- **Medición**: "La semana pasada sugerimos X; desde entonces pidió Y" por SKU con diferencia, y un resumen (monto
  sugerido vs pedido).
- Avisos: SKUs que la receta pide pero están inactivos o sin mapeo; si la tienda falló (POS no respondió), el motivo.

Envío: desde la ruta, con el mismo servicio de correo que usan las funciones (`CORREO_URL` + `CORREO_LLAVE`, variables
que el usuario agrega en Vercel). **Excepción documentada**: aunque el portal todavía no manda correos externos
(`COM_EFECTOS_EXTERNOS` apagado hasta el cutover), este correo sale porque solo va a esas dos direcciones internas. Si
faltan las variables, la corrida se guarda y la bitácora dice "correo no configurado".

## 8. Errores

- Una tienda que falla (POS, puente) no detiene a las demás: su corrida queda `error` con el motivo y el correo lo dice.
- Sin pedidos o sin ventas: se reporta en el correo; no se inventa cadencia ni consumo.
- El correo nunca lleva datos de clientes del POS; solo cantidades y montos por SKU.

## 9. Pruebas

- Unitarias (puras) del cálculo: cadencia (mediana, cotas, pocos pedidos), calibración (cotas, sin historia), fuera de
  receta, ya pedido, arrastre (positivo, negativo, tolerancia, cota), exclusión de inactivos, conversión insumo→SKU.
- Del correo: tabla, medición contra la semana anterior, avisos, escape de HTML.
- De la ruta: autenticación de cron, una tienda falla y las demás siguen, idempotencia por semana, sin variables de
  correo.
- Migración: tablas, permisos (la guardia de lecturas) y carga inicial.

## 10. Decisiones abiertas para después del piloto

Pantalla para editar el mapeo y ver la sugerencia; envío al franquiciatario (correo o borrador en Shopify); consumibles
por ticket en lugar de historial; inventario de la tienda; ampliar a más tiendas.
