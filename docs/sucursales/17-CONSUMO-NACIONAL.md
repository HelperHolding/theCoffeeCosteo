# 17 · Consumo nacional de ingredientes por mes

Fecha: 2026-11-04. Sebastián pidió, dentro del Tablero México, un tablero de consumo de ingredientes a nivel nacional,
con un botón por mes y empezando por octubre. Sirve para planear compras y abasto: cuánto se consumió de cada
ingrediente en México en un mes y cómo se reparte por ciudad y sucursal. Diseño: `docs/superpowers/specs/2026-11-04-consumo-nacional-design.md`.

## Qué muestra

En `/sucursales/mexico`, pestaña **Consumo** junto a la vista de ventas (`?vista=consumo`). Cada usuario ve la suma de
sus sucursales; con todas, es México.

1. **Mes y origen:** un botón por cada mes calculado (abre en el último) y el filtro Todo / Mostrador / App / Rappi.
   «Todo» suma todos los orígenes guardados, `desconocido` incluido, igual que la página de cada sucursal.
2. **Números clave:**
   - ingredientes con consumo;
   - sucursales incluidas, y cuántas tienen el mes incompleto;
   - cobertura: líneas que entran al consumo entre líneas vendidas;
   - **Vs <mes anterior>:** `▲ N · ▼ M`, los ingredientes que subieron más de 3 % y los que bajaron más de 3 %. No hay
     cambio total porque las unidades son distintas (kg, L, piezas).
3. **Avisos** (`role="status"`):
   - mes incompleto en alguna sucursal;
   - el mes anterior tiene menos sucursales calculadas que el actual: «compara conjuntos distintos».
4. **Tabla por categoría** (INGREDIENTES, PERECEDEROS, INSUMOS…), una fila por ingrediente:
   - consumo nacional en su unidad;
   - **presentaciones de compra:** consumo / `presentacion` del insumo, con su descripción (p. ej. «312 × 1 kg»). Sin
     presentación o con presentación 0, solo la cantidad. En teléfono las presentaciones van en una segunda línea bajo
     el consumo;
   - cambio contra el mes anterior.
5. **Desglose:** al abrir un ingrediente, su reparto por ciudad y por sucursal con su parte del total.
6. **Sin receta:** productos vendidos que no se pudieron contar, sumados entre sucursales, con sus unidades, para
   corregir enlaces o recetas.
7. **Exportar a Excel:** el mes y filtro que se ven. Hoja de resumen (categoría, ingrediente, unidad, consumo,
   presentación, presentaciones, cambio) y hoja por sucursal × ingrediente. Archivo `consumo-nacional-AAAA-MM-<origen>.xlsx`.

Mes sin calcular: no aparece como botón. Sin ningún mes calculado, la pestaña explica cómo calcularlo. Usa los colores y
el movimiento del Tablero México (movimiento reducido respetado) y se ve bien en 375 px.

## Cómo funciona

```
scripts/sucursales/consumo-mes.ts --mes 2026-10        (llave de servicio de .env.local)
   ├─ sucursales_recetas_consumo_datos()               ← recetas, una vez por corrida
   └─ por sucursal, UNA POR UNA: leerDias + conRappi → consumir por origen
        └─ sucursales_guardar_consumo_mes              ← borra y escribe ese mes y esa sucursal, en una transacción
             └─ sucursales_consumo_mes / _mes_sucursal
/sucursales/mexico?vista=consumo
   └─ /api/sucursales/consumo-nacional                 (sesión del usuario)
        └─ sucursales_consumo_nacional                 (sucursales_acceso en la base)
   └─ /api/sucursales/consumo-nacional/desglose        (al abrir un insumo o exportar)
        └─ sucursales_consumo_desglose
```

- **Migración 38** (`20261105000038_sucursales_consumo_mes.sql`):
  - `sucursales_consumo_mes`: un renglón por mes, sucursal, origen e insumo, con solo cantidades (nunca dinero). Sin FK
    al insumo: el renglón sobrevive si se desactiva; nombre, unidad y categoría van copiados;
  - `sucursales_consumo_mes_sucursal`: por mes y sucursal, `calculado_en`, `recetas_leidas_en`, `completa`,
    `cobertura` y `sin_receta` por origen;
  - las dos tablas están cerradas al portal y solo se leen por las dos RPC, con el mismo acceso por sucursal del resto
    del módulo. Escribe solo `service_role`;
  - `sucursales_recetas_consumo_datos()`: el cuerpo de `sucursales_recetas_consumo` pasa a una función interna solo
    para `service_role`. Con la llave de servicio no hay `auth.uid()`, así que la de portal devolvería `null`; la de
    portal conserva firma, permiso y comportamiento.
- **Lógica** (`lib/sucursales/consumo-mes.ts`): función pura que recibe pedidos y recetas y devuelve renglones; se prueba
  sin API. `consumo-mes-servidor.ts` recorre las sucursales y guarda; el script solo lee, llama y escribe.
- **Rutas y vista:** `lib/sucursales/consumo-nacional.ts` arma la respuesta de las RPC (el filtro de origen se aplica
  ahí), `consumo-excel.ts` arma las hojas, `components/sucursales/consumo-nacional.tsx` es la vista y
  `vistas-mexico.tsx` las dos pestañas. `lib/supabase/database.types.ts` ganó las firmas de las dos RPC de lectura.
- **Por qué Rappi se lee día por día:** PostgREST corta cada respuesta en 1,000 filas. Un mes de Rappi de una sucursal
  grande las pasa y el consumo saldría bajo sin avisar. Cada día se pide por separado, y si un día falla todo el
  periodo queda como lectura parcial (nunca pedidos perdidos en silencio).
- **Por qué las sucursales van una por una:** cada sucursal ya lee sus 31 días con 4 lecturas a la vez, que es lo que
  aguanta el proveedor. Más sucursales a la vez solo hacen esperar y agotar lecturas, como pasó en el historial del
  corte (doc 16).
- **Sucursal sin leer:** no se escribe y conserva su cálculo anterior; el script la lista al final.
- **Días incompletos:** se escribe con `completa = false` y el tablero lo avisa.
- **Receta vigente:** el cálculo usa la receta de cuando corre. Si una receta cambia, se vuelve a correr el mes;
  `recetas_leidas_en` lo deja visible.
- **Tiempo esperado:** unos 6 a 8 minutos por mes con 79 sucursales.

## Mismas cifras que cada sucursal

El cálculo es `consumir`, el de la sección Consumo de cada sucursal (tamaños, personalizaciones, combos y Rappi del
portal con `piloto = rappiPortal`). Se corre una vez por origen: cada vez con los pedidos de ese origen y, como
evidencia, **todos los del mes**, así que la identidad de línea es la misma que en la página. La suma nacional de un
mes es la suma de las páginas de cada sucursal en ese mes.

## Verificación

- `tests/db/sucursales-consumo-mes.test.ts` (PGlite): tablas cerradas, RPC solo con las sucursales del usuario, suma
  por insumo y origen, reemplazo de un mes y función interna de recetas no llamable como `authenticated`.
- `tests/portal/consumo-mes.test.ts`: la suma de los orígenes es igual a `consumir` con todos los pedidos (Mostrador,
  App y Rappi del portal, combos y personalizaciones); cobertura y sin receta por origen; lectura parcial marcada
  incompleta; sin pedidos, sin renglones; lectura de `AAAA-MM`; solo meses cerrados; Rappi día por día.
- `tests/portal/consumo-mes-servidor.test.ts`: recorrido de sucursales una por una, sucursal sin leer no se escribe,
  incompletas, mes no cerrado.
- `tests/portal/consumo-nacional.test.ts`: armado por insumo y origen, categorías, presentaciones, cambio contra el
  mes anterior (sin mes anterior no hay cambio, no es cero), filtro de origen y desglose por ciudad y sucursal.
- `tests/portal/consumo-excel.test.ts`: las hojas del Excel.
- `tests/portal/consumo-nacional-ui.test.tsx`: la vista, sus avisos y el KPI de cambio.
- **Prueba visual con datos sintéticos** (`npm run prueba:visual`, `tests/portal/vista/tablero-mexico.tsx`), en
  escritorio, 375 px y modo día y noche.
- **Paridad real:** pendiente, ver paso 4.

## Límites conocidos

- Si algo lanza al guardar, la corrida se detiene. Las sucursales ya guardadas quedan; volver a correr el mes las
  reemplaza.
- La columna «sucursales» de cada insumo es el máximo por origen, no un conteo de sucursales distintas.

## Pasos en producción (cada uno con OK)

1. **Merge del PR**, que aplica la migración 38. Antes, ensayo con ROLLBACK.
2. **Correr octubre** (lo hace Sebastián). Escribe en la base de `.env.local` con la llave de servicio:

   ```bash
   npx.cmd tsx --conditions=react-server scripts/sucursales/consumo-mes.ts --mes 2026-10
   ```

   Con `--companias 513,384` se corren solo algunas sucursales.
3. **Agosto y septiembre**, igual, si se quieren sus botones.
4. **Paridad real:** en 2 o 3 sucursales, comparar el consumo guardado de octubre con su sección Consumo del 1 al 31
   de octubre, insumo por insumo.
5. **Cada mes, al cerrar:** correr el mes. Automatizarlo con el cron queda para después.
