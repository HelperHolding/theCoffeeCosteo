# 07 · Rappi del portal en las 11 sucursales de Guadalajara: tiendas y configuración

Fecha: 2026-11-02. Completa el encargo de replicar Namóra (docs 03 y 04) en las demás sucursales de Guadalajara. El
lector para todas las tiendas y los pasos con OK de Carlo están en el PR #83 (doc 05). Aquí van la migración 29 (las 20
tiendas) y la configuración de la página.

## Orden

1. **Migración 29** (`rappi_tiendas`): antes de agregar las tiendas a `RAPPI_TIENDAS` en el servidor. Si llega una
   tienda sin alta, `rappi_importar` rechaza el lote completo, Namóra incluida.
2. **Historial del mes** por el webhook «Reponer».
3. **Configuración** (`rappiPortal` en `lib/sucursales/config.ts`): al final. Antes del historial, la página de cada
   sucursal mostraría su Rappi vacío.

## Comprobado el 2026-11-02 (solo lectura, con OK de Carlo)

- **Las 20 tiendas** (las 10 sucursales, Rubén Darío incluida) responden con 200 y sus nombres coinciden con el filtro
  de sucursales del portal (`brand/family/email?country=MX`) y con el `store_name` de sus pedidos del 27-oct o del
  1-nov. Legacy normal y Calle Ottawa normal no tuvieron pedidos esos días; su nombre sale solo del filtro («The Coffee
  Legacy», «The Coffee Calle Otawa»). Quedan en la migración 29.
- **Rubén Darío:** el Rappi del POS se reconoce por `paymentMethod = RAPPI`, y su `refundId` es el número de Rappi.
  El 27-oct y el 1-nov, los 21 pedidos Rappi del POS (16 y 5) estaban en el portal con el mismo número; ninguno solo
  en un lado. Por pedido de Carlo («está más completa la información del scrapping»), Rubén Darío entra al portal y,
  cuando un pedido llega por los dos lados, **se queda la versión del portal** (`conRappi`). Un pedido Rappi que solo
  esté en el POS se conserva.
- Conteos del 1-nov (cuenta/devueltos): Ventura 8/8 y 3/2, Aleden 2/2 y 1/1, Legacy 0/0 y 5/5, Granja 5/5 y 1/1,
  Chapu 67 1/1 y 3/3, Essentia 6/6 y 8/8, Calle Ottawa 0/0 y 8/8, Rubén Darío 3/3 y 2/2, Gran Plaza 6/6 y 7/7, Forum
  Tlaquepaque 16/15 y 1/1 (normal y Turbo).
