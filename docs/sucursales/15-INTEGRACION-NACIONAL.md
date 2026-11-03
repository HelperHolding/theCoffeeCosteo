# 15 · Integración nacional: todas las sucursales de la API

Fecha: 2026-11-03. Carlo pidió integrar todas las sucursales de la API The Coffee (Brasil) con su Rappi, de 10 en 10 y
con la misma información que ya tiene una sucursal. Al terminar, se agrega un tablero global de México en Sucursales.

**Reparto entre chats:**

- **«Módulo Sucursales» (este):** da de alta cada lote del POS en `lib/sucursales/config.ts` y propone los accesos.
- **«n8n thecoffee»:** agrega el Rappi de cada lote:
  - tiendas normal y Turbo;
  - alta en `rappi_tiendas`;
  - lector e historial;
  - al final, `rappiPortal` en la configuración.

Cada escritura en producción y cada merge llevan el OK de Carlo.

## Inventario (2026-11-03, solo lectura)

Medido con `scripts/sucursales/inventario-api.ts`. Para cada sucursal de la API trae su tienda del CRM (por número
Jestor), su actividad y sus accesos.

- `/company/list/all` tiene **125** sucursales (eran 119 el 22 de octubre).
- **79** vendieron del 27 de octubre al 2 de noviembre. **13** ya están en el portal. **Faltan 66.**
- **46** no tienen pedidos en esa semana:
  - dos son de prueba: «Station TTG (Solo empleados)» y «The Coffee DEV Mexico»;
  - las demás están por abrir o no operan;
  - 37 de ellas no tienen tienda en el CRM.

  Se revisan cuando empiecen a vender.

- Solo Rubén Darío recibe Rappi por la API del POS.

## Lotes

Agrupados por zona y por qué tan lista está su información. Los lotes 1 a 4 están en hora del centro.

| Lote | Sucursales (company_id)                                                                                                                                                                                                                          | Pedidos en la semana | Venta en la semana |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------: | -----------------: |
| 1    | Ciudad de México (I): La Mexicana (519), Plaza Carso (546), Polanco (545), Roma Sur (469), Reforma (670), Pasaje Parián (460), Patio Universidad (626), Santa Fe (607), Hamburgo (507), Plaza Samara (625)                                       |                6,161 |           $837,678 |
| 2    | Ciudad de México (II) y Toluca: Puerta Polanco (642), Interlomas (608), Satélite (606), Portales Norte (506), Río Nazas (550), Insurgentes (611), La del Valle (549), Tecnológico (610), Patio Santa Fe (643), Patio Toluca (646)                |                3,274 |           $448,467 |
| 3    | Centro y Bajío: Galerías Metepec (520), Townsquare (743), Avándaro (463), Colosio Pachuca (616), Centro Histórico Puebla (761), Los Arcos (509), UpTown Juriquilla (734), San Miguel de Allende Canal 16 (466), Torre Visu (614), Paseo MS (615) |                3,350 |           $556,036 |
| 4    | Centro-norte y occidente: Colosio Aguascalientes (551), Garza Sada (674), Zacatecas (593), Trendy San Luis (718), Covalia (763), Tepatitlán (508), Constitución (721), Colima (553), Centro Puerto Vallarta (582), Versalles (478)               |                3,234 |           $515,978 |
| 5    | Golfo, sur y norte: Fluvial (584), Ávila Camacho Veracruz (705), Andamar (590), Oaxaca (645), Aeropuerto Chiapas (781), Durango (632), Distrito Independencia (558), Tijuana (613), Andenes Hermosillo (664)                                     |                3,346 |           $546,339 |
| 6    | Sureste: Puerto Cancún (552), Scala Huayacan (679), Malecón Cancún (644), Tulum (462), Mayab (627), Calle 47 (601), Arthouse Mérida (655)                                                                                                        |                2,830 |           $416,402 |
| 7    | Sin tienda en el CRM: Plaza Cantabria (717), Plaza Norte (733), El Campanario (547), Tampico 33 (754), Nuevo León (719), Durango Centro (715), Marina Vallarta (771), Uruguay 20 (735), Plaza Cumbres (716), Puente Churubusco (770)             |                3,449 |           $555,598 |

- **Zonas horarias distintas:**
  - lote 5: Tijuana (`America/Tijuana`, con horario de verano de EE. UU.), Hermosillo (`America/Hermosillo`), Torreón y
    Durango (`America/Monterrey`);
  - lote 6: Cancún y Tulum (`America/Cancun`), Mérida (`America/Merida`).

  Cada zona se confirma con el horario de sus pedidos.

- **Lote 7:** su `lookerStoreId` no está en ninguna tienda del CRM. La identidad se confirma con Carlo, o se agregan
  al CRM, antes de darlas de alta.
- **Por revisar antes del lote 2:** el CRM pone a Patio Toluca y a Tecnológico en «Ciudad de México».

## Pasos por lote

1. **Validación, en solo lectura,** con `scripts/sucursales/validar-sucursal.ts` y un día cerrado:
   - identidad: API = CRM;
   - venta = suma por productos;
   - horario posible en su zona.
2. **Alta en `config.ts`** (PR; merge con OK de Carlo). Entra con el POS (Mostrador y App). Sin accesos, nadie la ve.
3. **Accesos** (`perfil_sucursales`), con el OK de Carlo sobre quién la ve.
4. **Rappi**, por el chat «n8n thecoffee»: tiendas, alta, lector, historial y `rappiPortal`.
5. **Verificación en producción:** Directorio, Ventas, Costeo, Consumo y Rappi.

## Lote 1: validación con el 2 de noviembre

Todas en `America/Mexico_City`, `local-etiquetada-z`. Ninguna recibe Rappi por el POS.

| Sucursal          | company_id | Jestor | CRM                     | Pedidos |      Venta | Venta = productos | Horario |
| ----------------- | ---------: | -----: | ----------------------- | ------: | ---------: | ----------------- | ------- |
| La Mexicana       |        519 |    411 | La Mexicana - 411       |     205 | $34,292.90 | exacta            | 7–20 h  |
| Plaza Carso       |        546 |    453 | Plaza Carso - 453       |      67 |  $8,155.40 | exacta            | 7–19 h  |
| Polanco           |        545 |    432 | Polanco - 432           |      72 | $10,129.12 | 2 ¢ de redondeo   | 7–20 h  |
| Roma Sur          |        469 |    363 | Roma Sur - 363          |      93 | $11,605.00 | exacta            | 7–20 h  |
| Reforma           |        670 |    556 | Reforma - 556           |      61 | $10,040.50 | exacta            | 6–20 h  |
| Pasaje Parián     |        460 |    354 | Pasaje Parián- 354      |     126 | $19,468.10 | exacta            | 7–20 h  |
| Patio Universidad |        626 |    540 | Patio Universidad - 540 |      86 | $12,928.01 | 1 ¢ de redondeo   | 7–20 h  |
| Santa Fe          |        607 |    472 | Santa Fe - 472          |      83 | $11,918.00 | exacta            | 7–20 h  |
| Hamburgo          |        507 |    402 | Hamburgo - 402          |      89 | $11,575.00 | exacta            | 7–20 h  |
| Plaza Samara      |        625 |    539 | Samara - 539            |      48 |  $6,218.50 | exacta            | 7–20 h  |

El redondeo de 1–2 ¢ es del proveedor, como en Chapu 67 (doc 13).

## Tablero global de México (propuesta)

Un tablero de ventas como el de cada sucursal, pero con todas sumadas. Muestra:

- **Hoy:** venta, pedidos y ticket contra el mismo día de la semana pasada a la misma hora, y la mezcla Mostrador, App
  y Rappi;
- **Sucursales:** las que más y menos venden, agrupadas por ciudad;
- **Tendencia** por semana;
- **Productos** más vendidos.

Cada usuario ve la suma de las sucursales a las que tiene acceso. Con todas, es México.

**Por qué necesita un resumen guardado.** Medido hoy a las 17:00: leer solo «hoy» de las 79 sucursales activas tarda
**16.5 s** (3,341 pedidos, 4 lecturas a la vez, como el portal). Sumar el mismo día de la semana pasada y 12 semanas
de tendencia desde la API tardaría minutos en cada carga.

**Propuesta:**

- **Una tabla de resumen:** por sucursal, día, hora y origen (pedidos, venta, unidades), más los productos por día.
  Solo totales, nunca pedidos ni datos de clientes.
- **Un corte cada 10 minutos** de «hoy» y el cierre de los últimos días en la madrugada. Usa las mismas reglas que la
  página de cada sucursal (POS y Rappi del portal).
- **El tablero lee solo esa tabla:** carga al instante y dice cuándo fue el último corte.

Lleva migración (respaldo, ensayo con ROLLBACK y OK de Carlo) y un disparador cada 10 minutos.

## Lote 2: validación con el 2 de noviembre

Todas en `America/Mexico_City`, `local-etiquetada-z`; ninguna recibe Rappi por el POS. Interlomas y Satélite van en la
zona metropolitana de la Ciudad de México. Tecnológico (Metepec) y Patio Toluca van en «Toluca», aunque el CRM las pone
en «Ciudad de México».

| Sucursal       | company_id | Jestor | Pedidos |      Venta | Venta = productos | Horario |
| -------------- | ---------: | -----: | ------: | ---------: | ----------------- | ------- |
| Puerta Polanco |        642 |    555 |      64 |  $6,996.00 | exacta            | 7–16 h  |
| Interlomas     |        608 |    473 |      73 |  $8,695.80 | exacta            | 7–20 h  |
| Satélite       |        606 |    478 |      61 | $11,499.00 | exacta            | 7–19 h  |
| Portales Norte |        506 |    387 |      43 |  $8,317.50 | exacta            | 9–21 h  |
| Río Nazas      |        550 |    424 |      54 |  $8,385.00 | exacta            | 7–19 h  |
| Insurgentes    |        611 |    490 |      35 |  $4,731.40 | exacta            | 8–20 h  |
| La del Valle   |        549 |    404 |      44 |  $6,846.60 | exacta            | 8–20 h  |
| Tecnológico    |        610 |    476 |      30 |  $4,209.01 | 1 ¢ de redondeo   | 9–20 h  |
| Patio Santa Fe |        643 |    554 |      14 |  $2,679.00 | exacta            | 8–20 h  |
| Patio Toluca   |        646 |    560 |      19 |  $2,264.70 | exacta            | 8–19 h  |

Puerta Polanco cierra a distinta hora según el día (16 h el 2-nov, 17 h el 30-oct, 20 h el 28-oct); su horario es
siempre posible en la Ciudad de México.
