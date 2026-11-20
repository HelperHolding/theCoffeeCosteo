// Dominio del portal para los enlaces de Supabase Auth (invitaciones y recuperación).
// Desde 2026-11-19 es el dominio propio. the-coffee-costeo.vercel.app se queda en las redirecciones porque el MCP
// depende de ella.
export const SITIO = 'https://portal.thecoffeemexico.com';
export const SITIOS_PERMITIDOS = [SITIO, 'https://the-coffee-costeo.vercel.app'];

// El 2026-11-18 la Site URL apareció cambiada a un dominio con SSO de Vercel y las invitaciones salieron rotas.
// Antes de mandar cualquier correo de Auth se revisa que siga en el dominio del portal.
export function revisarSitio(siteUrl: unknown) {
  const actual = String(siteUrl ?? '').replace(/\/+$/, '');
  if (actual !== SITIO)
    throw new Error(
      `La Site URL de Supabase Auth es «${actual}» y debería ser «${SITIO}». ` +
        'Los enlaces de los correos no funcionarían. Corre scripts/crm/aplicar-correo-auth.ts antes de enviar.',
    );
}
