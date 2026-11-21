import Link from 'next/link';
import { Activity, BellRing, BookOpen, ReceiptText, Timer, Truck } from 'lucide-react';
import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas, leerDia } from '@/lib/franquiciatarios/servidor';
import { diaOperacion } from '@/lib/franquiciatarios/dia';
import { Encabezado } from '@/components/portal/piezas';
import { ResumenDia } from '@/components/franquiciatarios/resumen-dia';
import { Incidencias } from '@/components/franquiciatarios/incidencias';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaLargo } from '@/components/franquiciatarios/formato';
import { TONO, type Tono } from '@/components/franquiciatarios/colores';
import { cn } from 'cn';

export default async function Hoy({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const base = `/franquiciatarios/${c.companyId}`;
  const hoy = diaOperacion();
  const [dia, baristas] = await Promise.all([
    leerDia(c.db, c.companyId, hoy),
    leerBaristas(c.db, c.companyId),
  ]);
  const elegido = c.rol === 'barista' ? await baristaElegido(baristas, c.companyId) : null;
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Hoy"
      descripcion={
        <span className="first-letter:uppercase">{diaLargo(hoy)} · día de operación (cambia a las 4:00)</span>
      }
    />
  );

  // Cuenta de baristas: primero se declara quién usa el dispositivo.
  if (c.rol === 'barista' && !elegido)
    return (
      <>
        {encabezado}
        <QuienEres companyId={c.companyId} nombres={baristas.filter((b) => b.activo)} />
      </>
    );

  const noes = dia.secciones.reduce((n, s) => n + s.noes, 0);
  const atrasos = dia.secciones.reduce((n, s) => n + s.atrasos, 0);
  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      <section aria-labelledby="checklists" className="space-y-3">
        <h2 id="checklists" className="text-lg">
          Checklists del turno
        </h2>
        <ResumenDia dia={dia} base={base} />
      </section>
      <nav aria-label="Accesos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Acceso
          href={`${base}/ventas`}
          icono={Activity}
          tono="ventas"
          titulo="Ventas y pedidos"
          texto="Venta del día con el desglose de cada pedido."
        />
        <Acceso
          href={`${base}/tira`}
          icono={ReceiptText}
          tono="tira"
          titulo="Tira de venta"
          texto="Resumen del día para imprimir o guardar en PDF."
        />
        <Acceso
          href={`${base}/recetas`}
          icono={BookOpen}
          tono="durante"
          titulo="Recetas"
          texto="Insumos y cantidades de cada producto por tamaño."
        />
        {c.gestor && (
          <Acceso
            href={`${base}/pedidos`}
            icono={Truck}
            tono="pedidos"
            titulo="Pedidos"
            texto="Lo pedido a la Comercializadora y su recepción."
          />
        )}
        {c.gestor && (
          <Acceso
            href={`${base}/servicio`}
            icono={Timer}
            tono="cambio"
            titulo="Tiempo de preparación"
            texto="Cocina demorada y espera del repartidor según Rappi."
          />
        )}
        {c.gestor && (
          <Acceso
            href={`${base}/avisos`}
            icono={BellRing}
            tono={noes + dia.incidencias.length + atrasos > 0 ? 'alerta' : 'incidencia'}
            titulo="Avisos e historial"
            texto={
              noes + dia.incidencias.length + atrasos > 0
                ? `Hoy: ${noes} «No», ${dia.incidencias.length} incidencias${atrasos ? ` y ${atrasos} rondas atrasadas` : ''}.`
                : 'Sin «No», incidencias ni rondas atrasadas hoy.'
            }
            alerta={noes + dia.incidencias.length + atrasos > 0}
          />
        )}
      </nav>
      <Incidencias companyId={c.companyId} incidencias={dia.incidencias} editable />
    </>
  );
}

function Acceso({
  href,
  icono: Icono,
  tono,
  titulo,
  texto,
  alerta = false,
}: {
  href: string;
  icono: typeof Activity;
  tono: Tono;
  titulo: string;
  texto: string;
  alerta?: boolean;
}) {
  const t = TONO[tono];
  return (
    <Link
      href={href}
      className={cn(
        'flex items-start gap-4 rounded-2xl border p-5 shadow-card transition-[border-color,box-shadow] hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45',
        t.brillo,
        t.borde,
      )}
    >
      <span
        className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground', t.marca)}
      >
        <Icono size={18} aria-hidden="true" />
      </span>
      <span>
        <span className="block font-display font-bold">{titulo}</span>
        <span className={`text-sm ${alerta ? 'font-medium text-bad' : 'text-ink-2'}`}>{texto}</span>
      </span>
    </Link>
  );
}
