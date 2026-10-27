import type { CosteoProducto, CosteoResumen, MotivoParcial } from '@/lib/sucursales/costeo';
import { Tarjeta } from '@/components/portal/piezas';
import { ConInfo } from '@/components/portal/con-info';
import { infoCosteo } from './info-tableros';
import { dinero, numero, porcentaje } from './formato';

/** Lectura de los costos en hora local del navegador (solo para el rótulo). */
const leido = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

const MOTIVOS: Record<MotivoParcial, string> = {
  tamano: 'tamaño sin verificar',
  personalizacion: 'con personalización (sin catálogo de costos)',
  costo: 'sin costo disponible o con insumo inactivo',
};

function Dato({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/**
 * Cobertura y costeo del periodo con el costo ACTUAL de Costeo. Solo se monta si la respuesta trae `costeo`
 * (el servidor decide si el usuario puede ver costos).
 */
export function TarjetaCosteo({ c, moneda }: { c: CosteoResumen; moneda: string }) {
  const cob = c.cobertura;
  const motivos = (Object.keys(MOTIVOS) as MotivoParcial[]).filter((k) => c.parcial.motivos[k] > 0);
  return (
    <ConInfo info={infoCosteo(c, moneda)}>
      <Tarjeta
        titulo="Costeo · calculado con el costo actual de Costeo"
        descripcion={`Costos leídos el ${leido(c.leidoEn)}. Son los costos de hoy aplicados al periodo: no es el margen histórico real.`}
      >
        <div className="space-y-5 text-sm">
          <section>
            <p className="mb-2 font-semibold">Cobertura de la venta con receta de Costeo</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Dato
                etiqueta="Venta con receta enlazada"
                valor={dinero(cob.conRecetaCent, moneda)}
                nota={`${numero(c.completo.lineas + c.parcial.lineas)} líneas`}
              />
              <Dato
                etiqueta="Sobre toda la venta (A)"
                valor={porcentaje(cob.sobreTotal)}
                nota={`A = ${dinero(cob.totalCent, moneda)}`}
              />
              <Dato
                etiqueta="Sobre la venta identificable (B = A − Generic)"
                valor={porcentaje(cob.sobreIdentificable)}
                nota={`B = ${dinero(cob.identificableCent, moneda)}`}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Fuera de la cobertura: Generic {dinero(cob.genericoCent, moneda)} (excluido de B: no identifica
              producto) · sin código {dinero(cob.sinCodigoCent, moneda)} · código sin enlace{' '}
              {dinero(cob.sinEnlaceCent, moneda)}.
            </p>
          </section>

          <section>
            <p className="mb-2 font-semibold">Costeo completo (entra al margen)</p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Dato
                etiqueta="Líneas (unidades)"
                valor={numero(c.completo.lineas)}
                nota={dinero(c.completo.importeCent, moneda) + ' cobrados'}
              />
              <Dato etiqueta="Venta sin IVA" valor={dinero(c.completo.ventaSinIvaCent, moneda)} />
              <Dato etiqueta="Costo actual" valor={dinero(c.completo.costoCent, moneda)} />
              <Dato
                etiqueta="Margen bruto teórico"
                valor={dinero(c.completo.margenCent, moneda)}
                nota={porcentaje(c.completo.margenPct) + ' de la venta sin IVA'}
              />
            </div>
          </section>

          <section>
            <p className="mb-2 font-semibold">Costeo parcial (excluido del margen)</p>
            <p>
              {numero(c.parcial.lineas)} líneas · {dinero(c.parcial.importeCent, moneda)} cobrados
              {motivos.length > 0 &&
                ' — ' + motivos.map((k) => `${numero(c.parcial.motivos[k])} ${MOTIVOS[k]}`).join(' · ')}
            </p>
          </section>

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Una línea del POS es una unidad. Solo es de costeo completo si su tamaño está verificado para
              ese producto y no lleva personalizaciones.
            </li>
            <li>
              Margen bruto teórico = importe cobrado ÷ {(1 + c.iva).toFixed(2)} (sin IVA) − costo de la
              receta, antes de comisiones. <strong>Provisional</strong>: Compras aún debe confirmar si los
              costos de insumos se capturan con o sin IVA; si incluyen IVA, el costo está sobrestimado y el
              margen subestimado.
            </li>
            <li>Los nombres e importes de la API se muestran sin cambios; el costeo va aparte.</li>
          </ul>
        </div>
      </Tarjeta>
    </ConInfo>
  );
}

/** Celda de la tabla de productos: receta de Costeo y estado del costeo de sus líneas. */
export function CeldaCosteo({
  c,
  moneda,
  generico = false,
}: {
  c?: CosteoProducto;
  moneda: string;
  generico?: boolean;
}) {
  if (generico) return <span className="text-xs text-muted-foreground">excluido (Generic, fuera de B)</span>;
  if (!c) return <span className="text-xs text-muted-foreground">sin enlace a receta</span>;
  const total = c.completo.lineas + c.parcial.lineas;
  return (
    <span className="block text-xs">
      <span className="font-medium">{c.receta}</span>
      <span className="block text-muted-foreground">
        {c.parcial.lineas === 0
          ? `completo · margen ${dinero(c.completo.margenCent, moneda)}`
          : c.completo.lineas === 0
            ? 'costeo parcial'
            : `completo ${numero(c.completo.lineas)} de ${numero(total)} · margen ${dinero(c.completo.margenCent, moneda)}`}
      </span>
    </span>
  );
}
