import { cn } from 'cn';

/** Logo de The Coffee (imagen). Se usa donde la marca de la tienda va sola, p. ej. la pantalla de OAuth. */
export function Marca({ negativo = false, className = '' }: { negativo?: boolean; className?: string }) {
  return (
    <img
      src="/the-coffee.png"
      alt="The Coffee"
      width={447}
      height={447}
      className={`object-contain ${negativo ? 'invert mix-blend-screen' : 'mix-blend-multiply'} ${className || 'size-24'}`}
    />
  );
}

/**
 * Marca de la plataforma: «helper holding.» con la misma tipografía del logo de The Coffee (minúsculas, negrita
 * apretada, punto final) y, debajo y en pequeño, «the coffee. ザ・コーヒー».
 */
export function MarcaHolding({
  negativo = false,
  tamano = 'md',
  className,
}: {
  negativo?: boolean;
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const t = {
    sm: { nombre: 'text-[1.05rem]', sub: 'text-[9px] mt-1' },
    md: { nombre: 'text-2xl', sub: 'text-[10px] mt-1.5' },
    lg: { nombre: 'text-[2.6rem]', sub: 'text-xs mt-2.5' },
  }[tamano];
  return (
    <span
      role="img"
      aria-label="Helper Holding · The Coffee"
      className={cn('inline-flex flex-col', negativo ? 'text-white' : 'text-ink', className)}
    >
      <span
        aria-hidden="true"
        className={cn('font-display font-black lowercase tracking-[-0.035em]', t.nombre, 'leading-[0.9]')}
      >
        helper
        <br />
        holding.
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'flex items-baseline gap-2 font-display font-bold lowercase tracking-[0.02em]',
          negativo ? 'text-neutral-400' : 'text-muted-foreground',
          t.sub,
          'leading-none',
        )}
      >
        the coffee.<span className="tracking-[0.12em]">ザ・コーヒー</span>
      </span>
    </span>
  );
}
