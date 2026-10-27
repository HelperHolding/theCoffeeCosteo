# 25 · Nombres de Costeo conforme al POS: cotejo y lote 1

**Estado (2026-10-26): lote preparado y ensayado en una copia local.**
- **Producción:** no se escribió nada; solo hubo lecturas con SELECT acotados.
- **Pendiente:** el ensayo remoto y la aplicación, cada uno con su autorización.
- **API de Brasil:** su respuesta, sus códigos y sus nombres no se modifican. Solo cambia `recetas.nombre` de Costeo.

**Criterio** (autorizado por Carlo). Se adopta el **nombre literal del POS** cuando el caso es claro:
- hay **un solo** candidato local;
- la variante es compatible y los tamaños son coherentes;
- el precio de 532 (Mostrador, sin descuento) y/o la composición concuerdan.

La similitud de texto solo sirvió para **buscar** candidatos; la escritura usa UUID, nombre y versión fijados por fila. Un caso **no** es claro si hay varios candidatos, sabores que comparten código, tamaños incompatibles o contradicciones. Esos casos quedan fuera y se presentan como decisiones concretas (§4).

## 1. Fuentes

| Fuente | Detalle |
|---|---|
| POS | La muestra auditada de fase 2 (`15`, `16`, `20`): sucursales 532, 583 y 612, del 2026-09-21 al 2026-10-18, 5,324 pedidos, **91 códigos de producto**. El precio es la moda de 532 en Mostrador, sin descuento, por vaso. Es evidencia de transacción, no un precio oficial vigente. **No se consultó la API de nuevo**: no hizo falta resolver ningún nombre contradictorio |
| Costeo | Producción, lectura del 2026-10-26: 160 recetas (154 productos activos y 6 subrecetas), tamaños, precios de lista, versión y los 62 enlaces POS |
| Composición | Recetario oficial 2026 (`21-mapa-pdf-recetas.csv`): la ficha de cada receta del lote |

**Archivos:**
- [`25-cotejo-nombres.csv`](25-cotejo-nombres.csv): los 91 códigos, con su clasificación y su motivo.
- [`25-costeo-sin-pos.csv`](25-costeo-sin-pos.csv): los 71 productos activos de Costeo sin equivalente en la muestra.
- [`25-nombres-pos-lote-1.manifiesto.json`](25-nombres-pos-lote-1.manifiesto.json): el lote.

## 2. Resultado: los 91 códigos del POS

| Clasificación | Códigos | Detalle |
|---|---|---|
| **Ya alineado** (nombre idéntico) | **73** | 62 ya enlazados. Los otros 11 tienen el nombre idéntico, pero su enlace espera otras decisiones (§2.2) |
| **Listo para renombrar en este lote** | **8** | §3 |
| **Excepción de presentación aprobada** | **1** | `MISICEDAPP`: el POS trae «Iced Latte +  Ham & Cheese Sandwich» con doble espacio. Costeo conserva un espacio (B7, decisión de Carlo) |
| **Requiere decisión concreta** | **2** | Zoé Water (D9) y Zoe Water Twist (D10), en §4 |
| **Sin receta en Costeo** | **7** | Pan de Muerto, Cookie Matcha & White Chocolate, Espresso Tonic, Spooky Biscuits, Matcha Iced Latte + Lemon Cake, True White + Croissant filled with cheese and ham, True White + Pan de Muerto (grupo F de `16`). No hay nada que renombrar |

**Desde el lado de Costeo:** de los 154 productos activos, **83** tienen código en la muestra y **71 no tienen equivalente observado** (`25-costeo-sin-pos.csv`). Que no aparezcan en 4 semanas de pedidos no prueba que su nombre sea correcto ni incorrecto. Esos 71 **no se declaran alineados**:
- 63 no tuvieron ventas en la muestra: combos, panadería, Nutty, Pink, Sora sin «Signature», aguas, accesorios, etc.;
- 6 son duplicados o variantes pendientes del grupo C (Urban Chocolat, Muffin Tradicional, Brownie com sorvete, Wrap de Pollo, Kit Coffee Editions e Iced Latte Large);
- 2 son los Zoé Water Twist (D10).

### 2.2 Alineados sin enlace (11): el nombre ya coincide; el código espera otra decisión

| Código | Nombre | Decisión pendiente |
|---|---|---|
| `5IL` | Iced Latte | C6 (Iced Latte Large) |
| `4UC` | Urban Chocolate | C1 (Urban Chocolat; el renombre de receta no la resuelve) |
| `BRICE` | Brownie with ice cream | C3 (Brownie com sorvete) |
| `SHCO` | Gelato Frappé Coffee | E4 (tamaño Large) |
| `FSOD2`, `FSOD4` | Fresh Soda Pink Lemonade, Passion fruit | E3 (tamaños) |
| `1CDV60`, `1CDV60M` | Cold Drip V60, + Milk | E2 (sin vaso) |
| `TRUGOUAPP`, `TRUMISAPP`, `COMILTAPP` | Combos True White / Iced Latte | E5 (vasos de combos) |

## 3. Lote 1: los 8 nombres exactos que cambiarían

Son las 8 recetas con su UUID, el nombre actual y el nombre nuevo, que es el literal del POS.

| ID | UUID | Nombre actual | → **Nombre nuevo** | Versión | Código | Tamaños (POS → Costeo) | Precio 532 (Costeo = POS) | Composición | Líneas |
|---|---|---|---|---|---|---|---|---|---|
| R1 | `38847fe5-2d6f-4050-9fd7-aa94bb3d4024` | Pumpkin Spice Iced Latte | **Pumpkin Iced Latte** | 27 | `CPUMICAPP` | Regular+Large → Chica+Grande | 99 · 109 | p.61 | 428 |
| R2 | `170be377-ff76-4bbc-b6d5-85cd9708b21c` | Pumpkin Spice Latte | **Pumpkin Latte** | 21 | `CPUMLAAPP` | Regular+Large → Chica+Grande | 99 · 109 | p.60 | 349 |
| R3 | `7769fb2e-d7ac-46b6-abeb-e23634d40bd5` | Pumpkin Spice Frappé | **Pumpkin Spice Frap** | 33 | `CPUMFRAPP` | Regular+Large → Chica+Grande | 99 · 109 | p.62 | 124 |
| R4 | `052a61f6-55ff-4ac8-9459-ab4939789420` | Salted Caramel Frappé | **Salted Caramel Frap** | 33 | `SALFRAAPP` | Regular+Large → Chica+Grande | 89 · 99 | p.51 | 101 |
| R5 | `817fe3be-7d8b-49be-8e1a-6acde12ccb1c` | Taro Frappé | **Taro Frap** | 24 | `FRATARAPP` | Regular+Large → Chica+Grande | 89 · 99 | p.54 | 80 |
| R6 | `ad75d625-2fef-4ce3-8a3f-1e3c049ebbcf` | Coffee Frappé | **Coffee Frap** | 27 | `COFFRAAPP` | Regular+Large → Chica+Grande | 89 · 99 | p.50 | 59 |
| R7 | `bb72c7a6-d900-4d47-bf56-4a74654ccf4b` | Matcha Frappé | **Matcha Frap** | 30 | `FRAMATAPP` | Regular+Large → Chica+Grande | 89 · 99 | p.52 | 46 |
| R8 | `a00da002-92a3-4a48-ab47-b62ee9aa6a13` | Chai Frappé | **Chai Frap** | 24 | `FRACHAAPP` | Regular+Large → Chica+Grande | 89 · (Grande sin venta en 532) | p.53 | 42 |

**Por qué son claros**
- **Candidato único:** en Costeo no hay otra receta con «Pumpkin» ni otro Frappé del mismo sabor en Chica/Grande.
- **Los Gelato Frappé son otros productos:** tienen códigos POS propios (`SHCO`, `SHCI`, `SHMA`), tamaño Único y categoría distinta.
- **Precios:** coinciden en todos los tamaños con evidencia.
- **Composición:** cada receta corresponde a la ficha del recetario (doc 21).
- **Unicidad:** ningún nombre nuevo choca con otra receta, incluidas subrecetas e inactivas, ni siquiera sin mayúsculas, acentos o espacios repetidos.

**Lo que no cambia:** ingredientes, cantidades, precios, costos, márgenes, alertas, categorías, estado activo y los 62 enlaces. Este lote no agrega ningún código SKU: ligar estos 8 códigos será el siguiente lote, y no se cuenta aquí.

## 4. Decisiones para Carlo (agrupadas)

| # | Caso | Evidencia | Recomendación | Respuesta esperada |
|---|---|---|---|---|
| **N1** | `ZOEWATAPP` «Zoé Water» → renombrar **Zoé Water Natural** (`3db3fdab…`) | Es el único Zoé de Costeo sin «Twist»; el POS vende los Twist con otro código (`ZOETWIAPP`, $50). Tamaño coherente (sin vaso → Único). **No hay precio local** con que contrastar el $45 del POS, y renombrar quita «Natural» del nombre visible | Renombrar a «Zoé Water» en el lote 2 de nombres | «N1 sí» o «N1 no, mantener Natural» |
| **N2** | `ZOETWIAPP` «Zoe Water Twist»: un código para **dos** recetas (Frutos Rojos y Limón y Jengibre) | El POS no distingue el sabor | No renombrar ni ligar. Queda pendiente del proveedor (D10) | Ninguna por ahora |
| **N3** | Manifiestos ya aplicados que fijan el nombre: lote 1 del recetario (R3, Pumpkin Spice Frappé) y H2 (7 de estas recetas: R1, R3–R8) | En la copia local, tras el renombre, el ensayo de esos manifiestos se detiene («la receta se llama «Chai Frap»…»). La reversión de H2 ya se negaba por la regla de registros posteriores, y ahora también por esto | **(a) Aceptarlo.** Esos lotes están aplicados y verificados; sus manifiestos e informes no se reescriben. Si alguna vez hubiera que deshacerlos, se prepara un lote de corrección nuevo con los nombres vigentes. (b) La alternativa: antes de aplicar este lote, adaptar las precondiciones de esos scripts para que acepten un nombre registrado por un lote de renombres aprobado. Es un cambio de código aparte, con su diff revisado | «N3 a» o «N3 b» |

### 4.1 Respuestas de Carlo (2026-10-26)

- **N1:** Zoé queda **fuera de este lote** y pendiente; no bloquea los 8 renombres.
- **N2:** sigue pendiente del proveedor.
- **N3: opción a.** Los manifiestos e informes ya ejecutados se conservan **intactos**. Una corrección futura de esas recetas requiere un **lote nuevo**, revisado contra los nombres, las versiones y las cantidades vigentes.

**Manifiestos que dejan de ser reutilizables cuando se aplique este lote.** Sus ensayos, repeticiones y reversiones se detienen por nombre o por registros posteriores. Quedan como evidencia histórica de lo aplicado:

| Manifiesto | Lote | Recetas afectadas | Uso que deja de funcionar |
|---|---|---|---|
| `21-lote-1-recetas.manifiesto.json` | `recetario-lote-1` (ejecución `d9dadc19…`) | Pumpkin Spice Frappé → Pumpkin Spice Frap | Ensayo, repetición y reversión (ya se negaba por los registros posteriores de H2) |
| `23-hielo-gramos-lote-1.manifiesto.json` | `hielo-gramos-lote-1` (ejecución `c9d715df…`) | Pumpkin Spice Iced Latte, Pumpkin Spice Frappé, Salted Caramel, Taro, Coffee, Matcha y Chai Frappé (7 de 26 líneas) | Ensayo, repetición y reversión del lote completo: la transacción es única, así que una sola receta renombrada lo detiene. `HIELO (g)` y las 26 líneas no cambian |

**Siguen reutilizables:**
- `21-lote-2-urban-chocolate`, `21-lote-2-cold-brew` y `24-lote-3b-cold-brew-agua`: Urban Chocolate y Cold brew no se renombran.
- Los manifiestos de enlaces POS (lotes 1 y 2): sus 62 recetas no se renombran.

## 5. Script y garantías (`scripts/conciliacion/renombres-lote.ts` y `-aplicar.ts`)

**Por qué un módulo nuevo.** `renombres-b.ts` (B1–B6) lee un CSV sin huella, permite el ensayo sin perfil, no fija versión y revierte la lista completa. Por eso se conserva solo como registro de B1–B6, y este lote usa un módulo nuevo con el patrón de `recetas-correcciones.ts`:

- **Lote explícito:** `--lote` es obligatorio en ensayo, aplicación y reversión; no hay lote por omisión. El manifiesto tiene su sha256 fijado en `LOTES_RENOMBRES_APROBADOS`. Cada fila fija UUID, nombre previo, nombre nuevo, versión, código, nombre literal del POS y evidencia. Un nombre distinto del literal exige declarar una `excepcion`.
- **Perfil:** obligatorio también en el ensayo (operaciones o admin, activo). Queda en `updated_by` y en la bitácora. La sesión del CLI de Supabase no interviene: el autor es el UUID que se pasa en `--usuario`.
- **Bloqueos:** REPEATABLE READ y `FOR UPDATE` sobre las recetas del lote, en orden fijo. Un nombre o una versión distintos de los esperados detienen todo, y la transacción es atómica.
- **Unicidad:** el nombre nuevo se compara contra las **160 recetas** (productos y subrecetas, activas e inactivas), sin mayúsculas, acentos ni espacios repetidos.
- **Qué puede cambiar:** solo `nombre`, `version`, `updated_at` y `updated_by`. Antes del COMMIT se verifican las huellas de:
  - precios y precios manuales;
  - insumos, líneas y cantidades;
  - enlaces POS;
  - el resto de recetas y los demás campos de estas;
  - costo, precio y margen de **todos** los productos y canales en `v_resumen`.

  No se borra, recrea, fusiona ni desactiva nada.
- **Bitácora:** exactamente 1 registro `recetas.nombre` por receta cambiada (`carga_masiva`, con autor), con la nota de la ejecución. Cualquier otro registro propio aborta; la actividad ajena solo se informa.
- **Cierre verificado** (`cierre.ts`): un COMMIT incierto o un ROLLBACK fallido se informan como `fallida`.
- **Idempotencia:** repetir da «sin cambio», sin registros ni versión nueva.
- **Reversión por ejecución:** devuelve el nombre previo solo a las recetas que esa ejecución cambió. Se niega si hubo cualquier registro posterior, así que no pisa ediciones.

## 6. Pruebas y ensayo local

**Pruebas** (`tests/db/renombres-lote.test.ts`, PGlite): **11/11**.
- **Manifiesto:**
  - el real (8 filas literales, registrado con su huella, sin Zoé, Brownie, Urban ni B7);
  - un lote no registrado o alterado se rechaza, y también las filas inválidas: nombre no literal sin excepción, sin cambio, nombre nuevo repetido con otra forma, UUID, evidencia y espacios;
  - la clave de choque.
- **Renombre:**
  - perfil, también en el ensayo;
  - ensayo sin rastro;
  - aplicación: solo nombres, versión +1, autoría y nota; costos y enlaces iguales; repetir no cambia nada;
  - choques con un producto inactivo («TARO  FRÁP») y con una subreceta («chai frap»);
  - nombre o versión inesperados;
  - un cambio de precio o de enlace durante la ejecución provoca ROLLBACK;
  - reversión por ejecución, que no pisa ediciones posteriores;
  - un COMMIT fallido da «fallida».

**Ensayo local** con datos reales, en una copia aislada del respaldo verificado `2026-10-26T2321Z`, eliminada al terminar. Antes se aplicaron 3b y H2 para reproducir producción; las versiones y los nombres coinciden con el manifiesto.

| Paso | Resultado |
|---|---|
| Ensayo (ROLLBACK) | 8 renombradas, 8 registros; costos y resto iguales; después no queda nada |
| Aplicación | 8 renombradas, versión +1 cada una. **Iguales:** costo, precio y margen de `v_resumen` en todos los productos y canales; alertas; precios; precios manuales; líneas; cantidades; insumos; los 62 enlaces, y los nombres de las 62 recetas enlazadas |
| Enlaces del lote 1 (ensayo del cargador) | 57 «sin cambio», 0 problemas. Siguen siendo 62 enlaces a 62 recetas, con el mismo UUID |
| Repetir | 8 «sin cambio», 0 registros |
| Revertir la ejecución | 8 revertidas; todo idéntico al estado previo |
| Manifiestos ya aplicados tras el renombre (N3) | Se detienen por nombre. La reversión de H2 se niega |

BD completa: **208/208**. `tsc` sin errores.

## 7. Procedimiento propuesto (un solo paso por autorización)

1. **Respaldo lógico** nuevo (`respaldo-logico.ts`), restaurado en una copia local y comparado con `verificar-restauracion.ts`.
2. **Revalidación** en solo lectura:
   - las 8 recetas con el UUID, el nombre y la versión del manifiesto;
   - ningún choque de nombres;
   - perfil activo;
   - los 62 enlaces;
   - bitácora sin cambios desde el respaldo.
3. **Ensayo remoto con ROLLBACK:**

   ```
   npx tsx scripts/conciliacion/renombres-lote-aplicar.ts --lote nombres-pos-lote-1 --usuario <uuid>
   ```

4. **Aplicación**, si el ensayo da 8 renombradas y 0 problemas:

   ```
   npx tsx scripts/conciliacion/renombres-lote-aplicar.ts --lote nombres-pos-lote-1 --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
   ```

5. **Verificación desde una conexión nueva:**
   - los 8 nombres y sus versiones;
   - 8 registros en la bitácora, con autor y nota;
   - las huellas de costos, márgenes y precios, y los 62 enlaces;
   - segundo ensayo con 8 «sin cambio» y 0 registros.
6. **Reversión**, solo con aprobación: `--lote nombres-pos-lote-1 --revertir --ejecucion <uuid>`.

N3 decidida (opción a, §4.1). El ensayo remoto quedó autorizado; la aplicación sigue pendiente.
