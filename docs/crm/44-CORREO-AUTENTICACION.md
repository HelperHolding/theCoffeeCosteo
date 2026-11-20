# 44 · Correo de autenticación (Supabase Auth)

Configurado el 2026-11-17 con OK de Carlos. Antes, Supabase usaba su servidor de correo de prueba: mandaba 2 correos por hora y solo a miembros del equipo de Supabase. Además, el enlace caía en un dominio protegido por Vercel, así que las invitaciones no llegaban ni funcionaban.

## Envío

| Dato      | Valor                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Servidor  | `smtp.gmail.com:465` (Google Workspace)                                                                       |
| Cuenta    | `sucursalespropias@mx.thecoffee.jp`, con verificación en 2 pasos y contraseña de aplicación «Supabase portal» |
| Remitente | `Portal The Coffee <notificaciones@mx.thecoffee.jp>`, alias agregado en «Enviar como» de la cuenta            |
| Límite    | 30 correos por hora en Supabase; Gmail permite unos 2,000 al día                                              |

La contraseña de aplicación la capturó Carlos en el panel de Supabase (Authentication → Emails → SMTP Settings) y no está en el repositorio. Para revocarla: Cuenta de Google → Seguridad → Contraseñas de aplicación.

## Configuración de Auth (por la API de administración)

- **Site URL:** `https://portal.thecoffeemexico.com`, el dominio propio (desde 2026-11-19; antes `https://the-coffee-costeo.vercel.app`). Está en `scripts/crm/sitio-auth.ts`. Las redirecciones anteriores se conservan y se agregan las dos direcciones con `/**`; `the-coffee-costeo.vercel.app` se queda porque el MCP depende de ella.
- **Revisión antes de enviar:** `invitar-heads.ts` y `enviar-contrasena-propia.ts` se detienen si la Site URL no es la del portal. El 2026-11-18 apareció cambiada a `the-coffee-portal-helperholding.vercel.app` (con SSO de Vercel) y las invitaciones a los heads salieron rotas; se corrigió y se reenviaron el 2026-11-19.
- **Plantillas en español:** `supabase/templates/invite.html` y `supabase/templates/recovery.html`. Llevan a `/auth/confirm?token_hash=…&type=invite|recovery`, que es lo que espera `app/auth/confirm/route.ts`.
- **Vigencia de los enlaces:** 24 horas (`mailer_otp_exp = 86400`).
- **Registro libre cerrado** (`disable_signup = true`): solo se entra por invitación. Todos los usuarios existentes se dieron de alta por administrador, así que no les afecta.

Para aplicar las plantillas otra vez, o para revertir con el respaldo `docs/crm/respaldos/auth-correo-2026-11-17.json`:

```bash
npx tsx --conditions=react-server scripts/crm/aplicar-correo-auth.ts
npx tsx --conditions=react-server scripts/crm/aplicar-correo-auth.ts --revertir docs/crm/respaldos/auth-correo-2026-11-17.json
```

## Contraseña propia para usuarios existentes

Supabase no permite invitar a una cuenta que ya existe. A esos usuarios se les manda el correo de recuperación con la plantilla temporal `supabase/templates/contrasena-propia.html` («Elige tu contraseña del portal»). El script restaura la plantilla normal al terminar.

```bash
npx tsx --conditions=react-server scripts/crm/enviar-contrasena-propia.ts correo1 correo2
```

El asunto del correo puede salir con el de la plantilla normal: Supabase tarda en aplicar el cambio de asunto, pero el texto del correo sí sale con la plantilla temporal. Hasta que cada quien elige su contraseña nueva, la anterior sigue funcionando.

Los usuarios con correo `@thecoffee.internal` no pueden recibir correo porque ese dominio no existe. Para que elijan su contraseña, primero hay que cambiarles el correo por uno real.

## Pendiente fuera del portal

El dominio `mx.thecoffee.jp` tiene dos registros SPF, uno de Google y otro de Zoho. Con dos registros la verificación SPF falla para todos los correos. Hay que juntarlos en uno solo: `v=spf1 include:_spf.google.com include:one.zoho.com ~all`. La firma DKIM de Google sí está configurada.
