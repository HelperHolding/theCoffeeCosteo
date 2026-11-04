# Consumo nacional de ingredientes por mes (Tablero México)

Fecha: 2026-11-04. Pedido de Sebastián: un tablero de consumo de ingredientes a nivel nacional, con botón por mes,
empezando por octubre. Subproyecto A; el espacio BI al estilo Zoho Analytics (subproyecto B) va aparte.

## 1. Propósito y alcance

- **Para qué:** planear compras y abasto. Cuánto se consumió de cada ingrediente en México en un mes, y cómo se
  reparte por ciudad y sucursal.
- **Exacto:** mismo cálculo que la sección Consumo de cada sucursal (`consumir`, con tamaños, personalizaciones,
  combos y Rappi del portal). La suma nacional de un mes = la suma de las páginas de cada sucursal en ese mes.
- **Fuera de alcance (después):** comparar contra lo surtido por la comercializadora o inventarios; costo en pesos.
  El diseño guarda cantidades por sucursal e insumo para que esa comparación se pueda agregar sin rehacer nada.

## 2. Enfoque

Consumo **guardado por mes**. Un proceso lee los pedidos del mes de cada sucursal con el código de su página y guarda
el resultado. El tablero solo lee y suma (como el resumen del doc 16). Calcularlo al abrir el tablero (79 sucursales ×
31 días de pedidos) tardaría minutos; se descarta.

## 3. Datos (migración 38)

`sucursales_consumo_mes` — un renglón por mes, sucursal, origen e insumo:

| Columna | Tipo | Nota |
|---|---|---|
| `mes` | date | primer día del mes |
| `company_id` | integer | id de la API |
| `origen` | text | `mostrador`, `app`, `rappi` o `desconocido` (los valores de `Origen`) |
| `insumo_id` | uuid | sin FK: el renglón sobrevive si el insumo se desactiva |
| `insumo`, `unidad`, `categoria` | text | copia al calcular, para leer sin cruzar |
| `cantidad` | numeric | en la unidad del insumo |

Llave primaria `(mes, company_id, origen, insumo_id)`.

`sucursales_consumo_mes_sucursal` — un renglón por mes y sucursal:

- `mes`, `company_id`, `calculado_en`, `recetas_leidas_en`;
- `completa` (boolean): todos los días del mes se leyeron completos;
- `cobertura` (jsonb, por origen): líneas vendidas, líneas que entran al consumo, Generic, sin código y sin enlace (mismas cuentas que `CoberturaConsumo`; en unidades, nunca dinero, como la sección Consumo);
- `sin_receta` (jsonb, por origen): productos vendidos que no se pudieron contar, con sus unidades.

Llave primaria `(mes, company_id)`.

**Acceso:**

- Las dos tablas quedan cerradas al portal: `revoke all` a `anon` y `authenticated`. Solo escribe la llave de
  servicio.
- Se leen por dos RPC, las dos filtran con `sucursales_acceso`, igual que `sucursales_tablero_periodo`:
  - `sucursales_consumo_nacional(p_mes date, p_companias integer[])`: los meses calculados, el consumo nacional sumado
    por insumo y origen (y el del mes anterior), y por sucursal su cobertura y sus productos sin receta. Es ligera:
    unas 600 filas, no 79 × 150 × 4;
  - `sucursales_consumo_desglose(p_mes date, p_companias integer[], p_insumo uuid)`: el consumo por sucursal y origen
    de un insumo (al abrirlo) o de todos con `p_insumo` nulo (para exportar).
- Escribe la RPC `sucursales_guardar_consumo_mes`, solo para `service_role`: borra y escribe un mes de una sucursal
  en una sola transacción.

**Recetas desde el script:** `sucursales_recetas_consumo` exige `auth.uid()` con acceso, y con la llave de servicio
devolvería `null`. La migración separa su cuerpo en una función interna `sucursales_recetas_consumo_datos()`:

- la existente la llama después de comprobar acceso, así que su comportamiento no cambia;
- la interna solo se otorga a `service_role`.

## 4. Proceso de cálculo

`scripts/sucursales/consumo-mes.ts --mes 2026-10 [--companias …]`. Corre con la llave de servicio de `.env.local`, como
`corte.ts`.

- **Recetas:** las lee una vez por corrida desde la función interna. Son las mismas para todas las sucursales. Lee
  también el catálogo POS.
- **Lectura por sucursal:** `leerDias` + `conRappi`, igual que `construirConsumo`, con 4 sucursales a la vez.
- **Cálculo:** `consumir` una vez por origen. Cada vez usa los pedidos de ese origen y, como evidencia, todos los del
  mes, así que la identidad de línea es la misma que en la página. Con `piloto = rappiPortal`, como `construirConsumo`.
- **Escritura por sucursal:** en una sola llamada borra y escribe ese mes y esa sucursal. Volver a correr el mes lo
  reemplaza.
- **Sucursal sin leer:** si no se pudo leer, no se escribe y conserva lo anterior. El script la lista al final.
- **Días incompletos:** si algún día del mes vino incompleto, se escribe con `completa = false` y el tablero lo
  avisa.
- **Receta vigente:** el cálculo usa la receta vigente al correr. Si una receta cambia, se vuelve a correr el mes.
  `recetas_leidas_en` lo deja visible.
- **Tiempo esperado:** unos 6 a 8 minutos por mes con 79 sucursales, según lo medido en el historial del doc 16.

La lógica de cálculo y armado de renglones vive en `lib/sucursales/consumo-mes.ts`, una función pura que recibe pedidos
y recetas y devuelve renglones, y se prueba sin API. El script solo lee, llama y escribe.

## 5. Tablero

Pestaña **«Consumo»** en `/sucursales/mexico`, junto a la vista actual de ventas. La ruta
`/api/sucursales/consumo-nacional?mes=2026-10&origen=todos` usa la sesión del usuario y llama a la RPC.

- **Meses:** un botón por cada mes calculado. Abre en el último (octubre). Filtro Todo / Mostrador / App / Rappi;
  «Todo» (`todos`) suma todos los orígenes guardados, `desconocido` incluido, igual que el filtro de la página.
- **Números clave:**
  - ingredientes con consumo;
  - sucursales incluidas, y cuántas tienen el mes incompleto;
  - cobertura: líneas que entran al consumo entre líneas vendidas (como la sección Consumo);
  - cambio contra el mes anterior, si está calculado.
- **Tabla por categoría** de insumo (INGREDIENTES, PERECEDEROS, INSUMOS…), con una fila por insumo:
  - cantidad nacional en su unidad;
  - **equivalente en presentaciones de compra**: cantidad / `presentacion` del insumo, con su descripción (p. ej.
    «312 × 1 kg»);
  - cambio contra el mes anterior.

  La presentación se lee del catálogo de insumos vigente.
- **Desglose:** al abrir un insumo, su reparto por ciudad y por sucursal, con su parte del total.
- **Sin receta:** lista de productos vendidos que no se contaron, sumados entre sucursales, con sus unidades, para
  corregir enlaces o recetas.
- **Exportar a Excel:** la tabla del mes y filtro actuales (insumo, categoría, unidad, cantidad, presentaciones) y una
  hoja por sucursal × insumo.
- **Estilo:** el del Tablero México (colores por origen, `tablero-mexico.css`), con movimiento reducido respetado.
  Debe verse bien en 375 px.

## 6. Errores y casos límite

- **Mes sin calcular:** no aparece como botón. Sin ningún mes, se muestra cómo calcularlo.
- **Sucursal sin acceso:** no entra en la suma. La suma es de las sucursales del usuario; con todas, es México.
- **Sucursal dada de alta a medio mes:** cuenta solo los días con pedidos y no se marca como incompleta.
- **Insumo sin presentación o con presentación 0:** se muestra solo la cantidad.

## 7. Pruebas

- **Base (PGlite, `tests/db/sucursales-consumo-mes.test.ts`):**
  - tablas cerradas;
  - la RPC solo con sucursales del usuario;
  - suma por insumo y origen;
  - reemplazo de un mes;
  - la función interna no se puede llamar como `authenticated`.
- **Unidad (`tests/portal/consumo-mes.test.ts`):** la suma de los renglones por origen es igual a `consumir` con
  `todos` en pedidos sintéticos (Mostrador, App y Rappi del portal, combos y personalizaciones).
- **Paridad real (antes de dar por bueno octubre):** en 2 o 3 sucursales, el consumo guardado de octubre se compara
  insumo por insumo con la sección Consumo de su página. Como esa página llega a 62 días, se compara octubre
  completo.
- **Visual:** datos sintéticos en `npm run prueba:visual`, en escritorio, 375 px y modo día y noche.

## 8. Pasos en producción (cada uno con OK)

1. Merge del PR; el merge aplica la migración 38. Antes, ensayo con ROLLBACK.
2. `consumo-mes.ts --mes 2026-10` (lo corre Sebastián). Después agosto y septiembre, si se quieren sus botones.
3. Paridad real de §7 y revisión del tablero.
4. Cada mes, al cerrar: correr el script del mes. Automatizarlo con el cron queda para después.
