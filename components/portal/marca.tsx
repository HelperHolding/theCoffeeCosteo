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
