# 41 · Zoé: alta de «Zoe Water Twist» y enlaces de sus códigos POS

**Estado:** el alta está preparada el 2026-10-30, con manifiesto, prueba, ensayo local y **ensayo remoto limpio**. **Sin
aplicar y sin merge.** El lote-9 de enlaces se prepara cuando el alta esté aplicada, porque necesita el id de la receta nueva. Cada
paso remoto y el merge requieren aprobación expresa de Carlo.

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

## Lote-9 de enlaces (se prepara después del alta)

| Código POS | Receta |
| --- | --- |
| ZOEWATAPP | Zoé Water Natural (ya existe) |
| ZOETWIAPP | Zoe Water Twist (la crea este alta) |

Requiere el lote-8, con 105 enlaces previos intactos.

## Para Zoho

Conviene dejar «Zoe Water Twist» del recetario de Zoho con media botella de cada sabor, o con una sola botella, para que
cueste $22 y no $44. No se carga nada en Zoho: va al documento de cambios para importar a mano.

## Procedimiento remoto (cada paso requiere aprobación)

1. ~~Ensayo remoto del alta con ROLLBACK~~ (hecho, limpio):
   `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote altas-zoe-lote-1 --usuario <uuid-perfil>`
2. Aplicar el alta (`--aplicar --confirmo jpqkmnfjwzniptszjuli`), verificar y repetir el ensayo.
3. Preparar el lote-9 con el id de la receta nueva, ensayarlo en local y en remoto, y cargarlo.
4. Merge del PR.
