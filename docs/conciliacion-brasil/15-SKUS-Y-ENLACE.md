# 15 · SKU (`defaultCode`) y enlace con la base de productos

**Origen:** observación del equipo de productos: «algunos productos no traen SKU y por eso no se traen algunos aspectos de las órdenes». Fecha: 2026-10-23.

**Hipótesis pendiente del proveedor:** la ausencia de mapeo o SKU en Rappi/POS explicaría Generic y los tamaños que no llegan, pero **no está confirmada** (preguntas 13–21 de `06`).

**Alcance:** análisis local (muestra de fase 2: 4 semanas, 612/583/532, 5,324 pedidos) + inventario de Costeo. **Nada se escribió en la base.** Lista candidata: [`15-enlace-codigos.csv`](15-enlace-codigos.csv).

## 1. ¿Faltan SKU en lo que llega?

| Sucursal · canal | Líneas | Sin código | Personalizaciones | Sin código | `GENERIC` |
|---|---|---|---|---|---|
| 532 · Rappi | 828 | **0** | 1,747 | **0** | **108** |
| 532 · Mostrador / App | 1,357 / 109 | 0 / 29 | 3,245 / 298 | 0 / 82 | 0 |
| 583 · Mostrador / App | 1,764 / 73 | 0 / 39 | 4,657 / 252 | 0 / 133 | 0 |
| 612 · Mostrador / App | 5,598 / 257 | 0 / 131 | 12,623 / 666 | 0 / 349 | 0 |

**Lectura:**
- **Rappi:** todo lo que llega trae código. Lo que se pierde **no llega**:
  - un artículo sin equivalencia llega como `GENERIC` (caso 1: Iced Mocha);
  - una opción de tamaño sin equivalencia se descarta (caso 2: «Grande 355 ml.» en Pumpkin Iced Latte, ver `14`).

  Esto es **coherente con la hipótesis del equipo de productos**: artículos u opciones del menú de Rappi sin SKU asignado o sin mapeo al POS. **Esos SKU no se pueden obtener de la API de Brasil**, que solo transmite lo que ya está mapeado. Se corrigen en la configuración del menú de Rappi o de su integración con el POS; preguntas en `06`.
- **App:** desde el 2-oct, parte de las líneas y personalizaciones llegan sin código (`null` / `""`). Sus nombres coinciden con los productos que sí traen código. El PR #18 ya las une por nombre cuando hay un código único.

## 2. Catálogo de códigos observado

**91 códigos de producto** (sin contar `GENERIC`). Ningún código aparece con dos nombres en la muestra.

| Enlace con Costeo (por nombre) | Códigos | Líneas | Estado |
|---|---|---|---|
| Nombre exacto | 67 | 7,571 | Candidato listo para aprobar |
| Mayúsculas o espacios (p. ej. `3FOOD3` «Pain au Chocolat» → «Pain Au Chocolat») | 7 | 632 | Candidato; depende de B2 (qué forma de nombre se adopta) |
| Sin receta local (p. ej. `CPUMICAPP` Pumpkin Iced Latte, `CPUMLAAPP` Pumpkin Latte, los «… Frap», `PANMUEAPP` Pan de Muerto) | 17 | 1,476 | Pendiente de B3/B6: ¿alias de una receta existente («Pumpkin Spice …», «… Frappé») o producto nuevo? |

**Códigos de tamaño** (personalizaciones), uno a uno en la muestra:

| Código | Personalización | Usos |
|---|---|---|
| `TRADICAPP` | Regular - 440ml | 1,995 |
| `LARGEAPP` | Large - 600ml | 1,896 |
| `HOTTRAAPP` | Regular - 240ml | 1,200 |
| `HOTLARAPP` | Large - 355ml | 1,264 |

Otras 157 personalizaciones de tamaño llegaron sin código; son las de App.

## 3. Propuesta para ligar los códigos a la base (para aprobación)

Es una corrección funcional nueva: migración en la base de producción más carga de datos. **No se ejecutó.**

**Migración 22 (diseño):**
- **`producto_codigo_pos`**:

  | Columna | Tipo / restricción |
  |---|---|
  | `codigo` | text, PK |
  | `receta_id` | FK a `recetas`, **`on delete restrict`** |
  | `nombre_observado` | text |
  | `fuente` | `'api_pedidos'` |
  | `primera_vez`, `ultima_vez` | date |
  | `aprobado_por`, `aprobado_en` | — |
  | `nota` | text |

  - Un código liga **una sola receta**; una receta puede tener varios códigos (canales o renombres).
  - **No se usa como clave global ni sustituye a `recetas.nombre`.**
- **`tamano_codigo_pos`**: `codigo` PK, `tamano_id` FK, `volumen_ml`. El mapeo Regular → Chica y Large → Grande es **por producto**, como en B5; los productos de tamaño único no se mapean.
- **Seguridad:**
  - lectura igual que el resto de Costeo, con `(select rol_actual())`;
  - escritura solo para operaciones y admin;
  - restrictivas OAuth;
  - trigger de bitácora.
- **Pruebas en PGlite:** permisos, unicidad, `restrict` al borrar una receta enlazada y bitácora.

**Carga** (script idempotente, dry-run por defecto, por códigos aprobados):
1. **Lote 1:** los 67 de nombre exacto.
2. **Lote 2:** los 7 de mayúsculas o espacios, tras decidir B2.
3. **Lote 3:** los 17 sin receta, solo con alias aprobados (B3) o recetas nuevas (B6).

**Uso posterior (otro cambio, con su aprobación):**
- Sucursales podría mostrar el nombre de la receta de Costeo y su margen por producto vendido.
- El cotejo de precios de `04` pasaría a hacerse por código y no por nombre.

**Lo que este enlace NO resuelve:** los artículos y opciones de Rappi que no llegan (Generic, tamaños perdidos). Eso requiere que el proveedor o Rappi asignen SKU y mapeen esas opciones.

## 4. Verificación de candidatos (aprobada por Carlo el 2026-10-23)

Herramienta: `scripts/conciliacion/verificar-enlaces.ts`, local. Resultado: [`15-enlace-codigos.csv`](15-enlace-codigos.csv), con columnas de verificación y motivo.

Cada código se verifica en cinco dimensiones:

| Dimensión | Criterio |
|---|---|
| **Código** | Un solo nombre observado; no es `GENERIC` ni vacío |
| **Nombre** | Exacto contra la receta (lote 1). Si solo difiere en mayúsculas o espacios, queda pendiente de B2 |
| **Contexto** | Sucursales y canales donde aparece. El precio de 532 Mostrador frente a `precio_lista` se anota como evidencia, no bloquea |
| **Variante** | Otra receta con el mismo nombre canónico (duplicados como Urban Chocolat / Urban Chocolate) o con el mismo nombre más un tamaño («Iced Latte Large») → ambiguo |
| **Tamaño** | Vasos observados fuera de Rappi frente a los tamaños de la receta: con vasos ↔ Chica+Grande; sin vaso ↔ Único. Las diferencias o mezclas quedan pendientes |

| Estado | Códigos | Líneas (4 semanas) |
|---|---|---|
| **Lote 1 (verificado)** | **57** | 6,502 |
| Pendiente | 34 | — |

**Pendientes por motivo:**
- **Sin receta local (B3/B6), 17:** Pumpkin Iced Latte, Pumpkin Latte, los «… Frap», Pan de Muerto, Espresso Tonic, Zoé Water y combos nuevos.
- **Forma del nombre (B2), 7:** Pain au Chocolat, Grilled Ham Cheese and Tomato Sandwich, Croissant filled with cheese and ham, Iced Latte +  Ham & Cheese Sandwich, Brownie with ice cream, White bag 250g y Black edition 250g.
- **Variante en Costeo, 2:**
  - `5IL` Iced Latte, por la existencia de «Iced Latte Large»;
  - `4UC` Urban Chocolate, por el duplicado «Urban Chocolat».
- **Tamaño, 8:**
  - combos con vaso cuya receta es «Único» (True White + …, Iced Latte + Cookie Tradicional, Iced Latte +  Ham & Cheese Sandwich);
  - Cold Drip V60 y Cold Drip V60 + Milk, que llegan sin vaso con receta Chica+Grande;
  - mezcla de con y sin vaso en Gelato Frappé Coffee y en las dos Fresh Soda.

**No se renombraron ni crearon recetas.**

## 5. Migración 22 y carga del lote 1 (sin aplicar)

**Rama:** `feat/sku-enlace-pos`, actualizada con `main` el 2026-10-26.

**El procedimiento vigente está en [`17-PROCEDIMIENTO-SKU-LOTE-1.md`](17-PROCEDIMIENTO-SKU-LOTE-1.md):**
- el modelo revisado: `carga_id`, autoría fijada por un trigger, bitácora sin `receta_id`;
- el lote fijado [`17-lote-1.csv`](17-lote-1.csv), con 57 códigos;
- los scripts de ensayo, aplicación y reversión, con sus pruebas;
- el ensayo sobre la copia local del 2026-10-26;
- los pasos remotos, cada uno pendiente de aprobación.

**Historial:** el primer dry-run (respaldo del 2026-10-23, con el script `cargar-enlaces.ts` que solo funcionaba en local, ya retirado) dio 57 altas, 0 problemas e idempotencia.

**Lotes siguientes:** los 6 códigos de B1–B6 son un lote adicional propuesto. Los demás, solo después de las decisiones C–F pendientes.
