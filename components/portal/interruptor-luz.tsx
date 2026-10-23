'use client';
import { useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const CLAVE = 'luz';

/**
 * Interruptor día/noche del muro. El aspecto lo pinta el CSS con html[data-luz] (que app/layout.tsx pone
 * antes de pintar), así que no hay salto al hidratar; aquí solo se guarda la elección.
 */
export function InterruptorLuz({ className }: { className?: string }) {
  const [noche, setNoche] = useState(false);
  // Lee la elección guardada y la vuelve a aplicar: en desarrollo React limpia el atributo al remontar.
  useLayoutEffect(() => {
    let guardada = false;
    try {
      guardada = localStorage.getItem(CLAVE) === 'noche';
    } catch {}
    if (guardada) document.documentElement.setAttribute('data-luz', 'noche');
    setNoche(guardada);
  }, []);

  const cambiar = () => {
    const siguiente = !noche;
    if (siguiente) document.documentElement.setAttribute('data-luz', 'noche');
    else document.documentElement.removeAttribute('data-luz');
    try {
      localStorage.setItem(CLAVE, siguiente ? 'noche' : 'dia');
    } catch {}
    setNoche(siguiente);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={noche}
      aria-label="Modo noche"
      title={noche ? 'Cambiar a día' : 'Cambiar a noche'}
      onClick={cambiar}
      className={`interruptor-luz shrink-0 ${className ?? ''}`}
    >
      <Sun className="sol" aria-hidden="true" />
      <span className="riel" aria-hidden="true">
        <span className="perilla" />
      </span>
      <Moon className="luna" aria-hidden="true" />
    </button>
  );
}
