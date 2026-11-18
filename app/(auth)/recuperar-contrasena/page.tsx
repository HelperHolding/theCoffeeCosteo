import Link from 'next/link';
import { FormularioRecuperar } from '@/components/portal/formulario-recuperar';

export default function RecuperarContrasena() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-8">
      <div>
        <h1>¿Olvidaste tu contraseña?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Escribe el correo de tu cuenta. Te enviaremos un enlace para elegir una contraseña nueva.
        </p>
      </div>
      <div className="panel">
        <FormularioRecuperar />
      </div>
      <Link href="/login" className="text-sm font-semibold hover:underline">
        Volver a iniciar sesión
      </Link>
    </main>
  );
}
