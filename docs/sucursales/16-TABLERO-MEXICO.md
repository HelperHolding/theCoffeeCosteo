# 16 · Tablero de México

Fecha: 2026-11-03. Carlo pidió, en Sucursales junto al Directorio, un tablero de ventas como el de cada sucursal pero
con todas sumadas. Eligió hacerlo con un **resumen guardado** que se actualiza cada 10 minutos (doc 15).

## Qué muestra

En `/sucursales/mexico` («Tablero México» en el menú de Sucursales). Cada usuario ve la suma de sus sucursales; con
todas, es México. El filtro Todo / Mostrador / App / Rappi es el mismo de cada sucursal.

Pedido de Carlo para el diseño: «extremadamente visual, más dashboards, más colores, números clave, distribución sin
saturar… igual animaciones». Usa los colores fijos de cada origen (Mostrador violeta, App naranja, Rappi verde), la rampa
azul para la magnitud y el verde y rojo solo para el cambio contra la semana pasada.

1. **Hoy:**
   - la venta del día en grande, contra el mismo día de la semana pasada a la misma hora;
   - cuatro números clave: pedidos, ticket, sucursales vendiendo y la que va adelante;
   - la venta acumulada apilada por origen, con la semana pasada punteada.
2. **México hoy, por estado:** un mapa en mosaico de los 32 estados. Se colorea por venta (azul) o por cambio (rojo
   a verde). Al lado, las 10 sucursales que más venden, con su mezcla de origen.
3. **Pedidos por hora** de hoy por origen, con la semana pasada en gris detrás, y un **anillo** con la parte de cada
   origen.
4. **Cómo va cada sucursal hoy:**
   - cada sucursal con su venta, su mezcla de origen y su cambio: verde si sube más de 3 %, rojo si baja más de 3 %;
   - las ciudades con 3 sucursales o más van en su propio grupo, y las demás juntas en «Más ciudades»;
   - al tocar una sucursal se abre su tablero.
5. **Últimas 4, 8 o 12 semanas** (completas, de lunes a domingo):
   - números del periodo;
   - venta por semana apilada por origen;
   - lo más vendido;
   - sucursales ordenadas por venta, con su barra.

**Movimiento** (skill movimiento-web, `tablero-mexico.css`):

- **Al cargar, una sola vez:**
  - los bloques suben escalonados;
  - el mapa se enciende en diagonal, de noroeste a sureste;
  - las barras y columnas crecen desde su base;
  - las cifras cuentan hasta su valor.
- **Al filtrar o con un corte nuevo:** barras, columnas, anillo y colores del mapa se mueven a su valor nuevo, y las
  cifras cuentan desde el anterior.
- **«Al día»:** el punto late mientras el corte esté al día.
- **Movimiento reducido:** con esa preferencia del sistema no se mueve nada.

El estado de cada ciudad está en `ESTADO_DE_CIUDAD` (`components/sucursales/tablero-mexico.tsx`). Una ciudad nueva
sin estado se lista como «sin estado asignado»; no se pierde.

## Cómo funciona

```
Vercel Cron (cada 10 min; 5:30 cierre de 8 días)
   └─ /api/sucursales/corte  (CRON_SECRET)
        └─ por sucursal configurada: leerVentana + conRappi   ← lo mismo que su página
             └─ resumirDia → sucursales_resumen_dia (llave de servicio)
/sucursales/mexico
   └─ /api/sucursales/tablero  (sesión del usuario)
        └─ sucursales_tablero_hoy / sucursales_tablero_periodo  (sucursales_acceso en la base)
```

- **Migración 37:**
  - `sucursales_resumen_dia`: un renglón por sucursal y día, solo con totales por origen, por hora, por tramo de 10 min
    y por producto. Nunca pedidos ni datos de clientes;
  - `sucursales_cortes`: cuándo corrió cada corte y si leyó todo.

  Las dos tablas están cerradas al portal. Solo se leen por las dos RPC, con el mismo acceso por sucursal que el
  resto del módulo.

- **Mismas cifras que la página de cada sucursal:**
  - venta y pedidos como en `resumen`;
  - productos como en `productos`, con la misma identidad de línea y el catálogo del POS;
  - Rappi del portal con `pedidoRappiAPos` y `conRappi`. En Rubén Darío se queda la versión del portal, igual que en su
    página.
- **«A la misma hora» exacta:** la comparación llega al último tramo de 10 min completo, en los dos días y en la hora
  local de cada sucursal. Solo cuenta las sucursales con corte de la semana pasada, y lo dice si faltan.
- **Nunca venta cero por error:**
  - un día que no se pudo leer no se escribe; queda el corte anterior;
  - una lectura incompleta se marca y el tablero lo avisa;
  - una sucursal sin corte de hoy aparece como «sin corte», no como cero.
- **Tamaño:** cada renglón pesa unos 4–6 KB. Los tramos de 10 min se borran a los 8 días; las horas y los productos
  quedan. Con 79 sucursales son unos 100–150 MB al año.
- **Carga en la API del POS:** una lectura de hoy por sucursal cada 10 minutos. Con 79 sucursales tarda ~17 s, medido
  hoy con 4 lecturas a la vez. El cierre de las 5:30 relee 8 días.

## Verificación

- `tests/db/sucursales-resumen.test.ts`:
  - acceso por sucursal: tablas cerradas y RPC con solo las sucursales del usuario;
  - hoy contra la semana pasada en el límite del tramo, sin contar el tramo en curso;
  - una sucursal sin la semana pasada queda sin base, no en cero;
  - semanas de lunes, días y productos sumados entre sucursales y separados por origen.
- **Corte en seco con datos reales del 2 de noviembre, sin escribir:**
  - Namóra: 23 pedidos de Rappi por $4,539, igual que la suma directa de `rappi_pedidos`;
  - Rubén Darío: 42 pedidos, con los 4 de Rappi del portal;
  - La Mexicana: solo POS, porque aún no tiene `rappiPortal`.
- **Prueba visual con datos sintéticos** (`?tablero-mexico`, y `&completo=1` para ver el mapa lleno, en
  `npm run prueba:visual`), en escritorio, en 375 px y en modo día y noche,
  sin desborde de página.

## Pasos (cada uno con OK de Carlo)

1. **Ensayo de la migración 37** en producción con ROLLBACK, y merge del PR (el merge la aplica).
2. **`CRON_SECRET` en Vercel (producción).** Es un valor aleatorio que no pasa por el chat. Sin él, el corte no corre.
3. **Historial:** `scripts/sucursales/corte.ts` de 7 en 7 días, de las 12 semanas anteriores (~25 min con las
   sucursales de hoy). Se repite por lote al sumar sucursales.
4. **Revisión en producción:** el tablero contra la página de dos o tres sucursales, el mismo día.
