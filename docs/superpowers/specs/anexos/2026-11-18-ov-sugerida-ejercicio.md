# Spike: orden de venta sugerida desde ventas POS (vía recetas)

Generado 2026-11-18. Ejercicio de solo lectura; nada se guardó en la base.

## Método
- **Consumo**: `sucursales_consumo_mes` de **octubre 2026** (ya calculado por el motor de Consumo, `lib/sucursales/consumo.ts`, con tamaños y personalizaciones; suma de orígenes mostrador/app/rappi). No se recalcularon los últimos 30 días: el motor lee la API del POS por pedido (con customs), y `bi_lineas` no trae las personalizaciones, así que recalcular a mano habría sido menos fiel.
- **Compras reales**: `com_legado_pedidos` por `apertura_id`, sin `status` cancelado/cancelacion_pendiente, sin pedidos de `com_legado_pedidos_apertura` ni notas "pedido/kit de apertura"; `items_editados` reemplaza a `items` (sku recuperado de `items` por nombre, como `serieDiaria`). Fecha en día local CDMX. Dos ventanas: **octubre 2026** y **promedio mensual ago–oct 2026** (para suavizar la cadencia de pedido). Todas las líneas tenían sku (la tabla `com_mapeo_sku` no existe en el portal; no hizo falta).
- **Precio**: `com_catalogo.costo_unitario` como proxy. INS-BA-076 (Café White 1 kg) no está en el catálogo: se usó $280 (= 420/1.5).
- **Sugerido** = consumo ÷ tamaño de paquete, redondeado hacia arriba, **suponiendo inventario cero en tienda** (un mes, sin stock inicial ni de seguridad).

## Tiendas y emparejamiento
| bi_tiendas | company_id | Venta POS 30d | Apertura (sitio viejo) | Match | Cobertura de líneas oct (incluidas/total) |
|---|---|---|---|---|---|
| La Mexicana | 519 | $379k | 411 "La Mexicana" | nombre exacto | 99% |
| Pasaje Parián | 460 | $244k | 354 "Pasaje Parian" | nombre sin acento | 98% |
| Avándaro | 463 | $169k | 347 "Avandaro" | nombre sin acento | 85% |

Las tres son del franquiciatario CDMX-MJA (varias tiendas comparten correo), por eso se emparejó por `apertura_id` (el pedido trae la apertura), no por correo. Se descartaron Cd. Juárez/Plaza Cantabria (el mismo franquiciatario pide todo por una sola apertura) y Ávila Camacho (abrió 2026-09, compras de llenado).

## Métricas resumen
| Tienda | Ventana compras | Comprado $ | % del $ comprado en SKUs sugeridos | SKUs comprados | comprados no sugeridos | sugeridos no comprados | $ sugerido (todo) | WAPE $ en SKUs sugeridos |
|---|---|---|---|---|---|---|---|---|
| La Mexicana | oct 2026 | $33,973 | 88.6% | 39 | 14 | 22 | $46,148 | 53% |
| La Mexicana | prom. ago–oct | $40,197 | 93.4% | 52 | 18 | 13 | $46,148 | 35% |
| Pasaje Parián | oct 2026 | $28,242 | 78.7% | 32 | 12 | 28 | $36,999 | 54% |
| Pasaje Parián | prom. ago–oct | $37,957 | 87.5% | 56 | 22 | 14 | $36,999 | 42% |
| Avándaro | oct 2026 | $11,172 | 90% | 15 | 3 | 29 | $22,688 | 85% |
| Avándaro | prom. ago–oct | $15,250 | 86.2% | 36 | 13 | 18 | $22,688 | 47% |

WAPE = Σ|sugerido sin redondear×costo − comprado×costo| ÷ Σ comprado×costo, sobre los SKUs que el método sugiere.

## La Mexicana (company 519, apertura 411) — detalle completo
| SKU | Nombre | Costo | Sugerido (exacto) | Sugerido (↑) | Comprado oct | Comprado prom/mes ago–oct | $ sug | $ oct | $ prom |
|---|---|---|---|---|---|---|---|---|---|
| INS-CAF-003 | Cafe en Grano White 1.5 Kg | 420 | 35.73 | 36 | 33 | 39.33 | 15,120 | 13,860 | 16,520 |
| INS-BEB-045 | Matcha Organico 1kg | 690 | 2.56 | 3 | 2 | 3.33 | 2,070 | 1,380 | 2,300 |
| INS-BEB-067 | Isopure Vainilla Zero Carb 7.5 Lb | 2198.21 | 0.71 | 1 | 1 | 1 | 2,198 | 2,198 | 2,198 |
| INS-FOD-001 | Bolsas Para Pan (1;000 Pzs) | 1061.76 | 1.19 | 2 | 0 | 0.67 | 2,124 | 0 | 708 |
| INS-BEB-046 | Chai Masala 1 Kg | 690 | 1.35 | 2 | 3 | 2.67 | 1,380 | 2,070 | 1,840 |
| INS-DES-004 | Vaso Caliente Chico 8 Oz (500 Pzs) | 510 | 3.25 | 4 | 1 | 2.33 | 2,040 | 510 | 1,190 |
| INS-DES-005 | Vaso Frio Chico 14 Oz (1;000 Pzs) | 960 | 1.15 | 2 | 0 | 1 | 1,920 | 0 | 960 |
| RTD-FEL-004 | Felix Schorle Frambuesa 24 Pz | 29.16 | 50 | 50 | 0 | 0 | 1,458 | 0 | 0 |
| INS-DES-003 | Vaso Frio Grande 20 Oz (1;000 Pzs) | 1360 | 0.62 | 1 | 1 | 0.67 | 1,360 | 1,360 | 907 |
| RTD-ZOÉ-001 | CAJA ZOÉ WATER SABOR NEUTRO 24 PZ | 313.68 | 3.92 | 4 | 3 | 3.67 | 1,255 | 941 | 1,150 |
| INS-BEB-049 | Jarabe de Vainilla 1L (3 Pzas) | 405 | 1.6 | 2 | 2 | 3 | 810 | 810 | 1,215 |
| INS-DES-021 | Vaso Caliente Grande 12 Oz (500 Pzs) | 568.19 | 1.56 | 2 | 1 | 1.33 | 1,136 | 568 | 758 |
| INS-BEB-041 | Terneatea 500g | 1062.5 | 0.1 | 1 | 0 | 0 | 1,063 | 0 | 0 |
| INS-BA-068 | SERVILLETAS THE COFFEE (6,000 PIEZAS) | 951 | 0 | 0 | 1 | 0.67 | 0 | 951 | 634 |
| INS-DEL-012 | BOLSAS KRAFT THE COFFEE (250 PZAS) | 810.3 | 0 | 0 | 1 | 0.67 | 0 | 810 | 540 |
| INS-DEL-007 | Portavasos The Coffee (300 Pzs) | 765 | 0 | 0 | 1 | 0.33 | 0 | 765 | 255 |
| INS-BA-069 | Base Neutra Frappe 1 Kg | 126.75 | 5.69 | 6 | 6 | 5 | 761 | 761 | 634 |
| INS-DES-012 | Tapa Para Vaso Caliente Chico (1;000 Pzs) | 360 | 1.63 | 2 | 1 | 1 | 720 | 360 | 360 |
| INS-DES-002 | Vaso Espresso 4 Oz (2;500 Pzs) | 697.44 | 0.07 | 1 | 0 | 0 | 697 | 0 | 0 |
| INS-DEL-005 | Etiquetas The Coffee (1;250 Pzs) | 692.46 | 0.95 | 1 | 0 | 0 | 692 | 0 | 0 |
| INS-BEB-034 | Schweppes Agua Tonica 296 ML | 11.01 | 58.78 | 59 | 0 | 0 | 650 | 0 | 0 |
| INS-BEB-009 | Cocoa en Polvo Premium 1 Kg | 315 | 1.38 | 2 | 2 | 2 | 630 | 630 | 630 |
| INS-CAF-001 | Cafe en Grano Black 1.5 Kg | 600 | 0.99 | 1 | 1 | 1 | 600 | 600 | 600 |
| INS-DES-010 | Popote con Punta Negro (2,000 Pzs) | 450 | 0.89 | 1 | 1 | 1.33 | 450 | 450 | 600 |
| INS-DES-008 | Tapa Para Vasos Frios Chico/Grande (1;000 Pzs) | 296.44 | 1.77 | 2 | 0 | 2 | 593 | 0 | 593 |
| INS-BA-072 | Base Taro Frappe 1 Kg | 194.68 | 1.65 | 2 | 3 | 2.67 | 389 | 584 | 519 |
| RTD-PER-003 | Agua Mineral Perrier 330 ML (4 PZS) | 71.08 | 7.75 | 8 | 0 | 0 | 569 | 0 | 0 |
| INS-BEB-051 | Jarabe de Caramelo Salado 1L (3 Pzas) | 405 | 0.57 | 1 | 0 | 1.33 | 405 | 0 | 540 |
| INS-CAF-002 | Cafe en Grano Kraft 1.5 Kg | 465 | 0.16 | 1 | 1 | 1 | 465 | 465 | 465 |
| INS-BA-071 | Base Chai Frappe 1 Kg | 194.68 | 0.68 | 1 | 2 | 2.33 | 195 | 389 | 454 |
| INS-BEB-033 | Salsa de Caramelo 4L | 425 | 0.18 | 1 | 0 | 0.33 | 425 | 0 | 142 |
| INS-BEB-052 | Jarabe de Caramelo 1L (3 Pzas) | 405 | 0.43 | 1 | 1 | 1 | 405 | 405 | 405 |
| INS-BEB-050 | Jarabe de Jengibre 1L (3 Pzas) | 405 | 0.1 | 1 | 0 | 0.33 | 405 | 0 | 135 |
| INS-BEB-069 | JARABE DE MENTA 1 LTO. CAJA (3 PIEZAS) | 405 | 0.15 | 1 | 0 | 0 | 405 | 0 | 0 |
| INS-BA-070 | Base Matcha Frappe 1 Kg | 194.68 | 0.63 | 1 | 2 | 1.67 | 195 | 389 | 324 |
| INS-DES-013 | Tapa para Vaso Caliente Grande (1;000 Pzs) | 349.62 | 0.78 | 1 | 1 | 0.67 | 350 | 350 | 233 |
| INS-BEB-022 | Jarabe de Coco 1L (1 Pza) | 140 | 0.78 | 1 | 2 | 1 | 140 | 280 | 140 |
| INS-CAF-004 | Cafe en Grano White 250g | 70 | 4 | 4 | 0 | 3.33 | 280 | 0 | 233 |
| INS-DEL-006 | Portavasos 2 Divisiones (300 Pzs) | 280 | 0 | 0 | 1 | 0.67 | 0 | 280 | 187 |
| INS-BEB-039 | Sobres de Stevia (500 Sobres) | 270 | 0 | 0 | 1 | 0.67 | 0 | 270 | 180 |
| MER-TER-003 | Vaso Termico The Coffee 360ml - Blanco | 127.71 | 2 | 2 | 0 | 0 | 255 | 0 | 0 |
| MER-TAZ-002 | Taza The Coffee 300ml - Blanco Mate | 76.22 | 3 | 3 | 0 | 0 | 229 | 0 | 0 |
| EQ-DEL-001 | Rollo de Plastico Impreso Beltek | 646.55 | 0 | 0 | 0 | 0.33 | 0 | 0 | 216 |
| INS-BEB-032 | Pulpa de Maracuya 500ml | 70.67 | 2.6 | 3 | 3 | 1.33 | 212 | 212 | 94 |
| RTD-ZOÉ-003 | CAJA ZOÉ WATER SABOR FRUTOS ROJOS 12 PZ | 196.44 | 0.75 | 1 | 1 | 0.67 | 196 | 196 | 131 |
| RTD-ZOÉ-002 | CAJA ZOÉ WATER SABOR LIMON 12 PZ | 196.44 | 0.75 | 1 | 1 | 1 | 196 | 196 | 196 |
| INS-BEB-058 | JARABE DE BLUEBERRY 1 LITRO (1 PIEZA) | 140 | 0.1 | 1 | 0 | 1.33 | 140 | 0 | 187 |
| INS-LIM-027 | Trapo Verde (5 Pzas) | 89.5 | 0 | 0 | 2 | 0.67 | 0 | 179 | 60 |
| MER-PAR-002 | Paraguas The Coffee - Transparente | 172.07 | 0 | 0 | 1 | 0.33 | 0 | 172 | 57 |
| INS-FOD-006 | Oregano 200g | 142.19 | 0.55 | 1 | 0 | 0 | 142 | 0 | 0 |
| INS-BEB-047 | Chips de Chocolate 500g | 70 | 0.52 | 1 | 2 | 2 | 70 | 140 | 140 |
| INS-LIM-034 | Jabón Lavatrastes 5L | 139.9 | 0 | 0 | 1 | 1 | 0 | 140 | 140 |
| INS-CAF-005 | Cafe en Grano Kraft 250g | 77.5 | 0 | 0 | 0 | 1.67 | 0 | 0 | 129 |
| INS-LIM-022 | Limpiador Multiusos 5L | 121.5 | 0 | 0 | 1 | 0.33 | 0 | 122 | 41 |
| MER-TOT-002 | Tote Bag The Coffee - Negra | 99 | 1 | 1 | 0 | 0 | 99 | 0 | 0 |
| INS-BEB-053 | Filtros de Papel Hario V60 | 98.6 | 0.27 | 1 | 0 | 0.33 | 99 | 0 | 33 |
| INS-LIM-033 | Trapo Blanco para Lanceta (5 Pzas) | 89.5 | 0 | 0 | 1 | 0.33 | 0 | 90 | 30 |
| INS-BEB-001 | Agitadores (1;000 Pzs) | 130 | 0 | 0 | 0 | 0.67 | 0 | 0 | 87 |
| INS-BEB-030 | Miel de Abeja 1L | 85 | 0.1 | 1 | 0 | 0 | 85 | 0 | 0 |
| MER-DRI-001 | Dripper V60 The Coffee | 235.89 | 0 | 0 | 0 | 0.33 | 0 | 0 | 79 |
| INS-BEB-057 | Azúcar Mascabado 500g | 23.69 | 2.48 | 3 | 0 | 0 | 71 | 0 | 0 |
| MP-OPE-022 | Acrilico Soporte Para Tarjeta | 22.786 | 0 | 0 | 2 | 0.67 | 0 | 46 | 15 |
| INS-LIM-026 | Jeringa Dosificadora 5ml | 28.5 | 0 | 0 | 1 | 0.33 | 0 | 29 | 10 |
| UNI-PIN-001 | Pin The Coffee | 15.6 | 0 | 0 | 1 | 0.33 | 0 | 16 | 5 |
| INS-DES-019 | (no en catálogo) | 0 | 0 | 0 | 1 | 0.33 | 0 | 0 | 0 |

## Pasaje Parián (company 460, apertura 354) — detalle completo
| SKU | Nombre | Costo | Sugerido (exacto) | Sugerido (↑) | Comprado oct | Comprado prom/mes ago–oct | $ sug | $ oct | $ prom |
|---|---|---|---|---|---|---|---|---|---|
| INS-CAF-003 | Cafe en Grano White 1.5 Kg | 420 | 26.51 | 27 | 30 | 34.33 | 11,340 | 12,600 | 14,420 |
| INS-BEB-067 | Isopure Vainilla Zero Carb 7.5 Lb | 2198.21 | 0.7 | 1 | 0 | 0.67 | 2,198 | 0 | 1,465 |
| INS-BA-076 | Café en Grano White 1kg (no está en com_catalogo) | 280 | 0 | 0 | 7 | 2.33 | 0 | 1,960 | 653 |
| INS-DES-005 | Vaso Frio Chico 14 Oz (1;000 Pzs) | 960 | 1.09 | 2 | 1 | 1.33 | 1,920 | 960 | 1,280 |
| INS-BEB-045 | Matcha Organico 1kg | 690 | 1.3 | 2 | 1 | 2.67 | 1,380 | 690 | 1,840 |
| INS-BEB-049 | Jarabe de Vainilla 1L (3 Pzas) | 405 | 1.66 | 2 | 2 | 3.67 | 810 | 810 | 1,485 |
| INS-BEB-046 | Chai Masala 1 Kg | 690 | 0.53 | 1 | 1 | 2 | 690 | 690 | 1,380 |
| INS-DES-003 | Vaso Frio Grande 20 Oz (1;000 Pzs) | 1360 | 0.5 | 1 | 0 | 0.67 | 1,360 | 0 | 907 |
| INS-DEL-012 | BOLSAS KRAFT THE COFFEE (250 PZAS) | 810.3 | 0 | 0 | 1 | 1.67 | 0 | 810 | 1,350 |
| INS-BEB-041 | Terneatea 500g | 1062.5 | 0.07 | 1 | 0 | 0.67 | 1,063 | 0 | 708 |
| INS-FOD-001 | Bolsas Para Pan (1;000 Pzs) | 1061.76 | 0.86 | 1 | 1 | 0.67 | 1,062 | 1,062 | 708 |
| INS-DES-004 | Vaso Caliente Chico 8 Oz (500 Pzs) | 510 | 1.65 | 2 | 1 | 1.33 | 1,020 | 510 | 680 |
| INS-BA-068 | SERVILLETAS THE COFFEE (6,000 PIEZAS) | 951 | 0 | 0 | 1 | 0.33 | 0 | 951 | 317 |
| INS-BEB-051 | Jarabe de Caramelo Salado 1L (3 Pzas) | 405 | 0.96 | 1 | 2 | 2.33 | 405 | 810 | 945 |
| MER-TOT-002 | Tote Bag The Coffee - Negra | 99 | 8 | 8 | 4 | 4.67 | 792 | 396 | 462 |
| INS-BA-069 | Base Neutra Frappe 1 Kg | 126.75 | 5.24 | 6 | 2 | 3 | 761 | 254 | 380 |
| INS-CAF-004 | Cafe en Grano White 250g | 70 | 9 | 9 | 0 | 10.67 | 630 | 0 | 747 |
| INS-DES-002 | Vaso Espresso 4 Oz (2;500 Pzs) | 697.44 | 0.05 | 1 | 0 | 0 | 697 | 0 | 0 |
| INS-DEL-005 | Etiquetas The Coffee (1;250 Pzs) | 692.46 | 0.69 | 1 | 0 | 0 | 692 | 0 | 0 |
| INS-BEB-009 | Cocoa en Polvo Premium 1 Kg | 315 | 1 | 1 | 2 | 2 | 315 | 630 | 630 |
| RTD-ZOÉ-001 | CAJA ZOÉ WATER SABOR NEUTRO 24 PZ | 313.68 | 1.13 | 2 | 1 | 1.33 | 627 | 314 | 418 |
| INS-CAF-001 | Cafe en Grano Black 1.5 Kg | 600 | 0.96 | 1 | 0 | 0.33 | 600 | 0 | 200 |
| INS-DES-008 | Tapa Para Vasos Frios Chico/Grande (1;000 Pzs) | 296.44 | 1.58 | 2 | 0 | 1.67 | 593 | 0 | 494 |
| INS-DES-021 | Vaso Caliente Grande 12 Oz (500 Pzs) | 568.19 | 0.87 | 1 | 1 | 0.33 | 568 | 568 | 189 |
| INS-DEL-011 | ETIQUETAS DE COUCHE DELIVERY ORDENA DESDE LA APP(1,250 PIEZAS) | 560 | 0 | 0 | 1 | 0.67 | 0 | 560 | 373 |
| INS-BEB-034 | Schweppes Agua Tonica 296 ML | 11.01 | 46.52 | 47 | 0 | 0 | 517 | 0 | 0 |
| INS-CAF-002 | Cafe en Grano Kraft 1.5 Kg | 465 | 0.2 | 1 | 0 | 0 | 465 | 0 | 0 |
| INS-BA-072 | Base Taro Frappe 1 Kg | 194.68 | 1.13 | 2 | 1 | 2.33 | 389 | 195 | 454 |
| INS-DES-010 | Popote con Punta Negro (2,000 Pzs) | 450 | 0.79 | 1 | 1 | 1 | 450 | 450 | 450 |
| INS-CAF-006 | Cafe en Grano Black 250g | 100 | 2 | 2 | 0 | 4.33 | 200 | 0 | 433 |
| RTD-PER-003 | Agua Mineral Perrier 330 ML (4 PZS) | 71.08 | 5.25 | 6 | 0 | 0 | 426 | 0 | 0 |
| INS-BEB-033 | Salsa de Caramelo 4L | 425 | 0.26 | 1 | 0 | 0.67 | 425 | 0 | 283 |
| RTD-FEL-004 | Felix Schorle Frambuesa 24 Pz | 29.16 | 14 | 14 | 0 | 0 | 408 | 0 | 0 |
| INS-BEB-052 | Jarabe de Caramelo 1L (3 Pzas) | 405 | 0.26 | 1 | 0 | 0 | 405 | 0 | 0 |
| INS-BEB-050 | Jarabe de Jengibre 1L (3 Pzas) | 405 | 0.17 | 1 | 0 | 0.33 | 405 | 0 | 135 |
| INS-BEB-069 | JARABE DE MENTA 1 LTO. CAJA (3 PIEZAS) | 405 | 0.01 | 1 | 0 | 0 | 405 | 0 | 0 |
| MER-TOT-001 | Tote Bag The Coffee - Blanca | 99 | 0 | 0 | 4 | 2 | 0 | 396 | 198 |
| INS-CAF-005 | Cafe en Grano Kraft 250g | 77.5 | 5 | 5 | 4 | 5 | 388 | 310 | 388 |
| INS-DES-012 | Tapa Para Vaso Caliente Chico (1;000 Pzs) | 360 | 0.82 | 1 | 1 | 0.67 | 360 | 360 | 240 |
| INS-DES-013 | Tapa para Vaso Caliente Grande (1;000 Pzs) | 349.62 | 0.43 | 1 | 1 | 0.33 | 350 | 350 | 117 |
| INS-BEB-022 | Jarabe de Coco 1L (1 Pza) | 140 | 0.6 | 1 | 0 | 2 | 140 | 0 | 280 |
| INS-DEL-006 | Portavasos 2 Divisiones (300 Pzs) | 280 | 0 | 0 | 1 | 1 | 0 | 280 | 280 |
| INS-BEB-039 | Sobres de Stevia (500 Sobres) | 270 | 0 | 0 | 1 | 0.33 | 0 | 270 | 90 |
| INS-BA-071 | Base Chai Frappe 1 Kg | 194.68 | 0.32 | 1 | 0 | 1.33 | 195 | 0 | 260 |
| INS-BEB-032 | Pulpa de Maracuya 500ml | 70.67 | 1.62 | 2 | 2 | 3.67 | 141 | 141 | 259 |
| MER-TER-003 | Vaso Termico The Coffee 360ml - Blanco | 127.71 | 2 | 2 | 0 | 1 | 255 | 0 | 128 |
| INS-BEB-047 | Chips de Chocolate 500g | 70 | 1 | 1 | 2 | 3.33 | 70 | 140 | 233 |
| INS-BEB-058 | JARABE DE BLUEBERRY 1 LITRO (1 PIEZA) | 140 | 0 | 0 | 0 | 1.67 | 0 | 0 | 233 |
| INS-LIM-018 | Polvo Limpiador para Maquina de Espresso Cafiza Urnex 566g | 228.52 | 0 | 0 | 1 | 0.33 | 0 | 229 | 76 |
| EQ-DEL-001 | Rollo de Plastico Impreso Beltek | 646.55 | 0 | 0 | 0 | 0.33 | 0 | 0 | 216 |
| RTD-ZOÉ-003 | CAJA ZOÉ WATER SABOR FRUTOS ROJOS 12 PZ | 196.44 | 0.21 | 1 | 0 | 0 | 196 | 0 | 0 |
| RTD-ZOÉ-002 | CAJA ZOÉ WATER SABOR LIMON 12 PZ | 196.44 | 0.21 | 1 | 0 | 0 | 196 | 0 | 0 |
| INS-LIM-021 | Desinfectante de Amplio Espectro 5 kg | 587.3 | 0 | 0 | 0 | 0.33 | 0 | 0 | 196 |
| INS-BA-070 | Base Matcha Frappe 1 Kg | 194.68 | 0.51 | 1 | 0 | 1 | 195 | 0 | 195 |
| INS-LIM-034 | Jabón Lavatrastes 5L | 139.9 | 0 | 0 | 1 | 1.33 | 0 | 140 | 187 |
| MER-PAR-002 | Paraguas The Coffee - Transparente | 172.07 | 0 | 0 | 1 | 0.67 | 0 | 172 | 115 |
| INS-FOD-006 | Oregano 200g | 142.19 | 0.27 | 1 | 0 | 0 | 142 | 0 | 0 |
| INS-LIM-022 | Limpiador Multiusos 5L | 121.5 | 0 | 0 | 1 | 0.67 | 0 | 122 | 81 |
| MER-TER-001 | Vaso Termico The Coffee 240ml - Blanco | 120.15 | 1 | 1 | 0 | 0 | 120 | 0 | 0 |
| MP-OPE-022 | Acrilico Soporte Para Tarjeta | 22.786 | 0 | 0 | 5 | 1.67 | 0 | 114 | 38 |
| INS-BEB-053 | Filtros de Papel Hario V60 | 98.6 | 0.35 | 1 | 0 | 0.33 | 99 | 0 | 33 |
| INS-LIM-032 | Tiras Reactivas | 289.5 | 0 | 0 | 0 | 0.33 | 0 | 0 | 97 |
| INS-BEB-030 | Miel de Abeja 1L | 85 | 0.14 | 1 | 0 | 0 | 85 | 0 | 0 |
| MER-DRI-001 | Dripper V60 The Coffee | 235.89 | 0 | 0 | 0 | 0.33 | 0 | 0 | 79 |
| INS-BEB-057 | Azúcar Mascabado 500g | 23.69 | 1.8 | 2 | 0 | 0 | 47 | 0 | 0 |
| INS-BEB-001 | Agitadores (1;000 Pzs) | 130 | 0 | 0 | 0 | 0.33 | 0 | 0 | 43 |
| MER-TER-002 | Vaso Termico The Coffee 240ml - Negro | 120.15 | 0 | 0 | 0 | 0.33 | 0 | 0 | 40 |
| INS-LIM-023 | Jabón Para Manos 5L | 119 | 0 | 0 | 0 | 0.33 | 0 | 0 | 40 |
| INS-LIM-033 | Trapo Blanco para Lanceta (5 Pzas) | 89.5 | 0 | 0 | 0 | 0.33 | 0 | 0 | 30 |
| INS-DES-022 | (no en catálogo) | 0 | 0 | 0 | 0 | 0.33 | 0 | 0 | 0 |

## Avándaro (company 463, apertura 347) — detalle completo
| SKU | Nombre | Costo | Sugerido (exacto) | Sugerido (↑) | Comprado oct | Comprado prom/mes ago–oct | $ sug | $ oct | $ prom |
|---|---|---|---|---|---|---|---|---|---|
| INS-CAF-003 | Cafe en Grano White 1.5 Kg | 420 | 10.06 | 11 | 8 | 13 | 4,620 | 3,360 | 5,460 |
| INS-BEB-067 | Isopure Vainilla Zero Carb 7.5 Lb | 2198.21 | 0.3 | 1 | 0 | 0.33 | 2,198 | 0 | 733 |
| INS-BEB-045 | Matcha Organico 1kg | 690 | 0.52 | 1 | 2 | 1.67 | 690 | 1,380 | 1,150 |
| INS-DES-003 | Vaso Frio Grande 20 Oz (1;000 Pzs) | 1360 | 0.18 | 1 | 1 | 0.33 | 1,360 | 1,360 | 453 |
| INS-BEB-041 | Terneatea 500g | 1062.5 | 0.02 | 1 | 0 | 0 | 1,063 | 0 | 0 |
| INS-FOD-001 | Bolsas Para Pan (1;000 Pzs) | 1061.76 | 0.48 | 1 | 0 | 0.33 | 1,062 | 0 | 354 |
| INS-DES-005 | Vaso Frio Chico 14 Oz (1;000 Pzs) | 960 | 0.22 | 1 | 1 | 0.33 | 960 | 960 | 320 |
| INS-CAF-002 | Cafe en Grano Kraft 1.5 Kg | 465 | 0 | 0 | 2 | 1.33 | 0 | 930 | 620 |
| INS-BEB-046 | Chai Masala 1 Kg | 690 | 0.23 | 1 | 1 | 1.33 | 690 | 690 | 920 |
| INS-CAF-004 | Cafe en Grano White 250g | 70 | 6 | 6 | 7 | 11.33 | 420 | 490 | 793 |
| INS-DES-002 | Vaso Espresso 4 Oz (2;500 Pzs) | 697.44 | 0.02 | 1 | 0 | 0 | 697 | 0 | 0 |
| INS-DEL-005 | Etiquetas The Coffee (1;250 Pzs) | 692.46 | 0.38 | 1 | 0 | 0 | 692 | 0 | 0 |
| INS-CAF-001 | Cafe en Grano Black 1.5 Kg | 600 | 0.5 | 1 | 0 | 0 | 600 | 0 | 0 |
| INS-DES-021 | Vaso Caliente Grande 12 Oz (500 Pzs) | 568.19 | 0.51 | 1 | 0 | 0.33 | 568 | 0 | 189 |
| INS-DEL-012 | BOLSAS KRAFT THE COFFEE (250 PZAS) | 810.3 | 0 | 0 | 0 | 0.67 | 0 | 0 | 540 |
| INS-BEB-049 | Jarabe de Vainilla 1L (3 Pzas) | 405 | 0.48 | 1 | 0 | 1.33 | 405 | 0 | 540 |
| INS-DES-004 | Vaso Caliente Chico 8 Oz (500 Pzs) | 510 | 0.82 | 1 | 1 | 0.67 | 510 | 510 | 340 |
| INS-DES-010 | Popote con Punta Negro (2,000 Pzs) | 450 | 0.2 | 1 | 0 | 0 | 450 | 0 | 0 |
| INS-BEB-033 | Salsa de Caramelo 4L | 425 | 0.05 | 1 | 0 | 0 | 425 | 0 | 0 |
| INS-BEB-052 | Jarabe de Caramelo 1L (3 Pzas) | 405 | 0.12 | 1 | 0 | 0 | 405 | 0 | 0 |
| INS-BEB-051 | Jarabe de Caramelo Salado 1L (3 Pzas) | 405 | 0.2 | 1 | 0 | 0.33 | 405 | 0 | 135 |
| INS-BEB-050 | Jarabe de Jengibre 1L (3 Pzas) | 405 | 0.04 | 1 | 0 | 0 | 405 | 0 | 0 |
| INS-CAF-006 | Cafe en Grano Black 250g | 100 | 4 | 4 | 3 | 2.67 | 400 | 300 | 267 |
| INS-BA-069 | Base Neutra Frappe 1 Kg | 126.75 | 1.51 | 2 | 3 | 2.67 | 254 | 380 | 338 |
| INS-DES-012 | Tapa Para Vaso Caliente Chico (1;000 Pzs) | 360 | 0.41 | 1 | 0 | 0 | 360 | 0 | 0 |
| INS-DES-013 | Tapa para Vaso Caliente Grande (1;000 Pzs) | 349.62 | 0.26 | 1 | 0 | 0.33 | 350 | 0 | 117 |
| INS-BEB-009 | Cocoa en Polvo Premium 1 Kg | 315 | 0.48 | 1 | 0 | 0.33 | 315 | 0 | 105 |
| RTD-ZOÉ-001 | CAJA ZOÉ WATER SABOR NEUTRO 24 PZ | 313.68 | 0.17 | 1 | 0 | 0 | 314 | 0 | 0 |
| INS-DES-008 | Tapa Para Vasos Frios Chico/Grande (1;000 Pzs) | 296.44 | 0.4 | 1 | 0 | 0.67 | 296 | 0 | 198 |
| INS-CAF-005 | Cafe en Grano Kraft 250g | 77.5 | 2 | 2 | 3 | 1.67 | 155 | 233 | 129 |
| EQ-DEL-001 | Rollo de Plastico Impreso Beltek | 646.55 | 0 | 0 | 0 | 0.33 | 0 | 0 | 216 |
| INS-BA-071 | Base Chai Frappe 1 Kg | 194.68 | 0.16 | 1 | 0 | 0.67 | 195 | 0 | 130 |
| INS-BA-070 | Base Matcha Frappe 1 Kg | 194.68 | 0.47 | 1 | 1 | 0.67 | 195 | 195 | 130 |
| INS-BA-072 | Base Taro Frappe 1 Kg | 194.68 | 0.4 | 1 | 1 | 1 | 195 | 195 | 195 |
| INS-FOD-006 | Oregano 200g | 142.19 | 0.27 | 1 | 0 | 0 | 142 | 0 | 0 |
| RTD-PER-003 | Agua Mineral Perrier 330 ML (4 PZS) | 71.08 | 1.5 | 2 | 0 | 0 | 142 | 0 | 0 |
| INS-BEB-058 | JARABE DE BLUEBERRY 1 LITRO (1 PIEZA) | 140 | 0.01 | 1 | 0 | 0 | 140 | 0 | 0 |
| INS-BEB-022 | Jarabe de Coco 1L (1 Pza) | 140 | 0.15 | 1 | 0 | 0 | 140 | 0 | 0 |
| INS-BEB-036 | Sobres Azucar Splenda (2;000 Sobres) | 412.2 | 0 | 0 | 0 | 0.33 | 0 | 0 | 137 |
| MER-TER-003 | Vaso Termico The Coffee 360ml - Blanco | 127.71 | 1 | 1 | 0 | 1 | 128 | 0 | 128 |
| INS-LIM-022 | Limpiador Multiusos 5L | 121.5 | 0 | 0 | 1 | 1 | 0 | 122 | 122 |
| MER-TER-001 | Vaso Termico The Coffee 240ml - Blanco | 120.15 | 0 | 0 | 0 | 1 | 0 | 0 | 120 |
| INS-BEB-053 | Filtros de Papel Hario V60 | 98.6 | 0.02 | 1 | 0 | 0 | 99 | 0 | 0 |
| INS-DEL-006 | Portavasos 2 Divisiones (300 Pzs) | 280 | 0 | 0 | 0 | 0.33 | 0 | 0 | 93 |
| INS-BEB-039 | Sobres de Stevia (500 Sobres) | 270 | 0 | 0 | 0 | 0.33 | 0 | 0 | 90 |
| INS-BEB-030 | Miel de Abeja 1L | 85 | 0.12 | 1 | 0 | 0 | 85 | 0 | 0 |
| INS-BEB-047 | Chips de Chocolate 500g | 70 | 0.18 | 1 | 0 | 0.33 | 70 | 0 | 23 |
| MP-OPE-022 | Acrilico Soporte Para Tarjeta | 22.786 | 0 | 0 | 3 | 1 | 0 | 68 | 23 |
| INS-BEB-034 | Schweppes Agua Tonica 296 ML | 11.01 | 5.24 | 6 | 0 | 0 | 66 | 0 | 0 |
| INS-LIM-034 | Jabón Lavatrastes 5L | 139.9 | 0 | 0 | 0 | 0.33 | 0 | 0 | 47 |
| INS-BEB-001 | Agitadores (1;000 Pzs) | 130 | 0 | 0 | 0 | 0.33 | 0 | 0 | 43 |
| INS-LIM-033 | Trapo Blanco para Lanceta (5 Pzas) | 89.5 | 0 | 0 | 0 | 0.33 | 0 | 0 | 30 |
| INS-BEB-057 | Azúcar Mascabado 500g | 23.69 | 0.87 | 1 | 0 | 0 | 24 | 0 | 0 |
| INS-BEB-032 | Pulpa de Maracuya 500ml | 70.67 | 0 | 0 | 0 | 0.33 | 0 | 0 | 24 |

## Mapeo insumo → SKU usado (a mano)
| Insumo (receta) | Unidad | presentacion insumo | SKU | Nombre SKU | Estatus SKU | Factor (unidades de insumo por paquete) |
|---|---|---|---|---|---|---|
| AGUA MINERAL PERRIER 330 ML | pza | 4 | RTD-PER-003 | Agua Mineral Perrier 330 ML (4 PZS) | Prueba | 4 |
| FELIX SCHORLE FRAMBUESA | pza | 1 | RTD-FEL-004 | Felix Schorle Frambuesa 24 Pz | Compra Recurrente | 1 |
| ZOE WATER NATURAL | pza | 24 | RTD-ZOÉ-001 | CAJA ZOÉ WATER SABOR NEUTRO 24 PZ | Compra Recurrente | 24 |
| ZOE WATER TWIST FRUTOS ROJOS | pza | 12 | RTD-ZOÉ-003 | CAJA ZOÉ WATER SABOR FRUTOS ROJOS 12 PZ | Compra Recurrente | 12 |
| ZOE WATER TWIST LIMÓN Y JENGIBRE | pza | 12 | RTD-ZOÉ-002 | CAJA ZOÉ WATER SABOR LIMON 12 PZ | Compra Recurrente | 12 |
| CAFÉ TOSTADO EN GRANO BLACK 1.5 KG | gr | 1500 | INS-CAF-001 | Cafe en Grano Black 1.5 Kg | Compra Recurrente | 1500 |
| CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG | gr | 1500 | INS-CAF-002 | Cafe en Grano Kraft 1.5 Kg | Compra Recurrente | 1500 |
| CAFÉ TOSTADO EN GRANO WHITE 1.5 KG | gr | 1500 | INS-CAF-003 | Cafe en Grano White 1.5 Kg | Compra Recurrente | 1500 |
| BOLSAS PARA PAN PAQUETE (1000 PIEZAS) | pza | 1000 | INS-FOD-001 | Bolsas Para Pan (1;000 Pzs) | Compra Recurrente | 1000 |
| POPOTE CON PUNTA NEGRO (2,000 PZS) | pza | 2000 | INS-DES-010 | Popote con Punta Negro (2,000 Pzs) | Compra Recurrente | 2000 |
| TAPA CALIENTE 80MM (1,000 PZS) | pza | 1000 | INS-DES-012 | Tapa Para Vaso Caliente Chico (1;000 Pzs) | Compra Recurrente | 1000 |
| TAPA CALIENTE 90MM (1,000 PZS) | pza | 1000 | INS-DES-013 | Tapa para Vaso Caliente Grande (1;000 Pzs) | Compra Recurrente | 1000 |
| TAPA FRIO PET (1,000 PZS) | pza | 1000 | INS-DES-008 | Tapa Para Vasos Frios Chico/Grande (1;000 Pzs) | Compra Recurrente | 1000 |
| VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS) | pza | 500 | INS-DES-021 | Vaso Caliente Grande 12 Oz (500 Pzs) | Compra Recurrente | 500 |
| VASO CALIENTE PAPEL KRAFT 8 OZ (500 PZS) | pza | 500 | INS-DES-004 | Vaso Caliente Chico 8 Oz (500 Pzs) | Compra Recurrente | 500 |
| VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS) | pza | 2500 | INS-DES-002 | Vaso Espresso 4 Oz (2;500 Pzs) | Compra Recurrente | 2500 |
| VASO FRÍO PET 14 OZ (1,000 PZS) | pza | 1000 | INS-DES-005 | Vaso Frio Chico 14 Oz (1;000 Pzs) | Compra Recurrente | 1000 |
| VASO FRÍO PET 20 OZ (1,000 PZS) | pza | 1000 | INS-DES-003 | Vaso Frio Grande 20 Oz (1;000 Pzs) | Compra Recurrente | 1000 |
| BASE CHAI PARA FRAPPÉ 1 KG | gr | 1000 | INS-BA-071 | Base Chai Frappe 1 Kg | Compra Recurrente | 1000 |
| BASE MATCHA LATTE PARA FRAPPÉ 1 KG | gr | 1000 | INS-BA-070 | Base Matcha Frappe 1 Kg | Compra Recurrente | 1000 |
| BASE NEUTRA PARA FRAPPÉ 1 KG | gr | 1000 | INS-BA-069 | Base Neutra Frappe 1 Kg | Compra Recurrente | 1000 |
| BASE TARO/COCO PARA FRAPPÉ 1 KG | gr | 1000 | INS-BA-072 | Base Taro Frappe 1 Kg | Compra Recurrente | 1000 |
| CHAI 1 KG | gr | 1000 | INS-BEB-046 | Chai Masala 1 Kg | Compra Recurrente | 1000 |
| CHIP DE SABOR CHOCOLATE 1 KG | gr | 500 | INS-BEB-047 | Chips de Chocolate 500g | Compra Recurrente | 500 |
| COCOA POWDER - EXTRA BRUTE 1 KG | gr | 1000 | INS-BEB-009 | Cocoa en Polvo Premium 1 Kg | Compra Recurrente | 1000 |
| JARABE DE BLUEBERRY 1 LITRO ( 1 PIEZA) | ml | 1000 | INS-BEB-058 | JARABE DE BLUEBERRY 1 LITRO (1 PIEZA) | Inactivo | 1000 |
| JARABE DE CARAMELO 1 LT (3 PZAS) | ml | 3000 | INS-BEB-052 | Jarabe de Caramelo 1L (3 Pzas) | Compra Recurrente | 3000 |
| JARABE DE CARAMELO SALADO 1 LT (3 PZAS) | ml | 3000 | INS-BEB-051 | Jarabe de Caramelo Salado 1L (3 Pzas) | Compra Recurrente | 3000 |
| JARABE DE COCO 1 LT (1 PZA) | ml | 1000 | INS-BEB-022 | Jarabe de Coco 1L (1 Pza) | Compra Recurrente | 1000 |
| JARABE DE JENGIBRE 1 LT (3 PZAS) | ml | 3000 | INS-BEB-050 | Jarabe de Jengibre 1L (3 Pzas) | Compra Recurrente | 3000 |
| JARABE DE MENTA 1 LT (3 PZAS) | ml | 3000 | INS-BEB-069 | JARABE DE MENTA 1 LTO. CAJA (3 PIEZAS) | Hasta Agotar Existencias | 3000 |
| JARABE DE VANILLA 1 LT (3 PZAS) | ml | 3000 | INS-BEB-049 | Jarabe de Vainilla 1L (3 Pzas) | Compra Recurrente | 3000 |
| MATCHA GOURMET ORGÁNICO 1 KG | gr | 1000 | INS-BEB-045 | Matcha Organico 1kg | Compra Recurrente | 1000 |
| MIEL DE ABEJA 1 LT | ml | 1000 | INS-BEB-030 | Miel de Abeja 1L | Compra Recurrente | 1000 |
| PULPA DE MARACUYÁ 500 ML | ml | 500 | INS-BEB-032 | Pulpa de Maracuya 500ml | Inactivo | 500 |
| SALSA DE CARAMELO BOTE 4 LTS | ml | 4000 | INS-BEB-033 | Salsa de Caramelo 4L | Inactivo | 4000 |
| SCHWEPPES AGUA TÓNICA 296 ML | ml | 296 | INS-BEB-034 | Schweppes Agua Tonica 296 ML | Inactivo | 296 |
| TERNEATEA 500 GRS | gr | 500 | INS-BEB-041 | Terneatea 500g | Compra Recurrente | 500 |
| AZUCAR MASCABADO USO BARRA | gr | 500 | INS-BEB-057 | Azúcar Mascabado 500g | Hasta Agotar Existencias | 500 |
| FILTRO PARA CAFÉ DE PAPEL V60 CÓNICO PAQUETE (100 PZS) | pza | 100 | INS-BEB-053 | Filtros de Papel Hario V60 | Compra Recurrente | 100 |
| ISOPURE | gr | 3400 | INS-BEB-067 | Isopure Vainilla Zero Carb 7.5 Lb | Compra Recurrente | 3400 |
| ETIQUETAS THE COFFEE ROLLO | pza | 1250 | INS-DEL-005 | Etiquetas The Coffee (1;250 Pzs) | Compra Recurrente | 1250 |
| BOLSA TOTE BAG NEGRA THE COFFEE | pza | 1 | MER-TOT-002 | Tote Bag The Coffee - Negra | Compra Recurrente | 1 |
| CAFE TOSTADO EN GRANO BLACK MERCH 250 GRAMOS | pza | 1 | INS-CAF-006 | Cafe en Grano Black 250g | Compra Recurrente | 1 |
| CAFÉ TOSTADO EN GRANO KRAFT MERCH 250 GRAMOS | pza | 1 | INS-CAF-005 | Cafe en Grano Kraft 250g | Compra Recurrente | 1 |
| CAFE TOSTADO EN GRANO WHITE MERCH 250 GRAMOS | pza | 1 | INS-CAF-004 | Cafe en Grano White 250g | Compra Recurrente | 1 |
| COFFEE MUG 300 ML WHITE | pza | 1 | MER-TAZ-002 | Taza The Coffee 300ml - Blanco Mate | Compra Recurrente | 1 |
| TUMBLER (240ML) | pza | 1 | MER-TER-001 | Vaso Termico The Coffee 240ml - Blanco | Compra Recurrente | 1 |
| TUMBLER (360ML) | pza | 1 | MER-TER-003 | Vaso Termico The Coffee 360ml - Blanco | Compra Recurrente | 1 |
| ORÉGANO MEMBERS MARK 195 GRS | gr | 200 | INS-FOD-006 | Oregano 200g | Hasta Agotar Existencias | 200 |

## Insumos de receta sin SKU de la Comercializadora
- AGUA (AGUA)
- FELIX NATURAL WATER (BEBIDAS)
- STILL EVIAN WATER 500ML (BEBIDAS)
- HELADO DE SABOR VAINILLA (HELADO)
- HIELO (g) (HIELO)
- AÇAÍ (INGREDIENTES)
- BLUEBERRIES (INGREDIENTES)
- COCO TOSTADO (INGREDIENTES)
- GRANOLA (INGREDIENTES)
- CHOBANI D.CREAMER PUMPKIN SPICE (INSUMOS)
- FRESA NATURAL CONGELADA 2 KG (INSUMOS)
- LECHE ALMENDRA (LECHE)
- LECHE AVENA (LECHE)
- LECHE COCO (LECHE)
- LECHE DESLACTOSADAS (LECHE)
- LECHE ENTERA (LECHE)
- CAFE TOSTADO EN GRANO WHITE MERCH 1KG (MERCH)
- BROWNIE (PANADERIA)
- COOKIE FULLY BAKED TRIPLE CHOCOLATE (PANADERIA)
- COOKIE MATCHA & WHITE CHOCOLATE (PANADERIA)
- COOKIE TRADICIONAL (PANADERIA)
- CROISSANT TRADICIONAL (PANADERIA)
- HAZELNUT CREAM CROISSANT (PANADERIA)
- HAZELNUT KOUIGN AMANN (PANADERIA)
- KOUIGN AMANN DULCE DE LECHE (PANADERIA)
- PAIN AU CHOCOLAT (PANADERIA)
- PAN DE MUERTO DE NARANJA (PANADERIA)
- PAN DE MUERTO TRADICIONAL (PANADERIA)
- PANQUÉ DE LIMÓN (PANADERIA)
- PANQUE DE PLATANO (PANADERIA)
- ROL DE CANELA (PANADERIA)
- ROULETTE HAZELNUT (PANADERIA)
- SPOOKY BISCUIT (PANADERIA)
- BRIOCHE TRENZA (PERECEDEROS)
- JAMON SERRANO 100G TGM (PERECEDEROS)
- LIMON EUREKA (PERECEDEROS)
- PECHUGA DE PAVO (PERECEDEROS)
- QUESO CREMA PHILADELPHIA (PERECEDEROS)
- QUESO GOUDA (PERECEDEROS)
- QUESO MOZARELLA (PERECEDEROS)
- QUESO PARMESANO (PERECEDEROS)
- SAL FINA 1 KG (PERECEDEROS)
- TOMATE CHERRY (PERECEDEROS)

## Hallazgos adicionales
| Tienda | Café White receta (kg/mes) | Comprado oct (kg, 1.5 kg + 1 kg) | Comprado prom ago–oct (kg) | % del $ comprado que es café 1.5 kg | $ sugerido sin redondear | $ sugerido redondeado ↑ | $ comprado prom | WAPE sin café | $ sugerido en SKUs que no compró en 3 meses |
|---|---|---|---|---|---|---|---|---|---|
| La Mexicana | 53.6 | 49.5 | 59.0 | 44% | 36,808 | 46,148 | 40,197 | 56% | 6,415 |
| Pasaje Parián | 39.8 | 52.0 | 53.8 | 40% | 27,659 | 36,999 | 37,957 | 56% | 4,805 |
| Avándaro | 15.1 | 12.0 | 19.5 | 40% | 10,452 | 22,688 | 15,250 | 61% | 6,249 |

- El café (≈40–44% del $) cuadra razonablemente: compras = 0.92–1.35× la receta (merma, calibración, purgas y en Avándaro 15% de líneas fuera del consumo).
- Redondear hacia arriba cada mes infla el sugerido 25–115% en tiendas chicas (jarabes de 3 L, espresso 2,500 pzs, terneatea, etiquetas: 0.02–0.2 de paquete al mes → 1 paquete).
- Sugeridos que la tienda no compra a la Comercializadora: Schweppes, Perrier, Felix Schorle, Etiquetas The Coffee rollo, Azúcar mascabado, Orégano, Miel, Menta, Espresso 4 oz, Terneatea (algunos SKUs Inactivos o se compran por fuera).
- Comprados no sugeridos (no están en recetas): servilletas, bolsas kraft delivery, portavasos, sobres stevia/splenda, agitadores, limpieza (jabón, multiusos, trapos, tiras, Cafiza), acrílicos POP, rollo Beltek, merch no vendido en POS (paraguas, dripper, tote blanca), pin. También SKUs nuevos fuera del catálogo (INS-BA-076, INS-DES-019/022/025/026, INS-BEB-070).
- Desechables: la receta pide más vaso caliente 8 oz / tapa 80 mm que lo comprado (La Mexicana 3.25 cajas vs 2.33/mes): posible doble conteo en recetas, vasos de otro proveedor o vasos "para llevar" vs taza en barra.

## Discrepancias de unidad/presentación detectadas
- VASO CALIENTE PAPEL KRAFT 12 OZ: nombre del insumo "(1,000 PZS)", presentacion 500, SKU INS-DES-021 de 500 pzs.
- VASO ESPRESSO 4 OZ: nombre "(500 PZS)", presentacion 2500, SKU INS-DES-002 de 2,500.
- CHIP DE SABOR CHOCOLATE "1 KG": presentacion 500, SKU 500 g.
- ZOE/PERRIER: unidad pza con presentacion = piezas por caja (24/12/4); FELIX SCHORLE: insumo presentacion 1, SKU RTD-FEL-004 dice "24 Pz" pero costo 29.16 parece por botella.
- Pulpa de maracuyá 500 ml (INS-BEB-032, Inactivo) reemplazada por INS-BEB-070 1 L (no está en com_catalogo); Salsa de caramelo 4 L Inactivo; Schweppes SKUs Inactivos; Evian 500 ml vs SKU 300 ml Inactivo; Menta tiene dos SKUs.
- Café White MERCH 1 KG (POS) sin SKU en catálogo (INS-BA-076 aparece en pedidos pero no en com_catalogo).
