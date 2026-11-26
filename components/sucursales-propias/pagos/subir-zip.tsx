'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SubirZip() {
  const router = useRouter();
  const [estado, setEstado] = useState<'listo' | 'subiendo'>('listo');
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setEstado('subiendo');
    setError(null);
    const fd = new FormData();
    fd.append('zip', archivo);
    try {
      const r = await fetch('/api/sucursales/propias/pagos', { method: 'POST', body: fd });
      const j = (await r.json().catch(() => ({}))) as { corridaId?: number; error?: string };
      if (!r.ok || !j.corridaId) throw new Error(j.error ?? 'No se pudo subir el ZIP.');
      router.push(`/sucursales/propias/pagos/${j.corridaId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el ZIP.');
      setEstado('listo');
    }
  }

  return (
    <label
      className="placa flex cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-8 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) subir(f);
      }}
    >
      <span className="font-medium">
        {estado === 'subiendo'
          ? 'Leyendo recibos y consultando Zoho…'
          : 'Arrastra aquí el ZIP de recibos Banregio, o haz clic para elegirlo'}
      </span>
      <span className="text-xs text-muted-foreground">
        El ZIP de la corrida, con el resumen de la transferencia masiva. Máximo 4 MB.
      </span>
      <input
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        disabled={estado === 'subiendo'}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir(f);
        }}
      />
      {error ? (
        <span role="alert" className="text-sm text-bad">
          {error}
        </span>
      ) : null}
    </label>
  );
}
