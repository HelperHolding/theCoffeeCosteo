-- Tiempo máximo de las consultas con la llave secreta (service_role): 120 s en vez de los 8 s que hereda de
-- authenticator. n8n guarda el cierre diario de Rappi (5:07) y el repaso del domingo llamando a rappi_importar con esa
-- llave. Con 110 tiendas, el cierre trae ~4,300 pedidos y el repaso ~8,500, y Supabase los cortaba a los 8 s:
-- «canceling statement due to statement timeout», cierre del 2026-11-17 (el del 14-nov, con 1,639 pedidos, sí entraba).
-- Los vivos (ayer y hoy, ~700 pedidos) entran sin problema. 120 s es lo mismo que espera n8n al guardar.
-- Un `set statement_timeout` dentro de la función no serviría: el tiempo es de la sentencia que la llama.
-- Solo cambia service_role (servidor del portal y n8n); anon y authenticated siguen en 3 s y 8 s.
alter role service_role set statement_timeout = '120s';

-- PostgREST lee los ajustes de los roles al cargar su configuración.
notify pgrst, 'reload config';
