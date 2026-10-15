import { FormularioAcceso } from '@/components/portal/formulario-acceso';
import { Marca } from '@/components/portal/marca';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; next?: string }>;
}) {
  const { aviso, next } = await searchParams;
  const configurado = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <Marca negativo className="size-28 -ml-3" />
        <div>
          <p className="font-display text-5xl font-black leading-[1.05] tracking-tight">
            Cada taza,
            <br />
            bien costeada<span className="text-crema">.</span>
          </p>
          <p className="mt-5 max-w-md text-neutral-400">
            Recetas, costos y márgenes por canal en un solo lugar, con la precisión que pide cada bebida.
          </p>
        </div>
        <p className="text-xs uppercase tracking-[.3em] text-neutral-500">ザ・コーヒー · Portal de costeos</p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border border-white/[.06]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -bottom-8 size-64 rounded-full border border-white/[.08]"
        />
      </section>
      <section className="grid place-items-center p-6">
        <div className="w-full max-w-sm space-y-7">
          <div className="lg:hidden">
            <Marca className="size-24 -ml-2" />
          </div>
          <div>
            <p className="eyebrow">Portal de costeos</p>
            <h1 className="mt-2">Iniciar sesión</h1>
            <p className="mt-2 text-sm text-muted-foreground">Recetas, costos y decisiones de precio.</p>
          </div>
          <div className="panel space-y-5">
            {aviso && (
              <p className="aviso">
                {aviso === 'perfil'
                  ? 'Tu cuenta necesita un perfil activo. Contacta al administrador.'
                  : 'El enlace no es válido o venció. Solicita una nueva invitación.'}
              </p>
            )}
            {configurado ? (
              <FormularioAcceso next={next} />
            ) : (
              <p className="aviso">Falta configurar Supabase. Consulta las instrucciones del README.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Acceso exclusivo para usuarios creados por el administrador.
          </p>
        </div>
      </section>
    </main>
  );
}
