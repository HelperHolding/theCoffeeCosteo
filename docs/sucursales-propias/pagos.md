# Pagos de Sucursales propias: guía de puesta en marcha

Spec: `docs/superpowers/specs/2026-11-25-sucursales-propias-pagos-design.md`. Plan: `docs/superpowers/plans/2026-11-25-sucursales-propias-pagos.md`.

## 1. Qué hace

Se sube un ZIP con los recibos de Banregio. El portal los lee, empata cada transferencia con proveedor y facturas abiertas de Zoho Books (org *Sucursales The Coffee – GDL*) y, al pulsar «Aplicar», crea el pago al proveedor en Zoho con el recibo PDF adjunto. Antes de tocar Zoho valida que el reparto sume exactamente la transferencia.

Recibos que entiende:

- SPEI con clave de rastreo (la llave es la clave).
- Banregio a Banregio (llave `BRG-…`).
- SPEI «Recibo de la solicitud» sin clave de rastreo (llave `SOL-…`): la corrida muestra un aviso para confirmar con Banregio que ya se ejecutó antes de aplicar.

Detalles de operación:

- Una fila atorada en «Aplicando…» solo se puede reintentar pasados 10 minutos.
- Si el pago se creó en Zoho pero no se guardó el resultado, la fila queda «Aplicada · falta el recibo» con el id de Zoho; el botón Reintentar solo adjunta el recibo.
- Las filas empatadas por nombre muestran «Proveedor por nombre — revisa»; la confirmación en bloque indica cuántas son.
- Quien solo tiene `sucursales_pagos` (sin `sucursales`) entra directo a Pagos y no ve ventas de tiendas.

## 2. Migración

Aplicar `supabase/migrations/20261125000098_sucursales_propias_pagos.sql` con el procedimiento de `docs/portal/MIGRACIONES-Y-DESPLIEGUE.md`: el merge a `main` la aplica sola, así que antes del merge van el respaldo, el ensayo remoto con ROLLBACK del archivo exacto, y la aprobación expresa fijada al SHA ensayado. **No aplicarla a mano.** Después del merge, comprobar en `supabase_migrations.schema_migrations` que la versión `20261125000098` quedó registrada.

## 3. Credenciales de Zoho (lo hace el usuario)

1. En `https://api-console.zoho.com` → *Self Client* (o el cliente que ya usan) → *Generate Code* con los scopes `ZohoBooks.bills.READ,ZohoBooks.contacts.READ,ZohoBooks.vendorpayments.CREATE,ZohoBooks.vendorpayments.READ,ZohoBooks.vendorpayments.UPDATE,ZohoBooks.accountants.READ`, con un usuario que tenga acceso a la org *Sucursales The Coffee – GDL*.
2. Cambiar el código por el refresh token: `POST https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=<id>&client_secret=<secreto>&code=<código>`.
3. El id de la org está en Zoho Books → Configuración → Perfil de la organización.

## 4. Secretos de Supabase

Project Settings → Edge Functions → Secrets (o `npx supabase secrets set`): `ZOHO_SUC_CLIENT_ID`, `ZOHO_SUC_CLIENT_SECRET`, `ZOHO_SUC_REFRESH_TOKEN`, `ZOHO_SUC_ORG_ID`.

`SUC_PAGOS_EFECTOS` **no** se define todavía: sin ella todo es solo lectura.

## 5. Desplegar la función

```bash
npx supabase functions deploy zoho-suc-pagos --project-ref jpqkmnfjwzniptszjuli --use-api
```

## 6. Vercel

Variable `ZOHO_SUC_ORG_ID` (Production y Preview), para los enlaces «Ver en Zoho».

## 7. Dar acceso

SQL con autorización, como los demás accesos (solo empleados Holding; `lectura` para quien solo revisa):

```sql
insert into perfil_modulos (user_id, modulo, nivel) values ('<uuid>', 'sucursales_pagos', 'edicion');
```

## 8. Primera corrida en modo prueba

Con `SUC_PAGOS_EFECTOS` apagado, subir el ZIP real. Se registran la corrida y los empates (solo lecturas de Zoho), y «Aplicar» deja las filas en *Error* con «modo sin efectos externos». Revisar que el empate sea el esperado y, cuando lo sea, definir `SUC_PAGOS_EFECTOS=si`.

Vista previa sin base de datos: `npm run prueba:visual` y abrir `http://127.0.0.1:4173/?pagos-propias` (agregar `&solo-lectura=1` para ver el modo de solo lectura).

### Primera corrida en modo prueba: qué revisar

Los parámetros de Zoho se supusieron sin credenciales reales. En la primera corrida, con un usuario `edicion`, confirmar:

- [ ] **Filtro de estado de facturas.** La acción `facturas` regresa facturas `open`, `overdue` y `partially_paid`. Si Zoho rechaza el parámetro `status`, cambiarlo por `filter_by` con `Status.Unpaid`, `Status.Overdue` y `Status.PartiallyPaid` en `facturasAbiertas` (`supabase/functions/_shared/sucPagos.ts`) y ajustar su prueba en `sucPagos_test.ts`.
- [ ] **Sucursal de la factura.** `location_name` trae la sucursal. Si viene vacío, ajustar el campo leído en `facturasAbiertas` (mismo archivo).
- [ ] **Búsqueda de pago previo.** Al pulsar Aplicar en una fila, el error «modo sin efectos externos» debe aparecer **después** de pasar la búsqueda `GET /vendorpayments?search_text=<llave>` y la relectura de saldos. Si `search_text` no filtra (regresa pagos ajenos o ninguno existiendo), cambiar a `reference_number_contains` en `pagoConReferencia` (mismo archivo) y su prueba.
- [ ] **Adjunto del recibo** (ya con efectos, en la primera fila real). El PDF debe quedar adjunto al pago. Si queda adjunto a cada factura liquidada, es el respaldo documentado: la API de Zoho no admitió adjuntos en pagos (`adjuntarYCerrar`) y no requiere cambio.

Anotar aquí lo que se cambie tras la primera corrida:

- _(sin cambios todavía)_

## Pendiente de confirmar con Banregio

Los recibos SPEI «de la solicitud» (`SOL-…`) no traen clave de rastreo, por lo que no prueban que la transferencia se ejecutó. Confirmar con Banregio qué documento acredita la ejecución (o cómo obtener el recibo con clave) y, mientras tanto, validar cada uno antes de aplicarlo.

## 9. Si algo sale mal

| Mensaje | Causa y qué hacer |
| --- | --- |
| «Zoho de Sucursales GDL no está configurado.» | Faltan secretos `ZOHO_SUC_*` en Supabase; cargarlos y volver a desplegar si hace falta. |
| «no encontré una sola cuenta bancaria …» | El nombre no coincide con exactamente una cuenta en Zoho; revisar `suc_pago_config.cuenta_nombre`. |
| «Aplicada · falta el recibo» | El pago existe en Zoho pero el adjunto falló; botón Reintentar (no duplica el pago). |
| «Ya estaba en Zoho» | Ya existía un pago con esa referencia (llave); no se crea otro. |
| «Otra persona la está aplicando.» | La fila está en «Aplicando…»; esperar. Pasados 10 minutos se puede reintentar. |
| «Lo asignado no es igual a la transferencia» | El reparto no suma el monto; corregirlo en la fila. |
| «El saldo de la factura … cambió en Zoho» | La factura ya se pagó o cambió; revisar la fila y repartir de nuevo. |
| «modo sin efectos externos» | `SUC_PAGOS_EFECTOS` no es `si`; es lo esperado en la corrida de prueba. |
