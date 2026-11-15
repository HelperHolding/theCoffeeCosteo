# Campos crudos de un pedido de la API del POS

Leído el 2026-11-05 con OK de Sebastián, en modo solo lectura. Se usó `scripts/sucursales/explorar-api.ts pagina`
(Polanco, 545, el 2026-11-03, 5 pedidos) y luego `extraer` de un día completo de 545 y 532. Las respuestas crudas
quedaron fuera del repo, en `%TEMP%\thecoffee-sucursales-api`.

## Pedido

| Campo | Tipo | Ejemplo / nota |
|---|---|---|
| `id` | number | 32236481. Es el `Order ID` de Zoho |
| `companyId` | number | 545 |
| `lookerStoreId` | number | 432. Es el `Store ID` de Zoho |
| `fromSmartphone` | boolean | `true` = App The Coffee |
| `netAmout` | number | (sic) |
| `grossAmount` | number | importe cobrado |
| `percentageOfTransfer` | number | 100 |
| `refundId` | string | no se usa (dato de transacción) |
| `discount` | number | monto |
| `paymentMethod` | string | `CARTAO`, `DINHEIRO`, `VIRTUAL_WALLET`, `WALLET_BALANCE`, `RAPPI` |
| `paymentType` | string | `EMV`, `CONTACTLESS_EMV`, `CONTINGENCY`, `WALLET`, `CREDIT` |
| `items` | array | líneas |
| `createdAt` | string | hora local con «Z» (`local-etiquetada-z`) |

## Línea (`items[]`)

`defaultCode`, `productName`, `amount`, `discount` e `itemsCustom[]`, que tiene la misma forma que la línea.

## Opción de consumo (Eat Here / To Go)

**La API no la trae.** Ningún campo del pedido ni de la línea indica si se consume en tienda o para llevar. En Zoho,
«Dining Option» viene del export de Looker. Consecuencia para el BI:

- `bi_lineas.opcion_consumo` queda en `null` para todo lo que venga del POS.
- El «Ajuste desechable Eat Here» de Zoho no se puede replicar con datos del POS.
- Queda pendiente preguntarle al proveedor si hay un campo o un endpoint que lo exponga.
