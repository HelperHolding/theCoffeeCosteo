# 27 · Paquete para cerrar la conciliación POS ↔ Costeo

**Fecha:** 2026-10-27.
- **Alcance:** diagnóstico en solo lectura sobre `main` `d9f8967` y producción.
- **Escrituras en la base:** ninguna.
- **Qué evita:** repetir lo terminado. Este documento solo lista lo que falta y la decisión o el dato que lo desbloquea.

## 0. Hecho (no se repite)

| Tema | Estado |
|---|---|
| Enlaces POS | **70 de 91 códigos** enlazados: lote 1 (57), lote 2 (5) y lote 3 (8). Migración 22 |
| Nombres | B1–B6 y 8 renombres al literal del POS (doc 25). B7 es una excepción aprobada |
| Recetario | Lote 1 (Pumpkin Spice Frap), lote 2 (Urban Chocolate y café de Cold brew), 3b (agua de Cold brew) y H2 lote 1 (26 líneas en `HIELO (g)`) |
| PR #25 | Incorporado: GitHub lo marcó como *merged* al integrar #26 (`8078a43`), que traía su commit. El CSV es idéntico y el doc 20 está en su versión ampliada |

### PR #24: contenido que falta en `main`

**No se cierra.** Su sección «Cierre de la entrega» del doc 17 (+52/−9 líneas) **no está en `main`**:
- el merge del #23 (`6bafd63`);
- la publicación automática;
- la verificación posterior: migración 22 sin repetir, 57 enlaces intactos y bitácora sin cambios.

Ese contenido sigue siendo válido como registro histórico, pero dos frases quedaron desactualizadas:
- «no se agregaron los 6 códigos de B1–B6»: después se cargaron 5 en el lote 2;
- el estado «CERRADA» del lote 1, que no menciona los lotes 2 y 3.

**Propuesta:** actualizar la rama del #24 con `main` y añadir una línea que remita a los docs 20, 25 y 26. Al integrarlo hay que retirar el UUID del perfil, que aparece una vez en esa rama.

## 1. Catálogo pendiente: 21 códigos del POS sin enlace

**Cómo leer la tabla:**
- El nombre es el literal del POS.
- «Receta actual» es el registro de Costeo con el mismo nombre.
- Los precios son de 532, Mostrador, sin descuento (evidencia, no lista oficial).

### 1.1 Coincidencias claras de nombre con el tamaño por decidir (9)

El nombre y la receta coinciden. Lo que falta es saber cómo se mapea el vaso o el «sin vaso» del POS a los tamaños de Costeo.

| Nombre POS | Código | Receta actual | Diferencia | Propuesta |
|---|---|---|---|---|
| Gelato Frappé Coffee | `SHCO` | Gelato Frappé Coffee (`adfc682f…`), Único $94 | En 532 se vende sin vaso a $94 **y en Large a $104**; Costeo solo tiene Único | **Enlazar la identidad** (E4 aparte). En Sucursales, el Large queda «sin tamaño de Costeo» |
| Fresh Soda Pink Lemonade | `FSOD2` | (`e5b9dc6b…`), Chica $86 · Grande $96 | En 532 llega sin vaso, a $86 (= Chica); en 612, a veces con vaso (doc 16, E3) | Enlazar la identidad; tamaño sin mapear (E3) |
| Fresh Soda Passion fruit | `FSOD4` | (`6465a09a…`), Chica $81 · Grande $91 | En 532, sin vaso a $81 (= Chica) (doc 16, E3) | Igual que `FSOD2` |
| Cold Drip V60 | `1CDV60` | (`7799a6fe…`), Chica $94 · Grande $104 | El POS lo vende sin vaso; en 532 a $94 (= Chica) | Enlazar la identidad; «sin vaso» no se convierte en Chica (E2) |
| Cold Drip V60 + Milk | `1CDV60M` | (`49ef4055…`), Chica $107 · Grande $117 | Sin vaso | Igual que `1CDV60` |
| True White + Croissant Serrano & Gouda | `TRUGOUAPP` | (`14c61cda…`), Único $125 | El POS lo vende con vaso Regular o Large | Enlazar la identidad; vaso del combo pendiente (E5) |
| True White + Grilled Ham & Cheese Sandwich | `TRUMISAPP` | (`d950794b…`), Único $119 | Regular $119 · Large $129 | Igual que `TRUGOUAPP` |
| Iced Latte + Cookie Tradicional | `COMILTAPP` | (`480a3080…`), Único $103 | Con vasos | Igual que `TRUGOUAPP` |
| Iced Latte +  Ham & Cheese Sandwich (doble espacio) | `MISICEDAPP` | Iced Latte + Ham & Cheese Sandwich (`e95e45e9…`), Único $119 | B7: el nombre se conserva con un espacio, y lleva vasos (E5) | Igual que `TRUGOUAPP`; el nombre observado se guarda literal, con el doble espacio |

**Decisión K1.** ¿Enlazar estos 9 solo por identidad, dejando el tamaño sin mapear? El enlace no fija tamaños: Sucursales mostraría sus ventas con la receta y sin costo por tamaño hasta resolver E2–E5.
- Recomendación: **sí**, como lote 4 con el cargador actual.

### 1.2 Duplicados en Costeo (3 con código + 3 pares sin código)

| Nombre POS | Código | Receta con nombre y precios del POS | Duplicado | Propuesta |
|---|---|---|---|---|
| Iced Latte | `5IL` | Iced Latte (`fcf0d45d…`), $70/$80 = POS | Iced Latte Large (`7b5b57b7…`): sin líneas en Chica (costo $0 con precio $70) y sin precio Grande | **Enlazar `5IL` → Iced Latte.** Desactivar Iced Latte Large es una decisión aparte (C6) |
| Urban Chocolate | `4UC` | Urban Chocolate (`2c8b49a6…`), $78/$88 = POS; receta corregida con el PDF (lote 2) | Urban Chocolat (`77aed410…`): sin precio Grande; 1 precio manual Rappi | **Enlazar `4UC` → Urban Chocolate.** Desactivar Urban Chocolat es aparte (C1) |
| Brownie with ice cream | `BRICE` | Brownie with ice cream (`2c8f400b…`), $89 = POS, Desserts | Brownie com sorvete (`ffc27925…`): misma receta, sin precio, PANADERÍA DULCE | El único con nombre y precio del POS es `2c8f400b`. Carlo pidió mantenerlo separado mientras persista la ambigüedad (C3/O2). **Decisión K2** |
| — | — | Muffin Traditional (`ac7cac6c…`) | Muffin Tradicional (`b0bac077…`): idénticas, sin precio ni ventas | Desactivar «Tradicional» (C2) |
| — | — | Chicken Wrap (`99548df1…`) | Wrap de Pollo (`d3351706…`): idénticas, sin precio ni ventas | Desactivar «Wrap de Pollo» (C4) |
| — | — | Kit Cafés Editions (`e2d09d4d…`), $899 | Kit Coffee Editions (`7b8d9e55…`): con 1 precio manual Rappi | Antes de desactivar, decidir si el precio Rappi pasa a «Cafés» (C5) |

**Decisión K2.** Enlazar `5IL` y `4UC` ya, porque son claros por nombre y por precio en los dos tamaños. ¿Y `BRICE`?
- **(a)** enlazarlo a `2c8f400b`;
- **(b)** esperar a O2.

Las desactivaciones C1–C6 son decisiones aparte: cambian agregados del tablero (doc 16).

### 1.3 Zoé (2)

| Nombre POS | Código | Receta actual | Diferencia | Propuesta |
|---|---|---|---|---|
| Zoé Water | `ZOEWATAPP` | Zoé Water Natural (`3db3fdab…`), sin precio | Único Zoé sin «Twist»; POS $45; no hay precio local | **N1 pendiente** (Carlo): renombrar y enlazar, o mantener Natural |
| Zoe Water Twist | `ZOETWIAPP` | Twist Frutos Rojos / Twist Limón y Jengibre | **Un código para dos sabores** | N2: no se enlaza; preguntar al proveedor si hay códigos por sabor |

### 1.4 Sin receta en Costeo (7): requieren datos de Operaciones/Compras

| Nombre POS | Código | Líneas (4 semanas) | Propuesta (grupo F, doc 18) |
|---|---|---|---|
| Pan de Muerto | `PANMUEAPP` | 98 | Temporada; crear solo con cantidades de Operaciones |
| Cookie Matcha & White Chocolate | `COOMATAPP` | 68 | Crear con datos de Compras/Operaciones |
| Espresso Tonic | `ESPTONAPP` | 28 | Crear; no está en el PDF |
| Spooky Biscuits | `SPOBISAPP` | 12 | Temporada; no costear salvo que se repita |
| Matcha Iced Latte + Lemon Cake | `MATLEMAPP` | 9 | Combo de recetas existentes, o no costear |
| True White + Croissant filled with cheese and ham | `TRWCROAPP` | 3 | Combo Rappi; no costear por ahora |
| True White + Pan de Muerto | `TRUPANAPP` | 3 | Combo Rappi de temporada; no costear |

**Del lado de Costeo**, 71 productos activos no aparecieron en la muestra (doc 25, `25-costeo-sin-pos.csv`). Que no se vendieran en 4 semanas no prueba nada sobre su nombre: no se tocan.

## 2. Propuesta: cómo usará Sucursales los enlaces (revisada 2026-10-27)

**Principio.** Lo que llega de la API **no se modifica**: `productName`, `defaultCode` e importes se muestran como llegan. Costeo se agrega como **columnas aparte**, calculadas en el servidor.

### 2.1 Cobertura: dos porcentajes con denominador explícito

Cifras de la muestra auditada: 532, 583 y 612, del 2026-09-21 al 2026-10-18.

| Concepto | Importe | Nota |
|---|---|---|
| **A · Venta total** (Σ líneas + personalizaciones) | **$980,577** | Lo que cobró la tienda |
| GENERIC | $18,020 (1.8% de A) | Línea genérica de Rappi en 532: sin producto identificable; nunca se asigna |
| **B · Venta identificable** (A − GENERIC) | **$962,557** | Denominador de la cobertura «identificable» |
| Líneas sin `defaultCode` (App desde 2026-10-02) | $19,463 (2.0% de A) | Siguen en B. Solo se identifican si su nombre tiene un único código en el periodo |

| Enlaces | Importe con receta | % de A (toda la venta) | % de B (identificable) |
|---|---|---|---|
| Hoy (70) | $809,678 | **82.6%** | **84.1%** |
| Con el lote 4 (72: + `5IL`, + `4UC`) | $884,814 | **90.2%** | **91.9%** |

**Lo que queda fuera de la cobertura de B con el lote 4** (8.1%):
- 9 códigos de tamaño pendiente: 3.9%;
- líneas sin código: 2.0%;
- 7 productos sin receta: 1.8%;
- `BRICE`: 0.2%;
- Zoé: 0.1%.

Sucursales muestra **los dos porcentajes** (A y B) y, al lado, cuánto quedó fuera y por qué: GENERIC, sin código, sin enlace.

### 2.2 Costo: por unidades y tamaño verificado, no por receta enlazada

- **Unidades.** Se cuentan como líneas: la API da una línea por unidad (doc `sucursales/03`; falta confirmar con el proveedor que no existe una cantidad mayor que 1).
- **Tamaño.** Una línea solo se costea si su tamaño está **verificado para ese producto**:
  - el vaso Regular/Large de la línea corresponde a Chica/Grande en un producto con mapeo aprobado: los 21 de E1, los 8 del lote 3 (excepto Chai Frap Grande) y los 2 del lote 4;
  - o es un producto Único que llega sin vaso.

  Sin eso, la línea queda «tamaño sin verificar». Nunca se infiere por precio.
- **Personalizaciones.** Costeo no tiene recetas de personalizaciones. En la muestra, sobre la venta enlazada con el lote 4:

  | Personalizaciones de la línea | % de la venta enlazada |
  |---|---|
  | Ninguna (o solo el tamaño) | 17.5% |
  | Solo gratuitas (Double shot, temperatura, nivel de miel…) | 31.8% |
  | Alguna de pago (Lactose free, Oatmilk, Almond Milk, Extra shot…) | 50.7% |

  Las de pago tienen costo seguro. Las gratuitas pueden tenerlo (un shot doble) o restarlo («Without Honey»).
- **Propuesta:** un **catálogo de personalizaciones** con su efecto (neutra, extra con costo, sustitución o reducción), aprobado por Operaciones.
  - Mientras no exista, toda línea con una personalización de efecto desconocido es **costeo parcial**.
  - Hoy, solo las líneas sin personalizaciones y con tamaño verificado serían de costeo completo: **15.7% de B** en la muestra.
- **Tener receta enlazada no significa poder costear toda la venta.** Sucursales lo muestra como dos cifras: «con receta» y «costeable».

### 2.3 Margen: mismo tratamiento de IVA y sin mezclar costeo parcial

- **Importes de la API.** Lo que cobra la tienda, con IVA incluido (precio al público).
- **Convención de Costeo.** `precio_lista` lleva IVA, y el margen se calcula sobre la **venta sin IVA** (`venta_neta = precio / (1 + iva)`, con `iva` = 0.16 de `parametros`).
- **Propuesta.** El margen teórico de Sucursales sigue la misma convención:
  - importe cobrado ÷ 1.16, menos el costo de Costeo;
  - antes de comisiones: la API no da la comisión de Rappi, y `netAmout` no es comisión.

  Se rotula «margen bruto teórico, sin IVA».
- **Pendiente de confirmar:** ningún documento dice si los costos de insumos se capturan **con o sin IVA**. Hasta que Compras lo confirme, el margen se muestra como **provisional** con esa nota (pregunta nueva **K5**).
- **Agregados:** en el margen agregado solo entran las líneas de **costeo completo**. Las de costeo parcial (tamaño sin verificar o personalización de efecto desconocido) se excluyen y se informan aparte con su importe.

### 2.4 Historia: costo actual, no margen histórico

Los costos son los **actuales** de Costeo, con las recetas, cantidades y precios de compra de hoy, aplicados a ventas pasadas. Toda cifra de costo o margen se rotula «calculado con el costo actual de Costeo (fecha)». **No es el margen histórico real**: Costeo no guarda la historia de costos por fecha.

### 2.5 Permisos: decide el servidor

- **Dónde se calcula.** En la ruta del servidor (`app/api/sucursales/...`), después de `autorizar()`. Antes de leer enlaces o costos se comprueba que el usuario tenga un **perfil de Costeo activo**, con la sesión del usuario y bajo RLS: `rol_actual()` exige perfil para `producto_codigo_pos`, `recetas` y las vistas de costo.
- **Sin perfil:** la respuesta **no incluye** receta, costo ni margen. No basta con ocultarlos en el navegador: el JSON no los lleva.
- **Caché:** como hoy, privado y `no-store`; la caché por usuario o permiso no mezcla respuestas con y sin costos.
- **Credenciales:** sin service role.

### 2.6 Lo demás

| Pieza | Propuesta |
|---|---|
| **Unión** | Por `codigo` con `producto_codigo_pos` → `receta_id`, después de agregar por producto. `nombre`, `nombreProveedor`, `importeCent` y `lineas` no cambian |
| **Líneas sin código** | Regla actual: se unen solo si su nombre tiene un único código en el periodo. Si no, quedan sin receta |
| **GENERIC** | Nunca se asigna |
| **Precio de lista** | Referencia al lado del precio observado, sin declarar diferencias (A1) |
| **Datos** | Decisión E4: bajo demanda, sin persistir pedidos ni migraciones |

**Entrega sugerida:** un PR de código con pruebas para:
- los 70 o 72 enlaces;
- GENERIC, líneas sin código, códigos sin enlace y tamaño sin verificar;
- personalizaciones de pago y gratuitas;
- usuario sin perfil de Costeo, cuya respuesta no debe llevar costos;
- margen sin IVA y exclusión del costeo parcial.

## 3. Recetas pendientes

### 3.1 Corregibles con el PDF vigente (revalidadas el 2026-10-27; falta la aprobación de Carlo)

Se revalidaron las páginas del PDF (sha256 `6a81e1a8…`) y las subrecetas en producción, en solo lectura. **Que un ingrediente cueste $0 no prueba que su cantidad sea correcta**: cada cambio se apoya en el PDF.

| Receta | Cambio | Evidencia revalidada |
|---|---|---|
| Fresh Soda Pink Lemonade y Passion fruit, Grande | Hielo 190/177 → **245 g** | pp.43–44: «245 gr de hielo» / «245 g de hielo en cubos» en Grande; la Chica (130 g) ya coincide |
| Cold brew | Hielo 130/245 a `HIELO (g)`, mismos números | p.27: «130 gr de hielo» / «245 gr de hielo» |
| Iced Chocolate | AGUA (línea aparte) 10 → **0 ml** | **p.24:** 36 g de salsa + 10 ml de agua caliente. **p.5:** preparado de 90 g de azúcar, 100 g de cocoa y 200 ml de agua. **Subreceta «Mix … (2)»** (rinde 1,000 ml): 200.64 de cocoa y 180.64 de azúcar (proporción p.5) + 618.71 de agua; quitando la del preparado (401.29) quedan **217.43**, que es **10/36** del preparado (0.2779). Así, 46.002 de «(2)» = 36 g de salsa **+ 10 ml de agua**, y la línea AGUA de 10 ml **los cuenta dos veces**. Urban Chocolate (p.34: 36 + 10) usa la misma «(2)» sin línea AGUA aparte: coherente |

**Fuera de este lote:**
- Gelato Grande (decisión de catálogo E4);
- todo lo que espera a Operaciones o Compras (§3.2).

**Sin cambio de costo, solo para registrar:** Ristretto (22 frente a 27 ml), preparado de chai (400 ml) y Chai Iced Latte (leche frente a «agua»). Costeo ya usa la lectura coherente.

### 3.2 Esperan a Operaciones/Compras (doc 22 §6 y doc 18)

| Tema | Pregunta | Lote |
|---|---|---|
| Base de las Fresh Sodas | ¿Agua con gas o tónica?; marca, presentación y reutilización | 3c |
| Preparado de fresa / pulpa de maracuyá | Rendimiento de 500 g; densidad o medida de la pulpa | 3d |
| Limón de Pink Lemonade | Variedad, peso, zumo por medio limón, rodaja | 3e |
| Hielo | ¿Se compra? Presentación y precio; ¿los 14 usos sin ficha están en gramos? | Costo de hielo; H2 restantes |
| Macchiato | ¿Se costea con 170 ml de leche vaporizada o solo con los 40 ml servidos? | Lote 3 del doc 21 |
| Açaí Bowl / Acai Cup | La ficha p.78 no corresponde a la receta enlazada | Lote 3 del doc 21 |
| Sándwiches | Peso del tomate cherry; rebanadas por trenza de brioche | Lote 2 del doc 21 |
| V60 Grande y combos con vaso | Cantidades y vaso | E2 y E5 |
| Sin ficha | Brownies, Pan de muerto, Sablé, Cookie Matcha, Espresso Tonic, Gelato Chocolate/Horchai/Mocha, Focaccia de pesto y aderezo de chipotle | Grupo F y lote 4 del doc 21 |
| Costos de insumos | K1–K4 | Compras |
| IVA de los costos | **K5:** ¿los costos de insumos se capturan con o sin IVA? (necesario para el margen de Sucursales, §2.3) | Compras |

## 4. UUID del perfil

**Retirado** de los 23 documentos e informes públicos de `main` (docs 17 y 19 e informes JSON de los docs 17, 19, 20 y 21). Ahora aparece el marcador `<uuid-perfil>` en su lugar.

**Lo que se conserva:**
- la autoría real en la base (`updated_by`, `creado_por` y `bitacora.usuario_id`);
- los informes privados fuera del repo.

**Lo que no se toca:** el historial de Git. Los commits anteriores conservan el valor.

## 5. Para cerrar la conciliación, en orden

1. **Lote 4 de enlaces** (`5IL` y `4UC`): preparado en el doc 28. `BRICE` sigue pendiente de K2.
2. **K1:** enlazar por identidad los 9 de tamaño pendiente, en el mismo lote 4 o en uno aparte.
3. **N1** (Zoé Water) y preguntar al proveedor por N2.
4. **Desactivaciones C1–C6**, en un lote con dependencias comprobadas (doc 16).
5. **Recetas del §3.1** con el PDF: 3a, Cold brew en `HIELO (g)` e Iced Chocolate.
6. **Sucursales:** el PR de código del §2.
7. **Operaciones/Compras:** enviar las preguntas del §3.2, cuando Carlo lo decida.
8. **PR #24:** actualizarlo e integrarlo con el UUID retirado.
