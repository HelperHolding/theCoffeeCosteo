# 35 · Personalizaciones con ajuste calculado en el costeo de Sucursales (etapa 1b)

**Estado:** ✅ **migración 26 aplicada el 2026-10-28 y verificada** (ver «Aplicación de la migración 26»). El PR (código de la etapa 1b) **no está mergeado**: el merge requiere aprobación expresa de Carlo. Hasta el merge, producción tiene la migración pero no usa los sustitutos.

Sigue al doc 33 (etapa 1, personalizaciones neutras). Esta etapa calcula las personalizaciones que **sí cambian la receta**, pero cuyo efecto se conoce sin pedir datos a Operaciones ni a Compras.

## Qué cambia

**`personalizaciones-verificadas.ts`** agrega `PERSONALIZACIONES_AJUSTADAS`: una lista explícita por receta, con 33 recetas y 49 pares. Cada par dice cómo cambia la receta:

| Personalización                                   | Ajuste                                             | Recetas                                                          |
| ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Lactose free / Lactose free (Gelato)              | LECHE ENTERA → LECHE DESLACTOSADAS, misma cantidad | 28 recetas con leche entera directa en todos sus tamaños         |
| More / Less / Average Vanilla (N ml)              | jarabe de vainilla = N ml (cantidad total)         | Iced Vanilla, Ichigo Matcha, Vanilla Latte, Matcha Vanilla Latte |
| Without Sprinkles                                 | chips de chocolate = 0                             | Iced Vanilla, Iced Chocolate                                     |
| No ginger                                         | jarabe de jengibre = 0                             | Black Ginger                                                     |
| Cold brew - White / Kraft; Hot Drip White / Kraft | grano BLACK → WHITE o KRAFT, mismos gramos         | Cold brew, Hot Drip V60                                          |

**Fuera, a propósito:**

- «Lactose free» en Americano y Cold brew: no llevan leche, así que la agregan.
- Todo lo que pide datos a Operaciones o Compras: shots, miel, leches vegetales, More/Less de jarabes sin ml y Chipotle Mayo. Es la etapa 2 y 3 del Excel de pendientes.

**`costeo.ts`:** `ajustePersonalizaciones` calcula la diferencia de costo con las líneas directas de la receta en ese tamaño (migración 25) y el costo actual del insumo nuevo. Ese costo sale de la propia receta o de la lista de sustitutos (migración 26).

- La línea es completa si cada personalización es neutra o tiene un ajuste que se pudo calcular.
- El costo de la línea es el costo de la receta más esa diferencia.
- Queda **parcial** si falta un dato: no hay líneas, el insumo no está en la receta o falta el costo del sustituto.
- Queda **parcial por costo** si el insumo que se agrega está inactivo.

**Migración 26** (`20261028000026_sucursales_costeo_sustitutos.sql`):

- `create or replace` de `sucursales_datos_costeo`, con la misma firma y el mismo permiso que la 25.
- Agrega la clave `sustitutos`: el costo unitario y si está activo, de una **lista cerrada de 12 insumos**:
  - las 8 leches: entera, deslactosada, avena, almendra y coco, normales y Califia;
  - los 3 granos de 1.5 kg: BLACK, WHITE y KRAFT;
  - miel.
- Quien ve el Costeo de una sucursal no recibe el resto de la lista de compras. Cambiar la lista exige otra migración.
- La misma lista sirve después para la etapa 3 (leches vegetales y miel).

**`costeo-servidor.ts`:** lee `sustitutos`. Si la migración 26 no está aplicada, la clave no viene y esas líneas siguen parciales, como hoy.

**Consumo (doc de GDL) no cambia:** sigue con solo las neutras. Que use también los ajustes, por ejemplo para descontar deslactosada en lugar de entera, es trabajo de esa sesión.

## Efecto (ventas del 28-sep al 25-oct, 3 sucursales, código de esta rama)

|                                     | Costeo completo de la venta enlazada |
| ----------------------------------- | ------------------------------------ |
| `main` hoy (#47)                    | $215,832 (24.0 %)                    |
| Esta rama, solo con la migración 25 | $217,999 (24.2 %)                    |
| **Esta rama con la migración 26**   | **$282,354 (31.4 %)**                |

El margen bruto teórico de las líneas completas pasa de 59.2 % a 63.4 %. No es que cambien los costos: entran más bebidas a la mezcla. Hoy la deslactosada cuesta lo mismo que la entera ($0.022/ml), así que «Lactose free» no cambia el costo; si Compras cambia su precio, el ajuste lo refleja.

## Verificación

- **`tsc`** limpio.
- **Pruebas del portal:** ajustes de deslactosada, vainilla, sin chispas y combinaciones; parcial sin sustitutos, sin líneas o sin ajuste para esa receta; sustituto inactivo → parcial por costo; integridad de la lista; lectura de `sustitutos` en el servidor.
- **PGlite:** la migración 26 devuelve solo la lista cerrada, no cuela otros insumos y mantiene el permiso.
- **Ensayo local** sobre una copia del respaldo `2026-10-28T2001Z`, con la 25 y luego la 26 aplicadas:
  - IVA, enlaces, costos, recetas Únicas y las 529 líneas quedan con el mismo md5 antes y después de la 26;
  - `sustitutos` trae los 12 insumos con su costo actual;
  - los permisos de ejecución no cambian.

  La copia se borró.

## Respaldo y ensayo remoto (2026-10-28, 20:47 UTC, autorizados por Carlo)

Desde el código de este PR en `cefad9c`. **No se aplicó nada.**

| Paso                                   | Resultado                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Respaldo**                           | Definición y ACL de `sucursales_datos_costeo` guardadas fuera del repo. md5 de la definición: `c6a33df3…`, idéntico al de la migración 25 aplicada en la copia local. ACL: `postgres`, `authenticated` y `service_role` con EXECUTE. 25 migraciones registradas                                                                                                                                                         |
| **Ensayo** (una transacción, ROLLBACK) | La RPC, llamada como Carlo en la 532 y en la 612, antes y después de la 26 dentro de la transacción: `iva`, `enlaces`, `costos`, `unicas` y `lineas` (529) con el **mismo md5**. Se agrega `sustitutos` con los 12 insumos y su costo actual (leche entera y deslactosada $0.022/ml; avena, almendra y coco $0.032; Califia $0.042–0.0564; granos BLACK $0.50/g, WHITE $0.40, KRAFT $0.4267; miel $0.098/ml). ACL igual |
| **Conexión nueva después**             | Definición igual al respaldo, ACL igual y 25 migraciones: no persistió nada                                                                                                                                                                                                                                                                                                                                             |

Para revertir después de aplicar, basta ejecutar el respaldo: es el `create or replace` de la versión de la migración 25.

## Para llevarlo a producción (cada paso requiere aprobación)

1. ~~Respaldo de la definición actual~~ hecho (arriba).
2. ~~Ensayo remoto con ROLLBACK~~ hecho (arriba).
3. ~~Aplicar la migración 26~~ hecho (abajo).
4. Merge del PR y verificación del despliegue.

El código funciona antes y después de la migración, así que el orden 3 → 4 o 4 → 3 no rompe nada.

## Aplicación de la migración 26 (2026-10-28, autorizada por Carlo)

Carlo autorizó aplicar únicamente la migración 26, ensayada con el código de este PR en `cefad9c`. Una sola transacción, sin reintentos.

| Paso                    | Resultado                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vigencia**            | Justo antes: función = versión de la 25 (md5 `c6a33df3…`), 25 migraciones registradas, sin la 26                                                                                 |
| **Aplicar**             | `create or replace` del archivo del commit (LF) y registro en `supabase_migrations.schema_migrations` (`20261028000026`, `sucursales_costeo_sustitutos`) en la misma transacción |
| **Verificación dentro** | La RPC como Carlo en la 532 y en la 612: claves anteriores con el mismo md5, 529 líneas y 12 sustitutos; ACL igual → **COMMIT**                                                  |
| **Conexión nueva**      | Definición nueva (md5 `d9911a19…`), ACL igual (`postgres`, `authenticated`, `service_role`), 26 migraciones con la 26 registrada; la RPC devuelve 529 líneas y 12 sustitutos     |

- La migración 25 quedó registrada con saltos de línea CRLF y la 26 con LF (el contenido del commit). Solo cambia el texto guardado, no la versión ni el efecto.
- **Reversión** (solo con aprobación): ejecutar el respaldo de la función (fuera del repo, `funciones/…-sucursales_datos_costeo-antes-26.sql`), que es la versión de la 25, y borrar el registro `20261028000026`. El código funciona sin `sustitutos`: esas líneas vuelven a parcial.

## Shots (2026-10-30, regla de Carlo)

Regla final de Carlo (2026-10-30): **«Single Shot (18ml)» y «Double shot (36ml)» usan los mismos 18 g de café**, que es
lo que ya dicen las recetas de espresso; lo que cambia es la preparación. **«Extra Double shot (36ml)» usa 36 g.** Rappi
manda las mismas opciones («Café: Single / Double / Extra Double Shot»).

Antes de la regla final se aplicaron dos versiones que Carlo corrigió el mismo día: primero Double = 18 g, Single = 9 g
y Extra Double = 36 g; después Single = 18 g, Double = 36 g y Extra Double = 72 g (#69 y #70). Esta reemplaza a las dos.

Se aplica a las 29 recetas ligadas al POS que llevan 18 g de café en grano directo en todos sus tamaños: lattes, True
White, Americano, frappés con espresso, los dos Pure Black y sus combos.

- `Single Shot (18ml)` → neutra: es la receta.
- `Double shot (36ml)` → neutra: también es la receta.
- `Extra Double shot (36ml)` → el café queda en 36 g.

Quedan fuera, a propósito:

- **Hot Drip V60:** es café filtrado.

Las recetas no cambian: el Pure Black (Double Shot) lleva 18 g, que con esta regla es correcto.

El Cold brew no cambia: lleva 100 ml de concentrado en los dos tamaños (20 g de café), con la proporción del concentrado
de 200 g por 1 L, y eso ya está en su receta.

**Efecto en Namóra (POS + Rappi, del 23 al 29 de octubre):**

- las unidades que entran a Consumo pasaron de 217 (de 869) a 556 (de 937, contando los combos por sus productos, #72);
- el café White: 6.14 kg (POS 3.88 kg y Rappi 2.27 kg) con la regla final.

El shot era lo que más dejaba fuera.
