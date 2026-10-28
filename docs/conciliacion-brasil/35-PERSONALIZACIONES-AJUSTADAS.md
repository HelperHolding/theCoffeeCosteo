# 35 · Personalizaciones con ajuste calculado en el costeo de Sucursales (etapa 1b)

**Estado:** código y migración 26 preparados el 2026-10-28, con pruebas y ensayo local. **La migración 26 no está aplicada en producción y el PR no está mergeado.** Cada paso remoto requiere aprobación expresa de Carlo.

Sigue al doc 33 (etapa 1, personalizaciones neutras). Esta etapa calcula las personalizaciones que **sí cambian la receta**, pero cuyo efecto se conoce sin pedir datos a Operaciones ni a Compras.

## Qué cambia

**`personalizaciones-verificadas.ts`** agrega `PERSONALIZACIONES_AJUSTADAS`: una lista explícita por receta, con 33 recetas y 49 pares. Cada par dice cómo cambia la receta:

| Personalización | Ajuste | Recetas |
|---|---|---|
| Lactose free / Lactose free (Gelato) | LECHE ENTERA → LECHE DESLACTOSADAS, misma cantidad | 28 recetas con leche entera directa en todos sus tamaños |
| More / Less / Average Vanilla (N ml) | jarabe de vainilla = N ml (cantidad total) | Iced Vanilla, Ichigo Matcha, Vanilla Latte, Matcha Vanilla Latte |
| Without Sprinkles | chips de chocolate = 0 | Iced Vanilla, Iced Chocolate |
| No ginger | jarabe de jengibre = 0 | Black Ginger |
| Cold brew - White / Kraft; Hot Drip White / Kraft | grano BLACK → WHITE o KRAFT, mismos gramos | Cold brew, Hot Drip V60 |

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

| | Costeo completo de la venta enlazada |
|---|---|
| `main` hoy (#47) | $215,832 (24.0 %) |
| Esta rama, solo con la migración 25 | $217,999 (24.2 %) |
| **Esta rama con la migración 26** | **$282,354 (31.4 %)** |

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

## Para llevarlo a producción (cada paso requiere aprobación)

1. Respaldo de la definición actual de `sucursales_datos_costeo` (la de la migración 25).
2. Ensayo remoto de la migración 26 con ROLLBACK: claves anteriores idénticas, 12 sustitutos y permisos sin cambio.
3. Aplicar la migración 26 y registrarla en `supabase_migrations`.
4. Merge del PR y verificación del despliegue.

El código funciona antes y después de la migración, así que el orden 3 → 4 o 4 → 3 no rompe nada.
