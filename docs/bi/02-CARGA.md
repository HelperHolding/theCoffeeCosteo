# BI 02 · Carga de ventas, piloto y orden de despliegue (F2)

Fecha: 2026-11-05. Segunda entrega del BI (contrato en `docs/bi/01-BASE.md`). F2 **carga las ventas por línea** a
`bi_lineas` con el mismo corte que alimenta el Tablero México (doc 16). Todavía no hay pantalla (F4) ni Rappi de Zoho (F3).

## Qué carga y cuándo

Cada corte que guarda un día de una sucursal en `sucursales_resumen_dia` guarda también sus líneas en el BI
(`bi_guardar_dia`, fuente `pos`). Son tres caminos, todos con el mismo código (`cortar` en
`lib/sucursales/corte-servidor.ts`):

| Camino | Cuándo | Qué guarda |
|---|---|---|
| Cron | Cada 10 minutos | Hoy de cada sucursal |
| Cierre | 5:30 de la Ciudad de México, `?dias=8` | Hoy y los 7 días cerrados anteriores |
| Historial | A mano, `scripts/sucursales/corte.ts` | Las fechas que se pidan, de 7 en 7 días |

- Las líneas salen de `lineasBi` (`lib/bi/lineas.ts`): una fila por línea del pedido, con el importe de la línea más sus
  modificadores, IVA incluido. El Rappi del portal ya viene mezclado con el POS, así que se guarda como fuente `pos` con
  canal `rappi` y con `p_rappi_portal` en las sucursales con portal, **solo desde la primera fecha con pedidos de esa tienda
  en `rappi_pedidos`** (regla de «Rappi sin doble conteo» del doc 01).
- **Rappi antes del portal.** Una vez por corte, para cada tienda con `rappiPortal`, `cortar` consulta su primera
  `fecha_local` en `rappi_pedidos`. Los días anteriores mandan `p_rappi_portal = false`, así el Rappi de Zoho de la historia
  (antes de oct-2026) no desaparece del BI. Si la consulta falla, manda `false` y lo anota en `bi.fallidos` con fecha `*`
  y motivo «inicio del portal de Rappi».
- **Huella.** `bi_cargas.huella` guarda un md5 de lo que se guardó. Si el corte repite un día igual, `bi_guardar_dia` solo
  renueva `leido_en`: no borra ni inserta (evita millones de filas muertas al día con el cron de 10 minutos).
- **Orden y tiempos del corte.** Primero se leen los días, luego se guarda el resumen y, al final, el BI (de 4 en 4). Cada
  guardado del BI tiene 15 s de límite y, pasados 240 s desde el inicio del corte, los que faltan quedan en `bi.fallidos`
  como «sin tiempo». Un BI lento nunca pierde el resumen ni la fila de `sucursales_cortes`.
- **Script de historial.** `scripts/sucursales/corte.ts` no tiene presupuesto total (el de 240 s es del límite de Vercel),
  solo el tiempo límite de cada guardado.
- **Interruptor.** `BI_CARGA=0` en las variables de Vercel apaga toda escritura del BI (altas de tiendas y guardados) sin
  revertir el despliegue; `bi` sale en ceros. Quitar la variable (o ponerla en otro valor) la reanuda.
- **Nota sobre el cierre de las 5:30.** Ahora también guarda 8 días × 79 tiendas en el BI. Se estima de 20 a 60 s más.
  **Hay que medirlo después del merge**: la función tiene `maxDuration` de 300 s.

## Regla de tiendas nuevas

La base lanza error si la tienda no está en `bi_tiendas`. Por eso `asegurarTiendasBi` revisa al inicio de cada corte las
sucursales configuradas y **da de alta las que faltan, una por una, como «Franquicia»**, sin franquiciatario ni
`fecha_apertura`. Nunca pisa una fila existente, y una fila mala (por ejemplo un `store_id` repetido) no frena a las demás.

- Las altas salen en el resultado del corte (`bi.altas`) y las que fallan, en `bi.fallidos`.
- Si la tienda nueva fuera propia, se corrige a mano en `bi_tiendas` (tipo, franquiciatario y apertura).

## Rappi Turbo

El portal llega como `RAPPI / RAPPI_PORTAL`. `rappiServicio` lee `rappi_tiendas(canal)` y, si el canal es `turbo`, marca el
pedido como `RAPPI_TURBO`. `docs/bi/zoho/pagos.json` lo mapea así:

| Método | Tipo | Etiqueta de Zoho |
|---|---|---|
| RAPPI | RAPPI_PORTAL | RAPPI |
| RAPPI | RAPPI_TURBO | RAPPI TURBO |

## Cómo se ve una falla

El BI **nunca frena** el corte del Tablero México: un día que no se guarda en el BI no impide guardar el resumen.

- **Cron y cierre:** `sucursales_cortes.mensaje` lleva «BI sin guardar: <compañía fecha: motivo>, …». Cada parte del mensaje
  (también «Sin leer: …») se corta en unos 500 caracteres.
- **Script de historial:** cada bloque imprime `bi: N guardados, M fallidos` y, si hubo, `altas de tiendas: …`.
- El día fallido no deja renglón en `bi_cargas` (sin renglón = sin datos, nunca cero). Se corrige la causa y se vuelve a
  cortar ese día: `bi_guardar_dia` reemplaza el día completo.

## Orden de despliegue

1. **Ensayo y merge.** Ensayar las migraciones 40 y 41 con ROLLBACK, luego PR y merge con OK. El merge aplica las
   migraciones y **desde ese momento el cron escribe las líneas de hoy**.
   - Si el código se despliega **antes** de que las migraciones estén aplicadas, los primeros cortes anotarán «BI sin
     guardar». Es inofensivo (el resumen se guarda igual) y el merge las aplica.
2. **Piloto** con 6 tiendas (384, 532, 612, 583, 613, 545) en dos ventanas. Escribe en la base de `.env.local`: solo con OK.

   ```bash
   npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --companias 384,532,612,583,613,545 --desde 2026-08-03 --hasta 2026-10-25
   npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --companias 384,532,612,583,613,545 --desde 2025-10-27 --hasta 2025-11-09
   ```

   Después, el cotejo de esas mismas ventanas (solo lectura, ver abajo):

   ```bash
   npx.cmd tsx --conditions=react-server scripts/bi/cotejo.ts --companias 384,532,612,583,613,545 --desde 2026-08-03 --hasta 2026-10-25
   npx.cmd tsx --conditions=react-server scripts/bi/cotejo.ts --companias 384,532,612,583,613,545 --desde 2025-10-27 --hasta 2025-11-09
   ```

3. **Cotejo con Zoho.** Lo hace el controlador con vistas previas sin guardar (no se cambia nada en Zoho).
   - **Tolerancia:** 0.5 % o 2 pedidos por tienda y día.
   - Se documentan las diferencias (en este doc, al terminar el piloto).
   - Recordar las tiendas sin alta (Hernández Macías, Correo 37 y Unknown): el BI queda unas 9 mil órdenes debajo de Zoho.
4. **Historia completa**, por años y por partes. **Escribe en la base real: solo con OK.** Ten en cuenta:
   - Además del BI, crea filas de `sucursales_resumen_dia` para días que nunca tuvieron resumen (2024-01-01 → 2026-08-09).
   - Cada bloque de 7 días inserta una fila en `sucursales_cortes`, lo que mueve el «último corte» que muestra el Tablero
     México.
   - Los días anteriores a la apertura de una tienda quedan como «cargados con 0 líneas».
   - Los días anteriores al portal de Rappi mandan `p_rappi_portal = false` (ver «Qué carga y cuándo»).

   ```bash
   npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2024-01-01 --hasta 2024-12-31
   npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2025-01-01 --hasta 2025-12-31
   npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2026-01-01 --hasta 2026-08-09
   ```

   El historial del Tablero México ya cubre desde el 2026-08-10, pero sin líneas del BI, así que también se recorre:

   ```bash
   npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2026-08-10 --hasta <ayer>
   ```

   **Tiempo estimado:** unos 90 s por semana con 79 tiendas, unas 4 h en total. Se corre por partes.

## Venta neta (migración 42)

«Ventas Netas» = neto de la API (como Zoho); lo cobrado queda en `importe_cent`. «Net Amount (Local)» de Zoho es el
`netAmout` del POS, después de la comisión del pago (3 % en APP - WALLET, 17.6 % en Rappi por POS). Ejemplo: el pedido
29583590 cobró $98.10 y su neto es $95.16; Zoho muestra $95.16. El detalle del contrato está en el doc 01.

### Resultado del piloto (2026-11-05)

- Mostrador + app **exacto en 2025** (4 tiendas, 14 días): venta y tickets idénticos a Zoho.
- En 2026, tickets ±4 por tienda en 84 días y venta arriba de 0.3 % a 2.8 % por la comisión de la app; corregido con la
  migración 42 (el BI muestra el neto).
- Rappi queda pendiente de F3.

### Aplicar la migración 42

La integración de Supabase no aplica migraciones al fusionar (el check sale «skipped»). Se aplica a mano en el SQL
Editor **y se registra** en el mismo paso:

1. Pegar y ejecutar `supabase/migrations/20261106000042_bi_neto.sql`.
2. Registrarla:

   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values ('20261106000042','bi_neto');
   ```

3. Volver a cortar las fechas del piloto (paso 2 del orden de despliegue) para que las filas traigan el neto; las filas
   viejas leen el neto como lo cobrado.

## Cotejo

`scripts/bi/cotejo.ts` (con `lib/bi/cotejo.ts`) lee `bi_lineas` con la llave de servicio, **solo lectura**, y escribe
`datos/bi-cotejo-<desde>-<hasta>.csv` con los totales por tienda, día, fuente, canal y etiqueta de pago, para compararlos
contra Zoho. Opciones: `--desde`, `--hasta` (obligatorias) y `--companias`.

Los CSV traen totales de ventas: `datos/*.csv` está en `.gitignore` (igual que `datos/*.xlsx`) y no se sube.

## Pendientes

- Confirmar en el piloto las **Fecha Relativa** dudosas (Últimas 4 semanas, N semanas anteriores, Últimos 3 meses).
- Confirmar la rareza de **«W1»** de fin de año (doc 01).
- Confirmar la **maduración de 3 meses**.
- **Rendimiento** de `bi_tablero` y `bi_tendencias` con la historia completa (F4, meta de 3 s).
- Medir el cierre de las 5:30 con el BI (ver nota arriba).

### Después del merge

- Revisar que los primeros cortes no traigan «BI sin guardar» en `sucursales_cortes.mensaje`.
- Medir el cierre de las 5:30 (la función tiene `maxDuration` de 300 s y el BI tiene presupuesto de 240 s).
- Vigilar filas muertas e IO de `bi_lineas` durante un día.
