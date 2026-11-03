# 06 · Auditoría de Namóra para replicarla en Guadalajara

Fecha: 2026-11-02. Carlo pidió auditar los apartados de Namóra, cómo se conectan y qué información necesitan, antes de
llevar el lector de Rappi a las demás sucursales. Todo se midió en solo lectura con datos reales:

- periodo: 30 días, del 3 de octubre al 1 de noviembre;
- ventas del POS por la API;
- recetas, enlaces, tiendas de Rappi y accesos de la base;
- script: `scripts/sucursales/auditar-replica.ts`, que usa las mismas funciones que la página.

## En corto

- **Namóra es lo que tienen todas, más dos cosas:** Rappi leído del portal y las reglas del piloto en Consumo. Las dos se
  prenden con un solo interruptor por sucursal, `rappiPortal`. No hay otro código propio de Namóra.
- **Las recetas, los enlaces, los tamaños y las personalizaciones son de marca, no de cada sucursal.** Ya cubren todo lo
  que venden las 10 sucursales en el POS: ninguna unidad sin enlace en 30 días.
- **Con las reglas de Namóra, el Consumo de las otras 10 pasa del 70.9 % al 95.9 % de las unidades.** El Costeo no
  cambia, porque es igual en todas.
- **Por sucursal falta:**
  - sus tiendas de Rappi: alta, lector e historial (doc 05);
  - medir su Rappi;
  - prender el interruptor;
  - decidir quién la ve.
- **Rubén Darío es distinto:** su Rappi ya llega por el POS, pero incompleto («Generic» y sin vaso). Necesita una
  decisión (abajo).

## Apartados de Namóra y de dónde leen

El filtro de origen (Mostrador, App, Rappi) y el periodo son de la sucursal: los comparten Ventas, Costeo y Consumo.

| Apartado                         | Qué ve el usuario                                           | De dónde lee                                                                                   | Qué agrega Namóra (`rappiPortal`)                                                       |
| -------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Directorio (tarjeta de hoy)      | Venta de hoy                                                | «En vivo» con todos los orígenes                                                               | Suma Rappi de hoy                                                                       |
| Ventas › En vivo                 | Hoy contra el mismo día de la semana pasada, top 5          | API del POS, catálogo del POS                                                                  | Rappi entra como origen «Rappi»                                                         |
| Ventas › Tendencias              | Semanas                                                     | API del POS por tramos                                                                         | Rappi, leído en tramos de 62 días                                                       |
| Ventas › Productos               | Venta por producto                                          | API del POS, catálogo del POS                                                                  | Rappi traducido a los códigos del POS; los combos que solo existen en Rappi, por partes |
| Ventas › Pedidos                 | Lista y detalle de pedidos                                  | API del POS                                                                                    | Pedidos de Rappi con productos y opciones                                               |
| Ventas › Rappi › Portal de Rappi | Pedidos del portal, tienda normal y Turbo, conteos, lectura | `sucursales_rappi_portal`: `rappi_tiendas`, `rappi_pedidos`, `rappi_conteos`, `rappi_corridas` | Solo existe con `rappiPortal`                                                           |
| Costeo (con permiso de Costeo)   | Costo y margen teóricos                                     | `sucursales_datos_costeo` (recetas, costos, líneas, sustitutos) y API del POS                  | Rappi suma; un combo de Rappi cuesta la suma de sus partes                              |
| Consumo                          | Insumos, cuadre por insumo, categorías, por día             | `sucursales_recetas_consumo`, catálogo del POS, API del POS                                    | Rappi suma, y las reglas del piloto (siguiente párrafo)                                 |

**Reglas del piloto en Consumo:**

- los combos del POS (`COMBOS_POS`) cuentan como sus productos;
- una personalización que aún no se calcula no saca la unidad: entra con su receta y la opción queda anotada en el
  detalle del insumo.

Fuera del piloto, esa unidad queda fuera, igual que en Costeo.

Un pedido que llega por el POS y por el portal (`refundId` = ID de Rappi) se cuenta una sola vez, con la versión del
POS.

## Qué es de marca y qué es de cada sucursal

| Pieza                                                     | Dónde vive                 | Alcance                     | Para las 10                                      |
| --------------------------------------------------------- | -------------------------- | --------------------------- | ------------------------------------------------ |
| Pedidos del POS                                           | API The Coffee             | Sucursal                    | Configuradas y validadas el 2026-10-28           |
| Recetas, insumos y costos                                 | Costeo (Supabase)          | Marca                       | Listo                                            |
| Enlaces POS → receta (107)                                | `producto_codigo_pos`      | Marca                       | Cubren todo lo vendido                           |
| Nombres del catálogo del POS                              | `sucursales_catalogo_pos`  | Marca                       | Listo                                            |
| Tamaños verificados, personalizaciones, combos del POS    | Código (`lib/sucursales`)  | Marca                       | Mismos pendientes que Namóra                     |
| Traducción de Rappi al POS (productos, opciones, sabores) | Código (`rappi-pos.ts`)    | Marca (el menú es de marca) | Se mide con el Rappi de cada sucursal            |
| Tiendas de Rappi                                          | `rappi_tiendas`            | Sucursal                    | Solo Namóra                                      |
| Lector y flujo de n8n                                     | Servidor de n8n            | Una corrida para todas      | PR #83 y doc 05                                  |
| Interruptor `rappiPortal` y texto de alcance              | `lib/sucursales/config.ts` | Sucursal                    | Solo Namóra                                      |
| Quién la ve                                               | `perfil_sucursales` y rol  | Usuario                     | 7 usuarios en cada una (Namóra y Rubén Darío, 8) |

## Medición por sucursal (POS, 3 de octubre a 1 de noviembre)

«Consumo hoy» es la regla que tienen hoy (estricta). «Con reglas de Namóra» es la misma venta con las reglas del
piloto. Los porcentajes son sobre las unidades identificables (sin «Generic»).

| Sucursal                | Pedidos POS | Venta POS | Unidades | Sin enlace | Consumo hoy | Con reglas de Namóra | Costeo completo | Combos del POS | Fuera por tamaño |
| ----------------------- | ----------: | --------: | -------: | ---------: | ----------: | -------------------: | --------------: | -------------: | ---------------: |
| Rubén Darío (532)       |       1,423 |  $226,139 |    2,404 |          0 |      63.0 % |               87.2 % |          64.5 % |             53 |              293 |
| Ventura (384)           |       1,891 |  $281,124 |    3,421 |          0 |      71.6 % |               96.7 % |          72.5 % |             37 |              112 |
| Aleden (457)            |       1,936 |  $263,912 |    3,237 |          0 |      72.5 % |               96.9 % |          74.1 % |             58 |              101 |
| Legacy (459)            |       1,466 |  $202,375 |    2,527 |          0 |      73.7 % |               97.8 % |          75.5 % |             51 |               56 |
| Granja (477)            |       1,377 |  $187,714 |    2,326 |          0 |      69.2 % |               97.5 % |          71.3 % |             60 |               58 |
| Chapu 67 (515)          |       1,315 |  $185,976 |    2,297 |          0 |      71.3 % |               94.7 % |          73.0 % |             48 |              122 |
| Essentia (514)          |       1,342 |  $177,228 |    2,246 |          0 |      77.2 % |               98.5 % |          79.0 % |             49 |               33 |
| Calle Ottawa (518)      |       2,217 |  $296,868 |    3,689 |          0 |      70.8 % |               98.8 % |          72.7 % |             79 |               44 |
| Gran Plaza (567)        |       2,017 |  $289,278 |    3,440 |          0 |      70.8 % |               94.6 % |          72.4 % |             61 |              187 |
| Forum Tlaquepaque (631) |       1,148 |  $169,383 |    1,994 |          0 |      67.7 % |               94.5 % |          70.2 % |             66 |              110 |
| **Namóra (513)**        |       1,696 |  $231,616 |    2,837 |          0 |      74.6 % |               97.0 % |          75.5 % |             34 |               85 |

- Las 11 sucursales se leyeron completas.
- Las otras 10 juntas: 16,132 pedidos, $2,279,998 y 27,581 unidades.
- **Rappi de Namóra en el mismo periodo**, como referencia de lo que se espera en las demás:
  - 709 pedidos que suman, de 722 guardados; 1,368 unidades;
  - todos cuadran con la venta del portal;
  - Consumo con reglas de Namóra: 98.2 %; POS y Rappi juntos: 97.4 %;
  - sin enlace solo Spooky Biscuits (2) y Triple Frap (1), que no tienen receta por decisión de Carlo.

### Lo que venden las demás y Namóra no vendió

Son 11 productos y **todos tienen enlace**:

- Iced Blueberry Matcha: 39 unidades, en Aleden, Chapu 67 y Gran Plaza. Sus vasos de 440 y 600 ml no están
  verificados.
- Cold Drip V60 + Milk: 29, en 6 sucursales.
- Kraft edition 250 g: 29, en 8 sucursales.
- True White + Grilled Ham & Cheese Sandwich: 13, en Rubén Darío.
- Con menos unidades:
  - Black edition 250 g (7) y Kit Café White 1 kg (6);
  - True White + Pan de Muerto (4), Kit Cafés Editions (3) y Totebags (3);
  - Tumbler 360 ml (2) y Evian (1).

### Pendientes de marca (los mismos que Namóra)

No son de cada sucursal: al resolverlos, mejoran todas a la vez. Varios están en el documento de preguntas para
Operaciones.

- **Tamaños sin verificar:**
  - Gelato Frappé Coffee y Gelato Frappé Matcha (440 y 600 ml);
  - Matcha Iced Mint;
  - Fresh Soda Pink Lemonade y Passion fruit;
  - Chai Frap Large;
  - Iced Blueberry Matcha;
  - Cold Drip V60 cuando el ticket no trae vaso.
- **Personalizaciones que aún no se calculan.** Con las reglas de Namóra no sacan la unidad; quedan anotadas:
  - miel (Less, Average, More);
  - Salted Caramel y Caramelo (Average, More);
  - Chipotle Mayo;
  - «With Coffee» del Dirty Chai;
  - Gengibre;
  - «With Sparkling Water» de las Fresh Soda;
  - «Lactose free» en recetas que no llevan la leche entera directa.

## Rubén Darío

- **Mostrador y App:** el 97.2 % entra a Consumo, como en las demás.
- **Rappi por la API del POS:** 851 unidades. 121 llegan como «Generic» y 249 sin vaso, así que entra el 65.9 %.
- Con el portal, ese Rappi llegaría completo: en Namóra entra el 98 %. Pero hoy, cuando un pedido llega por los dos
  lados, la página se queda con la versión del POS. No cuenta dos veces, pero tampoco corrige el «Generic».
- **Decisión para Carlo:**
  - **a)** dejarla como hoy;
  - **b)** prender el portal tal cual: solo agrega los pedidos de Rappi que no llegaron por el POS;
  - **c)** que en Rubén Darío el pedido del portal reemplace al del POS (PR aparte).

  Recomendación: **c**. Es la única que corrige el «Generic».

## Qué hay que hacer para replicar

Por sucursal (las 9 sin Rappi en el POS):

1. Comprobar y dar de alta sus tiendas normal y Turbo (doc 05, pasos 4 y 5).
2. Agregarlas al lector y cargar el historial del mes (doc 05, pasos 2, 3, 6 y 7).
3. Medir su Rappi con `auditar-replica.ts`, que ya lee el Rappi guardado:
   - productos y acompañamientos sin traducción;
   - tamaños;
   - cuadre con la venta del portal.

   Lo nuevo se agrega a las listas de marca, nunca se adivina.

4. Prender `rappiPortal` con `alcance: ALCANCE_POS_RAPPI_PORTAL` en `lib/sucursales/config.ts` (PR, con OK de Carlo).
5. Decidir quién ve cada sucursal: hoy cada una tiene 7 usuarios.
6. Seguimiento de una semana:
   - corridas y memoria del servidor;
   - en la página, la pestaña Rappi y el cuadre de Consumo.

**Opción:** las reglas del piloto en Consumo no necesitan Rappi. Si Carlo quiere, se separan del interruptor y se
prenden ya en las 10, antes del lector. Es un cambio pequeño y sube su Consumo del ~71 % al ~96 % desde el primer día.
