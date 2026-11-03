import Link from 'next/link';
import {
  AREAS,
  ETIQUETA_VENCIMIENTO,
  type CardPipeline,
  type EtapaGeneral,
} from '@/lib/crm/unificado/modelo';
import { BandejaAvisos } from '@/components/crm/unificado/avisos';
import { ChipEtapa } from '@/components/crm/unificado/card-pipeline';
import {
  Avatar,
  Chip,
  FichaFecha,
  Medidor,
  PanelCifras,
  Seccion,
  VacioBreve,
} from '@/components/crm/unificado/piezas';
import type { Aviso, ClaveArea, VencimientoCard } from '@/lib/crm/tipos';

export interface DatosPendientes {
  etapas: EtapaGeneral[];
  avisos: Aviso[];
  vencidos: (VencimientoCard & { dias: number })[];
  porValidar: CardPipeline[];
  totalPorValidar: number;
  listas: CardPipeline[];
  totalListas: number;
  bloqueadas: number;
  propias: CardPipeline[];
  areas: ClaveArea[];
  todas: boolean;
}

const VISIBLES = 6;

/** Fila compacta de card: quién, en qué etapa y cuánto le falta. */
export function FilaCard({ card, etapa }: { card: CardPipeline; etapa?: EtapaGeneral }) {
  return (
    <Link
      // rutaCard vive en un módulo de cliente: no se puede llamar desde el servidor.
      href={
        card.tipo === 'franquiciatario' ? `/crm/franquiciatarios/${card.id}` : `/crm/sucursales/${card.id}`
      }
      className="flex items-center gap-3 rounded-xl border border-transparent p-2 hover:border-line hover:bg-surface-2/60"
    >
      <Avatar nombre={card.nombre} area={etapa?.area} tam={34} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{card.nombre}</span>
          {card.ciudad && <span className="truncate text-xs text-muted-foreground">{card.ciudad}</span>}
        </span>
        {etapa && <ChipEtapa etapa={etapa} />}
      </span>
      {card.requisitos.total > 0 && (
        <span className="w-16 shrink-0 space-y-1 text-right">
          <Medidor listos={card.requisitos.listos} total={card.requisitos.total} />
          <span className="block text-[11px] tabular text-muted-foreground">
            {card.liberado ? 'liberada' : `${card.requisitos.listos}/${card.requisitos.total}`}
          </span>
        </span>
      )}
    </Link>
  );
}

function ListaCards({
  cards,
  total,
  etapas,
  vacio,
}: {
  cards: CardPipeline[];
  total: number;
  etapas: EtapaGeneral[];
  vacio: string;
}) {
  if (!cards.length) return <VacioBreve>{vacio}</VacioBreve>;
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  return (
    <>
      <ul role="list" className="-mx-2 space-y-1">
        {cards.slice(0, VISIBLES).map((c) => (
          <li key={`${c.tipo}-${c.id}`}>
            <FilaCard card={c} etapa={etapaDe.get(c.etapaId)} />
          </li>
        ))}
      </ul>
      {total > VISIBLES && (
        <p className="mt-2 text-xs text-muted-foreground">
          y {(total - VISIBLES).toLocaleString('es-MX')} más.{' '}
          <Link href="/crm/pipeline" className="font-semibold text-crema-strong hover:underline">
            Verlas en el Pipeline
          </Link>
        </p>
      )}
    </>
  );
}

/** Bandeja del usuario en recuadros: avisos y vencimientos arriba, luego validar, mover y dar seguimiento. */
export function VistaPendientes(d: DatosPendientes) {
  return (
    <>
      <PanelCifras
        cifras={[
          {
            etiqueta: 'Avisos sin atender',
            valor: d.avisos.length,
            tono: d.avisos.length ? 'warn' : undefined,
          },
          { etiqueta: 'Requisitos por validar', valor: d.totalPorValidar, nota: 'los registró otra persona' },
          { etiqueta: 'Listas para avanzar', valor: d.totalListas, tono: 'ok', nota: 'en etapas de tu área' },
          { etiqueta: 'Bloqueadas', valor: d.bloqueadas, tono: 'bad', nota: 'en etapas de tu área' },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion
          titulo="Avisos sin atender"
          contador={d.avisos.length}
          descripcion="COF a 2 meses, 5 días hábiles antes de abrir y límite de 120 días."
          cuerpo={false}
        >
          <BandejaAvisos avisos={d.avisos} areas={d.areas} todas={d.todas} />
        </Seccion>
        <Seccion titulo="Vencen en 7 días o ya vencieron" contador={d.vencidos.length}>
          {d.vencidos.length ? (
            <ul role="list" className="grid gap-2 sm:grid-cols-2">
              {d.vencidos.map((v) => (
                <li key={`${v.tipo}-${v.tienda_id}`}>
                  <Link
                    href={`/crm/sucursales/${v.tienda_id}`}
                    className="flex items-center gap-3 rounded-xl border border-line p-2 hover:border-line-strong"
                  >
                    <FichaFecha fecha={v.fecha} tono={v.dias < 0 ? 'bad' : 'warn'} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{v.nombre}</span>
                      <Chip color={AREAS[v.area].color} className="mt-1">
                        {ETIQUETA_VENCIMIENTO[v.tipo] ?? v.tipo}
                      </Chip>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <VacioBreve>Nada vence esta semana.</VacioBreve>
          )}
        </Seccion>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Seccion
          titulo="Por validar"
          contador={d.totalPorValidar}
          descripcion="Revisa y valida lo que registró otra persona."
        >
          <ListaCards
            cards={d.porValidar}
            total={d.totalPorValidar}
            etapas={d.etapas}
            vacio="No hay requisitos esperando tu validación."
          />
        </Seccion>
        <Seccion
          titulo="Listas para avanzar"
          contador={d.totalListas}
          descripcion="Tienen todo validado o el candado liberado."
        >
          <ListaCards
            cards={d.listas}
            total={d.totalListas}
            etapas={d.etapas}
            vacio="Ninguna card de tu área está lista todavía."
          />
        </Seccion>
        <Seccion
          titulo="Mis leads como vendedor"
          contador={d.propias.length}
          descripcion="Franquiciatarios a tu nombre (etapas 1–5)."
        >
          <ListaCards
            cards={d.propias}
            total={d.propias.length}
            etapas={d.etapas}
            vacio="No tienes leads asignados."
          />
        </Seccion>
      </div>
    </>
  );
}
