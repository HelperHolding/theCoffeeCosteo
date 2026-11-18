'use client';
import { useActionState } from 'react';
import { recuperar } from '@/app/(auth)/login/actions';
import { Button } from '@/components/ui/button';

export function FormularioRecuperar() {
  const [estado, action, pending] = useActionState(recuperar, '');
  if (estado === 'listo')
    return (
      <p className="text-sm" role="status">
        Si ese correo tiene cuenta, en unos minutos te llegará un enlace para elegir tu contraseña. Revisa
        también la carpeta de spam. El enlace vence en una hora.
      </p>
    );
  return (
    <form action={action} className="space-y-5">
      <label>
        Correo
        <input name="email" type="email" autoComplete="username" required />
      </label>
      {estado && (
        <p className="error" role="alert">
          {estado}
        </p>
      )}
      <Button size="lg" className="w-full" pendiente={pending}>
        {pending ? 'Un momento…' : 'Enviar enlace'}
      </Button>
    </form>
  );
}
