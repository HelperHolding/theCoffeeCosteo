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
  canal `rappi` y con `p_rappi_portal = true` en toda sucursal con portal (regla de «Rappi sin doble conteo» del doc 01).
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
4. **Historia completa**, por años y por partes:

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
