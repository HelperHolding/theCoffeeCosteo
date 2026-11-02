# 05 · Rappi del portal en las demás sucursales de Guadalajara

Fecha: 2026-11-02. Carlo pidió replicar lo de Namóra (docs 03 y 04) en las otras 10 sucursales de Guadalajara. Lo pidió
así: «que en la misma ejecución se scrapee más información, lo mismo que ya pide para Namóra pero para cada sucursal».
Es la opción sin costo extra de la valoración de abajo. Si el servidor se aprieta, se sube a 4 GB.

## Valoración del servidor (medida el 2026-11-02, solo lectura)

| Dónde                   | Medido                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Droplet de DigitalOcean | 1 vCPU y 2 GB ($12/mes), compartido con Dodo. Libres ~790 MB; ya usa 620 MB de swap; n8n ocupa ~500–600 MB                                 |
| Nuestro lector          | 113 MB en reposo; ~250 MB por unos segundos en cada corrida. «En vivo»: 16.6 s en la mediana. Cada ~2 h renueva la sesión y tarda ~2.5 min |
| Cierre y repaso         | Cierre (7 días): 43–115 s. Repaso (14 días): 76 s                                                                                          |
| Lector de Dodo          | Cada 15 min de 10:00 a 23:45 (mediana 9–16 s, máximo ~100 s). Cierre a las 6:30: hasta 8 min. **Entre 0:00 y 6:30 no corre**               |
| n8n                     | Guardaba ~130 KB de cada corrida durante 14 días; su base pesa 117 MB                                                                      |
| Supabase                | La base completa pesa 33 MB; Rappi de Namóra suma ~2.5 MB al mes                                                                           |
| Página de la sucursal   | Leer un mes de Rappi: 68 ms en la base y 0.3–0.6 s en llegar. Cada sucursal lee solo lo suyo                                               |

Con 11 sucursales (22 tiendas) y el lector como estaba, se proyectaba lo siguiente:

- cada corrida «en vivo» tardaría 1.5–3 min, porque pedía tienda por tienda en fila;
- el cierre de las 6:30 coincidiría con el de Dodo: dos navegadores a la vez en un servidor que ya usa swap;
- n8n guardaría ~1 MB por corrida, 1–2 GB en 14 días.

La página y Supabase no cambian: cada sucursal cuesta lo mismo que Namóra hoy, y la base crece ~25–30 MB al mes.

## Qué cambia en el lector

- **Misma corrida, todas las tiendas.** Sigue siendo una consulta por tienda y día, porque el listado no trae el ID de
  tienda y con toda la marca el portal dio HTTP 500 (doc 03). Ahora van 3 consultas a la vez en la misma página
  (`RAPPI_CONCURRENCIA`, máximo 6). Probado contra un portal simulado: 22 tiendas por 18 días, 396 consultas, siempre 3
  a la vez y resultados en el orden de tienda y día.
- **Reintento:** si Rappi responde 429 o 5xx, la consulta se repite dos veces con pausa de 2 y 4 s. Un 401/403 corta la
  corrida como `sesion_expirada`.
- **Descuentos (detalle del pedido):** «en vivo» lee hasta 80 por corrida; cierre y repaso, 400; una reposición manual, 1000. El mensaje dice cuántos faltan para las siguientes corridas.
- **Nombre de la tienda:** cada tienda del lote trae `nombre`, el que aparece en sus pedidos. `rappi_importar` lo ignora.
  Sirve para comprobar el ID de una tienda nueva.
- **Comprobar tiendas antes del alta:** una corrida `manual` acepta `tiendas` (de 1 a 30 IDs) fuera de `RAPPI_TIENDAS`.
  Es la misma lectura. Si ese lote llegara a Supabase, `rappi_importar` lo rechazaría completo porque trae tiendas sin
  alta.
- **Tope de reposición:** una corrida manual admite a lo más 400 consultas (días × tiendas). Con 22 tiendas son 18 días
  por corrida, para que termine antes de los 10 min que espera n8n.
- **Duración:** el mensaje de cada corrida (en `rappi_corridas`) dice cuántos segundos tardó.

## Qué cambia en n8n

- **Cierre:** a las 5:07, antes a las 6:30. **Repaso:** domingo a las 4:07, antes a las 5:30. A esas horas Dodo no corre.
- **Corridas que salen bien:** n8n ya no las guarda. Cada corrida queda en `rappi_corridas`, y si algo sale mal llega el
  correo. Se siguen guardando las que fallan dentro de n8n y las que se corren desde el editor.

## Tiendas

IDs de la cuenta del portal. Turbo: leídos el 2026-10-29 de `brand/family/email` y comprobados con pedidos del 27-oct
(doc 03). Normal: del filtro «Sucursales» del portal (doc 02). Los nombres de las tiendas normales se confirman con la
corrida de comprobación (paso 4).

| Sucursal (company_id)   | Tienda normal                           | Tienda Turbo                                          | Pedidos Turbo 27-oct |
| ----------------------- | --------------------------------------- | ----------------------------------------------------- | -------------------- |
| Rubén Darío (532)       | `MX1930260682` «The Coffee Rubén Darío» | `MX1930284884` «The Coffee Rubén Darío Turbo»         | 15                   |
| Ventura (384)           | `MX1930213018`                          | `MX1930370852` «The Coffee Ventura - Turbo»           | 9                    |
| Aleden (457)            | `MX1930215621` (Aleden Puerta)          | `MX1930284932` «The Coffee Aleden Puerta - Turbo»     | 4                    |
| Legacy (459)            | `MX1930215622`                          | `MX1930366484` «The Coffee Legacy - Turbo»            | 9                    |
| Granja (477)            | `MX1930215620` (Ciudad Granja)          | `MX1930370853` «The Coffee Ciudad Granja - Turbo»     | 7                    |
| Chapu 67 (515)          | `MX1930260683`                          | `MX1930384086` «The Coffee Chapu 67 - Turbo»          | 10                   |
| Essentia (514)          | `MX1930270836`                          | `MX1930370851` «The Coffee Essentia - Turbo»          | 15                   |
| Calle Ottawa (518)      | `MX1930258127` (Calle Otawa)            | `MX1930387241` «The Coffee Otawa - Turbo»             | 6                    |
| Gran Plaza (567)        | `MX1930384164`                          | `MX1930416799` «The Coffee la Gran Plaza - Turbo»     | 15                   |
| Forum Tlaquepaque (631) | `MX1930395081`                          | `MX1930469273` «The Coffee Forum Tlaquepaque - Turbo» | 3                    |

- Hay copias en la cuenta: «Ventura (copy)» `MX1930455612` y «Aleden Puerta - Turbo (copy)» `MX1930468098` (sin
  pedidos el 27-oct). No se usan.
- **Rubén Darío** ya tiene Rappi por la API del POS, incompleto («Generic» y sin vaso). Sus tiendas se leen, pero
  aprovecharlas necesita una decisión aparte (doc 06). Cuando un pedido llega por los dos lados (`refundId`), la página
  no lo cuenta dos veces, pero se queda con la versión del POS. Hasta entonces sigue como hoy.

## Pasos (cada uno con OK de Carlo)

1. **PR del lector y del flujo.** El merge no toca el servidor: el código del lector se copia a mano.
2. **Lector nuevo en el servidor, todavía solo con Namóra:**
   - respaldo de `/opt/n8n/rappi-thecoffee`;
   - copiar `servidor.mjs` y `lote.mjs`;
   - `docker compose build rappi-thecoffee && docker compose up -d --no-deps rappi-thecoffee` en un minuto sin corrida
     (entre :09 y :15);
   - revisar `/salud` y las siguientes corridas en `rappi_corridas`: mismos pedidos y duración en el mensaje.
3. **Flujo de n8n:** `node --env-file=… servicios/rappi-portal/flujo-n8n.mjs` (cierre 5:07, repaso 4:07, sin guardar
   corridas buenas). Conserva credenciales y webhook.
4. **Comprobación de las 20 tiendas, en solo lectura:**
   - una corrida `manual` de ayer con `tiendas` = las 20, desde el contenedor del lector, en un minuto sin corrida;
   - la clave se toma del entorno del contenedor y no se imprime;
   - se anotan por tienda el `nombre` y los conteos, sin datos de clientes;
   - si un nombre no corresponde a la sucursal, esa tienda no se da de alta.
5. **Migración 29:** las 20 filas de `rappi_tiendas` con los nombres comprobados. Antes del merge (que la aplica):
   respaldo, ensayo con ROLLBACK y OK de Carlo.
6. **`RAPPI_TIENDAS` con las 22 tiendas** en el compose del servidor y `up -d --no-deps rappi-thecoffee`. Siempre
   después del paso 5: si llega una tienda sin alta, `rappi_importar` rechaza el lote completo, Namóra incluida.
7. **Historial:** reposiciones manuales por el webhook «Reponer», de 18 días cada una, de madrugada. Se revisa la memoria
   del servidor en la primera.
8. **Mostrar en la página**, por sucursal (auditoría y lista completa en el doc 06):
   - medir su Rappi con `scripts/sucursales/auditar-replica.ts` (sin traducción, tamaños, cuadre);
   - PR con `rappiPortal: true` y `alcance: ALCANCE_POS_RAPPI_PORTAL` en `lib/sucursales/config.ts`.
9. **Una semana de seguimiento:** duración de las corridas, memoria y swap del servidor. Si se aprieta, se sube el
   droplet a 2 vCPU y 4 GB ($24/mes). Ese cambio reinicia el servidor unos minutos, y Dodo también se detiene.

## Qué se sacrifica

- **Consultas a Rappi con la misma cuenta:** ~11 veces más que hoy, en ráfagas de 3. No se conoce el límite de Rappi; el
  reintento cubre un 429 suelto, y si se repite se baja `RAPPI_CONCURRENCIA`.
- **Historial de n8n:** ya no se ven las corridas buenas en n8n, solo en `rappi_corridas`.
- **Descuentos del historial:** se completan en varias corridas (los pedidos sin detalle cuentan con descuento 0 mientras
  tanto).
