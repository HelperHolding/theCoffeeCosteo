'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { guardarTienda } from '@/app/(crm)/crm/acciones';
import { claseCampo } from '../nueva-tienda';
import { camposTienda, type CampoTienda } from '@/lib/crm/validacion';
import type { Tienda } from '@/lib/crm/tipos';
import { TIPOS_FRANQUICIA } from '@/lib/crm/tipos';

const etiquetas: Record<CampoTienda, string> = {
  nombre: 'Nombre de la tienda',
  franquiciatario: 'Franquiciatario',
  tipo_franquicia: 'Tipo de franquicia',
  ciudad: 'Ciudad',
  direccion: 'Dirección',
  numero_tienda_jestor: 'Número de tienda / Jestor',
  correo_tienda: 'Correo de la tienda',
  arquitecto_asignado: 'Arquitecto asignado',
  fecha_entrega_proyecto: 'Entrega de proyecto',
  fecha_aprobacion_local: 'Aprobación de local',
  fecha_programada_arranque: 'Arranque programado',
  fecha_apertura: 'Apertura',
  fecha_firma_contrato: 'Firma del primer contrato',
  fecha_firma_franquicia: 'Firma del contrato de franquicia (5 años)',
  estatus_contrato_franquicia: 'Estatus del contrato de franquicia',
  fecha_vencimiento_franquicia: 'Vencimiento del contrato de franquicia',
  url_carpeta_contrato: 'Carpeta del contrato',
  marca_cafetera: 'Marca de cafetera',
  estatus_cafetera: 'Estatus de cafetera',
  url_dictamen_local: 'Dictamen de aprobación de local',
  rappi: 'Rappi',
  rollout: 'Rollout',
};

/** Secciones en el orden del layout "Tiendas The Coffee" de Zoho. */
const secciones: { titulo: string; campos: CampoTienda[] }[] = [
  {
    titulo: 'Información',
    campos: [
      'nombre',
      'franquiciatario',
      'tipo_franquicia',
      'ciudad',
      'direccion',
      'numero_tienda_jestor',
      'correo_tienda',
    ],
  },
  { titulo: 'Proyecto', campos: ['arquitecto_asignado', 'fecha_entrega_proyecto'] },
  { titulo: 'Fechas', campos: ['fecha_aprobacion_local', 'fecha_programada_arranque', 'fecha_apertura'] },
  {
    titulo: 'Contrato',
    campos: [
      'fecha_firma_contrato',
      'fecha_firma_franquicia',
      'estatus_contrato_franquicia',
      'fecha_vencimiento_franquicia',
      'url_carpeta_contrato',
    ],
  },
  { titulo: 'Cafetera', campos: ['marca_cafetera', 'estatus_cafetera'] },
  { titulo: 'Evidencias y operación', campos: ['url_dictamen_local', 'rappi', 'rollout'] },
];

const formatoFecha = (s: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${s}T00:00:00Z`));

function Valor({ campo, tienda }: { campo: CampoTienda; tienda: Tienda }) {
  const v = tienda[campo];
  const c = camposTienda[campo];
  if (c.tipo === 'booleano') return <>{v ? 'Sí' : 'No'}</>;
  if (v === null || v === '') return <span className="text-muted-foreground">—</span>;
  if (campo === 'tipo_franquicia') return <>{TIPOS_FRANQUICIA[v as keyof typeof TIPOS_FRANQUICIA]}</>;
  if (c.tipo === 'fecha') return <>{formatoFecha(String(v))}</>;
  if (c.tipo === 'url')
    return (
      <a
        href={String(v)}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-crema-strong underline"
      >
        Abrir liga
      </a>
    );
  return <>{String(v)}</>;
}

function Entrada({ campo, tienda }: { campo: CampoTienda; tienda: Tienda }) {
  const c = camposTienda[campo];
  const v = tienda[campo];
  const id = `campo-${campo}`;
  if (c.tipo === 'booleano')
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name={campo} defaultChecked={Boolean(v)} /> {etiquetas[campo]}
      </label>
    );
  const control =
    c.tipo === 'opcion' ? (
      <select id={id} name={campo} defaultValue={v === null ? '' : String(v)} className={claseCampo}>
        <option value="">—</option>
        {c.opciones.map((o) => (
          <option key={o} value={o}>
            {campo === 'tipo_franquicia' ? TIPOS_FRANQUICIA[o as keyof typeof TIPOS_FRANQUICIA] : o}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        name={campo}
        defaultValue={v === null ? '' : String(v)}
        required={'requerido' in c && c.requerido}
        type={
          c.tipo === 'fecha'
            ? 'date'
            : c.tipo === 'entero'
              ? 'number'
              : c.tipo === 'url'
                ? 'url'
                : c.tipo === 'correo'
                  ? 'email'
                  : 'text'
        }
        className={claseCampo}
      />
    );
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {etiquetas[campo]}
      </label>
      {control}
    </div>
  );
}

export function DatosTienda({ tienda, editable }: { tienda: Tienda; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (!editando)
    return (
      <div className="space-y-6">
        {editable && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Pencil aria-hidden="true" /> Editar datos
            </Button>
          </div>
        )}
        {secciones.map((s) => (
          <section key={s.titulo} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-base">{s.titulo}</h2>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {s.campos.map((c) => (
                <div key={c}>
                  <dt className="text-xs font-medium text-muted-foreground">{etiquetas[c]}</dt>
                  <dd className="mt-1 text-sm">
                    <Valor campo={c} tienda={tienda} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    );
  return (
    <form
      className="space-y-6"
      action={(form) =>
        iniciar(async () => {
          setError('');
          const datos: Record<string, unknown> = {};
          for (const s of secciones)
            for (const c of s.campos)
              datos[c] =
                camposTienda[c].tipo === 'booleano' ? form.get(c) === 'on' : String(form.get(c) ?? '');
          const r = await guardarTienda(tienda.id, tienda.version, datos);
          if (r.error !== undefined) return setError(r.error);
          setEditando(false);
          router.refresh();
        })
      }
    >
      {secciones.map((s) => (
        <fieldset key={s.titulo} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <legend className="px-1 font-display text-base font-bold">{s.titulo}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.campos.map((c) => (
              <Entrada key={c} campo={c} tienda={tienda} />
            ))}
          </div>
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="sticky bottom-4 flex justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift">
        <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={pendiente}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
