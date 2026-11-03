# 44 · Cobertura del costeo de Sucursales y «Average» = la receta

**Estado:** PR en borrador. No cambia la base ni trae migraciones: son dos listas explícitas en `lib/sucursales/`. El merge
requiere la aprobación de Carlo.

## Medición (2026-11-03, solo lectura)

La medición cubre las 13 sucursales del módulo:

- las 3 con Rappi por la API: Cd. Juárez, Bonampak y Rubén Darío;
- las 10 de Guadalajara, con el Rappi del portal en Namóra.

Son las ventas del 6 de octubre al 2 de noviembre: $3.22M en 36,204 líneas. Se midieron con las reglas del portal en main
`17ffdc3` y los costos de producción del 2026-11-03.

| Estado | Venta | % |
| --- | --- | --- |
| Costeo completo | $2,357k | 73.2 % |
| Parcial: personalización sin regla | $673k | 20.9 % |
| Parcial: tamaño sin verificar | $169k | 5.3 % |
| GENERIC (Rappi de Rubén Darío sin desglose) | $19k | 0.6 % |
| Sin receta (Triple Frap de Rappi) | $310 | 0.0 % |

Cada paso suma al anterior:

| Paso | Qué se necesita | Costeo completo acumulado |
| --- | --- | --- |
| «Average» de jarabes, jengibre y menta | Decisión: = receta (**este PR**) | 79.2 % |
| Miel (Less / Average / More Honey) | ml por nivel; ninguna receta trae miel | 87.5 % |
| More / Less de jarabes | ml de cada uno | 89.2 % |
| Café extra (Dirty Chai, Chocold Mint) | confirmar un shot de 18 g | 91.0 % |
| Fresh Soda, leches, sprinkles, creamer y resto | datos de Operaciones | 94.1 % |
| Tamaños | combos con vaso, Chai Frap Grande, V60 sin vaso y Rappi sin vaso | ~99 % |
| GENERIC y Triple Frap | Rubén Darío al lector del portal (PR #85/#86) y receta del Triple Frap | 100 % |

El detalle por personalización, tamaño y sucursal está en `entregables/Costeo_Sucursales_que_falta_2026-11-03.xlsx`, que
queda fuera del repositorio.

Hallazgos:

- **Gelato Frappé y Fresh Soda sin vaso** son histórico. Del 6 al 19 de octubre llegaban sin vaso; desde el 20 de octubre el POS
  ya lo manda (Gelato Frappé Coffee: 154 líneas sin vaso antes y 3 después).
- **Rappi** es lo menos cubierto: 47 % completo.
- **Combos con vaso:** el POS manda vaso Regular o Large en Iced Latte + Ham & Cheese ($66k) y en los combos de True White.
  La receta del combo es de tamaño Único con el vaso chico. El Regular corresponde a la receta y el Large necesita un tamaño
  Grande del combo; queda pendiente.

## Cambio 1 · «Average» = la receta (Carlo, 2026-11-03)

Respuesta de Carlo: «Sí, Average = receta». Se agrega a `PERSONALIZACIONES_NEUTRAS` solo en las recetas donde se vende y que
llevan ese jarabe en los dos tamaños. Se verificó contra las recetas de producción del 2026-11-03.

| Receta | Personalización | Lo que trae la receta (Chica y Grande) |
| --- | --- | --- |
| Salted Caramel (`7867787b…`) | Average Salted Caramel (cold), Average Caramelo (hot) | 15 ml de jarabe de caramelo salado + 5 ml de salsa de caramelo |
| Flat Caramel (`f33b95a8…`) | Average Caramelo (hot) | 10 ml de jarabe de caramelo |
| Black Ginger (`af7eeb7f…`) | Average Gengibre (Black Ginger) | 15 ml de jarabe de jengibre |
| Matcha Iced Mint (`4b651700…`) | Average Mint | 15 ml de jarabe de menta |

Quedan fuera:

- **More y Less:** cambian la cantidad y siguen sin regla hasta tener sus ml.
- **Average Honey:** ninguna receta lleva miel.
- **Average Creamer:** ya tenía su regla.
- **«Coco Vainilla: Promedio» de Rappi:** 5 líneas en el Sora; falta verificar el jarabe de la receta.

## Cambio 2 · Tamaños del Matcha Iced Latte + Lemon Cake

La receta del combo ya tiene Chica (vaso de 14 oz, 170 ml de leche) y Grande (vaso de 20 oz, 290 ml), igual que el Matcha
Iced Latte, que ya estaba verificado. Se agrega a `TAMANOS_VERIFICADOS` con Regular → Chica y Large → Grande. La lista queda
en 38.

## Resultado

Medido otra vez con las reglas de esta rama, sobre las mismas ventas y costos:

- el costeo completo pasa de **73.2 % a 79.3 %**;
- la parcial por personalización baja de 20.9 % a 15.0 %, y la de tamaño, de 5.3 % a 5.1 %;
- Rappi pasa de 47.4 % a 50.0 %.

Como Consumo usa la misma regla, esas ventas también cuentan con su receta.

Pruebas: 628 en verde y `tsc` limpio. La prueba de paridad no corre en la copia de trabajo porque falta el Excel de costeo.
