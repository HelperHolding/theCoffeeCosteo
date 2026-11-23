# 10 · Plan: histórico de Rappi del portal antes del 1-oct-2026

Fecha: 2026-11-19. Propuesta para Carlo. Nada de esto está hecho: cada paso marcado «OK de Carlo» espera su visto bueno.

## Situación

- **En la base:** las 110 tiendas de `rappi_tiendas` (73 sucursales) tienen pedidos del portal **desde el 1-oct-2026**,
  sin días faltantes. Es el «historial del mes» que se cargó con cada lote (docs 05 y 07).
- **En el portal:** hay pedidos de The Coffee desde **mayo de 2025**. Antes, todo sale en cero.
- **El BI** (`bi_cargas`, POS) empieza el **27-oct-2025**. Ahí ya está el total de Rappi que cobró el POS, pero no los
  productos ni las opciones del portal.

### Sondeo del 2026-11-19 (solo lectura)

Llamada directa a `POST /sincronizar` (`tipo: manual`, un día y 2 a 4 tiendas) desde el contenedor `rappi-thecoffee`,
en minutos sin corrida (14:09 y 14:20). Sin pasar por n8n, así que no se guardó nada. Se anotaron solo los conteos
(`total_rows`) de cada tienda por día.

| Día         | Namóra (MX1930270777) | Rubén Darío (MX1930260682) | Cd. Juárez (MX1930415960) | Bonampak (MX1930356312) |
| ----------- | --------------------: | -------------------------: | ------------------------: | ----------------------: |
| 15-sep-2026 |                    12 |                          4 |                           |                         |
| 15-jun-2026 |                    16 |                          3 |                           |                         |
| 15-mar-2026 |                    11 |                          2 |                           |                         |
| 15-dic-2025 |                     1 |                          3 |                           |                         |
| 15-sep-2025 |                     7 |                          5 |                           |                         |
| 15-jul-2025 |                    17 |                         12 |                         0 |                       0 |
| 15-may-2025 |                     0 |                          3 |                         0 |                       0 |
| 15-abr-2025 |                     0 |                          0 |                         0 |                       0 |
| 15-mar-2025 |                     0 |                          0 |                         0 |                       0 |
| 15-dic-2024 |                     0 |                          0 |                         0 |                       0 |
| 15-jun-2024 |                     0 |                          0 |                         0 |                       0 |

Sin resolver:

- No se sabe si mayo de 2025 es el límite del portal o el inicio de la cuenta.
- Juárez y Bonampak dan 0 en julio de 2025, aunque entonces su Rappi llegaba por la API del POS. Puede que entonces
  vendieran con otra tienda de Rappi. Si es así, su historia del portal empieza más tarde que la de las demás.

## Qué se gana

- **Costeo y Consumo** con los productos y opciones de Rappi en meses anteriores. Hoy, antes del 1-oct-2026, una
  sucursal con portal muestra solo lo del POS.
- **Comparar** temporadas (Peppermint, Pumpkin) contra el año pasado.

## Propuesta: dos fases

| Fase | Periodo                | Días | Para qué                                                |
| ---- | ---------------------- | ---: | ------------------------------------------------------- |
| 1    | 27-oct-2025 a 30-sep-2026 |  339 | Mismo inicio que el BI: un año completo comparable      |
| 2    | 1-may-2025 a 26-oct-2025  |  179 | Lo que queda en el portal. Opcional, después de la fase 1 |

### Tamaño estimado

Con las corridas que ya están en `rappi_corridas`:

- **Listado:** el cierre lee 770 consultas (110 tiendas × 7 días) en unos 160 s. Son unos **0.2 s por consulta**.
- **Detalle (descuentos):** unos **0.13 s por pedido** (reposiciones del 15-nov, por ejemplo 442 detalles y
  208 consultas en 101 s).
- **Pedidos:** oct-nov 2026 promedia ~550 al día. Antes eran menos (Namóra: 7 en sep-2025 contra 12 en sep-2026). Se
  supone ~300 al día.
- **Espacio:** hoy hay 28,545 pedidos en 64 MB (pedidos y productos). La base mide 261 MB.

| Fase | Consultas | Pedidos (aprox.) | Espacio (aprox.) | Tiempo de lectura |
| ---- | --------: | ---------------: | ---------------: | ----------------: |
| 1    |    37,300 |   80 a 150 mil |     180 a 340 MB |        5 a 7 h |
| 2    |    19,700 |    30 a 60 mil |      70 a 140 MB |        2 a 3 h |

**Hay que revisar el plan de Supabase antes de empezar:** la fase 1 puede duplicar la base o más.

## Por qué no alcanza con «Reponer» como está

- El webhook «Reponer» lee siempre las 110 tiendas (no pasa `tiendas`).
- Con el tope de 400 consultas, cada corrida cubre 3 días: la fase 1 serían **113 corridas** a mano.
- Una corrida `manual` lee a lo más 1,000 detalles. Lo que quede sin leer **no** se completa después: el cierre y el
  repaso solo miran sus últimos 7 y 14 días. Esos pedidos quedarían con descuento 0.

## Cambios propuestos (código, un PR)

1. **`servidor.mjs`:** un `tipo` nuevo, `historico`, igual que `manual` pero con:
   - tope de **600 consultas** (5 días × 110 tiendas);
   - tope de **2,500 detalles**, para que no queden pedidos sin descuento;
   - la misma regla de solo lectura (los dos candados no cambian).

   Estimado por corrida: 550 consultas (~110 s) + ~1,500 detalles (~200 s) + navegador ≈ **5.5 min**, dentro de los
   10 min que espera n8n. Unos 1,500 pedidos por lote: menos que el cierre (~4,500), así que `rappi_importar` entra en
   sus 120 s (migración 60).

   `rappi_corridas` acepta `vivo`, `cierre`, `repaso` y `manual`. Para no tocar la tabla, n8n guarda estas corridas como
   `manual`; el mensaje dice «histórico».
2. **`reponer-historico.mjs`** (nuevo, en `servicios/rappi-portal`): corre en el servidor y llama al webhook «Reponer»
   con ventanas de 5 días consecutivas, una tras otra:
   - solo entre **00:10 y 04:50** (el domingo, hasta las 03:50), fuera de «en vivo» (07:07–23:57), del repaso
     (domingo 04:07) y del cierre (05:07);
   - espera a que termine cada corrida antes de pedir la siguiente;
   - se detiene ante cualquier estado que no sea `ok` o `sin_ordenes`, o si quedan detalles sin leer, y avisa;
   - lleva su avance en un archivo, para seguir la noche siguiente donde se quedó;
   - va del día más reciente hacia atrás, para que lo más útil entre primero.
3. **Flujo de n8n:** «Reponer» deja pasar `tipo: historico`. Se regenera con `flujo-n8n.mjs` y conserva credenciales y
   webhook.

A ~27 corridas por noche: **la fase 1 en 2 o 3 noches y la fase 2 en 1 o 2.**

## Orden (cada paso con OK de Carlo)

1. **Plan de Supabase:** confirmar que caben 200 a 500 MB más.
2. **PR** con los cambios 1 a 3, y pruebas del lote para `historico` (`tests/db/rappi-lote.test.ts`).
3. **Despliegue del lector** en un minuto sin corrida (entre :09 y :15), con respaldo de `/opt/n8n/rappi-thecoffee`
   (doc 05, paso 2).
4. **Prueba de una noche corta:** una sola ventana (25 a 29-sep-2026). Se revisan duración, memoria del servidor (2 GB,
   con Dodo al lado), pedidos, descuentos y que Costeo de esos días cuadre.
5. **Fase 1** en las noches siguientes, revisando cada mañana `rappi_corridas` y los correos.
6. **Fase 2**, solo si Carlo la quiere después de ver la fase 1.

## Riesgos

- **La cuenta del lector es una cuenta real** del portal. Miles de consultas por noche podrían hacer que Rappi la frene
  (429) o la revise. El lector ya reintenta un 429; si se repite, el script se detiene. Se puede bajar a 3 días por
  corrida.
- **Menú viejo:** productos que ya no existen o con otro nombre (temporadas 2025) saldrían sin receta en Costeo hasta
  ligarlos, como pasó con el Peppermint Mocha (commit `b6ff4aa`). Conviene medirlo con
  `scripts/sucursales/auditar-replica.ts` después de la prueba del paso 4.
- **Faltantes del portal:** el listado devuelve a veces menos pedidos de los que cuenta (doc 01). Pasará igual en el
  histórico; queda en el mensaje de cada corrida.
- **Juárez y Bonampak:** si su tienda de 2025 era otra, el portal no la tiene dada de alta y esa parte no entraría.
  Se revisa con una corrida `manual` de solo lectura antes de la fase 1.
