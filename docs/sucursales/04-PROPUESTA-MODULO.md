# 04 · Propuesta del módulo Sucursales

Principio rector, indicado por Carlo el 2026-10-22: **Sucursales sirve para ver qué está pasando en vivo.** La API lo permite: refleja pedidos con segundos de retraso y el día completo de la piloto cabe en una llamada de 1–3 s. El análisis histórico es secundario y se construye sobre las mismas definiciones.

## Navegación

```text
The Coffee
├── Costeo (existente)
├── CRM Franquicias (existente)
└── Sucursales (nuevo)
    ├── Directorio            /sucursales                 lista de sucursales accesibles con estado «en vivo»
    └── Sucursal              /sucursales/[companyId]
        └── Ventas POS        pestañas (?tab=) con el patrón de components/portal/pestanas.tsx
            ├── En vivo        (por defecto)  hoy al minuto + comparativo + últimos pedidos
            ├── Productos      qué se vende hoy o en el periodo, con personalizaciones y tamaños
            ├── Tendencias     días, semanas y mapa día×hora en un periodo cerrado
            └── Pedidos        detalle paginado con drawer de pedido
```

- Pagos y descuentos no llevan pestaña propia: aparecen como bloques dentro de En vivo y Tendencias, porque responden a las mismas preguntas.
- Devoluciones no se muestran: la API no las informa.
- Futuros apartados por sucursal (Operación, Costeo por tienda…) se agregan como hermanos de «Ventas POS» sin reestructurar.

## Pantalla 1 · En vivo (prioridad 1)

Preguntas que responde: ¿cómo vamos hoy?, ¿mejor o peor que el mismo día de la semana pasada a esta hora?, ¿la tienda está vendiendo ahora mismo?, ¿qué sale más hoy?

```text
┌ Sucursales › Cd. Juárez · 612 ─────────────────────────────────────────────┐
│ [Selector sucursal ▾]   Hoy, jue 22 oct · hora local Juárez   ● En vivo    │
│ POS · API The Coffee · MXN · No incluye Rappi   Actualizado hace 40 s [↻]  │
├────────────┬────────────┬────────────┬─────────────────────────────────────┤
│ Venta hoy  │ Pedidos    │ Ticket     │ Último pedido                       │
│ $11,240    │ 54         │ $208       │ hace 3 min · 14 pedidos últ. hora   │
│ ▲ 8% vs    │ ▲ 4% vs    │ ▲ 4%       │                                     │
│ jue 15 a   │ jue 15 a   │            │                                     │
│ esta hora  │ esta hora  │            │                                     │
├────────────┴────────────┴────────────┴─────────────────────────────────────┤
│ Venta acumulada por hora  ── hoy   ┄┄ jue 15 (completo)                    │
│ 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21     [ver como tabla]          │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ Lo más vendido hoy (importe)         │ Últimos pedidos                     │
│ 1 Pumpkin Latte      $1,420  12 pz   │ 12:41  $186  Tarjeta · 2 productos  │
│ 2 True White         $  990  11 pz   │ 12:38  $ 80  Efectivo · 1 producto  │
│ …                     [ver productos]│ …                    [ver pedidos]  │
├──────────────────────────────────────┴─────────────────────────────────────┤
│ Pagos hoy: Tarjeta 82% · Efectivo 12% · App 6%   Descuentos: $230 (2.0%)   │
└────────────────────────────────────────────────────────────────────────────┘
```

- La actualización automática corre cada 60 s mientras la pestaña está visible y se pausa cuando está oculta. También hay un botón manual.
- Indicador de frescura:
  - «En vivo» si la última lectura buena tiene menos de 2 min;
  - «Retrasado» si tiene más de 5 min;
  - «Sin conexión con la API» si hubo un error, conservando las cifras anteriores atenuadas con su hora.
- «Último pedido hace N min» distingue una tienda sin ventas en este momento de una falla de datos.
- El comparativo es contra el mismo día de la semana anterior, hasta la misma hora y minuto. Antes de la primera venta del día se muestra «sin base comparable aún».

## Pantalla 2 · Productos

- Periodo: hoy, por defecto, o un rango.
- Ranking por importe atribuible (línea + sus customs), unidades (🟡), presencia en pedidos y participación.
- Detalle por producto: tamaños («Regular 440 ml», «Large 600 ml»…) y personalizaciones más pedidas, por ejemplo leche deslactosada, avena o doble shot.
- El importe extra de los customs se muestra aparte, sin sumarlo dos veces.

## Pantalla 3 · Tendencias (periodos cerrados)

- Venta, pedidos y ticket por día de las últimas 4 semanas, comparando cada semana con la anterior.
- Mapa de calor día × hora con pedidos promedio, con la tabla equivalente.
- Mezcla de pago y descuentos por semana.
- Cobertura visible: «4 semanas completas · 3,050 pedidos · historial desde 11-feb-2026».

## Pantalla 4 · Pedidos

- Tabla de 25 filas por página (patrón del portal): hora, importe, descuento, pago, origen (Mostrador o App), número de productos.
- Drawer del pedido: líneas, customs con sus importes, descuentos en % y monto, ID del pedido.

## Directorio

- Tarjetas o tabla de las sucursales a las que el usuario tiene acceso: nombre de la API, Jestor y ciudad (cuando están vinculadas al CRM) y un enlace.
- **No carga pedidos de todas las sucursales al abrir.** La «venta de hoy» por tarjeta se agregaría después, y solo si los límites del proveedor lo permiten.

## Insights calculados (sin IA)

Frases generadas con reglas, cada una con enlace a su periodo y a su fórmula. Ejemplos:

- «Hoy vas +8 % en venta contra el jueves pasado a esta hora (54 vs 52 pedidos).»
- «Pumpkin Latte aporta el 13 % de la venta de hoy.»
- «Entre 08:00 y 10:00 se concentra el 26 % de los pedidos de la semana.»
- «Los descuentos subieron de 1.3 % a 2.0 % del precio de lista contra la semana anterior.»
- «Sin pedidos en los últimos 30 min, en horario donde normalmente hay 9.» (alerta suave; nunca atribuye causa)

## Criterios visuales

- Se reutilizan tokens y piezas: `Kpi`, `Tarjeta`, `Barra`, `Pill`, `Vacio`, `Pestanas`, `Paginacion`, `paper`/`ink`/`crema`, `ok`/`bad` para variaciones.
- Gráficas en SVG propio, accesible y con tabla equivalente, porque el portal no tiene librería de gráficos. Agregar una sería una decisión aparte.
- Encabezado fijo con sucursal, periodo, zona, moneda, origen y frescura, compartido por KPIs, gráficas y tablas.
- Estados: cargando (skeleton), vacío real («Sin pedidos hoy todavía»), sin permiso, error del proveedor, datos atrasados y carga parcial («Se leyeron 3 de 4 páginas»).
- Responsive:
  - móvil 375 px con KPIs en 2×2, curva y lista de últimos pedidos;
  - tablet 768 px;
  - escritorio 1,280–1,400 px.
- Formato es-MX y MXN, navegable por teclado, contraste AA.
