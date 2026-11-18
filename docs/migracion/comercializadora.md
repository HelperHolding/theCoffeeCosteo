# Comercializadora en el portal: guía de operación (plan 2)

Spec: `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md`. Plan: `docs/superpowers/plans/2026-11-12-migracion-fase-1-datos-funciones.md`.

## 1. Migraciones 45 a 47 en el portal

La 42 está en la base pero no en el historial: primero se registra y luego se aplica lo pendiente.

```bash
npx supabase link --project-ref jpqkmnfjwzniptszjuli
npx supabase migration repair --status applied 20261106000042
npx supabase db push
```

`db push` debe listar solo la 45, la 46 y la 47.

## 2. Rol del puente en bliocjvq (SQL Editor del proyecto viejo)

```sql
create role portal_puente with login password '<clave larga, solo letras y números>';
alter role portal_puente set default_transaction_read_only = on;
alter role portal_puente bypassrls;
grant select (id, apertura_id, fecha_pedido, status, items, items_editados, franquiciatario_email, notas_shopify,
              es_llenado_canal, marketing_proyecto_id) on public.pedidos to portal_puente;
grant select (pedido_id) on public.pedidos_apertura to portal_puente;
grant select (id, estatus, fecha) on public.aperturas to portal_puente;
```

## 3. User mapping en el portal (SQL Editor del proyecto nuevo)

```sql
create user mapping for service_role server legado
  options (user 'portal_puente.bliocjvqwskvoxrumqby', password '<la misma clave>');
create user mapping for postgres server legado
  options (user 'portal_puente.bliocjvqwskvoxrumqby', password '<la misma clave>');
select count(*) from public.com_legado_aperturas;  -- debe dar el mismo número que aperturas en bliocjvq
```

## 4. Secretos y Vault del portal

Funciones (Project Settings → Edge Functions → Secrets, o `npx supabase secrets set`):

| Secreto | Valor |
| --- | --- |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, `ZOHO_LOCATION_ID` | los mismos del proyecto viejo |
| `COM_SECRETO` | una clave larga nueva |
| `CORREO_URL` | `https://bliocjvqwskvoxrumqby.supabase.co/functions/v1/send-email` |
| `CORREO_LLAVE` | la llave anon del proyecto viejo |
| `COM_EFECTOS_EXTERNOS` | **no se define** hasta el cutover (plan 4) |

Vault (Project Settings → Vault): `project_url` = `https://jpqkmnfjwzniptszjuli.supabase.co` y `com_secreto` = el mismo valor que `COM_SECRETO`.

## 5. Desplegar funciones

```bash
npx supabase functions deploy zoho-sync com-minmax zoho-generar-oc zoho-proveedor-minimo --project-ref jpqkmnfjwzniptszjuli --use-api
```

## 6. Copiar datos

```bash
npx tsx scripts/migracion-legado/comercializadora.ts
npx tsx scripts/migracion-legado/comercializadora.ts --aplicar
```

La primera es simulación. La segunda escribe. Al final, `auto.modo` queda en `simulacion`.

La copia es un **espejo**: hasta el cutover manda el sitio viejo, así que en cada tabla copiada el portal queda igual al viejo. Lo que el portal haya creado o cambiado en esas tablas (por ejemplo, las corridas manuales del paso 7) se reemplaza o se borra. El reporte cuenta las filas `borradas`.

## 7. Prueba manual (sin cron, sin efectos)

En el SQL Editor del portal, una a la vez y revisando `com_sync_log` entre cada una:

```sql
select public.com_invocar('zoho-sync');
select public.com_invocar('com-minmax');
select public.com_invocar('zoho-generar-oc', '{"origen":"manual","modo":"simulacion"}');
select proceso, ok, error, inicio from public.com_sync_log order by inicio desc limit 5;
```

El cron sigue inactivo: `select jobname, active from cron.job;` debe mostrar los tres jobs con `active = false`.

## 8. Pantallas del portal (plan 3)

- Ruta: `/comercializadora`. Acceso: el admin da el módulo `comercializadora` en `perfil_modulos` (`lectura` ve; `edicion`/`desarrollador` editan).
- Vercel (Production y Preview) necesita `COM_SECRETO` con el mismo valor que el secreto de las funciones; sin él, los botones que recalculan o envían a Zoho muestran "no está configurado".
- Mientras el sitio viejo siga en Real, en el portal no se capturan OCs, mínimos ni cierres de verdad: el espejo de la copia los borraría y el viejo sigue siendo la fuente.

## 9. Inventario, catálogo, kit y configuración (plan 3b)

- El CEDIS se ajusta en Zoho Books; en el portal solo se ajusta y cuenta el 3PL (`com_ajustar_3pl`, todo o nada).
- Quién autoriza un ajuste: perfiles con Comercializadora `edicion` o `desarrollador`.
- `auto.modo` no se cambia desde la pantalla de configuración: se pasa a Real en el cutover (plan 4).
- Días de crédito: se editan en Zoho (términos de pago); el portal los muestra.

## 10. Inicio, Envíos, Traspasos y Mapeo (plan 3c)

- El puente lee además `pedidos.monto`, `pedidos.shopify_order_number`, `aperturas.sucursal` y `aperturas.contacto`. En bliocjvq, `portal_puente` necesita `grant select` de esas columnas (aplicado antes de la migración 49).
- Inicio y Mapeo leen el puente en el servidor con la llave de servicio (`SUPABASE_SECRET_KEY`); en Vercel debe existir en Production y Preview. Sin ella, Inicio muestra lo de `com_*` y avisa que no hay ventas.
- Ingresar un traspaso al 3PL suma a `saldo_yulius` en la misma transacción (`com_ingresar_traspaso`); al CEDIS se registra en Zoho.
- Crédito Comercializadora y los KPIs de pedidos (Fill rate, OTIF, entregas, encuestas, DSO) se migran con Pedidos. Ventas no se porta.
- Indicadores y DOH llegan con el plan 3d (necesitan el motor de planeación).

## 11. Motor, DOH e Indicadores (plan 3d)

- El motor de planeación del sitio viejo (`_planEngSku`, `_planDatAMotor`, `_planBuild`, `_kpiAbCalc`, `_planPzasApCalc`) está portado en `supabase/functions/_shared/plan{Motor,Datos,Build,Kpi,Piezas}.ts`. Las pruebas de paridad se corren con el HTML viejo:
  `git -C <repo viejo> show a9e4a22:app/index.html > "$TEMP/app-vieja-a9e4a22.html"` y luego `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones` (sin la variable, se ignoran).
- DOH, Indicadores, el riesgo de quiebre de Inicio y Piezas por apertura se calculan en el servidor del portal. Los datos crudos se guardan 10 minutos en memoria, compartidos entre usuarios; "Actualizar" los vuelve a leer. Leen los pedidos por el puente con `SUPABASE_SECRET_KEY`.
- Como en el viejo, DOH e Indicadores usan el cálculo local (no la simulación de `com-minmax`) y el lead time de `com_lead_times`. **Diferencia conocida con Qué pedir:** `com-minmax` usa primero `zoho_lead_time`.
- Un borrador de OC (en la carga de Zoho de la configuración o con `status = 'draft'` en `com_zoho_oc_lineas`) nunca cuenta como en camino. Ya no se usa la copia fija de OCs del 13-oct del sitio viejo.
- Las metas de Indicadores se guardan en `com_plan_config.config.kpi` con historial (`kpi.<meta>`). Mientras el viejo siga en Real, no se editan desde el portal.
- Piezas por apertura: Catálogo → "Sugerir piezas por apertura". Aplicar guarda solo lo marcado y deja historial por artículo.
- "OCs en camino al día con Zoho" (Indicadores › Datos del plan) mide la frescura de la última corrida buena de `zoho-sync` (≤ 3 días verde, ≤ 7 ámbar), no la conciliación por archivo del viejo.

## 12. Importaciones y Café (plan 3e)

- Pantallas `/comercializadora/importaciones` y `/comercializadora/cafe` ("Planear y pagar"), con vistas por `?vista=`, escenario por `?esc=` (solo cambia lo que se ve) y "Ver todo" (`?det=1`).
- Los motores de las Sheets (`_impEngine`, `_cafeEngine`) son copias exactas del HTML viejo en `supabase/functions/_shared/{impEngine,cafeEngine}.ts`, generadas con `node scripts/comercializadora/portar-motores-hoja.mjs <html viejo> .`; no se editan a mano. El adaptador (`planImp.ts`), la configuración (`impCafeCfg.ts`), el café (`planCafe.ts`) y la agrupación por proveedor (`planProv.ts`) son ports con paridad: `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`.
- Todo corre sobre los datos del motor del plan (caché de 10 minutos compartida). Se agregó una lectura opcional de `com_zoho_proveedor` (mínimos de proveedor) para el Qué pedir de café; si falla, aviso "mínimos de proveedor".
- Parámetros: se guardan solo en `com_plan_config.config.imp` / `.cafe`, normalizados, con la versión que se vio e historial por clave (`imp.items.SKU.venta`, `cafe.prod.white_1kg.precio`…). No recalculan `com-minmax`. Mientras el viejo siga en Real, no se editan desde el portal.
- Exportar Excel: `.xlsx` en el navegador con SheetJS 0.20.3 (la CDN oficial que ya usa el portal), con las hojas del viejo (7 y 4).
- Crear OC: abre Órdenes con el formulario prellenado (`?nueva=importaciones|cafe&proveedor=…&l=SKU:cantidad…`). Solo entran SKUs del catálogo; nada se guarda hasta pulsar Guardar.
- Diferencias conocidas con el viejo: un borrador real de Zoho no cuenta como en camino en Importaciones; Proyección mensual nombra el escenario que se ve; no se portan el chip de pago, el aviso de activaciones ni el "impacto" en vivo del borrador de parámetros.

## 13. Plan de abastos y Esta semana (plan 3f)

- Pantallas `/comercializadora/plan-abastos` ("Planear y pagar") y `/comercializadora/esta-semana` ("Comprar"). Solo leen: "Crear OC" abre Órdenes prellenado (`?nueva=plan` para lo local; Café e Importaciones con sus enlaces del 3e) y "Copiar pedido" usa el portapapeles.
- Plan de abastos: categorías incluidas por `?sin=cafe,imp`, semanas por `?sem=4|8|12`, `?vista=articulo`, búsqueda `?q=`/`?prov=` y "Ver todo" (`?det=1`). La gráfica es "Compras por semana"; los pagos por viernes están en Pagos proyectados. Exportar Excel lleva las seis hojas del viejo (sin la carga de Zoho en Configuración).
- Esta semana: `?sem=1` para la próxima; "Ver todo" (`?det=1`).
- Cálculo: ports con paridad en `supabase/functions/_shared/{planSem,planHoy}.ts` y `planLocal` en `planProv.ts` (`COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`). Lo local usa la simulación del servidor (`com_pago_proyectado`) si la corrida de `com-proyeccion` tiene ≤ 36 h y está completa; si no, el cálculo local, y el aviso de arriba lo dice.
- Viernes de pago: pedido el lunes de la semana (o hoy), contado = el viernes con al menos 3 días; con crédito, el viernes anterior al vencimiento. Los días de crédito salen de `com_zoho_proveedor.dias_credito`, por el vendor del grupo y, si no hay, por nombre (sin el paréntesis final); sin coincidencia, contado ("sin proveedor de Zoho").
- Borradores por resolver: los `draft` de zoho-sync (`com_zoho_oc_lineas`); emitir, ajustar o borrar con las reglas del viejo. Un borrador no cuenta como en camino ni como compra emitida.
- La carga del motor lee además `com_catalogo.clasificacion_detallada`, `com_zoho_oc_lineas.synced_at` y `com_zoho_proveedor.dias_credito`.
- Diferencias conocidas con el viejo: crédito desde Zoho y no desde `com_proveedores`; borradores de zoho-sync en lugar de la carga de la configuración; el error de una categoría se ve también en la vista simple; Importaciones usa el escenario guardado; no se portan "Pagos por viernes", el historial de 60 días por proveedor ni los avisos de `_planBannersHtml` (salvo el de la fuente de las cantidades).
