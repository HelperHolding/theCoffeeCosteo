'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThinkingOrb } from 'thinking-orbs';
import { X, ArrowUp, Square, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enlacePortal, MAX_TURNOS } from '@/lib/chat/entrada';
import { estadoOrbe, pasosDe, sugerenciasPara } from '@/lib/chat/orbes';
import type { IdAgente } from '@/lib/chat/agentes';

const transporte = (api: string) =>
  new DefaultChatTransport({
    api,
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        messages: messages
          .map(({ role, parts }) => ({
            role,
            parts: parts.filter((p) => p.type === 'text').map((p) => ({ type: 'text', text: p.text })),
          }))
          .filter((m) => m.parts.length),
      },
    }),
    fetch: async (input, init) => {
      const r = await fetch(input, init);
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo conectar con el asistente.');
      }
      return r;
    },
  });
// Mismo diseño, distinto agente: cada módulo tiene su endpoint, reglas y consultas.
const perfiles: Record<
  IdAgente,
  { nombre: string; transport: ReturnType<typeof transporte>; saludo: string; ayuda: string; campo: string }
> = {
  costeo: {
    nombre: 'Barista',
    transport: transporte('/api/chat'),
    saludo: '¿Qué quieres revisar hoy?',
    ayuda:
      'Pregunta por costos, márgenes, recetas o alertas. Consulta los datos del portal; no modifica nada.',
    campo: 'Pregunta sobre tus costos…',
  },
  crm: {
    nombre: 'Concierge',
    transport: transporte('/api/chat/crm'),
    saludo: '¿Qué cliente quieres revisar?',
    ayuda:
      'Pregunta cómo va una tienda, qué le falta, sus tareas o quién la modificó. Solo lee el CRM; no mueve ni modifica nada.',
    campo: 'Pregunta sobre tiendas, tareas o prospectos…',
  },
};

export function Agente({
  abierto,
  alCerrar,
  modulo = 'costeo',
}: {
  abierto: boolean;
  alCerrar: () => void;
  modulo?: IdAgente;
}) {
  const cfg = perfiles[modulo];
  const [entrada, setEntrada] = useState('');
  const [titulo, setTitulo] = useState<string>();
  const ruta = usePathname();
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    id: modulo,
    transport: cfg.transport,
  });
  const ocupado = status === 'submitted' || status === 'streaming';
  const turnos = messages.filter((m) => m.role === 'user').length;
  const limite = turnos >= MAX_TURNOS;
  const campo = useRef<HTMLTextAreaElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const ultima = messages.at(-1);
  const partesActuales =
    ultima?.role === 'assistant' ? (ultima.parts as { type: string; state?: string }[]) : [];
  const orbe = error
    ? { estado: 'breathing' as const, texto: 'Sin conexión' }
    : estadoOrbe(status, partesActuales);
  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);
  useEffect(() => {
    setTitulo(document.querySelector('main h1')?.textContent ?? undefined);
  }, [ruta, abierto]);
  useEffect(() => {
    if (abierto) fondo.current?.scrollIntoView({ block: 'nearest' });
  }, [abierto, messages, status]);
  const enviar = (texto: string) => {
    if (!texto.trim() || ocupado || limite) return;
    clearError();
    setEntrada('');
    void sendMessage({ text: texto.trim() });
  };
  if (!abierto) return null;
  return (
    <aside
      role="complementary"
      aria-labelledby="agente-titulo"
      onKeyDown={(e) => {
        if (e.key === 'Escape') alCerrar();
      }}
      className="fixed inset-0 z-50 flex flex-col bg-surface print:hidden lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:border-l lg:border-line lg:shadow-[-12px_0_32px_-24px_rgb(17_17_17/0.35)]"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid size-10 place-items-center rounded-xl bg-paper">
          <ThinkingOrb
            key={orbe.estado}
            state={orbe.estado}
            size={20}
            theme="light"
            aria-label={orbe.texto}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="agente-titulo" className="leading-tight">
            {cfg.nombre}
          </h2>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {orbe.texto} · Claude, solo lectura
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Nueva conversación"
          disabled={ocupado || !messages.length}
          onClick={() => {
            setMessages([]);
            clearError();
            setEntrada('');
            campo.current?.focus();
          }}
        >
          <RotateCcw size={16} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar asistente" onClick={alCerrar}>
          <X size={18} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5" aria-label="Conversación">
        {!messages.length && (
          <div className="flex flex-col items-center pt-6 text-center">
            <div className="grid size-28 place-items-center rounded-full bg-paper">
              <ThinkingOrb state="breathing" size={64} theme="light" aria-hidden />
            </div>
            <p className="mt-5 font-display text-lg font-bold">{cfg.saludo}</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{cfg.ayuda}</p>
            <div className="mt-6 flex w-full flex-col gap-2">
              {sugerenciasPara(ruta, titulo).map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm shadow-card transition-[border-color,transform] hover:-translate-y-px hover:border-crema"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, idx) => {
          const pasos = m.role === 'assistant' ? pasosDe(m.parts as { type: string; state?: string }[]) : [];
          const enCurso = idx === messages.length - 1 && ocupado;
          return m.role === 'user' ? (
            <article
              key={m.id}
              className="ml-10 rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm text-white"
            >
              {m.parts.map((p, i) => (p.type === 'text' ? <p key={i}>{p.text}</p> : null))}
            </article>
          ) : (
            <article key={m.id} className="space-y-3">
              {pasos.length > 0 && (
                <ol className="space-y-1.5 rounded-xl border border-line bg-paper/60 px-3 py-2.5 text-xs">
                  {pasos.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center">
                        {p.listo || !enCurso ? (
                          <Check size={14} className="text-ok" aria-label="Hecho" />
                        ) : (
                          <ThinkingOrb state={p.estado} size={20} theme="light" aria-hidden />
                        )}
                      </span>
                      <span
                        className={p.listo || !enCurso ? 'text-muted-foreground' : 'font-medium text-ink'}
                      >
                        {p.texto}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {m.parts.map((p, i) =>
                p.type === 'text' ? (
                  <div className="chat-respuesta text-sm leading-relaxed" key={i}>
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      urlTransform={(url) => enlacePortal(url) || ''}
                      components={{
                        img: () => null,
                        a: ({ href, children }) =>
                          enlacePortal(href) ? (
                            <Link href={href!} className="font-semibold text-crema-strong underline">
                              {children}
                            </Link>
                          ) : (
                            <span>{children}</span>
                          ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto rounded-lg border border-line">
                            <table>{children}</table>
                          </div>
                        ),
                      }}
                    >
                      {p.text}
                    </Markdown>
                  </div>
                ) : null,
              )}
            </article>
          );
        })}
        {status === 'submitted' && (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Pensando…
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error.message}
          </p>
        )}
        {limite && !ocupado && (
          <p role="status" className="text-sm">
            Inicia una nueva conversación para seguir consultando.
          </p>
        )}
        <div ref={fondo} />
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(entrada);
        }}
      >
        <div className="rounded-2xl border border-line-strong bg-surface p-2 shadow-card focus-within:border-crema focus-within:ring-[3px] focus-within:ring-crema/20">
          <label className="sr-only" htmlFor="chat-pregunta">
            Tu consulta
          </label>
          <textarea
            id="chat-pregunta"
            ref={campo}
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            maxLength={2000}
            rows={2}
            disabled={ocupado || limite}
            placeholder={cfg.campo}
            className="!border-0 !shadow-none !p-1.5 resize-none text-sm disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar(entrada);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 pl-1.5">
            <p className="text-[11px] text-muted-foreground">
              {turnos}/{MAX_TURNOS} consultas · Historial temporal
            </p>
            {ocupado ? (
              <Button type="button" size="icon-sm" aria-label="Detener" onClick={() => void stop()}>
                <Square size={13} />
              </Button>
            ) : (
              <Button
                type="submit"
                variant="accent"
                size="icon-sm"
                aria-label="Enviar"
                disabled={!entrada.trim() || limite}
              >
                <ArrowUp size={16} />
              </Button>
            )}
          </div>
        </div>
      </form>
    </aside>
  );
}
