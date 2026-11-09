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
  └─ leerDias(cfg 532) + conRappi           (lib/sucursales/datos.ts, la misma lectura del corte)
      └─ por pedido:  aTicket(pedido, catálogo, pagos) → TicketCompleto
      └─ por día:     aArqueo(día, tickets)            → ArqueoCaja
      └─ validar(cada JSON)                            → válido | descartado con motivo
  └─ escribe datos/areas/<desde>_<hasta>/...
```

- **Lectura.** Usa `leerDias` y `conRappi`, igual que el corte del Tablero. Así el Rappi del portal no se cuenta dos
  veces. **No escribe en la base.** La lectura necesita las variables de `.env.local` del POS, como
  `scripts/sucursales/corte.ts`.
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
| `NUM_SES` | El día del ticket como entero `AAAAMMDD` (por ejemplo `20261109`). Nuestro POS no tiene corte Z, así que la sesión es el día |
| `NUM_TIK` | `PedidoNormal.id` como **entero** (hoja 1.1). El POS usa 8 dígitos. El Rappi del portal usa el número de Rappi de 10 dígitos (`2485…`), que **no cabe en un int de 32 bits** (máximo 2,147,483,647); su hoja anterior decía «máximo 29 dígitos». Se manda igual y se pregunta (§10) |
| `TIP_OPE` | `"V"` |
| `MOM_OPE` | `fecha` + `hora` del pedido, formato `yyyy-MM-dd HH:mm:ss` |
| `IMP_VEN` | `ventaCent / 100`: lo cobrado, con impuestos y ya con descuentos |
| `ID_MVO_DTO` | `0`. El campo es nuevo en la hoja 1.1, no está en el PDF y no hay catálogo de descuentos. Se pide a Areas |
| `IMP_DTG` | Suma de los `IMP_DTO` de las líneas más la diferencia que quede, de modo que `Σ PRE_FIN − IMP_DTG = IMP_VEN` (ver 3.4) |

### 3.2 Detalle

Una línea por `LineaNormal`. Cada línea del POS es una unidad, como en el BI.

| Campo | Valor |
|---|---|
| `NUM_LIN` | Índice 1-based de la línea en el pedido |
| `COD_ART` | Número del catálogo (§5) para `bi_codigo(codigo)` |
| `DES_ART` | `nombre` de la línea, el nombre real, recortado a 150 caracteres |
| `UNI_VEN` | `1` |
| `PRE_UNI` | Precio con IVA **antes** del descuento de línea: `importeLinea(l) / (1 − descuentoPct/100)`. Si `descuentoPct` es 100, se usa el precio de lista del catálogo |
| `PRE_UNI_SIN_IVA` | `PRE_UNI / 1.16` |
| `PRE_UNI_SIN_IEPS` | `PRE_UNI_SIN_IVA`, porque no hay IEPS. Igual que la línea 1 del ejemplo del documento |
| `PRE_FIN` | `PRE_UNI × UNI_VEN` |
| `IMP_DTO` | `PRE_FIN − importeLinea(l)/100` |
| `POR_IVA` | `16` |
| `BAS_IVA` | `PRE_FIN / 1.16` |
| `IMP_IVA` | `PRE_FIN − BAS_IVA` |
| `POR_IEPS`, `BAS_IEPS`, `IMP_IEPS` | `0` |

`importeLinea(l)` incluye los modificadores, igual que el BI. Los impuestos van sobre el precio antes del descuento,
como en el ejemplo del documento: `BAS_IVA` 600 = 2 × 300, con `IMP_DTO` aparte.

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

En `COD_FPG` mandamos **nuestro código externo**. Areas lo traduce con su tabla `CODFPTPVEXT → CODFPAREAS`, que ya trae
101 Efectivo. Su ejemplo de JSON pone el código de Areas (1); **hay que confirmarlo con ellos**. Si piden el suyo, solo
cambia la tabla de `pagos.ts`.

Los códigos salen de `docs/bi/zoho/pagos.json`, verificado con pedidos de Rubén Darío y Polanco:

| Código | Descripción | Método y tipo del POS |
|---|---|---|
| 101 | Efectivo | `DINHEIRO` (cualquier tipo, incluso `CONTINGENCY`) |
| 102 | Tarjeta | `CARTAO` con `EMV`, `CONTACTLESS_EMV` o `CONTINGENCY`, fuera de la app |
| 103 | App - Tarjeta | `CARTAO` o `VIRTUAL_WALLET` con `WALLET` desde la app |
| 104 | App - Saldo | `WALLET_BALANCE` |
| 105 | Rappi | `RAPPI` (cualquier tipo: `CREDIT`, `RAPPI_PORTAL` o `RAPPI_TURBO`) |

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
- **`precio`:** el `PRE_UNI` más frecuente en el rango, que se usa en la columna PRECIO VENTA del Excel.

## 6. Arqueo diario (`ArqueoCaja`)

Un arqueo por día que tenga al menos un ticket válido:

| Campo | Valor |
|---|---|
| `COD_TPV` | `"TC01"` |
| `NUM_SES` | `AAAAMMDD` del día |
| `Fecha` | `yyyy-MM-dd` |
| `Hora` | `HH:mm:ss` del último ticket del día |
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

Un ticket que no pasa no se escribe y va al reporte con su motivo. Sus montos no cuentan en el arqueo.

## 8. Salida

En `datos/areas/<desde>_<hasta>/`:

| Archivo | Contenido |
|---|---|
| `tickets/<NUM_TIK>.json` | Un archivo por ticket válido: el cuerpo exacto del POST |
| `arqueos/<AAAA-MM-DD>.json` | Un archivo por día |
| `Carga Art TPVs Externos.xlsx` | Su formato: encabezado «ALTA DE CODIGOS» y columnas CÓDIGO, DESCRIPCIÓN, CODIGO DE FAMILIA 3 (0), FAMILIA 3 (vacío), IVA («16%»), TIPO (vacío) y PRECIO VENTA. Una fila por artículo del catálogo que se vendió en el rango |
| `Formas de Pago y Monedas.xlsx` | Su formato: CODFPTPVEXT, DESCFPTPVEXT, CODFPAREAS y DESCFAREAS (las dos últimas vacías, salvo 101 → 1 «EFECTIVO PESOS MX») y FechaRegistro (hoy) |
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

1. ¿`COD_FPG` lleva nuestro código externo (101…) o el suyo?
2. ¿Qué va en `ID_MVO_DTO`? ¿Tienen un catálogo de motivos de descuento?
3. ¿El arqueo por día con descuadre 0 les sirve, dado que nuestro POS no tiene corte Z?
4. ¿Qué tienen que traer `CODIGO DE FAMILIA 3`, `FAMILIA 3` y `TIPO` en el alta de artículos?
5. ¿`NUM_TIK` acepta enteros de más de 32 bits? Los pedidos de Rappi traen 10 dígitos.
6. ¿Para producción, los tickets se mandan uno por uno en tiempo real o en lote diario?
