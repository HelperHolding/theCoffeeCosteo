# 39 · Pan de Muerto: alta por lote con el brief a franquiciatarios

**Estado:** preparado y ensayado en local. **Sin aplicar en producción**: cada paso remoto (respaldo, ensayo y aplicar)
requiere aprobación de Carlo.

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

1. Respaldo lógico verificado.
2. Ensayo remoto con ROLLBACK:
   `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote pan-de-muerto-lote-1 --usuario <uuid-perfil>`
3. Aplicar: `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
4. Verificar con una conexión nueva y repetir el ensayo («sin cambio»).

## Siguiente paso: enlaces POS y Rappi (lote aparte)

Se prepara después de aplicar, porque necesita los ids de las recetas nuevas:

- **`PANMUEAPP` → Pan de Muerto Tradicional.** Es el pan base de la red. El de Naranja cobrado en mostrador quedará
  costeado como Tradicional, $8.59 menos por pieza, hasta que el POS tenga un producto aparte para él.
- **`TRUPANAPP` → True White + Pan de Muerto.**
- **Rappi** sí separa los dos panes:
  - «Pan de Muerto Tradicional» → `PANMUEAPP`, incluida la parte del combo con True White;
  - «Pan de Muerto con glaseado de naranja» → la receta de Naranja, con un código propio de Rappi, porque no tiene código
    en el POS.
