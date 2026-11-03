'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from 'cn';
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Download,
  FileText,
  Info,
  Lock,
  LockOpen,
  Plus,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pestanas } from '@/components/portal/pestanas';
import { ActividadTienda } from '@/components/crm/expediente/actividad';
import { ActividadesTienda } from '@/components/crm/expediente/actividades';
import { Candado, ChipEtapa } from './card-pipeline';
import { DialogoMovimiento, MenuMover } from './mover';
import { subirDocumento } from './subida';
import { enlaceArchivo } from '@/app/(crm)/crm/acciones';
import {
  avanzarCard,
  crearSucursal,
  cumplirRequisito,
  guardarCard,
  liberarCandado,
  retirarDocumento,
  revertirRequisito,
  validarRequisito,
} from '@/app/(crm)/crm/acciones-pipeline';
import { destinos, type Destino } from '@/lib/crm/unificado/reglas';
import {
  AREAS,
  cuando,
  textoVencimiento,
  type CardPipeline,
  type EtapaGeneral,
} from '@/lib/crm/unificado/modelo';
import { TIPOS_DOCUMENTO } from '@/lib/crm/validacion';
import {
  TERRITORIOS,
  type Actividad,
  type Archivo,
  type ClaveArea,
  type Franquiciatario,
  type Historial,
  type Liberacion,
  type Nota,
  type RequisitoCard,
  type Tienda,
  type TipoCard,
} from '@/lib/crm/tipos';

export interface DatosExpediente {
  tipo: TipoCard;
  card: CardPipeline;
  franquiciatario: Franquiciatario | null;
  sucursal: Tienda | null;
  etapa: EtapaGeneral;
  etapas: EtapaGeneral[];
  requisitos: RequisitoCard[];
  archivos: Archivo[];
  notas: Nota[];
  actividades: Actividad[];
  historial: Historial[];
  liberaciones: Liberacion[];
  sucursales: { id: string; nombre: string; etapa: EtapaGeneral }[];
  nombres: Record<string, string>;
}

export interface UsuarioCrm {
  id: string;
  nombre: string;
  areas: ClaveArea[];
  funciones: string[];
  esHead: boolean;
  desarrollador: boolean;
  editable: boolean;
}

// Un área inactiva (Finanzas) la cubre Ventas con evidencia (P1); la base aplica la misma regla.
const efectiva = (a: ClaveArea): ClaveArea => (a === 'finanzas' ? 'ventas' : a);
const puedeArea = (u: UsuarioCrm, a: ClaveArea) =>
  u.editable && (u.desarrollador || u.esHead || u.areas.includes(efectiva(a)));
const listo = (r: Pick<RequisitoCard, 'estado'>) => r.estado === 'validado' || r.estado === 'no_aplica';
const nombreDoc = (t: string | null) =>
  t && t in TIPOS_DOCUMENTO ? TIPOS_DOCUMENTO[t as keyof typeof TIPOS_DOCUMENTO] : 'Adjunto';
const peso = (b: number) =>
  b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const fechaCorta = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${s.slice(0, 10)}T00:00:00Z`))
    : '—';

function useAccion() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState('');
  const correr = (fn: () => Promise<{ error?: string }>, alTerminar?: () => void) =>
    iniciar(async () => {
      setError('');
      const r = await fn();
      if (r?.error) return setError(r.error);
      alTerminar?.();
      router.refresh();
    });
  return { pendiente, error, setError, correr };
}

function Ayuda({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Qué pide: ${titulo}`}
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-ink"
      >
        <Info size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <p className="font-semibold">{titulo}</p>
        <p className="mt-1 text-ink-2">{texto}</p>
      </PopoverContent>
    </Popover>
  );
}

function EstadoRequisito({ r }: { r: RequisitoCard }) {
  const [Icono, texto, clase] =
    r.estado === 'validado'
      ? [ShieldCheck, 'Validado', 'text-ok']
      : r.estado === 'cumplido'
        ? [CircleCheck, 'Por validar', 'text-warn']
        : r.estado === 'no_aplica'
          ? [CircleSlash, 'No aplica', 'text-muted-foreground']
          : [CircleDashed, 'Pendiente', 'text-muted-foreground'];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', clase)}>
      <Icono size={14} aria-hidden="true" /> {texto}
    </span>
  );
}

/** Formulario para registrar un requisito: pide lo que su tipo exige (fecha, documento, nota). */
function FormCumplir({
  r,
  tipo,
  card,
  archivos,
  alTerminar,
}: {
  r: RequisitoCard;
  tipo: TipoCard;
  card: string;
  archivos: Archivo[];
  alTerminar: () => void;
}) {
  const { pendiente, error, setError, correr } = useAccion();
  const conDoc = r.tipo === 'documento' || r.tipo === 'firma' || r.area_valida === 'finanzas';
  const conFecha = r.tipo === 'fecha' || r.tipo === 'firma';
  const conValor = r.tipo === 'dato';
  const [fecha, setFecha] = useState('');
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [existente, setExistente] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const docs = archivos.filter((a) => !a.archivado_en);
  return (
    <form
      className="col-span-3 mt-2 space-y-2 rounded-xl bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        correr(async () => {
          let archivo = existente || null;
          if (conDoc && !archivo) {
            if (!file) return { error: 'Adjunta el documento o elige uno del expediente.' };
            const s = await subirDocumento(tipo, card, file, r.tipo_documento ?? 'evidencia');
            if ('error' in s) return s;
            archivo = s.id;
          }
          return cumplirRequisito(tipo, card, r.requisito_id, { fecha: fecha || null, valor, nota, archivo });
        }, alTerminar);
      }}
    >
      {conDoc && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label>
            {r.area_valida === 'finanzas' ? 'Evidencia de Finanzas (correo o comprobante)' : 'Documento'}
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!!existente}
            />
          </label>
          {docs.length > 0 && (
            <label>
              …o uno del expediente
              <select value={existente} onChange={(e) => setExistente(e.target.value)}>
                <option value="">Subir nuevo</option>
                {docs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {nombreDoc(a.tipo_documento)} · {a.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {conFecha && (
          <label>
            {r.tipo === 'firma' ? 'Fecha de firma' : 'Fecha'}
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </label>
        )}
        {conValor && (
          <label>
            Dato
            <input value={valor} onChange={(e) => setValor(e.target.value)} required />
          </label>
        )}
        <label className={cn(!conFecha && !conValor && 'sm:col-span-2')}>
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={pendiente}>
          {pendiente ? 'Guardando…' : r.tipo === 'validacion' ? 'Registrar validación' : 'Registrar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => {
            setError('');
            alTerminar();
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FilaRequisito({
  r,
  datos,
  usuario,
  ahora,
}: {
  r: RequisitoCard;
  datos: DatosExpediente;
  usuario: UsuarioCrm;
  ahora?: Date;
}) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, correr } = useAccion();
  const cumple =
    puedeArea(usuario, r.area_cumple) &&
    (!r.funcion_cumple ||
      usuario.desarrollador ||
      usuario.esHead ||
      usuario.funciones.includes(r.funcion_cumple));
  const valida = puedeArea(usuario, r.area_valida);
  const archivo = r.archivo_id ? datos.archivos.find((a) => a.id === r.archivo_id) : null;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3">
      <span className="mt-0.5">
        {listo(r) ? (
          <CircleCheck size={16} aria-hidden="true" className="text-ok" />
        ) : (
          <Lock
            size={16}
            aria-hidden="true"
            className={r.obligatorio ? 'text-bad' : 'text-muted-foreground'}
          />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">
          {r.nombre}
          {!r.obligatorio && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(aviso)</span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: AREAS[r.area_cumple].color }}
            />
            Cumple {AREAS[r.area_cumple].nombre}
          </span>
          {r.area_valida !== r.area_cumple && (
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: AREAS[r.area_valida].color }}
              />
              Valida {AREAS[r.area_valida].nombre}
            </span>
          )}
          {(r.fecha || r.valor) && (
            <span className="text-ink-2">· {r.fecha ? fechaCorta(r.fecha) : r.valor}</span>
          )}
          {archivo && <span className="text-ink-2">· {archivo.nombre}</span>}
        </p>
        {r.campo && r.estado === 'pendiente' && (
          <p className="mt-1 text-xs text-muted-foreground">Se cumple al capturar el dato en Resumen.</p>
        )}
        {(r.cumplido_por || r.validado_por) && (
          <p className="mt-1 text-xs text-ink-2">
            {r.cumplido_por && r.cumplido_en && (
              <>
                Registró {datos.nombres[r.cumplido_por] ?? 'alguien'} · {cuando(r.cumplido_en, ahora)}
              </>
            )}
            {r.validado_por && r.validado_en && (
              <>
                {' '}
                · Validó {datos.nombres[r.validado_por] ?? 'alguien'} · {cuando(r.validado_en, ahora)}
              </>
            )}
          </p>
        )}
        {r.nota && <p className="mt-1 text-xs text-muted-foreground">{r.nota}</p>}
        {error && (
          <p role="alert" className="mt-1 text-xs text-bad">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <EstadoRequisito r={r} />
        <Ayuda titulo={r.nombre} texto={r.ayuda} />
      </div>
      {!r.campo && !abierto && (
        <div className="col-start-2 col-end-4 flex flex-wrap gap-2">
          {r.estado === 'pendiente' && cumple && (
            <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
              {r.tipo === 'documento' || r.tipo === 'firma' ? <Upload aria-hidden="true" /> : null}
              {r.tipo === 'validacion' ? 'Registrar validación' : 'Registrar'}
            </Button>
          )}
          {r.estado === 'cumplido' && valida && r.cumplimiento_id && (
            <Button
              size="sm"
              disabled={pendiente}
              onClick={() => correr(() => validarRequisito(r.cumplimiento_id!))}
            >
              <ShieldCheck aria-hidden="true" /> Validar
            </Button>
          )}
          {(r.estado === 'cumplido' || r.estado === 'validado') &&
            (cumple || valida) &&
            r.cumplimiento_id && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pendiente}
                onClick={() => {
                  const motivo = window.prompt(
                    `¿Por qué regresa «${r.nombre}» a pendiente? Queda en la bitácora.`,
                  );
                  if (motivo?.trim()) correr(() => revertirRequisito(r.cumplimiento_id!, motivo));
                }}
              >
                <RotateCcw aria-hidden="true" /> Corregir
              </Button>
            )}
        </div>
      )}
      {abierto && (
        <FormCumplir
          r={r}
          tipo={datos.tipo}
          card={datos.card.id}
          archivos={datos.archivos}
          alTerminar={() => setAbierto(false)}
        />
      )}
    </li>
  );
}

function Requisitos({
  datos,
  usuario,
  ahora,
}: {
  datos: DatosExpediente;
  usuario: UsuarioCrm;
  ahora?: Date;
}) {
  const grupos = new Map<string, RequisitoCard[]>();
  for (const r of datos.requisitos) grupos.set(r.etapa_id, [...(grupos.get(r.etapa_id) ?? []), r]);
  const ordenadas = [...grupos.entries()]
    .map(([id, rs]) => ({
      etapa: datos.etapas.find((e) => e.id === id),
      rs: rs.sort((a, b) => a.orden - b.orden),
    }))
    .filter((g): g is { etapa: EtapaGeneral; rs: RequisitoCard[] } => !!g.etapa)
    .sort((a, b) => b.etapa.orden - a.etapa.orden);
  if (!ordenadas.length)
    return (
      <p className="placa p-5 text-sm text-muted-foreground">
        Esta etapa no tiene requisitos
        {datos.etapa.provisional ? ' (provisional, hasta que llegue el documento de Proyectos)' : ''}.
      </p>
    );
  return (
    <div className="space-y-3">
      {ordenadas.map(({ etapa, rs }) => {
        const actual = etapa.id === datos.etapa.id;
        const adelanto = !actual && etapa.orden > datos.etapa.orden;
        const n = rs.filter(listo).length;
        const encabezado = (
          <span className="flex flex-wrap items-center gap-2">
            <ChipEtapa etapa={etapa} />
            <span className="text-xs text-muted-foreground tabular">
              {n}/{rs.length} listos
            </span>
            {adelanto && (
              <span className="text-xs font-semibold text-ink-2">· se puede registrar por adelantado</span>
            )}
          </span>
        );
        const cuerpo = (
          <ul role="list" className="divide-y divide-line">
            {rs.map((r) => (
              <FilaRequisito key={r.requisito_id} r={r} datos={datos} usuario={usuario} ahora={ahora} />
            ))}
          </ul>
        );
        return actual || adelanto ? (
          <section
            key={etapa.id}
            className={cn(
              'rounded-2xl border bg-surface shadow-card',
              actual ? 'border-ink/15' : 'border-line',
            )}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              {encabezado}
              {actual && <span className="text-xs font-semibold text-ink-2">Etapa actual</span>}
            </header>
            {cuerpo}
          </section>
        ) : (
          <details key={etapa.id} className="rounded-2xl border border-line bg-surface shadow-card">
            <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
              {encabezado}
            </summary>
            <div className="border-t border-line">{cuerpo}</div>
          </details>
        );
      })}
    </div>
  );
}

function Documentos({
  datos,
  usuario,
  ahora,
}: {
  datos: DatosExpediente;
  usuario: UsuarioCrm;
  ahora?: Date;
}) {
  const { pendiente, error, setError, correr } = useAccion();
  const [tipoDoc, setTipoDoc] = useState('otro');
  const [file, setFile] = useState<File | null>(null);
  const activos = datos.archivos.filter((a) => !a.archivado_en);
  const reemplazados = new Set(activos.map((a) => a.reemplaza_a).filter(Boolean));
  const vigentes = activos.filter((a) => !reemplazados.has(a.id));
  const anteriores = (a: Archivo): Archivo[] => {
    const previo = a.reemplaza_a ? datos.archivos.find((x) => x.id === a.reemplaza_a) : null;
    return previo ? [previo, ...anteriores(previo)] : [];
  };
  const tipos = [...new Set(vigentes.map((a) => a.tipo_documento ?? 'otro'))];
  const descargar = (id: string) =>
    correr(async () => {
      const r = await enlaceArchivo(id);
      if (r.error !== undefined) return r;
      window.location.assign(r.url);
      return {};
    });
  const enviar = (archivo: File, reemplaza?: Archivo) =>
    correr(
      async () => {
        const r = await subirDocumento(
          datos.tipo,
          datos.card.id,
          archivo,
          reemplaza?.tipo_documento ?? tipoDoc,
          reemplaza?.id,
        );
        return 'error' in r ? r : {};
      },
      () => setFile(null),
    );
  const nuevaVersion = (a: Archivo) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.onchange = () => entrada.files?.[0] && enviar(entrada.files[0], a);
    entrada.click();
  };
  return (
    <div className="space-y-4">
      {usuario.editable && (
        <form
          className="placa flex flex-wrap items-end gap-3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return setError('Elige el archivo.');
            enviar(file);
          }}
        >
          <label className="w-56">
            Tipo de documento
            <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
              {Object.entries(TIPOS_DOCUMENTO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-56 flex-1">
            Archivo (PDF, imagen, Word o Excel; hasta 25 MB)
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button disabled={pendiente || !file}>
            <Upload aria-hidden="true" /> Subir
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="placa px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {!vigentes.length && <p className="placa p-5 text-sm text-muted-foreground">Sin documentos todavía.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {tipos.map((t) => (
          <section key={t} className="rounded-2xl border border-line bg-surface shadow-card">
            <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{nombreDoc(t)}</h3>
            <ul role="list" className="divide-y divide-line">
              {vigentes
                .filter((a) => (a.tipo_documento ?? 'otro') === t)
                .map((a) => {
                  const previos = anteriores(a);
                  return (
                    <li key={a.id} className="px-4 py-3">
                      <p className="flex items-center gap-2 text-sm">
                        <FileText size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">{a.nombre}</span>
                        <span className="rounded-md bg-surface-2 px-1.5 text-[11px] font-semibold tabular">
                          v{a.version_documento}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(a.subido_por && datos.nombres[a.subido_por]) ||
                          (a.imported_at ? 'Zoho' : 'Alguien')}{' '}
                        · {cuando(a.subido_en, ahora)} · {peso(a.tamano)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pendiente}
                          onClick={() => descargar(a.id)}
                        >
                          <Download aria-hidden="true" /> Descargar
                        </Button>
                        {usuario.editable && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pendiente}
                              onClick={() => nuevaVersion(a)}
                            >
                              <Upload aria-hidden="true" /> Nueva versión
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pendiente}
                              onClick={() => {
                                const motivo = window.prompt(
                                  `¿Por qué se retira ${a.nombre}? Queda en la bitácora.`,
                                );
                                if (motivo?.trim()) correr(() => retirarDocumento(a.id, motivo));
                              }}
                            >
                              Retirar
                            </Button>
                          </>
                        )}
                      </div>
                      {previos.length > 0 && (
                        <details className="mt-1.5 text-xs">
                          <summary className="cursor-pointer text-ink-2 hover:underline">
                            {previos.length === 1
                              ? '1 versión anterior conservada'
                              : `${previos.length} versiones anteriores conservadas`}
                          </summary>
                          <ul role="list" className="mt-1 space-y-0.5 text-muted-foreground">
                            {previos.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => descargar(p.id)}
                                >
                                  v{p.version_documento} · {p.nombre} · {cuando(p.subido_en, ahora)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
      {datos.archivos.some((a) => a.archivado_en) && (
        <details className="placa p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Documentos retirados</summary>
          <ul role="list" className="mt-2 space-y-1 text-xs text-muted-foreground">
            {datos.archivos
              .filter((a) => a.archivado_en)
              .map((a) => (
                <li key={a.id}>
                  {a.nombre} · retirado {cuando(a.archivado_en!, ahora)}
                  {a.motivo_retiro ? ` · ${a.motivo_retiro}` : ''}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const origenTexto: Record<Historial['origen'], string | null> = {
  crm: null,
  sistema: 'Automático',
  importacion: 'Importación',
  zoho: 'Zoho',
  agente: 'Agente',
};

export function LineaTiempo({ eventos, ahora }: { eventos: Historial[]; ahora?: Date }) {
  if (!eventos.length)
    return <p className="placa p-5 text-sm text-muted-foreground">Sin movimientos registrados.</p>;
  return (
    <ol className="relative rounded-2xl border border-line bg-surface p-4 shadow-card">
      {eventos.map((e, i) => {
        const area = (e.actor_area?.split(',')[0] ?? null) as ClaveArea | null;
        const liberado = e.accion === 'candado_liberado';
        return (
          <li key={e.id} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {i < eventos.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[0.55rem] top-5 h-[calc(100%-1rem)] w-px bg-line"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'mt-1 grid size-[1.1rem] place-items-center rounded-full border-2 bg-surface',
                liberado ? 'border-warn' : 'border-line-strong',
              )}
              style={area && AREAS[area] && !liberado ? { borderColor: AREAS[area].color } : undefined}
            >
              {liberado && <LockOpen size={9} className="text-warn" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{e.resumen}</p>
              {e.motivo && (
                <p className="mt-1 rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-ink-2">
                  Motivo: {e.motivo}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.actor_nombre ?? (e.origen === 'zoho' ? 'Zoho' : 'Sistema')}
                {area && AREAS[area] ? ` · ${AREAS[area].nombre}` : ''} ·{' '}
                <time dateTime={e.fecha}>{cuando(e.fecha, ahora)}</time>
                {origenTexto[e.origen] && ` · ${origenTexto[e.origen]}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LiberarCandado({
  datos,
  faltantes,
  usuario,
  abiertoInicial = false,
}: {
  datos: DatosExpediente;
  faltantes: RequisitoCard[];
  usuario: UsuarioCrm;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [motivo, setMotivo] = useState('');
  const { pendiente, error, correr } = useAccion();
  const corto = motivo.trim().length < 15;
  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <LockOpen aria-hidden="true" /> Liberar candado
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar candado de {datos.card.nombre}</DialogTitle>
            <DialogDescription>
              La card podrá avanzar sin estos requisitos. Quedará registrado con tu nombre, la fecha y el
              motivo, y la card mostrará «Candado liberado».
            </DialogDescription>
          </DialogHeader>
          <ul role="list" className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
            {faltantes.map((r) => (
              <li key={r.requisito_id} className="flex items-center gap-2">
                <Lock size={13} aria-hidden="true" className="text-bad" /> {r.nombre}
                <span className="text-xs text-muted-foreground">({AREAS[r.area_cumple].nombre})</span>
              </li>
            ))}
            {datos.tipo === 'franquiciatario' && datos.franquiciatario?.territorio === 'bloqueada' && (
              <li className="flex items-center gap-2">
                <Lock size={13} aria-hidden="true" className="text-bad" /> Territorio bloqueado
              </li>
            )}
          </ul>
          <label>
            Motivo (obligatorio)
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se libera y quién lo autorizó"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {usuario.nombre}
            {corto && ' · escribe al menos 15 caracteres'}
          </p>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={corto || pendiente}
              onClick={() =>
                correr(
                  () => liberarCandado(datos.tipo, datos.card.id, motivo),
                  () => setAbierto(false),
                )
              }
            >
              <LockOpen aria-hidden="true" /> Liberar candado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type CampoEditable = {
  campo: string;
  etiqueta: string;
  tipo?: 'date' | 'email' | 'number' | 'select';
  opciones?: Record<string, string>;
};
const CAMPOS_FRANQUICIATARIO: CampoEditable[] = [
  { campo: 'nombre', etiqueta: 'Nombre o razón comercial' },
  { campo: 'correo', etiqueta: 'Correo', tipo: 'email' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'ciudad_interes', etiqueta: 'Ciudad de interés' },
  { campo: 'estado_interes', etiqueta: 'Estado de interés' },
  { campo: 'origen', etiqueta: 'Origen de captación' },
  { campo: 'territorio', etiqueta: 'Resultado territorial', tipo: 'select', opciones: TERRITORIOS },
  {
    campo: 'tipo_persona',
    etiqueta: 'Tipo de persona',
    tipo: 'select',
    opciones: { fisica: 'Física', moral: 'Moral' },
  },
  { campo: 'firmante', etiqueta: 'Firmante del contrato' },
  { campo: 'obligado_solidario', etiqueta: 'Obligado solidario' },
  { campo: 'razon_social', etiqueta: 'Razón social' },
  { campo: 'rfc', etiqueta: 'RFC' },
  { campo: 'regimen_fiscal', etiqueta: 'Régimen fiscal' },
  { campo: 'codigo_postal_fiscal', etiqueta: 'C.P. fiscal' },
];
const CAMPOS_SUCURSAL: CampoEditable[] = [
  { campo: 'nombre', etiqueta: 'Nombre de la sucursal' },
  { campo: 'ciudad', etiqueta: 'Ciudad' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'fecha_limite_apertura', etiqueta: 'Fecha límite de apertura', tipo: 'date' },
  { campo: 'fecha_estimada_apertura', etiqueta: 'Fecha estimada de apertura', tipo: 'date' },
  { campo: 'fecha_confirmada_apertura', etiqueta: 'Fecha confirmada de apertura', tipo: 'date' },
  { campo: 'numero_tienda_jestor', etiqueta: 'ID Jestor', tipo: 'number' },
  { campo: 'arquitecto_asignado', etiqueta: 'Arquitecta asignada' },
];

function Resumen({ datos, usuario }: { datos: DatosExpediente; usuario: UsuarioCrm }) {
  const fila = (datos.tipo === 'franquiciatario'
    ? datos.franquiciatario
    : datos.sucursal) as unknown as Record<string, unknown>;
  const campos = datos.tipo === 'franquiciatario' ? CAMPOS_FRANQUICIATARIO : CAMPOS_SUCURSAL;
  const [editando, setEditando] = useState(false);
  const { pendiente, error, correr } = useAccion();
  const texto = (c: CampoEditable) => {
    const v = fila[c.campo];
    if (v === null || v === undefined || v === '') return '—';
    if (c.tipo === 'date') return fechaCorta(String(v));
    if (c.opciones) return c.opciones[String(v)] ?? String(v);
    return String(v);
  };
  const responsable = fila.responsable_id ? datos.nombres[String(fila.responsable_id)] : null;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = Object.fromEntries(new FormData(e.currentTarget));
        correr(
          () => guardarCard(datos.tipo, datos.card.id, datos.card.version, form),
          () => setEditando(false),
        );
      }}
    >
      <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card sm:grid-cols-2 lg:grid-cols-3">
        {datos.tipo === 'sucursal' && datos.franquiciatario && (
          <div>
            <dt className="text-xs text-muted-foreground">Franquiciatario</dt>
            <dd className="mt-0.5 text-sm font-medium">
              <Link href={`/crm/franquiciatarios/${datos.franquiciatario.id}`} className="hover:underline">
                {datos.franquiciatario.nombre}
              </Link>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">
            {datos.tipo === 'franquiciatario' ? 'Vendedor' : 'Responsable'}
          </dt>
          <dd className="mt-0.5 text-sm font-medium">{responsable ?? 'Sin asignar'}</dd>
        </div>
        {campos.map((c) => (
          <div key={c.campo}>
            {editando ? (
              <label>
                {c.etiqueta}
                {c.tipo === 'select' ? (
                  <select name={c.campo} defaultValue={String(fila[c.campo] ?? '')}>
                    <option value="">—</option>
                    {Object.entries(c.opciones ?? {}).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name={c.campo} type={c.tipo ?? 'text'} defaultValue={String(fila[c.campo] ?? '')} />
                )}
              </label>
            ) : (
              <>
                <dt className="text-xs text-muted-foreground">{c.etiqueta}</dt>
                <dd className="mt-0.5 text-sm font-medium">{texto(c)}</dd>
              </>
            )}
          </div>
        ))}
      </dl>
      {error && (
        <p role="alert" className="placa px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {usuario.editable && (
        <div className="flex gap-2">
          {editando ? (
            <>
              <Button disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar datos'}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditando(true)}>
              Editar datos
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function Sucursales({ datos, usuario }: { datos: DatosExpediente; usuario: UsuarioCrm }) {
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState(datos.franquiciatario?.ciudad_interes ?? '');
  const { pendiente, error, correr } = useAccion();
  const formalizado = !!datos.franquiciatario?.formalizado_en;
  return (
    <div className="space-y-3">
      <ul role="list" className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
        {datos.sucursales.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href={`/crm/sucursales/${s.id}`} className="text-sm font-semibold hover:underline">
              {s.nombre}
            </Link>
            <ChipEtapa etapa={s.etapa} />
          </li>
        ))}
        {!datos.sucursales.length && (
          <li className="px-4 py-5 text-sm text-muted-foreground">
            {formalizado
              ? 'Sin sucursales.'
              : 'La primera sucursal se crea al cerrar la etapa 5 (carta de intención firmada).'}
          </li>
        )}
      </ul>
      {formalizado && puedeArea(usuario, 'ventas') && (
        <form
          className="placa flex flex-wrap items-end gap-3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            correr(
              () => crearSucursal(datos.card.id, nombre, ciudad),
              () => setNombre(''),
            );
          }}
        >
          <label className="min-w-48 flex-1">
            Nombre de la nueva sucursal
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="w-48">
            Ciudad
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          </label>
          <Button disabled={pendiente}>
            <Plus aria-hidden="true" /> Agregar sucursal
          </Button>
          {error && (
            <p role="alert" className="basis-full text-sm text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export function ExpedienteCard({
  datos,
  usuario,
  ahora,
  pestana = 'requisitos',
  liberarAbierto,
}: {
  datos: DatosExpediente;
  usuario: UsuarioCrm;
  ahora?: Date;
  /** Pestaña inicial (p. ej. la de la URL). */
  pestana?: string;
  /** Solo para revisión visual: abre el diálogo de liberar candado al montar. */
  liberarAbierto?: boolean;
}) {
  const router = useRouter();
  const { card, etapa } = datos;
  const [destino, setDestino] = useState<Destino | null>(null);
  const [errorMover, setErrorMover] = useState('');
  const [moviendo, iniciar] = useTransition();
  const actuales = datos.requisitos.filter((r) => r.etapa_id === etapa.id);
  const faltantes = actuales.filter((r) => r.obligatorio && !listo(r));
  const posibles = usuario.editable ? destinos(datos.etapas, etapa, datos.tipo, card.etapaPreviaId) : [];
  const siguiente = posibles.find((d) => d.tipo === 'siguiente');
  const puedeMover =
    usuario.editable && (usuario.desarrollador || usuario.esHead || usuario.areas.includes(etapa.area));
  const bloqueadoTerritorio =
    datos.tipo === 'franquiciatario' && datos.franquiciatario?.territorio === 'bloqueada';
  const lista = (faltantes.length === 0 && !bloqueadoTerritorio) || card.liberado;
  const mover = (d: Destino, motivo: string | null, sucursal: string | null) =>
    iniciar(async () => {
      setErrorMover('');
      const r = await avanzarCard(datos.tipo, card.id, d.etapa.clave, card.version, motivo, sucursal);
      if (r.error !== undefined) return setErrorMover(r.error);
      setDestino(null);
      if (r.sucursal) router.push(`/crm/sucursales/${r.sucursal}`);
      else router.refresh();
    });
  const elegir = (d: Destino) => (d.requiereMotivo || d.pideSucursal ? setDestino(d) : mover(d, null, null));
  const relacion =
    datos.tipo === 'franquiciatario' ? { franquiciatario_id: card.id } : { tienda_id: card.id };

  const pestanas = [
    { id: 'resumen', nombre: 'Resumen', contenido: <Resumen datos={datos} usuario={usuario} /> },
    {
      id: 'requisitos',
      nombre: 'Requisitos',
      contador: faltantes.length,
      contenido: <Requisitos datos={datos} usuario={usuario} ahora={ahora} />,
    },
    {
      id: 'documentos',
      nombre: 'Documentos',
      contador: datos.archivos.filter((a) => !a.archivado_en).length,
      contenido: <Documentos datos={datos} usuario={usuario} ahora={ahora} />,
    },
    {
      id: 'notas',
      nombre: 'Notas',
      contador: datos.notas.length,
      contenido: (
        <ActividadTienda
          relacion={relacion}
          notas={datos.notas}
          historial={[]}
          editable={usuario.editable}
          nombres={datos.nombres}
        />
      ),
    },
    {
      id: 'actividades',
      nombre: 'Actividades',
      contador: datos.actividades.filter((a) => a.estado !== 'Completed').length,
      contenido: (
        <ActividadesTienda
          tienda={card.id}
          actividades={datos.actividades}
          editable={usuario.editable}
          relacion={relacion}
        />
      ),
    },
    ...(datos.tipo === 'franquiciatario'
      ? [
          {
            id: 'sucursales',
            nombre: 'Sucursales',
            contador: datos.sucursales.length,
            contenido: <Sucursales datos={datos} usuario={usuario} />,
          },
        ]
      : []),
    {
      id: 'trazabilidad',
      nombre: 'Trazabilidad',
      contador: datos.historial.length,
      contenido: <LineaTiempo eventos={datos.historial} ahora={ahora} />,
    },
  ];
  return (
    <div className="space-y-5">
      <section
        className="placa flex flex-wrap items-center gap-x-6 gap-y-3 p-4"
        aria-label="Estado de la card"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <ChipEtapa etapa={etapa} />
          <Candado card={card} etapa={etapa} />
          {bloqueadoTerritorio && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-bad">
              <Lock size={13} aria-hidden="true" /> Territorio bloqueado
            </span>
          )}
          {card.vencimiento && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px]',
                card.vencimiento.dias <= 7 ? 'text-warn' : 'text-muted-foreground',
              )}
            >
              <Clock size={13} aria-hidden="true" /> {textoVencimiento(card.vencimiento)}
            </span>
          )}
          {card.muestra && (
            <span className="text-[12px] text-muted-foreground">Muestra: sin requisitos registrados</span>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {usuario.esHead && !lista && etapa.tipo === 'abierta' && (
            <LiberarCandado
              datos={datos}
              faltantes={faltantes}
              usuario={usuario}
              abiertoInicial={liberarAbierto}
            />
          )}
          <MenuMover
            nombre={card.nombre}
            destinos={posibles.filter((d) => d.tipo !== 'siguiente')}
            alElegir={elegir}
            deshabilitado={moviendo}
            compacto={false}
          />
          {siguiente && (
            <Button
              disabled={!lista || !puedeMover || moviendo}
              onClick={() => elegir(siguiente)}
              aria-label={`Avanzar a ${siguiente.etapa.numero ? `la etapa ${siguiente.etapa.numero}, ` : ''}${siguiente.etapa.nombre}`}
              title={
                !puedeMover ? `La mueve ${etapa.funcion ?? AREAS[etapa.area].nombre}` : siguiente.etapa.nombre
              }
            >
              {siguiente.etapa.numero
                ? `Avanzar a la etapa ${siguiente.etapa.numero}`
                : `Avanzar a ${siguiente.etapa.nombre}`}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
        {!lista && etapa.tipo === 'abierta' && (
          <p className="basis-full text-xs text-muted-foreground">
            No puede avanzar:{' '}
            {bloqueadoTerritorio
              ? 'el territorio está bloqueado (solo Standby o Descartada, o un head libera el candado).'
              : faltantes.length > 1
                ? `faltan ${faltantes.length} requisitos obligatorios de esta etapa.`
                : 'falta 1 requisito obligatorio de esta etapa.'}
          </p>
        )}
        {errorMover && !destino && (
          <p role="alert" className="basis-full text-sm text-bad">
            {errorMover}
          </p>
        )}
      </section>
      <Pestanas pestanas={pestanas} inicial={pestana} />
      <DialogoMovimiento
        destino={destino}
        nombre={card.nombre}
        ciudad={card.ciudad}
        pendiente={moviendo}
        error={errorMover}
        alCerrar={() => {
          setDestino(null);
          setErrorMover('');
        }}
        alConfirmar={(motivo, sucursal) => destino && mover(destino, motivo, sucursal)}
      />
    </div>
  );
}
