import { FormularioAcceso } from '@/components/portal/formulario-acceso';
export default function Contrasena() {
  return (
    <main className="max-w-md mx-auto p-8 space-y-6">
      <h1>Establecer contraseña</h1>
      <p>Elige la contraseña con la que vas a entrar. Solo tú la conoces.</p>
      <div className="panel">
        <FormularioAcceso nueva />
      </div>
    </main>
  );
}
