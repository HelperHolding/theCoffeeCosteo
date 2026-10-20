'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { crearTienda } from '@/app/(crm)/crm/acciones';
import { claseCampo } from '@/lib/crm/formato';

export function NuevaTienda({ etapas }: { etapas: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" /> Nueva tienda
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tienda</DialogTitle>
          <DialogDescription>Después podrás completar su expediente.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          action={(form) =>
            iniciar(async () => {
              setError('');
              const r = await crearTienda(Object.fromEntries(form));
              if (r.error !== undefined) return setError(r.error);
              setAbierto(false);
              router.push(`/crm/tiendas/${r.id}`);
            })
          }
        >
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Nombre de la tienda</span>
            <input name="nombre" required maxLength={200} className={claseCampo} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Franquiciatario</span>
            <input name="franquiciatario" maxLength={200} className={claseCampo} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Ciudad</span>
            <input name="ciudad" maxLength={120} className={claseCampo} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Etapa</span>
            <select name="etapa_id" defaultValue={etapas[0]?.id} className={claseCampo}>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Creando…' : 'Crear tienda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
