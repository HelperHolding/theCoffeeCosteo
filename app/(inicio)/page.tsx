import { accesos, sesion } from '@/lib/supabase/sesion';
import { modulos } from '@/lib/portal/modulos';
import { Encabezado } from '@/components/portal/piezas';
import { TarjetasModulos } from '@/components/portal/tarjetas-modulos';

export default async function Inicio() {
  const { db, perfil } = await sesion();
  const a = await accesos(db, perfil.user_id);
  return (
    <>
      <Encabezado
        area={`Hola, ${perfil.nombre.split(' ')[0]}`}
        titulo="Módulos"
        descripcion="Elige el área en la que vas a trabajar."
      />
      <TarjetasModulos modulos={modulos.filter((m) => m.acceso(a))} />
    </>
  );
}
