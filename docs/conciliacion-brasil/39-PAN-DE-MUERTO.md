# 39 · Pan de Muerto: alta por lote con el brief a franquiciatarios

**Estado:** **APLICADO en producción el 2026-10-29 a las 23:29 UTC**, con aprobación de Carlo:

- ejecución `ef6515ba…`;
- bitácora #1415–1450.

Falta el lote de enlaces (POS y Rappi), que requiere aprobación aparte.

Fecha: 2026-10-29. Carlo pidió dejar con receta todos los productos que se venden, uno por uno, empezando por el Pan de
Muerto. Lo que no tenía receta en las 13 sucursales configuradas, del 15 al 29 de octubre:

| Producto      | Unidades | Venta   | Sucursales |
| ------------- | -------- | ------- | ---------- |
| Pan de Muerto | 262      | $17,014 | 13         |

El Pan de Muerto es el producto sin receta que más vende. Le siguen el Generic de Rubén Darío, el Espresso Tonic y Zoé.
Fuente: «Brief_Pan_de_Muerto_Franquiciatarios_4.pdf» (sha256 `0fb76669…`), comunicado de temporada 2026.

## Lo que dice el brief

| Pan                       | Peso y acabado                  | Presentación | Precio base de proveedor |
| ------------------------- | ------------------------------- | ------------ | ------------------------ |
| Pan de Muerto Tradicional | 100 g, con mantequilla y azúcar | Blíster de 8 | $15.86 por pieza         |
| Pan de Muerto de Naranja  | 100 g, con ganache de naranja   | Blíster de 4 | $24.45 por pieza         |

- **Precio de red con IVA, igual para los dos:** $65 en mostrador y $80 en Rappi.
- **Precio máximo ideal por pieza:** $28.02, con 50 % de margen.
- **Proveedor:** uno local en cada plaza.

## Decisiones

- **Alta por lote** (Carlo: «Tú por lote»), con el cargador de altas del doc 31.
- **El POS cobra los dos panes con el mismo producto** («Pan de Muerto», `PANMUEAPP`), según Carlo. El enlace de ese
  código va en un lote aparte y tiene que elegir uno de los dos panes (ver «Siguiente paso»).

Valores que propone el lote, para revisión:

- **Insumos:**
  - categoría PANADERIA, como el resto del pan por pieza;
  - proveedor «POR ASIGNAR», porque cada plaza tiene el suyo;
  - presentación de 1 pieza, como el resto de la panadería.
- **Productos:**
  - pieza + bolsa para pan + etiqueta, igual que Croissant Traditional y Kouign Amann;
  - categoría Bakery;
  - precio de lista de $65, el de mostrador.
- **Combo «True White + Pan de Muerto»** (`TRUPANAPP`, vendido en Rubén Darío a $155):
  - True White Chica + pan tradicional + bolsa + etiqueta, igual que «True White + Pain Au Chocolat»;
  - sin precio de lista, como los demás combos (doc 37).

## Lote `pan-de-muerto-lote-1`

`39-pan-de-muerto-lote-1.manifiesto.json` (sha256 `2c1c4afc…`).

| Alta                             | Composición                                                    | Costo    | Precio de lista |
| -------------------------------- | -------------------------------------------------------------- | -------- | --------------- |
| Insumo PAN DE MUERTO TRADICIONAL | $15.86 / 1 pza · POR ASIGNAR · PANADERIA                       | $15.86   | —               |
| Insumo PAN DE MUERTO DE NARANJA  | $24.45 / 1 pza · POR ASIGNAR · PANADERIA                       | $24.45   | —               |
| Pan de Muerto Tradicional        | pan + bolsa ($1.30) + etiqueta ($0.8504)                       | $18.0104 | $65             |
| Pan de Muerto de Naranja         | pan + bolsa + etiqueta                                         | $26.6004 | $65             |
| True White + Pan de Muerto       | True White Chica ($14.74) + pan tradicional + bolsa + etiqueta | $32.7504 | —               |

## Cambio al cargador

`altas-productos.ts` ahora acepta, de forma opcional:

- **insumos nuevos** en el mismo lote;
- **precio de lista** por tamaño.

Los lotes anteriores no cambian: no traen ninguno de los dos.

| Garantía     | Insumos nuevos                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Estado       | Se crean solo si no existe ninguno del lote. Si ya existen todos e idénticos, es «sin cambio»; cualquier mezcla detiene todo  |
| Verificación | Proveedor, categoría, costo, presentación y unidad iguales al manifiesto                                                      |
| Bitácora     | Un registro por insumo y uno por precio de lista, además de los de siempre                                                    |
| Huellas      | El resto de los insumos no cambia                                                                                             |
| Reversión    | Borra los productos y los insumos de la ejecución, si no hubo ediciones posteriores y si ninguna otra receta usa esos insumos |

**Pruebas:** `tests/db/altas-productos.test.ts`, 15 en total (6 nuevas):

- validación;
- ensayo con la bitácora exacta;
- aplicar y repetir;
- cambio de precio;
- estado mezclado;
- reversión, también cuando otra receta usa el insumo.

## Ensayo local

Sobre una copia del respaldo `2026-10-29T1659Z`, borrada al terminar. Los informes están en el respaldo privado
(`informes-pan-de-muerto-lote-1/ensayo-local`).

| Paso     | Resultado                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ensayo   | 2 insumos y 3 productos creados con el costo esperado; 36 registros de bitácora propios y 0 ajenos; resto sin cambios; ROLLBACK |
| Aplicar  | Lo mismo, con COMMIT                                                                                                            |
| Repetir  | 2 insumos y 3 productos «sin cambio», 0 registros                                                                               |
| Revertir | 3 productos y 2 insumos borrados, 34 registros. Recetas e insumos quedan idénticos al respaldo (mismo md5)                      |

## Procedimiento remoto (cada paso requiere aprobación)

1. ~~Respaldo lógico verificado~~ (hecho, aprobado por Carlo: «dale con el respaldo y el ensayo»).
2. ~~Ensayo remoto con ROLLBACK~~ (hecho, limpio):
   `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote pan-de-muerto-lote-1 --usuario <uuid-perfil>`
3. ~~Aplicar~~ (hecho a las 23:29 UTC, aprobado por Carlo: «Sí, aplícalo»):
   `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
4. ~~Verificar con una conexión nueva y repetir el ensayo~~ (hecho: «sin cambio»).

**Respaldo `2026-10-29T2325Z`**, restaurado en local (`resp2325`):

- `pg_restore` con 8 errores, todos de `vault`, como en los respaldos anteriores.
- `verificar-restauracion.ts`: funciones, políticas, membresías y `v_resumen` bajo RLS iguales a producción.
- Las 13 tablas de Costeo, comparadas fila por fila en UTC, son idénticas a producción: recetas, insumos, tamaños,
  líneas, cantidades, bitácora, enlaces POS, catálogos, precios manuales y perfiles.
- Solo difieren `auth` (sesiones activas) y la secuencia de `rappi_corridas`, por una corrida del cron después del
  respaldo.

**Ensayo remoto con ROLLBACK** (23:27 UTC):

| Resultado        | Valor                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Creados          | 2 insumos y 3 productos, con el costo esperado ($18.0104, $26.6004 y $32.7504)                                         |
| Problemas        | 0                                                                                                                      |
| Bitácora         | 36 propios, 0 ajenos                                                                                                   |
| Resto de la base | sin cambios                                                                                                            |
| Transacción      | ROLLBACK. Con una conexión nueva siguen 174 recetas y 165 insumos, ninguno de Pan de Muerto, y la bitácora hasta #1378 |

El informe se guardó fuera del repo, en el respaldo privado.

## Aplicación en producción (2026-10-29 23:29 UTC, aprobada por Carlo)

Antes de aplicar se comprobó que producción seguía igual que en el ensayo: 174 recetas, 165 insumos, ninguno de Pan de
Muerto y la bitácora hasta #1378.

| Paso              | Resultado                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aplicar           | 2 insumos y 3 productos creados con el costo esperado y 0 problemas; 36 registros propios y 0 ajenos; resto sin cambios; COMMIT                                                                                          |
| Conexión nueva    | 174 → 177 recetas y 165 → 167 insumos. Los panes quedan en Bakery, con 3 líneas y $65 de lista; el combo, en Combos, con 7 líneas y sin lista. Todos activos. Insumos: POR ASIGNAR, PANADERIA, $15.86 y $24.45 por pieza |
| Bitácora          | #1415–1450: 36 filas, exactamente las del lote                                                                                                                                                                           |
| Repetir el ensayo | 2 insumos y 3 productos «sin cambio», 0 registros, ROLLBACK                                                                                                                                                              |

La ejecución completa y el comando de reversión están en el respaldo privado
(`informes-pan-de-muerto-lote-1/REVERSION.md`). La reversión solo borra si no hubo ediciones posteriores ni enlaces, y
requiere aprobación.

## Lote 7 de enlaces: POS y Rappi

**Estado:** preparado y ensayado en local. **Sin cargar**: el ensayo remoto y la carga requieren aprobación de Carlo
(«Si prepáralo» autoriza solo prepararlo).

`39-lote-7.csv` y `39-lote-7.manifiesto.json` (sha256 `66630760…`), con el cargador de enlaces del doc 17. Requiere el
lote 6, y por él los lotes 1 a 5: los 98 enlaces actuales deben seguir intactos.

| Código           | Receta                     | Nombre observado                       | Por qué                                                                |
| ---------------- | -------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `PANMUEAPP`      | Pan de Muerto Tradicional  | Pan de Muerto                          | El POS cobra los dos panes con este producto: se enlaza al pan base    |
| `RAPPIPANMUENAR` | Pan de Muerto de Naranja   | Pan de Muerto con Glaseado de Naranja. | Rappi sí lo separa y no tiene código en el POS: código propio de Rappi |
| `TRUPANAPP`      | True White + Pan de Muerto | True White + Pan de Muerto             | El combo del POS (Rubén Darío)                                         |

- El de Naranja vendido en mostrador queda costeado como Tradicional, $8.59 por debajo de su costo, hasta que el POS
  tenga un producto aparte para él.
- `RAPPIPANMUENAR` no lo usa el POS. Solo lo produce el traductor de Rappi (`lib/sucursales/rappi-pos.ts`), que ahora
  manda «Pan de Muerto Tradicional» a `PANMUEAPP` y «Pan de Muerto con Glaseado de Naranja» a `RAPPIPANMUENAR`. La
  parte del combo «Pan de Muerto Tradicional + True White» también queda enlazada: el combo se arma con True White y el
  Tradicional, como los demás combos de Rappi (doc 04).

**Pruebas:**

- `tests/db/lotes-aprobados.test.ts`: los 3 códigos, sus nombres observados y los 98 enlaces previos;
- `tests/portal/rappi-pos.test.ts`: la traducción de Rappi.

**Respaldo `2026-10-29T2340Z`**, tomado después de aplicar `pan-de-muerto-lote-1`. Restaurado en `resp2340`, con 8
errores, todos de `vault`. Las 13 tablas de Costeo son idénticas a producción.

**Ensayo sobre una copia del respaldo**, borrada al terminar. Los informes están en el respaldo privado
(`informes-sku-lote-7/ensayo-local`).

| Paso     | Resultado                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Ensayo   | 3 altas y 0 problemas; los 98 previos intactos; 3 registros propios en la bitácora y 0 ajenos; ROLLBACK |
| Cargar   | Lo mismo, con COMMIT: 98 → 101 enlaces                                                                  |
| Repetir  | 3 «sin cambio» y 0 registros                                                                            |
| Revertir | 3 bajas: la tabla de enlaces queda idéntica al respaldo (mismo md5)                                     |

### Procedimiento remoto (cada paso requiere aprobación)

1. Ensayo remoto con ROLLBACK:
   `npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --lote lote-7 --usuario <uuid-perfil>`
2. Cargar: `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
3. Verificar con una conexión nueva y repetir el ensayo («sin cambio»).
4. Merge del PR: el traductor de Rappi empieza a usar los dos códigos.
