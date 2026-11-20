# Cotejo de datos entre módulos y Zoho (Essentia, noviembre 2026)

Fecha: 2026-11-20. Pedido de Carlos: comprobar que los datos que usan Franquiciatarios, Sucursales, BI y Comercializadora
sean los mismos que los de Zoho, y corregir lo que no lo sea.

Se compara Essentia (POS 514, tienda 397) del 1 al 18 o 19 de noviembre. Todo en **solo lectura**, con
`scripts/franquiciatarios/cotejo-modulos.ts` (reutilizable para cualquier sucursal y periodo).

## 1. Resultado

| Dato                                                     | Módulos internos                                | Zoho                   | ¿Cuadra?                                                              |
| -------------------------------------------------------- | ----------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| Venta POS por día (Sucursales = Franquiciatarios = BI)   | 19 de 19 días iguales                           | —                      | ✅ Entre módulos: igual al centavo (−$0.05 de redondeo en 19 días)    |
| Venta Rappi por día (Sucursales = Franquiciatarios = BI) | Igual entre los tres                            | —                      | ✅ Entre módulos                                                      |
| Pedidos por día                                          | 1,104 (del 1 al 18)                             | 1,102                  | ✅ Prácticamente iguales: mismos pedidos de Rappi (345 de 345 por ID) |
| Efectivo                                                 | 60 pedidos · $8,105.90                          | 60 · $8,105.90         | ✅ Exacto                                                             |
| Tarjeta y app con tarjeta                                | 643 · $83,254.90                                | 642 · $82,950.52       | ✅ Casi (−$304, 1 pedido)                                             |
| **Saldo de la app (wallet)**                             | 55 · **$5,344.45** (la API dice neto $3,103.79) | 55 · **$2,731.53**     | ❌ Mismos pedidos, otro monto                                         |
| **Rappi (monto)**                                        | **$71,229** (bruto, antes de descuentos)        | **$61,663**            | ❌ Mismos pedidos, otra definición                                    |
| Metas mensuales                                          | `bi_metas` (cargadas de Zoho)                   | «Metas Mensuales 2026» | ✅ Iguales; las diarias suman la mensual en los 11 meses (±$0.14)     |
| Gastos fijos                                             | `franq_gastos_fijos` (cargados de Zoho)         | «Gastos Sucursales»    | ✅ Iguales ($101,231 al mes)                                          |
| Compras                                                  | Pedidos del sitio viejo (apertura 397)          | —                      | ✅ Misma fuente que Comercializadora                                  |
| Día 19                                                   | Está                                            | No está                | ℹ️ En Zoho la venta se carga a mano al día siguiente                  |

**Conclusión:** los módulos internos ya comparten la misma información (Sucursales, Franquiciatarios y BI dan las mismas
cifras). Las diferencias son solo contra Zoho y salen de **dos definiciones distintas**, no de datos perdidos.

## 2. Rappi: qué monto es la venta

- Los 345 pedidos de Rappi de Zoho son los mismos que tiene nuestro portal.
- **Nosotros** tomamos el `bruto` del portal: el precio de lista, antes de descuentos.
- **Zoho** toma el monto después del descuento de producto que paga la tienda.
- Regla que reproduce a Zoho: `bruto − (descuento_aliado − order_discount)`, es decir, el descuento del aliado sin la
  recompensa «Pro Rewards» que paga Rappi.
  - Cuadra exacto en **323 de 345** pedidos.
  - En los otros 22, Zoho resta **dos veces** el mismo descuento de producto, porque el portal lo trae repetido y el
    archivo manual de Zoho lo cuenta doble. Ejemplo: $276 − $23.40 − $23.40, cuando la tienda solo dio $23.40.
  - Total: con la regla $62,663; Zoho $61,663; bruto $71,229.
- **Propuesta:** que la venta de Rappi en todos los módulos sea la **neta del descuento que paga la tienda**, como ya es
  la venta del POS (su `ventaCent` ya trae el descuento restado). El descuento va aparte en `descuentoCent`.
- **Impacto:** cambia la venta de Rappi en Sucursales, BI, Tira, P&L y en las 73 sucursales con portal. Hoy Rappi está
  inflado contra Zoho en un ~14 % para Essentia. Requiere decisión de Carlos y un PR propio, con el cotejo antes y
  después.

## 3. Saldo de la app (wallet)

- Los mismos 55 pedidos dan tres montos distintos:
  - POS (venta): $5,344.45.
  - API (neto): $3,103.79.
  - Zoho: $2,731.53.
- Parece un beneficio o _cashback_ pagado con saldo, que Zoho no cuenta como venta. **Es una definición de Finanzas
  pendiente.**
- **Corregido en este PR:** el P&L lo metía como «comisión de cobro». Ahora va en su propia línea, «Saldo de la app
  (beneficios)», con la nota correspondiente. La utilidad no cambia, solo el lugar donde aparece. Para Essentia del 1 al
  20 de noviembre: comisiones $12,735 y saldo de la app $2,010.

## 4. Cómo repetir el cotejo

```bash
npx tsx --conditions=react-server scripts/franquiciatarios/cotejo-modulos.ts --desde 2026-11-01 --hasta 2026-11-19 --company 514
```

El script lee las tres fuentes por día: Sucursales/Franquiciatarios, BI y Zoho «Looker Sucursales». Usa una sola
renovación de token de Zoho.

## 5. Definición de venta aplicada (2026-11-20, decisión de Carlos)

- **Rappi:** la venta que suma a la sucursal, al P&L, a las metas, a BI y al cotejo es la **neta** = bruto − descuento
  que paga la tienda (`descuento_venta`). Las vistas de Rappi muestran también la **venta completa** (sin descuentos),
  que es la que sigue el equipo de delivery, y las promociones que paga Rappi («Pro Rewards») aparte, sin restarlas.
  - `rappi_descuento_venta` ya estaba en producción, aplicada a mano y sin migración (ninguna sesión de Claude de esta
    máquina la creó). La migración 90 la registra tal cual, junto con `sucursales_rappi_portal`.
  - Las líneas de cada pedido se prorratean a la venta neta, así que productos, Costeo, Consumo y BI usan la misma cifra.
- **Saldo de la app (WALLET_BALANCE):** la venta es el neto de la API (lo que no se pagó con saldo). Lo pagado con saldo
  queda en `saldoAppCent`, no como venta. El P&L ya no tiene la línea «Saldo de la app».
- **Cotejo después del cambio** (Essentia, 1 al 18 de noviembre; Zoho «Looker Sucursales» trae POS y Rappi juntos):

  |                                                  | Módulos   | Zoho     | Diferencia      |
  | ------------------------------------------------ | --------- | -------- | --------------- |
  | Antes (Rappi bruto y saldo de la app como venta) | ~$168,000 | $155,465 | ~−$12,500       |
  | Ahora                                            | $157,279  | $155,465 | −$1,814 (1.2 %) |

  Lo que queda: los 22 pedidos de Rappi en los que Zoho resta dos veces el mismo descuento (~$1,000), un pedido del 18
  que Zoho no tiene (−$537) y un pedido con tarjeta (−$304).

- **Pendiente después del merge, con OK de Carlos:** recalcular el historial ya guardado (`sucursales_resumen_dia` del
  Tablero México y `bi_lineas`) con `scripts/sucursales/corte.ts`, porque esos días se guardaron con la definición
  anterior. Mientras tanto, la página de cada sucursal (que lee en vivo) ya usa la nueva.
