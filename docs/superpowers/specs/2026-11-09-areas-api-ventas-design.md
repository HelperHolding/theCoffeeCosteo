# Areas México: exportación de ventas para su API (prueba)

**Fecha:** 2026-11-09.

**Antecedente:** Areas México quiere ver las ventas de una tienda. Para eso nos pidió seguir su
«Documentación Técnica: API de Integración de Ventas y Arqueos», versión 1.1 del 2026-09-08, junto con tres Excel:

| Archivo | Qué contiene |
|---|---|
| `Datos API AreasMex.xlsx` | Hoja «DATOS API 1.1»: `NUM_TIK` pasa a entero y se agrega `ID_MVO_DTO` |
| `Carga Art TPVs Externos.xlsx` | Formato para dar de alta artículos; trae la fila de ejemplo 31 «COFFEE» |
| `Formas de Pago y Monedas.xlsx` | Tabla `CODFPTPVEXT → CODFPAREAS`; hoy solo tiene 101 Efectivo → 1 |

Su API todavía no existe. El documento dice que la URL y la llave se darán cuando su ambiente esté listo.

**Decisiones de Sebastián:**
- La prueba es con **Rubén Darío**: `companyId` 532, Store ID 455 en Zoho.
- **Solo el nombre de la tienda** va anónimo. Los productos van con su nombre real.
- La entrega son **archivos JSON** generados y validados. No hay envío ni servidor de prueba.
- Los artículos llevan un **catálogo numérico** propio, que Areas da de alta con su formato.
- **Rappi no se maneja con Areas** (decisión del 2026-11-11): ni los pedidos pagados con RAPPI en el POS ni los del portal
  de Partners. `armar` los excluye y el reporte dice cuántos.

## 1. Alcance

**Entra:**
- Un script de solo lectura que, para un rango de fechas, genera:
  - un JSON por ticket (cuerpo de `POST /api/tickets/recibir`);
  - un JSON por arqueo diario (cuerpo de `POST /api/arqueos/recibir`).
- El catálogo numérico de artículos y los dos Excel de alta en el formato de Areas.
- La validación de cada JSON contra el documento, con un reporte.

**Fuera:**

| Qué | Por qué |
|---|---|
| Envío HTTP, reintentos y llave | Su API no existe todavía. Será una fase siguiente, con su URL |
| Tabla del catálogo en la base | Para la prueba basta un archivo versionado; pasa a la base al ir a producción |
| Otras tiendas | Solo Rubén Darío |
| Devoluciones (`TIP_OPE = "D"`) | El POS no las marca; todo sale como venta |
| IEPS | No aplica al café; va en 0 |

## 2. Flujo

```
scripts/areas/exportar.ts --desde AAAA-MM-DD --hasta AAAA-MM-DD
  └─ leerDias(cfg 532)                      (lib/sucursales/datos.ts, la misma lectura del corte; sin Rappi del portal)
      └─ por pedido:  aTicket(pedido, catálogo, pagos) → TicketCompleto
      └─ por día:     aArqueo(día, tickets)            → ArqueoCaja
      └─ validar(cada JSON)                            → válido | descartado con motivo
  └─ escribe datos/areas/<desde>_<hasta>/...
```

- **Lectura.** Usa `leerDias`, igual que el corte del Tablero, sin el Rappi del portal. **No toca la base.** La lectura
  necesita el token del POS de `.env.local`, como `scripts/sucursales/corte.ts`. Los pedidos pagados con RAPPI en el POS
  se excluyen en `armar`.
- **Lógica pura en `lib/areas/`.** Son funciones sin red ni disco, con pruebas en vitest. Hay un archivo por cosa:

| Archivo | Qué hace |
|---|---|
| `tipos.ts` | Esquemas zod de `TicketCompleto` y `ArqueoCaja` |
| `ticket.ts` | `aTicket` |
| `arqueo.ts` | `aArqueo` |
| `pagos.ts` | Mapeo de formas de pago |
| `catalogo.ts` | Asignación de códigos |
| `validar.ts` | Validación de los JSON |

- **El script** solo lee, arma y escribe archivos.

## 3. Ticket (`TicketCompleto`)

Montos en pesos con 2 decimales y punto decimal. Fechas en hora local de la CDMX (la zona de la sucursal).

### 3.1 Cabecera

| Campo | Valor |
|---|---|
| `COD_TPV` | `"TC01"`: código neutro de 4 caracteres, sin nombre de tienda. Cabe en el `nvarchar(4)` del arqueo |
| `NUM_SES` | `0`. Areas asigna sus propios consecutivos de sesión (correo de Areas, 2026-11-11) |
| `NUM_TIK` | `PedidoNormal.id` como **entero** (hoja 1.1). El POS usa 8 dígitos (sin Rappi ya no hay números de 10 dígitos) |
| `TIP_OPE` | `"V"` |
| `MOM_OPE` | `fecha` + `hora` del pedido, formato `yyyy-MM-dd HH:mm:ss` |
| `IMP_VEN` | `ventaCent / 100`: lo cobrado, con impuestos y ya con descuentos |
| `ID_MVO_DTO` | **No se envía**: Areas lo omite (correo de Areas, 2026-11-11). La cabecera se valida estricta para que no se cuele |
| `IMP_DTG` | Suma de los `IMP_DTO` de las líneas más la diferencia que quede, de modo que `Σ PRE_FIN − IMP_DTG = IMP_VEN` (ver 3.4) |

### 3.2 Detalle

Una línea por `LineaNormal`. Cada línea del POS es una unidad, como en el BI.

| Campo | Valor |
|---|---|
| `NUM_LIN` | Índice 1-based de la línea en el pedido |
| `COD_ART` | Número del catálogo (§5) para `bi_codigo(codigo)` |
| `DES_ART` | `nombre` de la línea, el nombre real, recortado a 150 caracteres |
| `UNI_VEN` | `1` |
| `PRE_UNI` | Precio con IVA **antes** de los descuentos. Cada componente se lleva a lista con su propio porcentaje: la línea `importe/(1 − descuentoPct/100)` y cada modificador igual con el suyo. Una línea al 100% usa el precio de lista del catálogo (§5); un modificador al 100% vale 0 |
| `PRE_UNI_SIN_IVA` | `PRE_UNI / 1.16` |
| `PRE_UNI_SIN_IEPS` | `PRE_UNI_SIN_IVA`, porque no hay IEPS. Igual que la línea 1 del ejemplo del documento |
| `PRE_FIN` | `PRE_UNI × UNI_VEN` |
| `IMP_DTO` | `PRE_FIN − importeLinea(l)/100` |
| `POR_IVA` | `16` |
| `BAS_IVA` | `PRE_FIN / 1.16` |
| `IMP_IVA` | `PRE_FIN − BAS_IVA` |
| `POR_IEPS`, `BAS_IEPS`, `IMP_IEPS` | `0` |

Los impuestos van sobre el precio antes del descuento, como en el ejemplo del documento: `BAS_IVA` 600 = 2 × 300, con
`IMP_DTO` aparte.

**Personalizaciones (decisión del 2026-11-10).** Cada personalización **con costo** (tamaño grande, leches, shot extra,
etc.) va como **línea propia** justo después de su bebida, con su propio `COD_ART` y su propio descuento. La bebida queda
a su precio de lista, estable para la tarifa de Areas, y el total del ticket no cambia. Las personalizaciones **sin costo**
(lista e importe en 0: temperatura, «sin miel», shot doble incluido, etc.) **no se mandan**. Su código es el del POS
normalizado. Una personalización al 100% toma
su precio de lista de la corrida o del catálogo; si no tiene, no se manda. En la semana del 2 al 8 de noviembre de 2026
hubo 73 personalizaciones distintas, 17 con costo, y se dieron de alta 26 artículos de personalización (1083 a 1108).

**IVA 16%.** Rubén Darío está en Guadalajara, que no es zona fronteriza. El IVA se calcula desde el precio porque la
API del POS no lo separa.

### 3.3 Formas de pago

Un pedido del POS tiene una sola forma de pago, así que va un renglón con `NUM_ORD` 1:

| Campo | Valor |
|---|---|
| `COD_FPG` | Nuestro código externo (§4) |
| `COD_MON` | `1` (peso mexicano) |
| `IMP_DIV` | `IMP_VEN` |
| `CAM_MON` | `1` |
| `IMP_FPG` | `IMP_DIV × CAM_MON` |

### 3.4 Redondeo

- Cada campo se redondea a 2 decimales al final, no en los pasos intermedios.
- La diferencia de centavos entre `Σ PRE_FIN − Σ IMP_DTO` e `IMP_VEN` se suma a `IMP_DTG`. Esa diferencia aparece si
  hubo un descuento de pedido o por redondeo.
- Una diferencia **negativa** de más de 1 peso significa que las líneas suman menos que lo cobrado. Pasa en los
  pedidos con `cuadra = false`. Ese ticket se **descarta** y queda en el reporte; no se inventan montos.

## 4. Formas de pago

En `COD_FPG` mandamos **nuestro código externo**. **Confirmado por Areas (correo del 2026-11-09):** ellos relacionan
nuestras formas de pago con las de su POS, y del Excel solo informamos las columnas A y B (código y descripción). Lo
mismo con los artículos: hacen el match entre nuestros códigos y los suyos.

Los códigos salen de `docs/bi/zoho/pagos.json`, verificado con pedidos de Rubén Darío y Polanco:

| Código | Descripción | Método y tipo del POS |
|---|---|---|
| 101 | Efectivo | `DINHEIRO` (cualquier tipo, incluso `CONTINGENCY`) |
| 102 | Tarjeta | `CARTAO` con `EMV`, `CONTACTLESS_EMV` o `CONTINGENCY`, fuera de la app |
| 103 | App - Tarjeta | `CARTAO` o `VIRTUAL_WALLET` con `WALLET` desde la app |
| 104 | App - Saldo | `WALLET_BALANCE` |

Una combinación que no esté en la tabla **descarta el ticket** y sale en el reporte con su método y tipo crudos, para
agregarla.

## 5. Catálogo numérico de artículos

- **Archivo:** `datos/areas/articulos.json`, versionado en git. Es un arreglo de
  `{ cod_art, codigo, descripcion, precio }`, donde `codigo` es el código del POS normalizado con la misma regla que
  `bi_codigo` y `descripcion` es el nombre más reciente visto.
- **Asignación:** cada código nuevo recibe el siguiente número, empezando en **1001**. Los números **nunca se reasignan
  ni se borran**: si un producto deja de venderse, su número queda. El 31 de Areas no se usa.
- **Primera ejecución:** el script agrega los códigos vistos en el rango y reescribe el archivo. Los productos sin
  `defaultCode` usan el nombre como código, igual que en el BI.
- **`precio`:** el precio de lista más frecuente del producto **sin modificadores**, calculado **antes** de armar los tickets con las líneas de descuento menor a 100%. Así una línea al 100% tiene precio aunque el producto sea nuevo. Es la columna PRECIO VENTA del Excel.
- **Transacción por ticket:** un ticket descartado no deja códigos ni cambia descripciones en el catálogo.
- **Escritura:** el catálogo se guarda primero y de forma atómica (`.tmp` y luego renombrar), antes de cualquier otro archivo.

## 6. Arqueo diario (`ArqueoCaja`)

Un arqueo por día que tenga al menos un ticket válido:

| Campo | Valor |
|---|---|
| `COD_TPV` | `"TC01"` |
| `NUM_SES` | `0` (Areas asigna sus consecutivos) |
| `Fecha` | `yyyy-MM-dd` |
| `Hora` | Fecha y hora del último ticket del día, `yyyy-MM-ddTHH:mm:ss`, como el ejemplo de Areas (`2025-07-03T23:10:00`) |
| `Monto` | Suma de `IMP_VEN` de los tickets válidos del día |
| `Descuadres` | `0`: no hay conteo físico de caja |

## 7. Validación

`validar.ts` revisa cada JSON antes de escribirlo:

- **Forma:** esquema zod con los campos obligatorios, los tipos y los largos del documento:
  - `COD_TPV` hasta 20 en el ticket y hasta 4 en el arqueo;
  - `DES_ART` hasta 150;
  - al menos 1 detalle y 1 forma de pago;
  - `UNI_VEN` mayor que 0.
- **Cuadres del ticket**, con tolerancia de 0.01:
  - `IMP_FPG = IMP_DIV × CAM_MON`;
  - `Σ IMP_FPG = IMP_VEN`;
  - `Σ PRE_FIN − IMP_DTG = IMP_VEN`;
  - `IMP_IVA = PRE_FIN − BAS_IVA` en cada línea.
- **Cuadre del arqueo:** `Monto = Σ IMP_VEN` de su día.
- **Anonimato:** ningún campo de texto contiene el nombre de la sucursal. Se revisa contra el nombre de
  `ConfigSucursal` y contra «Rubén Darío» y «Ruben Dario», sin distinguir mayúsculas ni acentos.

Un ticket que no pasa no se escribe y va al reporte con su motivo. Sus montos no cuentan en el arqueo. El motivo de anonimato dice **dónde** está el nombre (`Detalles[0].DES_ART`), nunca lo repite.

**Última red:** antes de escribir, el script revisa `reporte.md` y cada celda de los Excel. Si alguno contiene el nombre de la tienda, no escribe nada.

**Días incompletos:** el reporte marca cada día con lectura incompleta en la tabla y en la advertencia. La carpeta del rango se borra y se rehace en cada corrida.

## 8. Salida

En `datos/areas/<desde>_<hasta>/`:

| Archivo | Contenido |
|---|---|
| `tickets/<NUM_TIK>.json` | Un archivo por ticket válido: el cuerpo exacto del POST |
| `arqueos/<AAAA-MM-DD>.json` | Un archivo por día |
| `Carga Art TPVs Externos.xlsx` | Su formato: encabezado «ALTA DE CODIGOS» y columnas CÓDIGO, DESCRIPCIÓN, CODIGO DE FAMILIA 3 y FAMILIA 3 (vacías: Areas no las necesita), IVA («16%»), TIPO (vacío) y PRECIO VENTA. Una fila por artículo del catálogo que se vendió en el rango |
| `Formas de Pago y Monedas.xlsx` | Su formato, con solo las columnas A y B llenas: CODFPTPVEXT y DESCFPTPVEXT. CODFPAREAS, DESCFAREAS y FechaRegistro van vacías: las llena Areas |
| `reporte.md` | Por día: tickets leídos, válidos, descartados y monto. La lista de descartados con su motivo. Artículos nuevos en el catálogo. Combinaciones de pago sin mapeo |

Las carpetas de salida se ignoran en `.gitignore` (`datos/areas/*/`). Solo se versiona `datos/areas/articulos.json`.

## 9. Pruebas

En vitest, sobre `lib/areas/` y con pedidos armados a mano:

- **Ticket con el ejemplo del documento:** dos líneas con descuento. Se revisa que cuadren `PRE_FIN`, `BAS_IVA`,
  `IMP_IVA`, `IMP_DTO`, `IMP_DTG` e `IMP_VEN`.
- **Ticket con modificadores:** el importe de la línea incluye los customs.
- **Línea con 100% de descuento:** usa el precio de lista del catálogo.
- **Descuento de pedido:** la diferencia va a `IMP_DTG`.
- **Pedido con `cuadra = false`:** queda descartado.
- **Formas de pago:** cada fila de la tabla §4 da su código, y una combinación desconocida descarta el ticket.
- **Catálogo:**
  - un código existente conserva su número;
  - los nuevos toman el siguiente;
  - la normalización pliega mayúsculas y espacios.
- **Arqueo:** suma solo los válidos y toma la hora del último ticket.
- **Validación:**
  - rechaza un `COD_TPV` de 5 caracteres en el arqueo;
  - rechaza un `DES_ART` de 151;
  - rechaza un texto con «Rubén Darío».

**Verificación manual:**
1. Correr el script con una semana de Rubén Darío.
2. Comparar el monto por día del reporte con el Tablero México de esos días.
3. Revisar a ojo tres tickets.

## 10. Preguntas para Areas

1. ~~¿`COD_FPG` lleva nuestro código externo (101…) o el suyo?~~ Resuelta: el nuestro; Areas hace la relación.
2. ~~¿Qué va en `ID_MVO_DTO`?~~ Resuelta: no se envía. En las pruebas deben ir ventas con descuento.
3. ~~¿El arqueo por día con descuadre 0 les sirve?~~ Resuelta: sí, con `NUM_SES` = 0 y la `Hora` con fecha.
4. ~~¿Qué llevan las familias y el tipo en el alta?~~ Resuelta: no hacen falta.
5. ~~¿`NUM_TIK` acepta enteros de más de 32 bits?~~ Ya no aplica: sin Rappi, el POS usa 8 dígitos.
6. ~~¿Cómo cuadran el ticket?~~ Resuelta: con el descuento por línea o, si no, el global; mandamos los dos.
7. ~~¿Tiempo real o lote?~~ Resuelta: ticket a ticket o paquetes cada 10 a 30 minutos (fase de envío).
8. ~~Precios de Rappi~~ Ya no aplica: Rappi no se maneja con Areas.
9. ¿Les sirve que las personalizaciones con costo lleguen como líneas propias? Pidieron más detalle (2026-11-11).
10. **Devoluciones:** Areas las maneja abonando el ticket (positivo y negativo). La API de nuestro POS no trae
    devoluciones (sin estado, montos negativos ni marca de cancelación): hoy no se pueden informar.
