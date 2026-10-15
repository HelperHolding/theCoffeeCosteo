'use client';

import { useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { Button } from '@/components/ui/button';
import { Agente } from './agente';

// Lanzador independiente del agente (lo usan el arnés visual y las pruebas).
// En el portal, el botón vive en la barra superior de Marco.
export function ChatPortal() {
  const [abierto, setAbierto] = useState(false);
  const lanzador = useRef<HTMLButtonElement>(null);
  const cerrar = () => {
    setAbierto(false);
    lanzador.current?.focus();
  };
  return (
    <>
      <Button
        ref={lanzador}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        className="fixed right-4 bottom-4 z-40 rounded-full pl-2 shadow-lg"
      >
        <span className="grid size-7 place-items-center rounded-full bg-white">
          <ThinkingOrb state="breathing" size={20} theme="light" aria-hidden />
        </span>
        Consultar
      </Button>
      <Agente abierto={abierto} alCerrar={cerrar} />
    </>
  );
}
