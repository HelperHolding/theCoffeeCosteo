'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { crearFranquiciatario } from '@/app/(crm)/crm/acciones-pipeline';
import { TERRITORIOS } from '@/lib/crm/tipos';

/** Registro del lead (etapa 1): contacto, ciudad de interés, origen y resultado territorial. */
export function NuevoFranquiciatario() {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setAbierto(true)}>
        <Plus aria-hidden="true" /> Registrar lead
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const datos = Object.fromEntries(new FormData(e.currentTarget));
              iniciar(async () => {
                setError('');
                const r = await crearFranquiciatario(datos);
                if (r.error !== undefined) return setError(r.error);
                setAbierto(false);
                router.push(`/crm/franquiciatarios/${r.id}?tab=requisitos`);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Registrar lead</DialogTitle>
              <DialogDescription>
                Entra a la etapa 1 con tu nombre como vendedor. Para avanzar necesita contacto, ciudad de
                interés, origen y resultado territorial.
              </DialogDescription>
            </DialogHeader>
            <label>
              Nombre o razón comercial
              <input name="nombre" required autoFocus />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Correo
                <input name="correo" type="email" />
              </label>
              <label>
                Teléfono
                <input name="telefono" />
              </label>
              <label>
                Ciudad de interés
                <input name="ciudad_interes" />
              </label>
              <label>
                Origen de captación
                <input name="origen" placeholder="Sitio web, evento, referido…" />
              </label>
            </div>
            <label>
              Resultado territorial
              <select name="territorio" defaultValue="">
                <option value="">Por validar</option>
                {Object.entries(TERRITORIOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button disabled={pendiente}>{pendiente ? 'Guardando…' : 'Registrar lead'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
