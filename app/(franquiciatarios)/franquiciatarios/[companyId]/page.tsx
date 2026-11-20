import Link from 'next/link';
import { Activity, BellRing, ReceiptText } from 'lucide-react';
import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas, leerDia } from '@/lib/franquiciatarios/servidor';
import { diaOperacion } from '@/lib/franquiciatarios/dia';
import { Encabezado } from '@/components/portal/piezas';
import { ResumenDia } from '@/components/franquiciatarios/resumen-dia';
import { Incidencias } from '@/components/franquiciatarios/incidencias';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaLargo } from '@/components/franquiciatarios/formato';

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
          titulo="Ventas y pedidos"
          texto="Venta del día con el desglose de cada pedido."
        />
        <Acceso
          href={`${base}/tira`}
          icono={ReceiptText}
          titulo="Tira de venta"
          texto="Resumen del día para imprimir o guardar en PDF."
        />
        {c.gestor && (
          <Acceso
            href={`${base}/avisos`}
            icono={BellRing}
            titulo="Avisos e historial"
            texto={
              noes + dia.incidencias.length > 0
                ? `Hoy: ${noes} «No» y ${dia.incidencias.length} incidencias.`
                : 'Sin «No» ni incidencias hoy.'
            }
            alerta={noes + dia.incidencias.length > 0}
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
  titulo,
  texto,
  alerta = false,
}: {
  href: string;
  icono: typeof Activity;
  titulo: string;
  texto: string;
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${alerta ? 'bg-bad-soft text-bad' : 'bg-surface-2 text-ink'}`}
      >
        <Icono size={18} aria-hidden="true" />
      </span>
      <span>
        <span className="block font-display font-bold">{titulo}</span>
        <span className={`text-sm ${alerta ? 'font-medium text-bad' : 'text-muted-foreground'}`}>
          {texto}
        </span>
      </span>
    </Link>
  );
}
