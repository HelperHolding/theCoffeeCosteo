# 16 · Tablero de México

Fecha: 2026-11-03. Carlo pidió, en Sucursales junto al Directorio, un tablero de ventas como el de cada sucursal pero
con todas sumadas. Eligió hacerlo con un **resumen guardado** que se actualiza cada 10 minutos (doc 15).

## Qué muestra

En `/sucursales/mexico` («Tablero México» en el menú de Sucursales). Cada usuario ve la suma de sus sucursales; con
todas, es México. El filtro Todo / Mostrador / App / Rappi es el mismo de cada sucursal.

Pedido de Carlo para el diseño: «extremadamente visual, más dashboards, más colores, números clave, distribución sin
saturar… igual animaciones». Usa los colores fijos de cada origen (Mostrador violeta, App naranja, Rappi verde), la rampa
azul para la magnitud y el verde y rojo solo para el cambio contra la semana pasada.

**Rediseño del 2026-11-15** (pedido de Carlo: «se ve demasiado agrandado», mapa real, gráficas mejor formadas, top 5
por ciudad y el periodo menos plano). Las gráficas de ejes miden su ancho y dibujan a tamaño real: alto fijo y letra de
11 px, sin crecer con la pantalla. Los KPI van de 24 a 40 px.

1. **Hoy:**
   - la venta del día, contra el mismo día de la semana pasada a la misma hora («vs el domingo 8 nov a las 16:10»;
     con sucursales en otra zona agrega «hora local»);
   - cuatro números: pedidos, ticket, sucursales con venta (y cuáles no) y la última hora completa contra la misma
     hora de la semana pasada;
   - la venta acumulada por tramo de 10 min, apilada por origen, con la semana pasada punteada y el resto del día
     sombreado.
2. **México hoy, por estado:**
   - un mapa con las formas reales de los 32 estados, coloreado por venta o por cambio;
   - la venta va en 4 pasos de la rampa azul por cuantil, con la leyenda en pesos; el cambio va de rojo a verde;
   - el Valle de México (CDMX, Estado de México, Morelos y Tlaxcala) va ampliado en una lupa;
   - al lado, la lista de estados con el mismo color. Es también la vista de tabla del mapa.
3. **Pedidos por hora:**
   - columnas por origen con ejes, y en gris la semana pasada hasta el mismo corte;
   - la hora en curso va rayada y marcada «en curso»; la hora pico lleva su cifra;
   - **De dónde viene la venta:** una barra 100 % con la parte de cada origen y una tabla con venta, pedidos, ticket
     y cambio de cada origen.
4. **Cómo va cada sucursal hoy:**
   - las 5 que más venden, alineadas, con su barra por origen en la misma escala, su venta y su cambio;
   - debajo, cada ciudad en una fila: venta, mezcla y cambio. Al abrirla salen todas sus sucursales con venta,
     pedidos, ticket y cambio. Se ven 8 ciudades y un botón abre las demás.
5. **Últimas 4, 8 o 12 semanas** (completas, de lunes a domingo):
   - números del periodo, con el promedio por semana y por día, y el cambio de la última semana;
   - venta por semana con ejes y el cambio contra la anterior. Si Rappi del portal empieza dentro del periodo (1 de
     octubre), la semana se marca y la descripción lo dice;
   - venta por día: un calendario de lunes a domingo con el promedio de cada día;
   - lo más vendido;
   - sucursales con su tendencia semanal y el cambio de su última semana.

**La curva y las horas entre zonas** (`armarHoy`):

- La curva se corta en el corte más común, `hastaTramo`.
- Cada sucursal entra hasta su propio tramo, sin pasar de ese corte: Cancún va una hora adelante y no deja una cola de
  4 sucursales.
- La semana pasada se corta igual (`baseHasta`). El día completo (`base`) queda como referencia del resto del día.

**Un día o un rango** (pedido de Carlo, 2026-11-15). Arriba a la izquierda: Hoy / Un día / Rango, con campos de fecha
del 10 de agosto de 2026 (`HISTORIAL_DESDE`) a ayer. Sin migración: son las mismas dos RPC.

- **Un día:** `sucursales_tablero_hoy` con esa fecha para todas. Se compara el día completo contra el mismo día de la
  semana anterior («vs el sábado 7 nov, día completo»).
  - En lugar de «Última hora» va la hora pico.
  - Los tramos de 10 min se borran a los 8 días: un día más viejo dibuja la curva por hora, con las horas guardadas
    (`tramosDeHoras`, `curva.paso` 6). Nunca se inventan los tramos de en medio.
- **Rango:** hasta 120 días (el límite de la RPC). `sucursales_tablero_periodo` lee dos veces: el rango y los mismos
  días justo antes, para el cambio («vs los 7 días anteriores (1–7 nov)»). `armarRango` le da la forma de «hoy», así
  que el mapa, la mezcla, el top 5 y las ciudades son los mismos.
  - En lugar de la curva va la venta por día, con el cambio contra el mismo día de la semana anterior.
  - En lugar de los pedidos por hora va lo más vendido del rango. La RPC del periodo no tiene horas; hacerlo
    llevaría otra RPC.
  - Una sucursal sin venta en todo el rango cuenta como «sin venta»: el periodo no distingue un día cerrado de uno sin
    leer. Los días incompletos se avisan aparte.
- **Rappi en la comparación:** Rappi del portal se lee desde el 1 de octubre. Si el día o rango tiene Rappi y su base no,
  un aviso dice que el cambio de «Todo» va de más.
- La validación de fechas (`lib/sucursales/tablero-fechas.ts`) es la misma en la ruta, la vista de prueba y las pruebas.
  El último día permitido es el anterior al «hoy» más temprano entre zonas.

**Espacio vacío al final de la página** (corregido el 2026-11-15):

- **Causa:** la tabla «Sucursales en el periodo» tiene scroll propio, pero su caja no tenía posición. Sus textos solo
  para lectores de pantalla («sube», «baja») son `position: absolute`, se escapaban del recorte y alargaban la página
  hasta ~9,700 px (quedaba solo el muro).
- **Arreglo:** `relative` en esa caja, en la de Por estado y en la tabla de cada ciudad.

**Movimiento** (skill movimiento-web, `tablero-mexico.css`):

- **Al cargar, una sola vez:**
  - los bloques suben escalonados;
  - el mapa se enciende de oeste a este y el calendario en diagonal;
  - las barras y columnas crecen desde su base;
  - las cifras cuentan hasta su valor.
- **Al filtrar o con un corte nuevo:** las barras y los colores del mapa se deslizan a su valor nuevo, y las cifras
  cuentan desde el anterior.
- **Al abrir una ciudad:** su panel crece.
- **«Al día»:** el punto late mientras el corte esté al día.
- **Movimiento reducido:** con esa preferencia del sistema no se mueve nada.

**Mapa:**

- Trazos en `components/sucursales/mapa-mexico-trazos.ts`, generados con `scripts/sucursales/trazos-mexico.ts`.
- La geometría es de Natural Earth (dominio público), tomada del TopoJSON de México de datamaps 0.5.9 (MIT). Ese
  archivo se descargó con OK de Carlo el 2026-11-15 y solo se leyó como datos.
- Proyección cónica conforme de Lambert con los parámetros del INEGI.
- Simplificada por arco, para que las fronteras compartidas coincidan. Sin las islas lejanas.

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
- `tests/portal/tablero-mexico-calculo.test.tsx` cubre lo que se pinta:
  - el corte de referencia entre zonas;
  - la frase de la comparación;
  - la hora en curso y la última hora completa;
  - la marca de Rappi en el periodo;
  - el top 5 y las ciudades.
- **Datos contra las fuentes, solo lectura** (`scripts/sucursales/verificar-tablero.ts`):
  - compara lo guardado con la API cruda del POS (sin pago RAPPI) y con `rappi_pedidos` paginado con `.order()`;
  - revisa la cobertura por día y la frescura de hoy;
  - el 2026-11-15 cuadró:
    - POS: 79 de 79 el 14 y el 10 de noviembre (4,600 y 4,413 pedidos);
    - Rappi: 73 de 73 del 1 al 14 de noviembre (8,350 pedidos, $1,802,568);
    - hoy: 79 de 79 con corte de las 16:00. Reforma, Puerta Polanco y Mayab estaban en $0, igual que el domingo
      anterior.

## Pasos (cada uno con OK de Carlo)

1. **Ensayo de la migración 37** en producción con ROLLBACK, y merge del PR (el merge la aplica).
2. **`CRON_SECRET` en Vercel (producción).** Es un valor aleatorio que no pasa por el chat. Sin él, el corte no corre.
3. **Historial:** `scripts/sucursales/corte.ts` de 7 en 7 días, de las 12 semanas anteriores (~25 min con las
   sucursales de hoy). Se repite por lote al sumar sucursales.
4. **Revisión en producción:** el tablero contra la página de dos o tres sucursales, el mismo día.
