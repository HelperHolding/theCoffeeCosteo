'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThinkingOrb } from 'thinking-orbs';
import { LogOut, Menu, Search, X, Coffee, Layers } from 'lucide-react';
import { Navegacion, grupos } from './navegacion';
import { Marca } from './marca';
import { Agente } from './agente';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { salir } from '@/app/(auth)/login/actions';

type Receta = { id: string; nombre: string; tipo: string };

export function Marco({
  perfil,
  recetas,
  children,
}: {
  perfil: { nombre: string; rol: string };
  recetas: Receta[];
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [buscador, setBuscador] = useState(false);
  const [agente, setAgente] = useState(false);
  const router = useRouter();
  const ruta = usePathname();
  useEffect(() => setMenu(false), [ruta]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscador((v) => !v);
      }
      if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAgente((v) => !v);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  const ir = (href: string) => {
    setBuscador(false);
    router.push(href);
  };

  const lateral = (
    <div className="flex h-full flex-col gap-7 px-5 py-6">
      <Link href="/" aria-label="The Coffee · Tablero" className="flex items-center gap-3">
        <Marca negativo className="size-14 -my-2 -ml-2" />
        <span className="border-l border-white/15 pl-3 text-[10px] font-semibold uppercase leading-relaxed tracking-[.24em] text-neutral-400">
          Portal de
          <br />
          costeos
        </span>
      </Link>
      <Suspense>
        <Navegacion alNavegar={() => setMenu(false)} />
      </Suspense>
      <div className="flex-1" />
      <div className="flex items-center gap-3 rounded-xl bg-white/[.05] p-3 text-sm">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-crema font-display font-bold text-ink">
          {perfil.nombre.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{perfil.nombre}</p>
          <p className="capitalize text-xs text-neutral-400">{perfil.rol}</p>
        </div>
        <form action={salir}>
          <button
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div
      className={`min-h-screen lg:grid ${agente ? 'lg:grid-cols-[248px_minmax(0,1fr)_400px]' : 'lg:grid-cols-[248px_minmax(0,1fr)]'}`}
    >
      <aside className="hidden bg-ink lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        {lateral}
      </aside>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Menú">
          <button
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMenu(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] overflow-y-auto bg-ink shadow-2xl">
            {lateral}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <div className="sticky top-0 z-30 border-b border-line/80 bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 md:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menú"
              onClick={() => setMenu(true)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </Button>
            <Link href="/" className="lg:hidden" aria-label="The Coffee">
              <Marca className="size-11" />
            </Link>
            <button
              onClick={() => setBuscador(true)}
              aria-label="Buscar"
              className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface text-sm text-muted-foreground shadow-card transition-colors hover:border-ink/30 sm:w-full sm:max-w-sm sm:justify-start sm:px-3 lg:ml-0"
            >
              <Search size={16} aria-hidden="true" />
              <span className="hidden flex-1 text-left sm:inline">Buscar producto, insumo o pantalla…</span>
              <kbd className="hidden rounded-md border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px] sm:inline">
                Ctrl K
              </kbd>
            </button>
            <Button
              variant={agente ? 'secondary' : 'default'}
              onClick={() => setAgente((v) => !v)}
              aria-expanded={agente}
              className="shrink-0 rounded-full pl-2 sm:ml-auto"
            >
              <span className="grid size-7 place-items-center rounded-full bg-white">
                <ThinkingOrb state="breathing" size={20} theme="light" aria-hidden />
              </span>
              <span className="hidden sm:inline">Consultar</span>
              <kbd className="hidden rounded border border-white/20 px-1 text-[10px] font-normal opacity-70 md:inline">
                Ctrl J
              </kbd>
            </Button>
          </div>
        </div>
        <main className="mx-auto w-full min-w-0 max-w-[1400px] space-y-7 px-4 py-7 md:px-8 md:py-9">
          {children}
        </main>
      </div>

      <Agente abierto={agente} alCerrar={() => setAgente(false)} />

      <CommandDialog
        open={buscador}
        onOpenChange={setBuscador}
        title="Buscar"
        description="Ir a una pantalla o receta"
      >
        <CommandInput placeholder="Escribe un producto, sub-receta o pantalla…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Pantallas">
            {grupos.flatMap((g) =>
              g.enlaces.map(({ href, nombre, icono: Icono }) => (
                <CommandItem key={href} value={`pantalla ${nombre}`} onSelect={() => ir(href)}>
                  <Icono aria-hidden="true" /> {nombre}
                </CommandItem>
              )),
            )}
          </CommandGroup>
          <CommandGroup heading="Recetas">
            {recetas.map((r) => (
              <CommandItem
                key={r.id}
                value={`${r.nombre} ${r.id}`}
                onSelect={() => ir(`/${r.tipo === 'producto' ? 'productos' : 'subrecetas'}/${r.id}`)}
              >
                {r.tipo === 'producto' ? <Coffee aria-hidden="true" /> : <Layers aria-hidden="true" />}
                {r.nombre}
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.tipo === 'producto' ? 'Producto' : 'Sub-receta'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
