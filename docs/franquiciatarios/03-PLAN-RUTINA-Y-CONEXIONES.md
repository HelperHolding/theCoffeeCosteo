# Plan: rutina operativa del gerente + conexión con Comercializadora y P&L (piloto Essentia)

Fuente: «Checklist y Rutina Operativa de Turno v1.0», de Moisés (Diseño Operativo), noviembre 2026. Va dirigido a
Tecnología e Inventarios. Fecha de este plan: 2026-11-20. Estado: **F1 mergeada (#181, migración 79 en producción); F3 en PR (migración 80).**

Leyenda: **[H]** hecho verificado (repo o producción, en solo lectura) · **[P]** propuesta · **[D]** decisión pendiente
de Carlos.

---

## 1. Qué pide el documento

El documento quiere unir tres cosas: la rutina diaria en barra, el control de existencias en tiempo real y la
inocuidad. También pide optimizar el despacho. Organiza el día en **4 fases y 32 actividades**, una tabla de
**responsables** (barista mañana, barista tarde/cierre, gerente, fecha y sucursal) y **4 módulos por integrar**.

Cada actividad cae en uno de estos tipos. De eso depende cómo se registra en la plataforma.

| Tipo                     | Qué es                                                                                   | Actividades del PDF                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Check único**       | Se hace una vez en la fase: Sí/No, con observación si es «No»                            | Encender equipos, colocar sanitizantes, verificar limpieza, encender/apagar música, limpieza de equipos (backflush), limpieza de áreas de preparación, limpieza de tienda, apagar equipos, apagar luces y mobiliario, sacar basura, cerrar (accesos y alarma), lavar loza, cambiar bolsas |
| **B. Ronda recurrente**  | Se repite con una frecuencia. Importa **cuántas veces y a qué hora**, no solo si se hizo | Revisar baños (**cada hora**), cambiar sanitizantes (**cada 2 h**), revisar cold brew (**cada 2–4 h**), reabastecer barra (continuo), hacer previas o preparados (por demanda)                                                                                                            |
| **C. Registro con dato** | Además del Sí/No, se captura un valor                                                    | Revisar etiquetas y caducidades (qué caduca), PEPS, **revisar existencias y actualizar tabletas**, **conteos y bitácoras** (apertura y medio turno: insumos críticos o de alto valor), cold brew (hora de inicio de extracción y nivel)                                                   |
| **D. Corte o envío**     | Produce un documento de ventas o caja                                                    | **Enviar corte de medio día**, **enviar corte del día** (cierre de caja y métricas)                                                                                                                                                                                                       |

### Diferencias contra lo que ya está en producción [H]

- **Fases.** Hoy el módulo tiene 3 secciones fijas (apertura 12 puntos, cambio 10, cierre 11), sembradas del Excel
  anterior. Un `check` en la base las amarra: `franq_plantilla_secciones.clave in ('apertura','cambio','cierre')` y
  `franq_checklists.seccion` igual (migración 75).
  - El PDF agrega **«Durante la operación»**, que es continua y no una sola vez.
  - El «cambio de turno» se convierte en **«Medio turno»**.
  - **No basta con una plantilla v2: se necesita una migración.**
- **Rondas.** La regla actual es una respuesta vigente por punto y día. Con eso no se puede registrar «baños cada
  hora» ni «sanitizante cada 2 h».
- **Datos capturados.** Los conteos, las caducidades y el cold brew necesitan cantidades u horas. Hoy solo hay
  Sí/No con observación.
- **Firmas.** El PDF pide barista de mañana, barista de tarde/cierre y gerente. Hoy apertura y cierre tienen un
  responsable, y el cambio de turno tiene «entrega/recibe». Falta la **firma del gerente** del día.
- **Cortes.** La **tira de venta** ya existe y sirve como «corte de medio día» y «corte del día». Falta el
  **arqueo**: efectivo contado contra efectivo del POS. Falta también que el envío quede registrado con quién y a
  qué hora.
- **Conservar.** Las dos versiones pueden convivir: la 1 (Excel) y la 2 (PDF). Los registros de la v1 siguen
  intactos, porque las tablas son de solo inserción.

### Bloque «por integrar» del PDF y lo que ya tenemos

| Módulo pedido                                             | Qué ya existe                                                                          | Nota                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Reglas de dosificación y recetas estándar              | **Costeo** tiene las recetas (insumos y cantidades por tamaño) [H]                     | Se puede mostrar la ficha de receta **sin costos** (regla del módulo: nada de costos para usuarios externos) |
| 2. Tiempos objetivo de preparación y despacho (SLA)       | No hay [H]. El POS da la hora del pedido; **no está verificado** si da hora de entrega | [D] Habría que capturarlo o confirmarlo con la API del POS                                                   |
| 3. Matriz de roles por posición en barra                  | No hay                                                                                 | Captura simple del gerente, ligada a la lista de baristas                                                    |
| 4. Puntos críticos de control (PCC) y tolerancia de merma | Consumo teórico por receta (Sucursales) [H]. No hay mermas capturadas                  | Mermas: propuesta P1 en `02-PROPUESTA-GERENTE.md`                                                            |

---

## 2. Qué sabe Comercializadora de Essentia [H]

- **No existen órdenes de venta como tal.** Comercializadora toma los **pedidos que cada tienda hace en el sitio
  viejo (Shopify)**. Ahí cada tienda es una «apertura».
  - **Essentia = apertura 397** («Essentia», activa desde 2024-11-21). Lo confirmé en producción.
  - Coincide con `bi_tiendas.store_id = 397`, tipo **Sucursales Propias**.
- **Pedidos de Essentia: 37 pedidos por $330,825.08, de marzo a noviembre de 2026.**

| Mes     | Pedidos | Estado                 |      Monto |
| ------- | ------: | ---------------------- | ---------: |
| 2026-03 |       4 | terminado              | $17,580.12 |
| 2026-04 |       2 | terminado              | $11,948.24 |
| 2026-06 |       6 | terminado              | $64,471.49 |
| 2026-07 |       5 | terminado              | $39,016.05 |
| 2026-08 |       8 | terminado              | $59,147.39 |
| 2026-09 |       4 | enviado                | $50,029.58 |
| 2026-10 |       5 | enviado                | $50,356.88 |
| 2026-11 |   1 + 2 | enviado + **recibido** | $38,275.33 |

- `monto` es lo que **paga la tienda**, es decir, su compra real a la Comercializadora.
- Algunos pedidos ya traen el estado «recibido». Eso sirve como base para **Recepciones de mercancía**.
- En `com_movimientos` (envíos, sin precio) Essentia tiene 167 renglones en 15 folios, del 16 de junio al 6 de
  noviembre.
- **Pedido sugerido (OV sugerida):** el piloto cubre 3 tiendas en `com_ovs_tiendas` (519, 460 y 463). **Essentia no
  está.** Para sumarla basta un renglón `514 → '397'`. Es una escritura en producción y **necesita el OK de Carlos**.
- **No hay inventario por tienda.** El inventario de Comercializadora es solo del CEDIS y del 3PL.
- **Acceso:** las tablas `com_*` exigen el módulo Comercializadora y no filtran por tienda. Las vistas del sitio
  viejo solo las lee `service_role`. Para mostrarle a la tienda **sus** pedidos, Franquiciatarios necesita una
  función propia:
  1. Autoriza con `franq_rol` para esa sucursal.
  2. Lee con la llave de servicio **solo la apertura de esa sucursal**.

  Es el mismo patrón que ya usan las ventas de Rappi.

## 3. ¿Se puede sacar el P&L de Essentia?

**Hoy no completo. La parte de arriba sí; la de abajo no existe en ningún sistema nuestro.**

| Línea del P&L                                 | Estado                   | Fuente                                                                                                                                                                             |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venta bruta, descuentos y venta sin IVA       | **Disponible**           | POS en vivo (Sucursales, hasta 62 días por consulta). BI solo tiene **22 días cargados** de Essentia (finales de octubre y noviembre: oct $21,029; nov $186,322 al día de hoy) [H] |
| Comisiones (App, Rappi por POS)               | Disponible desde 2026-03 | `importe_neto_cent` en BI. Al Rappi del portal le falta la comisión                                                                                                                |
| **Costo de venta teórico**                    | Estimado                 | Receta × unidades (Costeo). Usa el costo de hoy y no cubre todos los productos                                                                                                     |
| **Compras reales**                            | **Disponible**           | Pedidos del sitio viejo, apertura 397 (tabla de arriba)                                                                                                                            |
| Margen bruto                                  | Estimado                 | Venta − costo teórico, contrastado con las compras                                                                                                                                 |
| Renta, nómina, servicios, marketing, regalías | **No existe**            | Ninguna tabla. El sitio viejo tiene regalías y marketing, pero sin puente                                                                                                          |
| Punto de equilibrio                           | **Vacío en producción**  | `bi_punto_equilibrio` tiene 0 filas [H]. El repo trae Essentia = $219,197.24 al mes (con IVA, provisional, del P&L de Zoho), sin desglose                                          |
| Inventario y merma                            | No existe                | Saldría de los conteos y las mermas que este plan propone capturar                                                                                                                 |

**Propuesta [P]:**

1. **P&L de contribución** con lo que ya existe: venta, compras reales, costo teórico y margen. Se muestra mes a
   mes, con cada fuente marcada.
2. **Gastos fijos mensuales** capturados por un administrador interno: renta, nómina, servicios y otros. Más
   adelante se pueden importar de Zoho.
3. **Caja chica**, capturada por el gerente.

Con eso salen la utilidad de operación y el punto de equilibrio con desglose.

**[D → parcialmente decidido 2026-11-20: el barista no ve el P&L] Visibilidad.** La regla vigente del módulo es «nada de costos ni márgenes para usuarios del módulo».
Essentia es **Sucursal Propia**, así que su «franquiciatario» es la propia empresa. Propuesta: el P&L se ve **solo
como administrador** (Carlos y Finanzas) hasta que Carlos decida si el franquiciatario puede verlo.

## 4. Cómo se interconectan los módulos [P]

```
                 POS (ventas)  ──►  Sucursales / BI  ──► Ventas, tira, corte ─┐
Costeo (recetas) ──► consumo teórico ──► dosificación (sin costo) · PCC/merma ├─► Franquiciatarios (tienda)
Comercializadora ◄── pedidos de la tienda (sitio viejo, apertura) ──► Pedidos y recepciones ┤
                 ◄── OV sugerida (consumo receta + historial)  ◄── conteos de la tienda ────┘
                                       └──────────────► P&L de la sucursal (solo admin)
```

- **Las tres llaves de una tienda:**
  - POS `company_id = 514`.
  - Apertura del sitio viejo `397`.
  - BI `store_id = 397`.
- **[P]** Que `com_ovs_tiendas` (o una vista común) sea **la** tabla de equivalencias de cada tienda, y que la usen
  Franquiciatarios y Comercializadora.
- **Los conteos de la tienda** (tipo C) pueden alimentar la OV sugerida con el inventario real en lugar de solo el
  consumo teórico. Primero se capturan en el piloto y después se conectan.

## 5. Fases propuestas

| Fase                              | Qué entrega                                                                                                                                                                                                                                                                                                                                                                         | Depende de                                       | Producción                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| **F1 · Rutina de turno v2 (PDF)** | Migración 79: 4 fases (apertura, durante, medio turno, cierre), puntos con **tipo** (único, recurrente con frecuencia, con dato), rondas con hora, firmas mañana, tarde y gerente, y plantilla v2 sembrada con las 32 actividades. UI: «Durante la operación» como lista de rondas con la «próxima a las HH:MM» y avisos de atrasos. Corte de medio día y del día ligados a la tira | Carlos aprueba este plan                         | Aplicar la migración = merge, con OK   |
| **F2 · Conteos y bitácoras**      | Conteo de insumos críticos y de alto valor (apertura y medio turno), caducidades y cold brew con dato. Lista de insumos críticos tomada de Costeo o `com_insumo_sku`                                                                                                                                                                                                                | F1 + [D] lista de insumos críticos (gerente)     | Migración, con OK                      |
| **F3 · Pedidos y recepciones**    | La tienda ve **sus** pedidos a la Comercializadora (apertura 397): estado, renglones y monto. Confirma recepción con diferencias. Essentia entra a la OV sugerida                                                                                                                                                                                                                   | [D] ¿la tienda ve montos? Alta `514→397`, con OK | Escritura en `com_ovs_tiendas`, con OK |
| **F4 · Arqueo y caja chica**      | Efectivo contado contra efectivo del POS en medio turno y cierre. Gastos de caja chica con comprobante                                                                                                                                                                                                                                                                              | F1                                               | Migración, con OK                      |
| **F5 · P&L piloto (admin)**       | P&L mensual de contribución + gastos fijos capturados + punto de equilibrio con desglose. Solo administrador                                                                                                                                                                                                                                                                        | F3 (compras), F4 (gastos), [D] visibilidad       | Migración, con OK                      |
| **F6 · Bloque «por integrar»**    | Ficha de receta sin costo, matriz de roles por posición, mermas con tolerancia, SLA (si el POS da la hora de entrega)                                                                                                                                                                                                                                                               | F2, [D] SLA                                      | Por definir                            |

Orden recomendado: F1 → F3 → F2 → F4 → F5 → F6. F3 va temprano porque los datos ya existen y solo hay que
leerlos.

## 6. Decisiones pendientes [D]

**Decididas por Carlos (2026-11-20):** plan aprobado y F1 autorizada (#181). Pedidos, montos e inventario: los
ven **gerente y franquiciatario**; la **cuenta de baristas no ve pedidos, inventario ni P&L** (migración 82 lo cierra
también en la base). Los baristas sí capturan los conteos del checklist (F2), sin ver valores.

1. ~~Aprobar este plan~~ (aprobado).
2. **Durante la operación:** ¿la ronda de baños cada hora y la de sanitizante cada 2 h son **obligatorias**, con un
   aviso al gerente si se atrasan, o solo de registro?
3. **Insumos críticos y de alto valor** para los conteos: lista del gerente (Moisés).
4. ~~Montos de pedidos~~ (gerente y franquiciatario sí; barista no ve pedidos).
5. **Alta de Essentia en la OV sugerida** (`514 → 397`): escritura en producción.
6. **P&L:** el barista no lo ve; ¿lo ven gerente y franquiciatario o solo el administrador? ¿De dónde salen renta y
   nómina: captura manual o Zoho?
7. **Hora de turnos:** ¿a qué hora es el cambio mañana/tarde en Essentia? Define cuándo toca «medio turno».

Prompt de ejecución de la F1: `04-PROMPT-F1-RUTINA-V2.md`.
