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
   - sucursales calculadas contra las esperadas («75 de 79»), con la nota «N sin calcular» si faltan y cuántas tienen
     el mes incompleto;
   - cobertura: líneas que entran al consumo entre líneas vendidas;
   - **Vs <mes anterior>:** `▲ N · ▼ M`, los ingredientes que subieron más de 3 % y los que bajaron más de 3 %. El
     nombre es el del mes del calendario anterior al activo; si ese mes no está calculado, muestra «—». No hay cambio
     total porque las unidades son distintas (kg, L, piezas).
3. **Avisos** (`role="status"`):
   - mes incompleto en alguna sucursal;
   - solo parte de las sucursales tiene el mes anterior calculado: «N de M sucursales tienen el mes anterior calculado:
     el cambio se calcula solo con esas».
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
   presentación, presentaciones, «Vs mes anterior (%)» con un decimal, p. ej. 25 para +25 %) y hoja por sucursal × ingrediente. Archivo `consumo-nacional-AAAA-MM-<origen>.xlsx`.

Mes sin calcular: no aparece como botón. Sin ningún mes calculado, la pestaña explica cómo calcularlo. Usa los colores y
el movimiento del Tablero México (movimiento reducido respetado) y se ve bien en 375 px.

## Cómo funciona

```
scripts/sucursales/consumo-mes.ts --mes 2026-10        (llave de servicio de .env.local)
   ├─ RPC sucursales_recetas_consumo_datos()           ← recetas, una vez por corrida
   └─ por sucursal, UNA POR UNA: leerDias + conRappi → consumir por origen
        └─ RPC sucursales_guardar_consumo_mes          ← borra y escribe ese mes y esa sucursal, en una transacción
             └─ tablas sucursales_consumo_mes / sucursales_consumo_mes_sucursal
/sucursales/mexico?vista=consumo
   └─ /api/sucursales/consumo-nacional                 (sesión del usuario)
        └─ RPC sucursales_consumo_nacional             (sucursales_acceso en la base)
   └─ /api/sucursales/consumo-nacional/desglose        (al abrir un insumo o exportar)
        └─ RPC sucursales_consumo_desglose
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
- **Sucursal sin leer o que falla:** no se escribe y conserva su cálculo anterior. Si algo lanza al leer, calcular o
  guardar una sucursal, se anota con su motivo y la corrida sigue con la siguiente; el script las lista al final.
- **Catálogo POS:** si no se puede leer, el script se detiene con «No se pudo leer el catálogo POS»: sin él, los
  productos sin código quedarían fuera y las cantidades guardadas saldrían menores. La lectura pagina de 1,000 en
  1,000 (max-rows de PostgREST).
- **Comparación con el mes anterior:** solo cuenta las sucursales que tienen AMBOS meses calculados. La RPC devuelve
  `anterior` y `actual_comun` sobre ese mismo conjunto y `sucursales_anterior` lo cuenta; el cambio es
  `actual_comun / anterior − 1`. Una sucursal que falló este mes no hace parecer más bajo el total, y una nueva no
  hace parecerlo más alto.
- **Repetir sucursales:** las incompletas o fallidas se vuelven a correr con `--companias <ids>` (el script imprime
  la lista); reemplaza solo esas.
- **Días incompletos:** se escribe con `completa = false` y el tablero lo avisa.
- **Receta vigente:** el cálculo usa la receta de cuando corre. Si una receta cambia, se vuelve a correr el mes;
  `recetas_leidas_en` lo deja visible.
- **Tiempo esperado:** ~10 minutos estimados (sin medir aún), más las lecturas de Rappi día por día.

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
  incompletas, mes no cerrado, y una sucursal que lanza no impide guardar la siguiente.
- `tests/portal/corte-catalogo.test.ts`: el catálogo POS se pagina sin truncar.
- `tests/portal/consumo-nacional.test.ts`: armado por insumo y origen, categorías, presentaciones, cambio contra el
  mes anterior sobre el mismo conjunto de sucursales (sin mes anterior no hay cambio, no es cero), filtro de origen y desglose por ciudad y sucursal.
- `tests/portal/consumo-excel.test.ts`: las hojas del Excel, el cambio en porcentaje y la suma de orígenes.
- `tests/portal/consumo-nacional-ui.test.tsx`: la vista, sus avisos y el KPI de cambio.
- **Prueba visual con datos sintéticos** (`npm run prueba:visual`, `tests/portal/vista/tablero-mexico.tsx`), en
  escritorio, 375 px y modo día y noche.
- **Paridad real:** pendiente, ver paso 4.

## Límites conocidos

- El script de cálculo no se prueba de punta a punta (escribe en la base real); sus piezas sí tienen pruebas.
- El tiempo de una corrida de 79 sucursales no se ha medido.

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
