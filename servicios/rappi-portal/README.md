# Lector del portal de Rappi (The Coffee)

Contenedor junto a n8n que lee el historial del portal de Rappi Partners y devuelve el lote de
`public.rappi_importar`. Diseño y evidencia: `docs/rappi-portal/01`, `02` y `03`.

| Archivo                       | Qué es                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `servidor.mjs`                | Servicio HTTP: `POST /sincronizar {tipo, desde?, hasta?}` (header `x-api-key`) y `GET /salud`           |
| `lote.mjs`                    | Conversión del JSON del portal al lote (sin datos personales). Probado en `tests/db/rappi-lote.test.ts` |
| `Dockerfile`                  | Imagen de Playwright 1.55 con `playwright-core`                                                         |
| `compose.rappi-thecoffee.yml` | Servicio `rappi-thecoffee` para el docker-compose de n8n                                                |
| `flujo-n8n.mjs`               | Crea o actualiza el flujo `TheCoffee_Rappi_Portal` de n8n, **inactivo**                                 |

## Instalación (cada paso con OK de Carlo)

1. **Usuario del lector en Rappi.** Carlo lo crea en Rappi → Usuarios, con acceso de solo lectura a las tiendas del
   piloto si el portal lo permite. Las credenciales no pasan por el chat ni por el repo.
2. **Servidor de n8n.**
   - Copiar esta carpeta a `./rappi-thecoffee` junto al `docker-compose` de n8n.
   - Agregar el servicio de `compose.rappi-thecoffee.yml`.
   - Carlo pone en el `.env` del compose `RAPPI_THECOFFEE_KEY`, `RAPPI_THECOFFEE_USUARIO` y `RAPPI_THECOFFEE_CLAVE`.
   - `docker compose up -d --build rappi-thecoffee` (solo ese servicio; n8n no se reinicia).
3. **Prueba del lector** desde el contenedor de n8n: `GET http://rappi-thecoffee:3101/salud` y un
   `POST /sincronizar {"tipo":"manual","desde":"<ayer>","hasta":"<ayer>"}`. Debe responder `estado: ok` con pedidos de
   las dos tiendas de Namóra.
4. **Migración 28** (`supabase/migrations/20261029000028_rappi_portal.sql`): respaldo, ensayo con ROLLBACK y OK de
   Carlo antes del merge, porque el merge la aplica (`docs/portal/MIGRACIONES-Y-DESPLIEGUE.md`).
5. **Flujo de n8n:**
   - `node --env-file=<archivo con N8N_URL y N8N_API_KEY> servicios/rappi-portal/flujo-n8n.mjs` lo crea inactivo.
   - Carlo elige las credenciales en los nodos marcados: `x-api-key` del lector y `apikey` de Supabase.
   - Se corre una vez a mano y se revisa en el portal (pestaña Rappi de Namóra).
   - Después se activa.

## Operación

- **En vivo:** cada 10 min de 07:07 a 23:57 (minutos 7, 17, 27…), ayer y hoy. Esos minutos son para no coincidir
  con el lector de Dodo (0, 15, 30, 45): el servidor tiene 2 GB y cada lector abre un navegador.
- **Cierre:** 06:30, los últimos 7 días.
- **Repaso:** domingo 05:30, los últimos 14 días.
- **Reponer días:** `POST` al webhook «Reponer» con `{"tipo":"manual","desde":"…","hasta":"…"}`, máximo 62 días.
- **Sesión:**
  - vive en el volumen `rappi_thecoffee` (`/datos/sesion.json`);
  - si Rappi la cierra, el lector entra solo con su usuario;
  - si ese login falla, no reintenta en 6 h y avisa por correo.
- **Agregar una sucursal:**
  - sus dos tiendas (normal y Turbo) en `RAPPI_TIENDAS` y en `rappi_tiendas` (por migración);
  - `rappiPortal: true` en `lib/sucursales/config.ts`.
