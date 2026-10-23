import { writeFile } from 'node:fs/promises';
import { conLectura } from './db-lectura';

/**
 * Fase 2 · Muestra acotada de cantidades de receta (para cotejar contra el recetario oficial, que no trae costos).
 *   npx tsx scripts/conciliacion/muestra-recetas.ts <salida.json> "Iced Latte" "True White" …
 */
const [salida, ...nombres] = process.argv.slice(2);
if (!salida || nombres.length === 0 || nombres.length > 15) throw new Error('Uso: muestra-recetas.ts <salida.json> <1..15 nombres>');

const { resultado } = await conLectura(async (q) =>
  (await q(`
    select r.id as receta_id, r.nombre as receta, coalesce(i.nombre, s.nombre) as componente,
           case when i.id is not null then 'insumo' else 'subreceta' end as tipo,
           coalesce(i.unidad::text, s.unidad_rendimiento::text) as unidad, t.nombre as tamano, lc.cantidad
    from recetas r
    join receta_lineas l on l.receta_id = r.id
    left join insumos i on i.id = l.insumo_id
    left join recetas s on s.id = l.subreceta_id
    join linea_cantidades lc on lc.linea_id = l.id
    left join tamanos t on t.id = lc.tamano_id
    where r.nombre = any($1)
    order by r.nombre, l.orden, t.orden`, [nombres])).rows,
);
await writeFile(salida, JSON.stringify(resultado, null, 1));
console.log(`OK → ${salida} (${resultado.length} filas)`);
