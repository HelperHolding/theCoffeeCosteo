# 41 · Zoé: alta de «Zoe Water Twist» y enlaces de sus códigos POS

**Estado:** el alta quedó **APLICADA** en producción el 2026-10-30: ejecución `8d8fa908…`, bitácora #1597–1602; receta
`902a845f-5a02-4ac7-a424-e64ce036bc9f`, $22. El **lote-9** quedó **CARGADO** el 2026-10-30 con aprobación de Carlo: carga `ba6f95b6…`, 105 → 107
enlaces, bitácora #1605–1606.

Carlo pidió coordinar con el chat «Módulo Sucursales» y subir cuando ese chat diera el OK. Dio el OK el 2026-10-30: no tiene
nada en curso que toque estos archivos, la base ni los productos Zoé.

## Revisión en Zoho (2026-10-30, solo lectura)

**Ventas del POS en Zoho Analytics** («Looker Sucursales», septiembre–octubre):

| Default Code | Producto en el POS | Unidades |
| --- | --- | --- |
| ZOEWATAPP | Zoé Water | 1,867 |
| ZOETWIAPP | Zoe Water Twist | 637 |

**Recetario de Zoho** («Recetario The Coffee Marzo 2026»), que liga los productos por nombre:

- «Zoé Water» → ZOE WATER NATURAL, $18.
- «Zoe Water Twist» → **las dos** botellas Twist, Limón y Jengibre y Frutos Rojos: $44 en lugar de $22. Es el mismo error que
  tenían el Mug y el Félix antes del doc 34.

«Costo y Márgenes Marzo 2026» no trae ninguno de los dos, y el módulo Productos del CRM está vacío.

**Nuestra base** tiene tres productos de una botella cada uno: «Zoé Water Natural», «Zoé Water Twist Limón y Jengibre» y
«Zoé Water Twist Frutos Rojos», todos en BEBIDA CERRADA y tamaño Único. Ningún código Zoé tenía enlace.

## Decisión de Carlo (2026-10-30)

«Si es twist entran los 2 sabores, y si ligalos porfa con el código». El código del POS ZOETWIAPP vende cualquiera de los dos
sabores, sin distinguirlos.

## Lote `altas-zoe-lote-1`

Cargador: `altas-productos.ts`. Manifiesto `41-altas-zoe-lote-1.manifiesto.json`, sha256 `9725327e…`. No hay un archivo de
fuente: el `sha256` de la fuente es la huella de la cadena de evidencia (código, nombre del POS y los dos insumos).

| Alta | Composición | Costo |
| --- | --- | --- |
| Zoe Water Twist (nombre exacto del POS; BEBIDA CERRADA, Único) | ½ ZOE WATER TWIST LIMÓN Y JENGIBRE + ½ ZOE WATER TWIST FRUTOS ROJOS | $22 |

- Media botella de cada sabor deja el costo de **una** botella: los dos sabores cuestan $22 (264 / 12).
- En Consumo, el gasto se reparte entre los dos sabores, que el POS no distingue.
- Los productos de un solo sabor que ya existen no se tocan.
- No lleva precio de lista.

**Ensayo sobre una copia del respaldo `2026-10-30T1851Z`**, borrada al terminar:

| Paso | Resultado |
| --- | --- |
| Ensayo | 1 producto creado con costo $22; 6 registros propios, 0 ajenos; resto sin cambios; ROLLBACK |
| Aplicar | COMMIT |
| Repetir | «sin cambio» |
| Revertir | borrado |

Los informes se guardaron en el respaldo privado, `informes-altas-zoe-lote-1`.

**Ensayo remoto con ROLLBACK** (2026-10-30, aprobado por Carlo). Antes, producción tenía 181 recetas, 105 enlaces y
bitácora hasta #1590, y no existía «Zoe Water Twist».

- Resultado: 1 producto creado con costo $22; 6 registros propios y 0 ajenos; resto sin cambios.
- Con una conexión nueva, producción sigue idéntica, con la misma huella de costos.

**Aplicación** (2026-10-30). Respaldo previo `2026-10-30T1925Z`: 24,115 filas, iguales a producción.

| Paso | Resultado |
| --- | --- |
| Aplicar | 1 producto creado a $22; 6 registros propios (#1597–1602), 0 ajenos; resto sin cambios; COMMIT |
| Conexión nueva | 182 recetas; «Zoe Water Twist» con ½ Frutos Rojos y ½ Limón y Jengibre; costo $22 |
| Repetir ensayo | «sin cambio» |

## Lote-9 de enlaces

| Código POS | Receta |
| --- | --- |
| ZOEWATAPP | Zoé Water Natural (ya existe) |
| ZOETWIAPP | Zoe Water Twist (la crea este alta) |

Requiere el lote-8, con 105 enlaces previos intactos.

Archivos `41-lote-9.csv` y `41-lote-9.manifiesto.json` (sha256 `5d44fa3b…`), fijados en `LOTES_APROBADOS` con
`DOC_LOTE['lote-9'] = '41'`. La prueba de lotes que usaba «lote-9» como ejemplo de lote no aprobado ahora usa «lote-99».

**Respaldo `2026-10-30T1929Z`**, tomado después del alta: 24,128 filas, iguales a producción.

| Paso | Resultado |
| --- | --- |
| Ensayo local (copia del respaldo) | 2 altas; 105 previos intactos; 2 registros; aplicar 105 → 107; repetir «sin cambio»; revertir vuelve a 105 |
| Ensayo remoto (ROLLBACK) | 2 altas, 0 problemas; los 105 previos intactos; 2 registros propios, 0 ajenos; datos comerciales sin cambios; con una conexión nueva sigue en 105 enlaces y bitácora #1602 |

**Carga en producción** (2026-10-30, aprobada por Carlo después de ver el ensayo). Antes se comprobó que producción seguía
igual que en el ensayo.

| Paso | Resultado |
| --- | --- |
| Cargar | 2 altas, 0 problemas; 105 previos intactos; 2 registros propios (#1605–1606), 0 ajenos; datos comerciales sin cambios; COMMIT |
| Conexión nueva | 107 enlaces: ZOETWIAPP → Zoe Water Twist y ZOEWATAPP → Zoé Water Natural, los dos de esta carga |
| Repetir ensayo | 2 «sin cambio», 0 registros, ROLLBACK |

El `carga_id` completo y el comando de reversión están en el respaldo privado (`informes-sku-lote-9/REVERSION.md`).

**Mejora posible del chat «Módulo Sucursales»:** el POS manda el sabor del Twist como opción («Mixed Berries» y «Lemon
Ginger»). Con ajustes en `personalizaciones-verificadas.ts`, Consumo podría contar el sabor exacto en lugar de ½ y ½. Lo
propone ese chat a Carlo.


## Para Zoho

Conviene dejar «Zoe Water Twist» del recetario de Zoho con media botella de cada sabor, o con una sola botella, para que
cueste $22 y no $44. No se carga nada en Zoho: va al documento de cambios para importar a mano.

## Procedimiento remoto (cada paso requiere aprobación)

1. ~~Ensayo remoto del alta con ROLLBACK~~ (hecho, limpio):
   `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote altas-zoe-lote-1 --usuario <uuid-perfil>`
2. ~~Aplicar el alta, verificar y repetir el ensayo~~ (hecho).
3. ~~Preparar, ensayar y cargar el lote-9~~ (hecho: 107 enlaces).
4. Merge del PR.
