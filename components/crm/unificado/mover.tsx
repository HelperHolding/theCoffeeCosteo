'use client';
import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { textoMovimiento, type Destino } from '@/lib/crm/unificado/reglas';

const nombreEtapa = (d: Destino) => `${d.etapa.numero ? `${d.etapa.numero} · ` : ''}${d.etapa.nombre}`;

/** Alternativa accesible al arrastre: lista los destinos permitidos desde la etapa actual. */
export function MenuMover({
  nombre,
  destinos,
  alElegir,
  deshabilitado,
  compacto = true,
}: {
  nombre: string;
  destinos: Destino[];
  alElegir: (d: Destino) => void;
  deshabilitado?: boolean;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  if (!destinos.length) return null;
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        disabled={deshabilitado}
        aria-label={`Mover ${nombre} a otra etapa`}
        className={
          compacto
            ? 'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-ink disabled:opacity-40'
            : 'inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40'
        }
      >
        <ArrowRightLeft size={14} aria-hidden="true" />
        {!compacto && 'Mover a…'}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Mover a…</p>
        <ul role="list">
          {destinos.map((d) => (
            <li key={`${d.tipo}-${d.etapa.id}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                onClick={() => {
                  setAbierto(false);
                  alElegir(d);
                }}
              >
                <span className="text-muted-foreground">{textoMovimiento[d.tipo]} </span>
                {nombreEtapa(d)}
                {d.requiereMotivo && <span className="text-xs text-muted-foreground"> · pide motivo</span>}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Confirma un movimiento que pide motivo (regresar, pausar, cerrar, omitir) o el nombre de la sucursal. */
export function DialogoMovimiento({
  destino,
  nombre,
  ciudad,
  alCerrar,
  alConfirmar,
  pendiente,
  error,
}: {
  destino: Destino | null;
  nombre: string;
  ciudad?: string | null;
  alCerrar: () => void;
  alConfirmar: (motivo: string | null, sucursal: string | null) => void;
  pendiente?: boolean;
  error?: string;
}) {
  const [motivo, setMotivo] = useState('');
  const [sucursal, setSucursal] = useState('');
  const falta =
    (destino?.requiereMotivo && motivo.trim().length < 5) || (destino?.pideSucursal && !sucursal.trim());
  return (
    <Dialog
      open={!!destino}
      onOpenChange={(a) => {
        if (!a) {
          setMotivo('');
          setSucursal('');
          alCerrar();
        }
      }}
    >
      <DialogContent>
        {destino && (
          <>
            <DialogHeader>
              <DialogTitle>
                {textoMovimiento[destino.tipo]} {nombreEtapa(destino)}
              </DialogTitle>
              <DialogDescription>
                {destino.pideSucursal
                  ? `Al formalizar a ${nombre} se crea su primera sucursal en la etapa 6. Después puedes agregar más.`
                  : `El movimiento de ${nombre} queda en la bitácora con tu nombre, la fecha y el motivo.`}
              </DialogDescription>
            </DialogHeader>
            {destino.pideSucursal && (
              <label>
                Nombre de la primera sucursal
                <input
                  value={sucursal}
                  onChange={(e) => setSucursal(e.target.value)}
                  placeholder={ciudad ? `${ciudad} Centro` : 'Ciudad y zona'}
                  autoFocus
                />
              </label>
            )}
            {destino.requiereMotivo && (
              <label>
                Motivo (obligatorio)
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={
                    destino.tipo === 'omitir'
                      ? 'Por qué no aplica la revisión de contrato'
                      : 'Qué pasó y quién lo pidió'
                  }
                  autoFocus={!destino.pideSucursal}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button
                disabled={!!falta || pendiente}
                onClick={() => alConfirmar(motivo.trim() || null, sucursal.trim() || null)}
              >
                {pendiente ? 'Guardando…' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
