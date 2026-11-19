# Propuesta: apartados del gerente de tienda (módulo Franquiciatarios)

> **Estado:** propuesta. No se construye en el PR del piloto. Base: app de Dodo MX (`dodo-money`, solo lectura), el
> checklist de turno de Operaciones y lo que ya existe en el portal. Prototipo navegable en el arnés visual:
> `npm run prueba:visual` → `?franquiciatarios&vista=propuesta&rol=gerente`.
> Preparada el 2026-11-19 para revisarla con el gerente que le pasará sus actividades a Carlos.

## 1. Qué ya tiene el gerente (piloto)

- **Hoy:** el avance de apertura, cambio de turno y cierre, los «No» y las incidencias.
- **Avisos e historial:** los «No» vigentes con su observación, las incidencias, las correcciones con motivo y el CSV.
- **Baristas:** los nombres de la cuenta compartida.
- **Ventas y pedidos, y tira de venta:** con las mismas cifras que Sucursales y sin costos.

## 2. Reglas que conviene copiar de Dodo (y ya usa el checklist)

| Regla | Cómo la aplica Dodo | Cómo queda aquí |
|---|---|---|
| Nada se edita ni se borra | No hay políticas de update ni delete; la escritura pasa por RPC | Tablas de solo inserción y triggers. Una corrección es un renglón nuevo con motivo |
| La fecha y la hora las pone el servidor | Trigger `dia_operativo()` con corte a las 4:00 | `franq_dia_operacion()`, igual (por confirmar) |
| Confirmación por otra persona | `check (confirmado_por <> registrado_por)` + RPC | Ya en «recibe ≠ entrega». Se usa también en arqueos y movimientos |
| Anulación con motivo | `anular_arqueo` (gerente), queda tachado | Mismo patrón: anula el gerente y el registro sigue visible |
| Sin cuentas compartidas para dinero | El README de Dodo lo prohíbe | **La cuenta de baristas no mueve dinero.** Arqueos y caja requieren una sesión personal (gerente) o un PIN de barista (pendiente) |
| Doble validación | La server action da el mensaje amable y la RPC o el trigger lo vuelve a exigir | Igual |

## 3. Apartados propuestos

La prioridad es **P1** (lo siguiente), **P2** y **P3**. «Registra» es quien captura y «Confirma» es una persona distinta.

### P1 · Arqueo y cierre del día
- **Qué resuelve:** cuadrar la caja por turno y cerrar el día con lo que dice el POS. Hoy esto vive en papel: el
  checklist solo pregunta «¿caja cuadrada?».
- **Datos:**
  - Momento (inicio, cambio, cierre) y conteo por denominación. Total contado.
  - Efectivo esperado: viene de las ventas en efectivo del POS, que ya están en el portal (`pagos` de Sucursales con
    `DINHEIRO`), más el fondo y menos los retiros.
  - Diferencia (columna generada) y retiros a bóveda.
  - Cierre del día: venta por canal (sale del portal), diferencia de los turnos, fondo y corte de Rappi (foto).
- **Registra:** el responsable del turno. **Confirma:** quien recibe el turno; el cierre del día lo confirma el gerente.
- **Reglas:**
  - Un arqueo de inicio por día.
  - El de cierre no se anula.
  - No se cierra el día con un turno abierto ni con movimientos pendientes.
  - El efectivo esperado lo calcula el servidor; nunca sale del formulario.
- **Relación con el portal:** usa la misma lectura de ventas que la tira de venta, así que las cifras coinciden.

### P1 · Gastos y caja chica
- **Qué resuelve:** el registro de gastos menores con comprobante y su reposición.
- **Datos:** concepto, proveedor, monto, comprobante (CFDI, nota o sin comprobante), UUID del CFDI, foto opcional y de
  qué caja salió.
- **Registra:** el gerente o un barista con PIN. **Confirma:** el gerente marca «repuesto»; la reposición la confirma el
  franquiciatario.
- **Reglas:** las fotos van a un bucket privado, sin reemplazo ni borrado. Una corrección es un movimiento contrario.

### P1 · Mermas
- **Qué resuelve:** el checklist pide «mermas capturadas en formato de mermas» en el cambio de turno y en el cierre.
  Aquí se capturan directo.
- **Datos:**
  - Producto o insumo, del catálogo de **Costeo** (recetas e insumos que ya existen).
  - Cantidad, unidad, motivo (caducidad, preparación, caída, devolución…) y nombre de quien lo registra.
- **Registra:** cualquier barista (con nombre declarado). **Confirma:** el gerente cierra las mermas del día.
- **Reglas:** después del cierre del día no se agregan mermas a ese día.
- **Valor:** con las recetas de Costeo, la merma se valúa a costo **solo en la vista del franquiciatario y del
  admin**. Los baristas nunca ven costos.

### P2 · Inventarios y conteos
- **Qué resuelve:** el «conteo de inventario / de cierre» del checklist y el inventario teórico.
- **Datos:** conteos por insumo (apertura y cierre o semanales) en la unidad de compra.
- **Registra:** un barista. **Confirma:** el gerente.
- **Relación:** el consumo teórico **ya existe** (Sucursales → Consumo usa las recetas de Costeo). La diferencia contra
  el conteo es la merma no registrada. Los pedidos sugeridos salen de **Comercializadora** (qué pedir y mínimos).

### P2 · Recepciones de mercancía
- **Qué resuelve:** confirmar lo que llega de la Comercializadora o de proveedores locales.
- **Datos:** el renglón de la orden (de las OV o OC de Comercializadora), la cantidad recibida, diferencias y una foto
  de la nota.
- **Registra:** el gerente. **Confirma:** Comercializadora ve la diferencia.
- **Reglas:** se anula con motivo. El barista no ve precios (como en Dodo).

### P2 · Bitácoras
- **Qué resuelve:** temperaturas (refrigeradores y retenes), bitácora de baños y limpieza profunda. Todas aparecen en
  el checklist como «registrado en bitácora».
- **Datos:**
  - Lectura con hora del servidor, equipo o área y nombre declarado.
  - Para la limpieza profunda, el área del día según un calendario (Dodo usa un ciclo de 14 días).
- **Registra:** un barista. **Confirma:** el gerente revisa.
- **Reglas:**
  - Rangos por equipo: una temperatura fuera de rango pide una observación y genera un **aviso**, como un «No».

### P3 · Equipo y turnos
- **Qué resuelve:** quién trabaja cada turno y su asistencia (el checklist pide «todo el personal checó entrada»).
- **Datos:** turnos (matutino y vespertino) con su encargado y los baristas del turno, más la hora de entrada y de
  salida.
- **Relación:** amplía «Baristas» (los nombres ya existen). Aquí es donde se pondría el **PIN opcional** si hace falta.

### P3 · Activos y mantenimiento
- **Qué resuelve:** equipos de la tienda (espresso, molinos, refrigeradores) con sus mantenimientos.
- **Datos:** activo, serie, estado, mantenimientos preventivos y correctivos, y evidencia.
- **Registra:** el gerente. **Confirma:** el franquiciatario o el área de operaciones.

### P3 · Reportes
- Semana de la tienda en una página:
  - venta (de Sucursales);
  - cumplimiento de checklists (porcentaje de puntos en «Sí» y secciones firmadas a tiempo);
  - «No» repetidos, mermas, diferencias de arqueo e incidencias abiertas.
- Para el franquiciatario con varias sucursales: la misma página, una columna por tienda.

## 4. Orden sugerido

1. Arqueo y cierre del día (usa la venta del portal y ya tiene la regla de dos personas).
2. Mermas (usa el catálogo de Costeo y cierra el ciclo del checklist).
3. Gastos y caja chica.
4. Bitácoras (temperaturas primero).
5. Inventarios y recepciones (dependen de cómo opera hoy la Comercializadora con la tienda).
6. Turnos, activos y reportes.

## 5. Preguntas para el gerente

1. ¿Cuántos arqueos hacen al día y quién entrega a quién? ¿Hay bóveda o solo caja?
2. ¿Qué gastos paga la tienda en efectivo y cada cuánto se reponen? ¿Quién autoriza la reposición?
3. ¿Cómo capturan hoy las mermas (formato, frecuencia) y quién las revisa?
4. ¿Qué inventario cuentan, cada cuándo y en qué unidad (pieza, kilo, caja)?
5. ¿Qué equipos llevan bitácora de temperatura y cuáles son sus rangos?
6. ¿Hay un calendario de limpieza profunda? ¿Qué áreas y cada cuánto?
7. ¿Cómo reciben la mercancía (de la Comercializadora o de proveedores locales) y qué revisan?
8. ¿Qué le reporta hoy el gerente al franquiciatario y cada cuánto?
9. ¿Qué debe ver el franquiciatario que no vea el gerente (o al revés)?
10. ¿Quién sería el gerente de distrito y qué revisa?
