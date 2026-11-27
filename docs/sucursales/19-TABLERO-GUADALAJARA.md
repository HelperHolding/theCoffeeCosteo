# 19 · Tablero Guadalajara y accesos de Dione y Claudia

Fecha: 2026-11-27. Encargo de Carlos del doc 18 (preparado en el chat de planeación). Plan aprobado por Carlos el mismo
día, con estas respuestas:

- Costeo de Dione y Claudia: rol `operaciones` (productos y recetas, sin precios).
- Costeo del tablero: por mes cerrado.
- Mapa: OpenStreetMap.
- Cierre: mergear y aplicar.

## Qué hay

**Tablero Guadalajara** en `/sucursales/guadalajara`, debajo de «Tablero México» en el menú de Sucursales. Lo ve
completo todo usuario con el módulo Sucursales, aunque no tenga ninguna de las 11 asignadas.

Tiene las cuatro secciones de una sucursal, con la misma barra (`components/sucursales/barra-secciones.tsx`, que ahora
usa también la página de sucursal):

1. **Ventas.** Lo del Tablero México con las 11:
   - Hoy, un día o un rango;
   - filtro de origen con sus colores;
   - comparación contra la semana anterior;
   - curva del día, pedidos por hora, mezcla por origen, semanas, calendario, lo más vendido y tendencia por sucursal.
   - **Mapa de Guadalajara** en lugar del de estados: municipios y avenidas principales, y un punto por sucursal con el
     número de su lugar en la lista. El tamaño del punto es la venta; con «Cambio», el color es el cambio contra la
     semana anterior. Al lado va la lista con el mismo número, que es también la vista de tabla del mapa. Tiene tooltip
     con teclado.
   - **Las 11 sucursales** en una tabla, en lugar de «Por ciudad».
2. **Costeo** (solo con rol de Costeo o el módulo `sucursales_costeo`). Por mes cerrado:
   - margen teórico de la ciudad;
   - margen por sucursal, con la línea de la ciudad;
   - productos con el margen más bajo (al menos 30 vendidos);
   - lo más vendido con su margen.
   - Usa los costos del día en que se calculó el mes.
3. **Consumo.** El consumo mensual de las 11, con el **mapa por ingrediente**: se elige un ingrediente y el punto mide
   lo que pidieron sus recetas.
4. **Nivel de servicio y Menú en Rappi.** Las vistas nacionales con solo las 11.

**Enlaces:** desde el tablero, el nombre de una sucursal solo abre su página si el usuario la tiene asignada. Las demás
se ven como texto, para no mandar a «Sucursal no disponible».

## Decisiones

- **D1, Costeo de Dione y Claudia.** Se cambia su rol a `operaciones` (Carlos, 2026-11-27).
  - Pueden hacer:
    - crear productos y sub-recetas;
    - cambiar nombre, categoría, activo y tamaños que vende;
    - editar recetas y cantidades;
    - administrar las categorías de producto.
  - No pueden tocar:
    - precios de venta (finanzas);
    - insumos y proveedores (compras);
    - tamaños, parámetros y canales (finanzas);
    - usuarios (nadie desde el portal).
  - Lo exigen la acción del servidor y la base: `guardar_receta`, el trigger `vigilar_producto_tamanos` y las políticas
    por `tiene_rol`. Lo cubren `tests/db/permisos.test.ts` y `guardar-receta.test.ts`.
  - Además de editar, ven todo Costeo:
    - costos, precios y parámetros;
    - nombres y roles de los usuarios;
    - la bitácora;
    - el asistente de Costeo y el conector.
  - Sucursales no cambia: va por `perfil_modulos` y `perfil_sucursales`, no por el rol. Su fila `sucursales_costeo` se
    queda, así revertir es un solo cambio.
- **D2, acceso abierto solo en el tablero** (migración 99).
  - Las RPC agregadas pasan su cuerpo, sin cambios, a una función `_base` interna (solo service_role):
    - tablero hoy y periodo;
    - servicio;
    - consumo y desglose;
    - menú.
  - Las de siempre conservan firma y filtro por sucursal.
  - Las nuevas `sucursales_ciudad_*` cruzan lo pedido con `sucursales_ciudades`, solo para quien tiene el módulo
    (`sucursales_modulo_lectura`, nunca por OAuth). Llaman a la misma base.
  - No se abre ninguna tabla ni el detalle de otras sucursales. El costeo de ciudad pide además permiso de Costeo.
- **D3, mapa.** Geometría de OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), descargada una vez de Overpass.
  - `scripts/sucursales/trazos-ciudad.ts` la recorta al recuadro de las sucursales, la simplifica y la deja en
    `components/sucursales/mapa-guadalajara-trazos.ts` (20 KB, sin mosaicos ni llaves).
  - Los crudos quedan fuera del repo.
  - Las coordenadas van en la config (`coordenadas`, con su precisión).
- **D4, componente por ciudad.** Las vistas reciben la ciudad (`CiudadTablero`) y las rutas aceptan `?ciudad=`.
  - Otra ciudad pide cuatro cosas:
    - su clave en `CIUDADES_TABLERO` (`lib/sucursales/alcance.ts`);
    - sus filas en `sucursales_ciudades`;
    - sus trazos;
    - las coordenadas de sus sucursales.
  - Solo Guadalajara se publica.

## Ubicación de las sucursales

Revisadas a mano contra la dirección del CRM. «Plaza» y «tienda» salen de OpenStreetMap; «calle» es un punto de su
calle sin número ubicable; «colonia» es la zona del código postal.

| Sucursal | Dirección (CRM) | Precisión |
| --- | --- | --- |
| Rubén Darío (532) | Córdoba 2740, Providencia | calle |
| Ventura (384) | Av. Central Guillermo González Camarena 500, 45116 Zapopan | **colonia** (la calle no está en OSM) |
| Aleden (457) | Av. Universidad 1011, Zapopan | **calle** (la avenida mide ~2 km; el número no está en OSM) |
| Legacy (459) | Av. de los Empresarios 62, Puerta de Hierro | calle |
| Granja (477) | Calzada Central 270, Ciudad Granja | calle |
| Chapu 67 (515) | Av. Chapultepec Nte. 67 | calle |
| Essentia (514) | Circunvalación Jorge Álvarez del Castillo 1433, Country Club | calle |
| Calle Ottawa (518) | Ottawa 1560, Providencia | calle |
| Namóra (513) | Av. Chapultepec Sur 29 | tienda (en OSM con otro nombre) |
| Gran Plaza (567) | Av. Vallarta 3959, La Gran Plaza | plaza |
| Forum Tlaquepaque (631) | Marcelino García Barragán 2077, Prados del Nilo | plaza (municipio de Guadalajara) |

**Por confirmar:** los puntos de Ventura y Aleden. Basta la ubicación en Google Maps de cada una para corregir su línea
en `lib/sucursales/config.ts`.

## Aplicado en producción (2026-11-27)

- **PR #229** mergeado (bdbacff) y desplegado en Vercel.
- **Migración 099** aplicada a mano y registrada en `schema_migrations` (`scripts/sucursales/aplicar-99.ts`):
  - antes, ensayo con ROLLBACK sin errores;
  - las 7 funciones que reemplaza eran idénticas en prod y en el repo;
  - resultado: 11 filas en `sucursales_ciudades` y 8 funciones `sucursales_ciudad_*`.
- **Costeo de octubre** de las 11:
  `consumo-mes.ts --mes 2026-10 --companias <las 11> --solo-costeo`, 124 s, las 11 completas.
  - Margen teórico de 66.0 % (Legacy) a 70.7 % (Gran Plaza); 68.6 % la ciudad.
  - Cobertura de receta del 99–100 %.

### Accesos de Dione y Claudia

Con `scripts/sucursales/accesos-gdl.ts`. Identifica a cada una por su perfil, su rol y su correo: hay perfiles de
franquiciado con nombres parecidos («Dione Acuña Velarde», «Claudia Villegas») que no se tocaron. El doc 18 tenía los
correos al revés: Dione es dacuna@ y Claudia es clarios@.

| | Antes (21:14 UTC) | Después |
| --- | --- | --- |
| `perfiles.rol` | `sucursales` | `operaciones` |
| `perfil_modulos` | sucursales y sucursales_costeo (desarrollador) | sin cambio |
| `perfil_sucursales` | 84 (todas) | 11: 384, 457, 459, 477, 513, 514, 515, 518, 532, 567, 631 |

El estado previo completo (user_id y las 84 sucursales) quedó en un respaldo JSON local. La bitácora registra cada
cambio.

**Para revertir:**
1. Volver a insertar las 73 sucursales que se quitaron: el `insert` de la vista nacional del doc 15 con sus dos
   `user_id`.
2. `update perfiles set rol = 'sucursales'` para las dos.

**Verificación en prod** (con la sesión de cada una, en transacción con rollback):

| Comprobación | Dione | Claudia |
| --- | --- | --- |
| `sucursales_acceso(532)` (GDL) | sí | sí |
| `sucursales_acceso(612)` (Juárez) | no | no |
| Sus sucursales | 11 | 11 |
| `sucursales_puede_costeo(514)` | sí | sí |
| Tablero de ciudad | 11 | 11 |
| `tiene_rol('operaciones')` | sí | sí |
| `tiene_rol('finanzas', 'admin')` (precios) | no | no |

### Cuadre del tablero (G7)

Total de la ciudad contra la suma sucursal por sucursal, en prod y por origen:

| Periodo | Ciudad | Suma de las 11 |
| --- | --- | --- |
| Hoy, 27 nov (corte de la tarde) | 375 pedidos · $56,273.20 | igual por origen |
| 25 nov (día cerrado) | 723 pedidos · $106,757.48 | igual por origen |
| 17 al 23 nov (77 días = 11 × 7) | 4,964 pedidos · $727,216.05 | igual |

## Verificación

- **Pruebas:**
  - `tests/db/tablero-ciudad.test.ts` (PGlite):
    - con el módulo se ven las 11 aunque no haya ninguna asignada;
    - sin módulo o por OAuth, nada;
    - bases y tablas cerradas;
    - mismo resultado que las RPC de siempre;
    - costeo solo con permiso.
  - Las pruebas de BD existentes (tablero, MCP, servicio, consumo, costeo y menú) pasan sobre la 99.
  - `tests/portal/costeo-mes.test.ts`, `alcance-tablero.test.ts` y `tablero-ciudad.test.tsx`.
- **Arnés `?tablero-guadalajara` (puerto 4194):**
  - capturas a 390, 768, 1366 y 1920, en claro y oscuro;
  - sin scroll horizontal.
  - Arreglo de paso: a 390 px el Tablero México también desbordaba en «Lo más vendido» y en «Reclamos» (grids sin
    `grid-cols-1`), y ya no desborda.

## Pendientes

- Confirmar los puntos de Ventura y Aleden.
- Costeo de noviembre: a partir del 1 de diciembre, correr `consumo-mes.ts --mes 2026-11 --costeo`. Para todo el país
  calcula también el consumo; para solo las 11 de GDL, usar `--companias` y `--solo-costeo`.
- Comprobar en el portal, con la sesión de Dione o Claudia, que el Directorio muestra las 11 y que Costeo deja editar
  una receta.
- El encargo 2 (Panel de admins) parte del modelo de permisos de este cierre: Costeo sigue siendo un rol por persona.
