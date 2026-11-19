# Consultar ventas de The Coffee desde Grok

Servidor: `https://portal.thecoffeemexico.com/mcp` (el mismo de Claude, ver `claude-web.md`).

Grok entra con un **token fijo** (`Authorization: Bearer <token>`), no con OAuth. El servidor reconoce el token,
inicia sesión como un **usuario dedicado del portal** y consulta con la sesión de ese usuario: la base aplica sus
permisos y sus sucursales asignadas. Código: `lib/mcp/token.ts`.

## Activación por el administrador

1. Publicar la migración 73 (`supabase/migrations/20261119000073_mcp_ventas.sql`) **antes** de desplegar:

   ```powershell
   npx.cmd supabase db push
   ```

2. Crear en el portal el usuario de Grok (por ejemplo `grok@thecoffeemexico.com`):
   - módulos `sucursales` y `bi` en nivel **lectura** (sin `sucursales_costeo`, `crm` ni otros);
   - **todas** las sucursales asignadas (o solo las que Grok deba ver);
   - contraseña larga y única; solo vive en Vercel.
3. Generar el token (mínimo 32 caracteres; no pegarlo en chats ni en el repositorio):

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

4. En Vercel → Settings → Environment Variables (Production), agregar:
   - `MCP_GROK_TOKEN`: el token del paso 3;
   - `MCP_GROK_EMAIL`: el correo del usuario de Grok;
   - `MCP_GROK_PASSWORD`: su contraseña.
5. Volver a desplegar para que tome las variables.

## Conectar Grok

En grok.com, agregar un conector MCP con URL `https://portal.thecoffeemexico.com/mcp` y autenticación por
encabezado `Authorization: Bearer <MCP_GROK_TOKEN>`. Pedir «usa ventas_sucursales»: debe listar las sucursales del
usuario de Grok.

Herramientas de ventas: `ventas_sucursales`, `ventas_resumen` (hoy en vivo o un periodo), `ventas_por_hora`,
`ventas_por_producto` y `ventas_bi`. También quedan disponibles las 6 consultas de recetas y costos. Montos en MXN
con IVA; máximo 120 días por consulta (7 en horas). Un día con `completa: false` no se leyó entero y no se estima.

## Rotar o revocar

- **Rotar:** generar otro token, cambiar `MCP_GROK_TOKEN` en Vercel, volver a desplegar y actualizar el conector
  en Grok.
- **Revocar:** borrar `MCP_GROK_TOKEN` en Vercel y volver a desplegar (sin la variable, el acceso por token queda
  apagado). Para cortar todo de inmediato, desactivar el usuario de Grok en el portal: cada consulta comprueba que
  su perfil siga activo.

## Alcance y límites

- Solo lectura: las 11 herramientas consultan; no hay SQL libre ni escrituras.
- Quien tenga el token consulta como el usuario de Grok; trátalo como una contraseña.
- El usuario de Grok también puede entrar al portal con su contraseña: por eso solo lleva módulos de lectura.
- La sesión del usuario se guarda en memoria del servidor hasta poco antes de vencer (~1 h); un cambio de
  contraseña tarda hasta ese tiempo en exigir el nuevo inicio de sesión.
- Otros conectores por OAuth no ven ventas salvo que su `client_id` esté en `mcp_ventas_clientes`.
