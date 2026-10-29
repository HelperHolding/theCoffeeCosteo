# 02 · Diseño del cron de n8n para Rappi (piloto Namóra)

Fecha: 2026-10-29. **Solo diseño**: no se construyó ningún flujo, tabla ni migración. La evidencia está en el doc 01.

## Decisión de arquitectura

| Opción                                     | Cómo                                                                                                                                                                                                      | Sesión sin intervención                                                                                                                                                     | Veredicto                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **A. Extractor con navegador** (como Dodo) | Contenedor junto a n8n con Playwright sin pantalla. Abre `partners.rappi.com` con la sesión guardada y, **desde la página**, pide el JSON del historial (`by-stores`) con el token que la página ya tiene | El navegador renueva el token de 2 h solo (Auth0 con su cookie). Cuando esa sesión de Auth0 caduque: login automático con credenciales guardadas o aviso para entrar a mano | **Recomendada para el piloto**                               |
| B. HTTP directo desde n8n                  | Nodo HTTP con `Authorization: Bearer`                                                                                                                                                                     | No hay refresh token visible: el token muere a las 2 h. Dodo lo intentó con refresh token y Rappi lo rechazó (HTTP 500)                                                     | Descartada                                                   |
| C. Integración oficial                     | API de Rappi (órdenes + webhooks) o la integración del proveedor del POS, como en Rubén Darío                                                                                                             | Credenciales de servidor (`client_id`/`client_secret`)                                                                                                                      | **La mejor a largo plazo**; depende de Rappi o del proveedor |

Recomendación: construir A para Namóra y, en paralelo, pedir C. Si C llega, A se apaga sin cambiar las tablas.

A difiere de Dodo en un punto: la cuenta de The Coffee **no** puede usar el endpoint de Dodo (403). El extractor
lee `…/rests-stores-config/orders/by-stores`, que además ya trae productos y opciones, así que no hace falta abrir
cada pedido salvo para los descuentos.

## 1. Disparo y ventana

| Corrida          | Cuándo                                                                                                                                    | Ventana                                | Para qué                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| **En vivo**      | Cada 10 min, de 07:00 a 23:50 (hora de Guadalajara; el 27-oct el primer pedido del POS fue a las 07:32 y el primero de Rappi a las 07:43) | Ayer y hoy (`from` = ayer, `to` = hoy) | Pedidos nuevos y cambios del mismo día o la noche                  |
| **Cierre**       | 06:30                                                                                                                                     | Últimos **7 días**                     | Cerrar el día anterior y detectar reclamos y cancelaciones tardías |
| **Repaso largo** | Domingo 05:30                                                                                                                             | Últimos **14 días**                    | Margen sobre la evidencia; se ajusta tras 4 semanas de datos       |

- **Por qué 7 días:** en Dodo, el repaso del 28-oct encontró 4 pedidos que pasaron a «Con reclamo» 2 a 4 días después
  (doc 01 §6). Con The Coffee, la tabla de cambios (abajo) medirá el máximo real; si algún cambio llega después de
  7 días, el repaso diario se amplía.
- **Paginación:** `page_size` 100 y `page_number` desde 0 hasta una página vacía. Tope de 20 páginas por corrida
  (Namóra en 2 días son ~25 pedidos: una página).
- **Detalle** (`GET …/orders/{id}`): solo para pedidos nuevos o cuya huella cambió, para traer `discount_info`. En
  Namóra son ~12 al día.
- **Una corrida a la vez:** si la anterior sigue, la nueva se salta y se anota `ocupado` (patrón de Dodo).

## 2. Sesión

- **Primera vez:** Carlo inicia sesión en una PC con el script de login y exporta la sesión (`storageState`: cookies +
  `localStorage`). El archivo va al volumen del extractor. Nunca al repo ni al chat.
- **Cada corrida:** el extractor abre la sesión, deja que el portal renueve el token y, al terminar, **reescribe** la
  sesión (escritura atómica), igual que Dodo.
- **Cuando caduca la sesión de Auth0** (duración sin confirmar), hay dos opciones a decidir:
  1. **Aviso y login manual:** el flujo marca `sesion_expirada`, avisa por correo y alguien repite el login y la
     exportación. En Dodo pasó 1 vez en 8 días; quedó caído 1 h.
  2. **Login automático:** credenciales guardadas en el servidor del extractor (como Dodo desde el 27-oct). Requiere
     que el login no pida código ni captcha, y el OK de Carlo para guardar credenciales.
- Si el login pide segundo factor, la opción 2 no es viable y queda la 1.

## 3. Corrección continua

Cada corrida vuelve a leer **toda** su ventana y actualiza lo guardado:

1. **Upsert por pedido:** clave `rappi_pedido_id` (el número sin `MX`). Un pedido que ya existe se actualiza; nunca
   se inserta otro.
2. **Huella:** hash de estado + disputa + productos + opciones + importes. Si cambia:
   - se guarda el estado anterior y la corrida que lo cambió;
   - se registra cada campo cambiado en `rappi_pedido_cambios`;
   - los productos y opciones del pedido se **reemplazan** (borrar y volver a insertar los del pedido), no se acumulan.
3. **Detecta:** cancelación después de entrar (`state` pasa a `canceled*`), cambios de estado, reclamos (`is_dispute`,
   `dispute_status`), cambios de importe o de productos.
4. **Pedido que desaparece:** si un pedido guardado no aparece al releer su día, **no se borra**: se marca
   `revisar = true` con la corrida, y se avisa.
5. `visto_primero` y `visto_ultimo` por pedido.

## 4. Comprobación por corrida

- Por cada día de la ventana, se comparan tres números:
  - `total_rows` del portal;
  - pedidos que devolvió el portal;
  - pedidos guardados de ese día, con la suma de `bruto`.
- **Faltantes del portal** (`total_rows` mayor que lo devuelto; doc 01 §3: 5 de 84 en Namóra):
  - se guardan por día en `rappi_corridas`;
  - el aviso sale solo si la diferencia **persiste después del cierre de 06:30**.
  - Pendiente averiguar cómo recuperarlos: CSV del portal, con permiso de Carlo, o API oficial.
- **Si no cuadra** lo guardado contra lo leído, la corrida queda en `error` y avisa.
- **Reprocesar** un día (webhook con `{"desde":"AAAA-MM-DD","hasta":"AAAA-MM-DD"}`) da el mismo resultado: todo es
  upsert y reemplazo.

## 5. Destino en Supabase (esquema propuesto, sin migración)

Sin datos personales. Lectura con la misma regla de Sucursales (`perfil_sucursales` por `company_id`); escritura solo
desde n8n con una llave de servicio guardada en n8n.

```text
rappi_tiendas         rappi_tienda_id (MX1930270777) PK · company_id (513) · nombre · activa
rappi_pedidos         rappi_pedido_id (bigint) PK · rappi_tienda_id · company_id · creado_local (timestamp sin zona)
                      · fecha_local · estado · estado_nombre · en_disputa · estado_disputa · metodo_pago · prime
                      · bruto (order_product_total_price) · descuento_aliado (total_discount_by_partner, null sin detalle)
                      · descuentos jsonb (discount_info.discounts tal cual) · huella · estado_anterior
                      · corrida_cambio · visto_primero · visto_ultimo · revisar
rappi_pedido_productos  (rappi_pedido_id, linea) PK · rappi_producto_id · nombre · unidades · precio
                      · precio_con_desc_aliado · descuento_rappi_pct
rappi_pedido_opciones (rappi_pedido_id, linea, orden) PK · categoria · descripcion · precio · unidades
rappi_corridas        id · tipo (vivo|cierre|repaso|manual) · inicio · fin · desde · hasta · estado
                      · leidos · total_rows jsonb (por día) · nuevos · cambiados · desaparecidos · mensaje
rappi_pedido_cambios  rappi_pedido_id · corrida_id · campo · antes · despues · en
rappi_equivalencias   tipo (producto|opcion) · rappi_nombre_norm · categoria · codigo_pos · receta_id · notas
```

- **Hora:** `created_at` llega en hora local con etiqueta `+00:00` (doc 01 §4). Se guarda como hora local, igual que
  el POS. **Sin confirmar** con Rappi; la primera semana se valida con la hora de pedidos de Rubén Darío en el POS.
- Comisión, neto y liquidación **no** se guardan por pedido: el portal no los da por pedido (regla de Carlo: solo datos
  de la fuente, sin nombres inventados).

## 6. Cruce con el POS

**Ventas de Namóra:**

- Rappi se suma como origen «Rappi» a las ventas del POS de la 513 (cambio de código en Sucursales, fuera de esta
  ejecución).
- Doble conteo: en el cotejo del 27-oct no hubo pedidos de Rappi en el POS de Namóra. Por regla, si un día el POS trae
  un pedido `RAPPI` con `refundId` = un `rappi_pedido_id`, cuenta el del POS y el del portal solo lo enriquece.
- En Rubén Darío esa regla evita contar dos veces los pedidos que ya llegan por la integración.

**Productos** (para Productos, Costeo y Consumo):

1. Nombre normalizado: minúsculas, sin acentos ni espacios dobles ni puntuación final. Se busca en
   `rappi_equivalencias` (producto → código POS o receta).
2. Opciones: tabla de equivalencias Rappi → personalización del POS (Deslactosada → Lactose free, Mediano 440 ml →
   Regular - 440ml, Poco → Less Honey… doc 01 §5).
3. **Combos** («Crea tu The Coffee», «Iced latte + sandwich jamón y queso»): la bebida y el pan vienen como opciones
   («Elige tu Bebida», «Elige Tu Sandwich»). Se emparejan las partes, pero el reparto del precio del combo no existe en
   la fuente, así que el combo queda **sin costeo** hasta que Carlo decida una regla.
4. Lo que no empareja queda «sin emparejar», con su venta visible (nunca se estima).

Cobertura esperada: Namóra vendió 32 productos distintos en 8 días. Se mide la primera semana; la tabla de equivalencias
se llena a mano, por lote y con aprobación, como los enlaces POS.

## 7. Fallos y monitoreo

| Situación                                                              | Estado de la corrida     | Aviso                                                                               |
| ---------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| Sesión caducada                                                        | `sesion_expirada`        | Correo a Carlo al aparecer y cada 6 h si sigue (patrón de Dodo)                     |
| Portal lento o cambiado (no aparece el historial, JSON con otra forma) | `error` con el detalle   | Correo                                                                              |
| Faltantes del portal que persisten tras el cierre                      | `ok` con `faltantes`     | Correo diario con la lista por día                                                  |
| Pedido desaparecido                                                    | `ok` con `desaparecidos` | Correo                                                                              |
| Corrida ocupada                                                        | `ocupado`                | Sin aviso                                                                           |
| Cero pedidos                                                           | `sin_ordenes`            | Sin aviso. **A decidir:** avisar si no entra ninguno en N horas de horario de venta |

Correo con la credencial SMTP que ya existe en n8n. Cada corrida queda en `rappi_corridas` para auditar.

## 8. Escalado

- **Una sesión basta para las 73 tiendas:** `by-stores` acepta varias tiendas a la vez. Con toda la marca: 3,144
  pedidos en 8 días (~390 al día), unas 8 páginas de 100 por corrida «en vivo». El detalle solo de lo nuevo o cambiado.
- Como el listado no trae el ID de tienda, se pide **una consulta por tienda** (o se traduce `store_name` con
  `rappi_tiendas`).
- Para agregar una sucursal basta una fila en `rappi_tiendas` con su `company_id`.

| Sucursal          | `company_id` | Tienda en Rappi                                                 |
| ----------------- | ------------ | --------------------------------------------------------------- |
| Namóra            | 513          | `MX1930270777`                                                  |
| Rubén Darío       | 532          | `MX1930260682` (ver pendiente 2 del doc 01)                     |
| Ventura           | 384          | `MX1930213018` («Ventura (copy)» `MX1930455612` también existe) |
| Aleden            | 457          | `MX1930215621` (Aleden Puerta)                                  |
| Legacy            | 459          | `MX1930215622`                                                  |
| Granja            | 477          | `MX1930215620` (Ciudad Granja)                                  |
| Chapu 67          | 515          | `MX1930260683`                                                  |
| Essentia          | 514          | `MX1930270836`                                                  |
| Calle Ottawa      | 518          | `MX1930258127` (Calle Otawa)                                    |
| Gran Plaza        | 567          | `MX1930384164`                                                  |
| Forum Tlaquepaque | 631          | `MX1930395081`                                                  |
| Bonampak          | 583          | `MX1930356312`                                                  |
| Cd. Juárez        | 612          | `MX1930415960`                                                  |

Las equivalencias salen del nombre en el filtro del portal; antes de usarlas se verifican con pedidos de cada tienda.

## Decisiones pendientes para Carlo

1. Opción A (extractor con navegador) para el piloto, y pedir en paralelo la integración oficial (C).
2. Sesión: login automático con credenciales guardadas o aviso y login manual (depende del 2FA).
3. Permiso para descargar un CSV del historial y ver si trae los pedidos que faltan en el listado.
4. Horario de la corrida «en vivo» y si se avisa cuando pasan N horas sin pedidos.
5. Regla para el precio de los combos de Rappi en Costeo, o dejarlos sin costeo.
6. Revisar el convenio con Rappi sobre accesos automatizados al portal.

## Prompt borrador de la siguiente ejecución (NO AUTORIZADO)

> **Encargo:** construir el piloto de Rappi para Namóra según `docs/rappi-portal/02-DISENO-CRON-N8N.md`.
>
> **Requiere OK explícito de Carlo antes de empezar:** la opción de arquitectura, el manejo de la sesión, y guardar
> credenciales en n8n o en el servidor.
>
> **Requiere OK antes del merge:** la migración de las tablas `rappi_*`. En este repo, el merge a `main` aplica la
> migración (ver `docs/portal/MIGRACIONES-Y-DESPLIEGUE.md`).
>
> **Pasos:**
>
> 1. Migración con las tablas del §5 y RLS por `perfil_sucursales`, con pruebas en PGlite.
> 2. Extractor (contenedor junto a n8n):
>    - `POST /sincronizar {desde, hasta, tiendas}`;
>    - lee `by-stores` desde la página con la sesión guardada y detalle solo de lo nuevo o cambiado;
>    - responde `{estado, mensaje, por_dia: {total_rows, devueltos}, pedidos[]}`, sin datos personales.
> 3. Flujo de n8n:
>    - disparos del §1, upsert por huella (§3), comprobación por corrida (§4) y avisos (§7);
>    - creado **inactivo**; Carlo lo activa.
> 4. Validación:
>    - 7 días de Namóra contra el portal (conteo y bruto por día);
>    - reprocesar un día dos veces y comparar;
>    - un cambio de estado provocado por el tiempo, sin tocar pedidos.
>
> **Prohibido:**
>
> - acciones en el portal de Rappi;
> - activar el flujo sin OK;
> - otras sucursales;
> - guardar datos personales.
