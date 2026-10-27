'use client';
import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

export interface InfoTablero {
  titulo: string;
  /** Qué mide, en una o dos frases. */
  mide: React.ReactNode;
  /** Cifras de contexto (etiqueta → valor), p. ej. hoy contra la base. */
  cifras?: { etiqueta: string; valor: React.ReactNode }[];
  /** Cómo se calcula y de dónde sale. */
  calculo?: React.ReactNode;
}

// Controles y gráficas navegables (tienen su propio tooltip): ahí el pop-up no se abre.
const INTERACTIVO =
  'a, button, input, label, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"]), [data-sin-info]';
// Esperas: abrir pide un instante de intención (no se dispara al cruzar la tarjeta); cerrar deja pasar
// el cursor de la tarjeta al pop-up sin que desaparezca.
const ABRIR_MS = 450;
const CERRAR_MS = 180;

/**
 * Tarjeta de tablero que, al dejar el cursor encima, abre un pop-up con qué mide, sus cifras de
 * contexto y cómo se calcula. Con mouse solo se abre con el cursor, nunca con clic; en pantallas
 * táctiles, con un toque; con teclado, con el botón (i).
 * Sobre controles y gráficas no se abre: ahí manda su propio comportamiento.
 */
export function ConInfo({ info, children }: { info: InfoTablero; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLDivElement>(null);
  const espera = useRef<number | undefined>(undefined);
  const programar = (abrir: boolean, ms: number) => {
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setAbierto(abrir), ms);
  };
  const cancelar = () => window.clearTimeout(espera.current);
  useEffect(() => cancelar, []);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverAnchor asChild>
        <div
          ref={ancla}
          className="con-info relative h-full [&>*:first-child]:h-full"
          data-abierto={abierto || undefined}
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse' || !ancla.current) return;
            const objetivo = e.target as HTMLElement;
            const tarjeta = ancla.current.firstElementChild;
            const control = objetivo.closest(INTERACTIVO);
            // En tarjetas con encabezado (tablas, gráficas) solo el encabezado abre el pop-up; una tarjeta
            // que es toda un enlace sí lo abre al pasar por ella.
            const encabezado = tarjeta?.querySelector(':scope > header');
            const fueraDeZona = encabezado ? !encabezado.contains(objetivo) : false;
            if ((control && control !== tarjeta) || fueraDeZona) {
              if (abierto) programar(false, CERRAR_MS);
              else cancelar();
            } else if (!abierto) programar(true, ABRIR_MS);
            else cancelar();
          }}
          onPointerLeave={(e) => e.pointerType === 'mouse' && programar(false, CERRAR_MS)}
          // Con mouse el clic no abre ni cierra: solo el cursor. Sin cursor (pantallas táctiles) no hay
          // "pasar por encima", así que ahí un toque fuera de los controles lo abre.
          onPointerUp={(e) => {
            if (e.pointerType !== 'touch') return;
            const control = (e.target as HTMLElement).closest(INTERACTIVO);
            const esInfo = control?.classList.contains('con-info-boton');
            if (control && control !== ancla.current?.firstElementChild && !esInfo) return;
            cancelar();
            setAbierto(true);
          }}
        >
          {children}
          <button
            type="button"
            // Solo para teclado (Enter o espacio llegan con detail 0); con mouse el pop-up ya lo abre el cursor.
            onClick={(e) => e.detail === 0 && setAbierto((a) => !a)}
            aria-expanded={abierto}
            aria-label={`Información de ${info.titulo}`}
            className="con-info-boton absolute right-3 bottom-3 grid size-7 place-items-center rounded-full text-ink-2"
          >
            <Info size={15} aria-hidden="true" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={10}
        // Arriba deja libre la barra fija del portal para que no tape el título del pop-up.
        collisionPadding={{ top: 80, right: 16, bottom: 16, left: 16 }}
        // Abierto por el cursor, el foco se queda donde estaba.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Un clic en la propia tarjeta lo resuelve su onClick; no es "clic fuera".
        onInteractOutside={(e) => {
          if (ancla.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onPointerEnter={cancelar}
        onPointerLeave={(e) => e.pointerType === 'mouse' && programar(false, CERRAR_MS)}
        className="con-info-pop w-80 rounded-2xl border-white/70 p-0 text-sm"
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <p className="font-display text-base font-bold">{info.titulo}</p>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="-mt-1 -mr-1 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-ink/5"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <p className="px-4 pt-1 text-ink-2">{info.mide}</p>
        {info.cifras && info.cifras.length > 0 && (
          <dl className="mx-4 mt-3 divide-y divide-ink/10 rounded-xl bg-ink/[0.04]">
            {info.cifras.map((c) => (
              <div key={c.etiqueta} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{c.etiqueta}</dt>
                <dd className="tabular text-right font-semibold">{c.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {info.calculo && (
          <p className="mx-4 mt-3 border-t border-ink/10 pt-3 text-xs text-muted-foreground">
            {info.calculo}
          </p>
        )}
        <div className="h-4" />
      </PopoverContent>
    </Popover>
  );
}
