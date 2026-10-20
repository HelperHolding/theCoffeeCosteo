'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { agregarElemento, crearChecklist, marcarElemento } from '@/app/(crm)/crm/acciones';
import type { Checklist, ChecklistItem } from '@/lib/crm/tipos';
import { claseCampo } from '../nueva-tienda';

type Lista = Checklist & { items: ChecklistItem[] };

function Elemento({ tienda, item, editable }: { tienda: string; item: ChecklistItem; editable: boolean }) {
  const [hecho, setHecho] = useState(item.hecho);
  const [error, setError] = useState('');
  const [, iniciar] = useTransition();
  const router = useRouter();
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <input
        id={`item-${item.id}`}
        type="checkbox"
        checked={hecho}
        disabled={!editable}
        className="mt-0.5 size-4"
        onChange={(e) => {
          const nuevo = e.target.checked;
          setHecho(nuevo);
          iniciar(async () => {
            const r = await marcarElemento(tienda, item.id, nuevo);
            if (r.error !== undefined) {
              setHecho(!nuevo);
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={`item-${item.id}`}
          className={`text-sm ${hecho ? 'text-muted-foreground line-through' : ''}`}
        >
          {item.texto}
        </label>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-2 inline-flex items-center gap-1 text-xs text-crema-strong underline"
          >
            Ver evidencia <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
        {error && (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

function NuevoElemento({ tienda, checklist }: { tienda: string; checklist: string }) {
  const [texto, setTexto] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex gap-2 px-4 py-3"
      action={() =>
        iniciar(async () => {
          const r = await agregarElemento(tienda, checklist, texto);
          if (r.error === undefined) {
            setTexto('');
            router.refresh();
          }
        })
      }
    >
      <label className="sr-only" htmlFor={`nuevo-${checklist}`}>
        Nuevo elemento
      </label>
      <input
        id={`nuevo-${checklist}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={300}
        placeholder="Agregar elemento…"
        className={claseCampo}
      />
      <Button type="submit" variant="outline" disabled={pendiente || !texto.trim()}>
        Agregar
      </Button>
    </form>
  );
}

export function ChecklistsTienda({
  tienda,
  listas,
  editable,
}: {
  tienda: string;
  listas: Lista[];
  editable: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-5">
      {listas.length === 0 && (
        <p className="text-sm text-muted-foreground">Esta tienda aún no tiene checklists.</p>
      )}
      {listas.map((l) => {
        const hechos = l.items.filter((i) => i.hecho).length;
        return (
          <section key={l.id} className="rounded-2xl border border-line bg-surface shadow-card">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold">{l.nombre}</h3>
              <span className="text-xs text-muted-foreground tabular">
                {hechos}/{l.items.length}
              </span>
            </header>
            <ul className="divide-y divide-line">
              {l.items.map((i) => (
                <Elemento key={i.id} tienda={tienda} item={i} editable={editable} />
              ))}
            </ul>
            {editable && <NuevoElemento tienda={tienda} checklist={l.id} />}
          </section>
        );
      })}
      {editable && (
        <form
          className="flex flex-wrap gap-2"
          action={() =>
            iniciar(async () => {
              setError('');
              const r = await crearChecklist(tienda, nombre);
              if (r.error !== undefined) return setError(r.error);
              setNombre('');
              router.refresh();
            })
          }
        >
          <label className="sr-only" htmlFor="nueva-lista">
            Nombre de la nueva lista
          </label>
          <input
            id="nueva-lista"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            placeholder="Nueva lista (p. ej. Apertura)"
            className={`${claseCampo} max-w-xs`}
          />
          <Button type="submit" variant="outline" disabled={pendiente || !nombre.trim()}>
            <Plus aria-hidden="true" /> Crear lista
          </Button>
          {error && (
            <p role="alert" className="w-full text-sm text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
