'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Archive, Download, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cliente } from '@/lib/supabase/cliente';
import { archivarArchivo, confirmarArchivo, enlaceArchivo, prepararArchivo } from '@/app/(crm)/crm/acciones';
import { TAMANO_MAXIMO, TIPOS_ARCHIVO, validarArchivo } from '@/lib/crm/validacion';
import type { Archivo } from '@/lib/crm/tipos';
import { fechaHora } from '@/lib/crm/formato';

const peso = (b: number) =>
  b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const SECCIONES: Record<string, string> = {
  adjuntos: 'Adjuntos',
  'Información Proyecto': 'Información del proyecto',
  notas: 'Adjuntos de notas',
};

/** Lista de documentos con descarga. La subida solo existe en tiendas (`tienda`). */
export function DocumentosTienda({
  tienda,
  archivos,
  editable,
}: {
  tienda?: string;
  archivos: Archivo[];
  editable: boolean;
}) {
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const grupos = Object.entries(
    archivos.reduce<Record<string, Archivo[]>>((g, a) => ((g[a.seccion] ??= []).push(a), g), {}),
  );

  const subir = (file: File) =>
    iniciar(async () => {
      setAviso(null);
      try {
        validarArchivo(file.name, file.type, file.size);
      } catch (e) {
        return setAviso({ tipo: 'error', texto: (e as Error).message });
      }
      if (!tienda) return;
      const p = await prepararArchivo(tienda, { nombre: file.name, mime: file.type, tamano: file.size });
      if (p.error !== undefined) return setAviso({ tipo: 'error', texto: p.error });
      // Subida directa al bucket privado con la sesión del usuario: la RLS exige la fila recién creada.
      const r = await cliente().storage.from('crm-archivos').upload(p.ruta, file, { contentType: file.type });
      await confirmarArchivo(tienda, p.id, !r.error);
      if (r.error)
        return setAviso({ tipo: 'error', texto: 'No se pudo subir el archivo. Intenta de nuevo.' });
      setAviso({ tipo: 'ok', texto: `${file.name} se subió.` });
      router.refresh();
    });

  const descargar = (id: string) =>
    iniciar(async () => {
      const r = await enlaceArchivo(id);
      if (r.error !== undefined) return setAviso({ tipo: 'error', texto: r.error });
      window.location.assign(r.url);
    });

  const archivar = (a: Archivo) =>
    iniciar(async () => {
      if (!window.confirm(`¿Archivar ${a.nombre}? Dejará de verse en el expediente.`)) return;
      const r = await archivarArchivo(tienda ?? '', a.id);
      if (r.error !== undefined) return setAviso({ tipo: 'error', texto: r.error });
      router.refresh();
    });

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-surface p-5 shadow-card">
      {editable && tienda && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={entrada}
            type="file"
            className="sr-only"
            id="subir-archivo"
            tabIndex={-1}
            aria-hidden="true"
            accept={Object.keys(TIPOS_ARCHIVO).join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) subir(f);
            }}
          />
          <Button variant="outline" disabled={pendiente} onClick={() => entrada.current?.click()}>
            <Upload aria-hidden="true" /> {pendiente ? 'Procesando…' : 'Subir archivo'}
          </Button>
          <p className="text-xs text-muted-foreground">
            PDF, imagen, XML, Word o Excel · hasta {TAMANO_MAXIMO / 1024 / 1024} MB
          </p>
        </div>
      )}
      <div role="status" aria-live="polite" className={aviso ? '' : 'sr-only'}>
        {aviso && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${aviso.tipo === 'error' ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok'}`}
          >
            {aviso.texto}
          </p>
        )}
      </div>
      {archivos.length === 0 && <p className="text-sm text-muted-foreground">Sin documentos.</p>}
      {grupos.map(([seccion, lista]) => (
        <section key={seccion} className="rounded-2xl border border-line bg-surface shadow-card">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">
            {SECCIONES[seccion] ?? seccion}
          </h3>
          <ul className="divide-y divide-line">
            {lista.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText size={18} aria-hidden="true" className="text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {TIPOS_ARCHIVO[a.mime] ?? a.mime} · {peso(a.tamano)} ·{' '}
                    {fechaHora(a.zoho_created_at ?? a.subido_en)}
                    {a.campo && ` · ${a.campo.replaceAll('_', ' ')}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => descargar(a.id)} disabled={pendiente}>
                  <Download aria-hidden="true" /> Descargar
                </Button>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Archivar ${a.nombre}`}
                    onClick={() => archivar(a)}
                    disabled={pendiente}
                  >
                    <Archive aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
