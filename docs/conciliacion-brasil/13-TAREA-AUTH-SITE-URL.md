# 13 · Tarea independiente: corregir el Site URL de Supabase Auth

**Estado:** registrada el 2026-10-23, **sin ejecutar**. Por decisión de Carlo, no se cambian el Site URL, las Redirect URLs ni la protección de Vercel dentro de la conciliación. Requiere su aprobación expresa.

## Hallazgo

Leído en el panel de Supabase con la sesión de Carlo, sin modificar nada:

| Configuración | Valor actual |
|---|---|
| Site URL (Authentication → URL Configuration) | `https://the-coffee-portal-thecoffee1.vercel.app/` |
| Redirect URLs (8) | `https://the-coffee-costeo-thecoffee1.vercel.app/` y `/**`, `https://the-*-coffee-costeo-thecoffee1.vercel.app` y `/**`, `https://the-coffee-portal-thecoffee1.vercel.app/` y `/**`, `https://the-*-coffee-portal-thecoffee1.vercel.app` y `/**` |
| Dominio público del portal | `https://the-coffee-costeo.vercel.app`: `/login` y `/oauth/consent` responden 200. **No está** en las Redirect URLs |
| Dominios `…-thecoffee1.vercel.app` | Responden 302 a `vercel.com/sso-api`: **protección de despliegue de Vercel** |

**Efecto comprobado:**
- Al autenticar el MCP (`https://the-coffee-costeo.vercel.app/mcp`) desde Claude Code, Supabase envía la pantalla de consentimiento al Site URL protegido.
- Esa pantalla pide una cuenta de Vercel, así que un usuario del portal sin acceso a Vercel **no puede completar el consentimiento**.

**Efecto probable (no verificado):** los correos de Auth que usan el Site URL (invitación, restablecer contraseña) llevarían al mismo dominio protegido.

**Referencia:** `docs/mcp/claude-web.md`, paso 2, indica que el Site URL debía ser `https://the-coffee-costeo.vercel.app`.

## Residuos del intento

- **Cliente OAuth registrado automáticamente:** `client_id 72872914-…`, sin autorización concedida. Puede borrarse en Supabase → Authentication → OAuth Apps.
- **Servidor MCP local `thecoffee-costeo`** en la configuración de Claude Code de este proyecto (`~/.claude.json`, fuera del repo). Para quitarlo:

  ```
  claude mcp remove thecoffee-costeo -s local
  ```

## Propuesta para la tarea (solo con aprobación)

1. Anotar los valores actuales de Site URL y Redirect URLs (tabla de arriba).
2. Cambiar el Site URL a `https://the-coffee-costeo.vercel.app` y agregar `https://the-coffee-costeo.vercel.app/**` a Redirect URLs. **No se toca la protección de Vercel.**
3. Revisar las plantillas de correo de Auth que usan `{{ .SiteURL }}`.
4. Verificar:
   - el flujo MCP completo: consentimiento sin Vercel, las seis herramientas de solo lectura, una consulta comparada con la base y el rechazo de escrituras;
   - un correo de restablecimiento de contraseña de prueba con la cuenta de Carlo.
5. Reversión: restaurar los valores anotados en el paso 1.

## Pendiente que cierra esta tarea

**Fase 4, V7:** prueba real del flujo MCP completo. Hoy solo está verificada por simulación de la sesión OAuth en la base: mismos permisos antes y después de la migración 21.
