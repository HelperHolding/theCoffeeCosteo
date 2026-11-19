import Link from 'next/link';
import { FormularioAcceso } from '@/components/portal/formulario-acceso';
import { MarcaHolding } from '@/components/portal/marca';
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
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: fondo sólido, sin texturas ni adornos. */}
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex xl:p-16">
        <MarcaHolding negativo tamano="lg" />
        <div className="max-w-lg">
          <span aria-hidden="true" className="block h-0.5 w-10 bg-crema" />
          <p className="mt-6 font-display text-[2.6rem] font-bold leading-[1.12] tracking-[-0.02em]">
            Información del grupo,
            <br />
            en un solo lugar.
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-neutral-400">
            Sucursales, ventas, costeo, CRM y abastos de The Coffee, con datos verificados para tomar
            decisiones.
          </p>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[.28em] text-neutral-500">
          Helper Holding · Plataforma corporativa
        </p>
      </section>
      <section className="grid place-items-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <MarcaHolding tamano="md" />
          </div>
          <div>
            <p className="eyebrow">Plataforma Helper Holding</p>
            <h1 className="mt-3">Iniciar sesión</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Accede con la cuenta que te asignó el administrador.
            </p>
          </div>
          <div className="space-y-5 rounded-xl border border-line bg-surface p-6">
            {aviso && (
              <p className="aviso">
                {aviso === 'perfil'
                  ? 'Tu cuenta necesita un perfil activo. Contacta al administrador.'
                  : 'El enlace no es válido o venció. Pide uno nuevo en «¿Olvidaste tu contraseña?».'}
              </p>
            )}
            {configurado ? (
              <>
                <FormularioAcceso next={next} />
                <Link
                  href="/recuperar-contrasena"
                  className="block text-center text-sm font-medium text-ink-2 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </>
            ) : (
              <p className="aviso">Falta configurar Supabase. Consulta las instrucciones del README.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Acceso exclusivo para usuarios autorizados por Helper Holding.
          </p>
        </div>
      </section>
    </main>
  );
}
