# 42 · Tamaños verificados con el recetario oficial 2026 y dos correcciones del #71

**Estado:** preparado el 2026-11-02, con código, pruebas, lote y ensayo local. **Sin ensayo remoto, sin aplicar y sin
merge.** Cada paso remoto y el merge requieren aprobación expresa de Carlo.

## Origen

En Consumo de Namóra salían líneas con «Tamaño sin verificar»:

- **1 de noviembre (11 líneas):** Gelato Frappé Coffee (5), Gelato Frappé Matcha (2), Matcha Iced Mint (2), Fresh Soda
  Passion fruit (1) y Fresh Soda Pink Lemonade (1).
- **2 de noviembre (3 líneas):** Gelato Frappé Coffee (2) y Matcha Iced Mint (1).

Carlo pidió cotejarlas con el recetario. La fuente es el **RECETARIO OFICIAL 2026** («Manual de Preparación de Bebidas y
Alimentos», Canva), leído el 2026-11-02 sin editarlo.

## Lo que dice el recetario

| Producto | Página | Regular (440 ml) | Grande (600 ml) | Nuestra base |
| --- | --- | --- | --- | --- |
| Fresh Soda Passion fruit | 44 | 60 g pulpa, 130 g hielo, 170 ml agua con gas | 70 g, 245 g, 220 ml | Chica y Grande iguales |
| Fresh Soda Pink Lemonade | 43 | 15 g limón, 30 g fresa, 130 g hielo, 170 ml | 20 g, 40 g, 245 g, 220 ml | Iguales (Chica con 16 g de limón) |
| Matcha Iced Mint | 37 | 36 ml matcha, 130 g hielo, 170 ml leche, 15 ml menta | **45 ml**, 245 g, 290 ml, 15 ml | Chica igual; Grande con **36 ml** |
| Iced Blueberry Matcha | 59 | 36 ml matcha, 130 g hielo, 170 ml leche, **15 ml** jarabe | 45 ml, 245 g, 290 ml, 15 ml | Matcha, hielo y leche iguales; jarabe en **10 ml** |
| Gelato Frappé Coffee | 46 | 36 ml café, 150 g helado, 100 ml leche | 36 ml, **200 g**, **140 ml** | Un solo tamaño (Único), igual al Regular |
| Gelato Frappé Matcha | 48 | 36 g matcha, 150 g helado, 100 ml leche | 36 g, **200 g**, **140 ml** | Un solo tamaño (Único), igual al Regular |

En el Iced Blueberry Matcha, 10 ml es la opción «Menos». En las dos recetas, el valor de la base salió del Excel del
equipo en el #71 (doc 40) y el recetario oficial lo contradice.

## Cambios

**Código** (`lib/sucursales/tamanos-verificados.ts`): Regular → Chica y Large → Grande en Fresh Soda Passion fruit, Fresh
Soda Pink Lemonade, Matcha Iced Mint e Iced Blueberry Matcha. La lista pasa de 31 a 35 productos.

**Lote `recetas-recetario-lote-1`** (cargador `recetas-ajustes.ts`, doc 40). Manifiesto
`42-recetas-recetario-lote-1.manifiesto.json`, sha256 `e8299d3b…`. El `sha256` de la fuente es la huella de la referencia
del recetario (páginas y cantidades), porque el recetario no es un archivo descargado.

| Receta | Cambio | Costo |
| --- | --- | --- |
| Iced Blueberry Matcha | jarabe de blueberry 10 → 15 ml (Chica y Grande) | $15.61 → $16.78 · $19.70 → $20.87 |
| Matcha Iced Mint | mix de matcha Grande 36.05 → 45.02 ml | Grande $19.55 → $20.80 |

Los dos vuelven exactamente a los valores que tenían antes del #71.

**Ensayo sobre una copia del respaldo `2026-10-30T1929Z`**, borrada al terminar:

| Paso | Resultado |
| --- | --- |
| Ensayo | 2 recetas y 3 celdas; 3 registros propios, 0 ajenos; los 3 costos declarados y ninguno más; resto sin cambios; ROLLBACK |
| Aplicar | COMMIT |
| Repetir | «sin cambio» |
| Revertir | vuelve a los valores previos |

Los informes se guardaron en el respaldo privado, `informes-recetario-42`.

## Gelato Frappés: decisión pendiente

En Costeo, los Gelato Frappés son de un solo tamaño (Único). El POS los vende con vaso Regular o Large, y el recetario
tiene las dos tallas. Una línea con vaso de un producto Único no se puede costear, así que salen como «tamaño sin verificar».

Hay dos opciones:

1. **Agregar el tamaño Grande** con la receta del recetario (200 g de helado y 140 ml de leche, mismo café o matcha) y
   mapear Regular → Chica y Large → Grande. Cuentan las dos tallas.
   - Falta confirmar el empaque de la Grande: vaso de 20 oz, con la misma tapa y popote.
   - Requiere ampliar el cargador, porque `recetas-ajustes.ts` no agrega tamaños.
2. **Contar solo el Regular** como el tamaño Único. El Large sigue sin contarse.

## Procedimiento remoto (cada paso requiere aprobación)

1. Respaldo nuevo.
2. Ensayo remoto con ROLLBACK:
   `npx tsx scripts/conciliacion/recetas-ajustes-aplicar.ts --lote recetas-recetario-lote-1 --usuario <uuid-perfil> --informes <carpeta privada>`
3. Aplicar (`--aplicar --confirmo jpqkmnfjwzniptszjuli`), verificar y repetir el ensayo.
4. Merge del PR. El código de tamaños entra con el merge.
