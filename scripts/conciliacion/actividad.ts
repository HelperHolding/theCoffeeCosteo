import { conLectura } from './db-lectura';

/** Fase 4 · Actividad actual (solo lectura): sesiones de clientes y bloqueos sobre las tablas de Costeo. Sin texto de consultas. */
const { resultado } = await conLectura(async (q) => ({
  ahora: (await q(`select now()::text as utc`)).rows[0].utc,
  sesiones: (await q(`select usename as rol, state as estado, count(*)::int as n from pg_stat_activity
    where backend_type = 'client backend' and pid <> pg_backend_pid() group by 1, 2 order by 3 desc`)).rows,
  bloqueosCosteo: (await q(`select c.relname as tabla, l.mode as modo, count(*)::int as n from pg_locks l
    join pg_class c on c.oid = l.relation where l.pid <> pg_backend_pid() and c.relnamespace = 'public'::regnamespace
      and c.relname = any($1) group by 1, 2`, [['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo',
      'categorias_producto', 'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'perfiles',
      'bitacora', 'precio_canal_manual', 'perfil_sucursales']])).rows,
  transaccionesLargas: (await q(`select count(*)::int as n from pg_stat_activity where xact_start < now() - interval '30 seconds'
    and pid <> pg_backend_pid() and backend_type = 'client backend'`)).rows[0].n,
}));
console.log(JSON.stringify(resultado));
