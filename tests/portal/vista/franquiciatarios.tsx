import { useEffect, useReducer } from 'react';
import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { Checklist } from '../../../components/franquiciatarios/checklist';
import { ResumenDia } from '../../../components/franquiciatarios/resumen-dia';
import { Incidencias } from '../../../components/franquiciatarios/incidencias';
import { NombreDeclarado, QuienEres } from '../../../components/franquiciatarios/quien-eres';
import { Equipo } from '../../../components/franquiciatarios/equipo';
import { Avisos } from '../../../components/franquiciatarios/avisos';
import { VentasFranq } from '../../../components/franquiciatarios/ventas';
import { TiraVenta } from '../../../components/franquiciatarios/tira';
import { diaLargo } from '../../../components/franquiciatarios/formato';
import { armarDia, diaOperacion } from '../../../lib/franquiciatarios/dia';
import type {
  FranqAviso,
  FranqPunto,
  FranqSeccion,
  SeccionClave,
  TipoFirma,
} from '../../../lib/franquiciatarios/tipos';
import { configDe } from '../../../lib/sucursales/config';
import { construirTira, sinDatosSensibles } from '../../../lib/franquiciatarios/ventas';
import { enZona, sumarDias } from '../../../lib/sucursales/tiempo';
import { tienda } from './franq-acciones';
import { PropuestaGerente } from './propuesta-gerente';
import { VerComo } from '../../../components/franquiciatarios/ver-como';
import { PedidosFranq } from '../../../components/franquiciatarios/pedidos';
import { ConteoFranq } from '../../../components/franquiciatarios/conteo';
import { InventarioFranq } from '../../../components/franquiciatarios/inventario';
import { armarHistorial } from '../../../lib/franquiciatarios/conteos';
import { ArqueoCaptura, CajaChica, ConfigCaja, ResumenCaja } from '../../../components/franquiciatarios/caja';
import { gastosEfectivoHasta, gastosVigentes, resumenArqueo } from '../../../lib/franquiciatarios/caja';
import type { CajaDia } from '../../../lib/franquiciatarios/caja-servidor';
import { armarPedidos } from '../../../lib/franquiciatarios/pedidos';

/**
 * Franquiciatarios con DATOS SINTÉTICOS (sin Auth ni base): las acciones corren contra un estado en memoria con las
 * reglas de las migraciones 75 y 79; ventas y tira usan el pipeline real de Sucursales sobre el fetch falso del arnés.
 * ?franquiciatarios&vista=hoy|checklist|ventas|tira|pedidos|conteo|inventario|equipo|avisos&rol=barista|gerente|franquiciatario
 * &momento=apertura|medio (conteo); vista=caja (arqueo ciego; gerencia ve cuadre, caja chica y fondo); &sinlista=1 (inventario sin lista: botón de sugerido)
 * &estado=vacio|curso|no|firmado&elegido=1&seccion=apertura|durante|medio|cierre&sinred=1
 */
const p = new URLSearchParams(window.location.search);
const vista = p.get('vista') ?? 'hoy';
const estado = p.get('estado') ?? 'curso';
const seccionPedida = (p.get('seccion') ?? 'apertura') as SeccionClave;
tienda.rol = (p.get('rol') ?? 'barista') as typeof tienda.rol;
tienda.sinRed = p.get('sinred') === '1';
tienda.dia = diaOperacion();

// Plantilla v2 (la misma de la migración 79: rutina de turno del PDF de Operaciones).
type PuntoArnes = {
  a: string;
  e: string;
  tipo?: 'recurrente';
  cada?: number;
  margen?: number;
  dato?: string;
  corte?: 'parcial' | 'dia';
};
const PLANTILLA: [SeccionClave, string, TipoFirma[], PuntoArnes[]][] = [
  [
    'apertura',
    'Apertura',
    ['responsable'],
    [
      { a: 'Encender equipos', e: 'Maquinaria · espresso y periféricos: encendido y calibración térmica' },
      {
        a: 'Revisar etiquetas y caducidades',
        e: 'Inocuidad · control de insumos: fechas de vencimiento revisadas',
        dato: 'Qué caduca hoy o mañana (o «nada»)',
      },
      { a: 'Hacer PEPS', e: 'Inventario · almacenamiento: rotación de leche, granos y jarabes' },
      {
        a: 'Colocar sanitizantes',
        e: 'Higiene · estaciones de trabajo: soluciones desinfectantes preparadas',
      },
      { a: 'Verificar limpieza de tienda', e: 'Imagen · salón y barra: superficies e insumos limpios' },
      {
        a: 'Revisar existencias y actualizar tabletas',
        e: 'Digital · stock y POS: conteo rápido y sincronización en App/POS',
      },
      {
        a: 'Realizar conteos y llenar bitácoras',
        e: 'Inventario · registro: insumos críticos capturados',
        dato: 'Insumos críticos contados',
      },
      { a: 'Encender música', e: 'Ambiente · experiencia de cliente: playlist y volumen oficial' },
    ],
  ],
  [
    'durante',
    'Durante la operación',
    [],
    [
      {
        a: 'Reabastecer barra',
        e: 'Logística · insumos de barra: desechables, leches y café; según demanda',
        tipo: 'recurrente',
      },
      {
        a: 'Hacer previas',
        e: 'Preparación · mise en place: jarabes, toppings y bases; según consumo',
        tipo: 'recurrente',
      },
      {
        a: 'Hacer preparados',
        e: 'Producción · recetas base: mezclas estándar de la casa; por lote o demanda',
        tipo: 'recurrente',
        dato: 'Qué se preparó',
      },
      {
        a: 'Revisar cold brew',
        e: 'Calidad · bebidas frías: tiempo de extracción y nivel; cada 2 a 4 horas',
        tipo: 'recurrente',
        cada: 120,
        margen: 120,
        dato: 'Inicio de extracción y nivel',
      },
      {
        a: 'Cambiar sanitizantes',
        e: 'Higiene · inocuidad: reemplazo total de la solución; cada 2 horas',
        tipo: 'recurrente',
        cada: 120,
        margen: 15,
      },
      {
        a: 'Revisar baños',
        e: 'Servicio · experiencia de cliente: limpieza, papel y jabón; cada hora',
        tipo: 'recurrente',
        cada: 60,
        margen: 15,
      },
    ],
  ],
  [
    'medio',
    'Medio turno',
    ['entrega', 'recibe'],
    [
      { a: 'Limpieza de tienda', e: 'Mantenimiento · salón y barra: sanitización rápida de mesas y barra' },
      { a: 'Reabastecer barra', e: 'Logística · insumos: reabastecimiento general para el turno vespertino' },
      {
        a: 'Enviar corte de medio día',
        e: 'Administración · ventas: reporte de caja/POS generado y enviado',
        corte: 'parcial',
      },
      {
        a: 'Revisar y cambiar bolsas de basura',
        e: 'Higiene · residuos: botes vaciados y bolsas reemplazadas',
      },
      { a: 'Lavar loza', e: 'Sanidad · utensilios: loza acumulada lavada y desinfectada' },
      {
        a: 'Conteos',
        e: 'Inventario · control parcial: existencias de alto valor y rotación auditadas',
        dato: 'Insumos contados',
      },
      { a: 'Revisar baños', e: 'Servicio · mantenimiento: inspección profunda y limpieza' },
    ],
  ],
  [
    'cierre',
    'Fin de turno',
    ['responsable', 'visto_bueno'],
    [
      { a: 'Limpieza de equipos', e: 'Mantenimiento · maquinaria: purga, backflush de espresso y molinos' },
      { a: 'Lavar loza', e: 'Sanidad · utensilios: lavado total y secado de loza y jarras' },
      { a: 'Limpieza de áreas de preparación', e: 'Sanitización · superficies: barras y tarjas a fondo' },
      { a: 'Limpieza de tienda', e: 'Mantenimiento · general: pisos barridos y trapeados, salón barrido' },
      { a: 'Apagar música', e: 'Operaciones · cierre: sistema de audio desconectado' },
      { a: 'Apagar equipos', e: 'Mantenimiento · ahorro de energía: maquinaria desconectada' },
      {
        a: 'Enviar corte del día',
        e: 'Administración · conciliación: cierre de caja y métricas enviados',
        corte: 'dia',
      },
      { a: 'Revisar baños', e: 'Higiene · entrega de instalaciones: limpieza profunda y desinfección final' },
      { a: 'Apagar luces y guardar mobiliario', e: 'Seguridad · resguardo: terraza, mobiliario y luces' },
      { a: 'Sacar basura y cambiar bolsas', e: 'Residuos · sanidad: depósito final en contenedor externo' },
      { a: 'Cerrar', e: 'Seguridad · protocolo de entrega: accesos asegurados y alarma activada' },
    ],
  ],
];
const secciones: FranqSeccion[] = [];
const puntos: FranqPunto[] = [];
PLANTILLA.forEach(([clave, nombre, firmas, ps], i) => {
  secciones.push({ id: i + 1, plantilla_id: 2, clave, nombre, orden: i + 1, firmas });
  tienda.puntos[clave] = ps.map((_, j) => (i + 1) * 100 + j + 1);
  ps.forEach((x, j) => {
    const pt: FranqPunto = {
      id: (i + 1) * 100 + j + 1,
      seccion_id: i + 1,
      orden: j + 1,
      actividad: x.a,
      estandar: x.e,
      tipo: x.tipo ?? 'unico',
      cada_min: x.cada ?? null,
      margen_min: x.margen ?? null,
      dato: x.dato ?? null,
      corte: x.corte ?? null,
    };
    puntos.push(pt);
    tienda.meta[pt.id] = pt;
  });
});

// Pedidos sintéticos a la Comercializadora (forma del sitio viejo: items con sku, nombre, precio, cantidad).
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
const it = (
  sku: string,
  nombre: string,
  precio: number,
  cantidad: number,
  variante: string | null = null,
) => ({
  sku,
  nombre,
  precio: precio.toFixed(2),
  cantidad,
  variante,
});
tienda.pedidos = [
  {
    id: '04598135-cfcd-428c-96f8-4f9e8627bab4',
    apertura_id: '397',
    fecha_pedido: hace(0.2),
    status: 'enviado',
    monto: '3542.00',
    items: [
      it('INS-CAF-005', 'Café en Grano Kraft 250g', 122, 2),
      it('INS-BEB-009', 'Cocoa en Polvo Premium 1 Kg', 485, 1),
      it('INS-DES-008', 'Tapa Para Vasos Fríos Chico/Grande (1,000 Pzs)', 1200, 2),
      it('INS-LIM-018', 'Polvo Limpiador Cafiza Urnex 566g', 372, 1),
    ],
    items_editados: null,
    shopify_order_number: '#CMS3245',
  },
  {
    id: '1f48253a-28bf-4f73-9ef3-9b52cf3d89a7',
    apertura_id: '397',
    fecha_pedido: hace(7),
    status: 'recibido',
    monto: '12807.00',
    items: [
      it('INS-BEB-067', 'Isopure Vainilla Zero Carb 7.5 Lb', 2550, 1),
      it('INS-BEB-045', 'Matcha Orgánico 1kg', 1300, 1),
      it('INS-CAF-003', 'Café en Grano White 1.5 Kg', 600, 7),
      it('UNI-PLA-023', 'Playera Unisex Manga Larga Negra', 152, 1, 'M'),
    ],
    items_editados: null,
    shopify_order_number: '#CMS3178',
  },
  {
    id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    apertura_id: '397',
    fecha_pedido: hace(14),
    status: 'terminado',
    monto: '9870.50',
    items: [
      it('INS-LEC-001', 'Leche Entera 1 L (12 pzs)', 310, 12),
      it('INS-CAF-003', 'Café en Grano White 1.5 Kg', 600, 6),
    ],
    items_editados: null,
    shopify_order_number: '#CMS3101',
  },
];
if (estado !== 'vacio')
  tienda.recepciones.push({
    id: 1,
    company_id: 514,
    pedido_id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    folio: '#CMS3101',
    completo: false,
    diferencias: [{ nombre: 'Leche Entera 1 L (12 pzs)', sku: 'INS-LEC-001', pedido: 12, recibido: 10 }],
    observacion: 'Llegaron 10 cajas; se avisó a la Comercializadora',
    barista_id: 2,
    nombre: 'Beto Ruiz',
    registrado_por: 'cuenta',
    registrado_en: hace(13.8),
    sesion: 's',
    dispositivo: 'tablet',
  });

// Lista sugerida de Essentia (la misma que dio el ensayo de la migración 83) y conteos de la última semana.
const LISTA_SUGERIDA: [string, string][] = [
  ['Café Tostado En Grano White 1.5 Kg', 'paquete de 1500 gr'],
  ['Leche Deslactosadas', 'paquete de 1000 ml'],
  ['Chobani D.creamer Pumpkin Spice', 'paquete de 710 ml'],
  ['Leche Entera', 'paquete de 2000 ml'],
  ['Brioche Trenza', 'pza'],
  ['Pechuga De Pavo', 'paquete de 3000 gr'],
  ['Croissant Tradicional', 'pza'],
  ['Vaso Frío Pet 20 Oz (1,000 Pzs)', 'paquete de 1000 pza'],
  ['Vaso Frío Pet 14 Oz (1,000 Pzs)', 'paquete de 1000 pza'],
  ['Panque De Platano', 'pza'],
  ['Vaso Caliente Papel Kraft 12 Oz (1,000 Pzs)', 'paquete de 500 pza'],
  ['Tapa Frio Pet (1,000 Pzs)', 'paquete de 1000 pza'],
  ['Panqué De Limón', 'pza'],
  ['Vaso Caliente Papel Kraft 8 Oz (500 Pzs)', 'paquete de 500 pza'],
  ['Brownie', 'pza'],
  ['Queso Mozarella', 'paquete de 2270 gr'],
  ['Isopure', 'paquete de 3400 gr'],
  ['Leche Avena', 'paquete de 1000 ml'],
  ['Matcha Gourmet Orgánico 1 Kg', 'paquete de 1000 gr'],
  ['Bolsas Para Pan Paquete (1000 Piezas)', 'paquete de 1000 pza'],
];
const momentoConteo = p.get('momento') === 'medio' ? ('medio' as const) : ('apertura' as const);
if (p.get('sinlista') !== '1') {
  LISTA_SUGERIDA.forEach(([nombre, unidad], i) =>
    tienda.insumos.push({
      id: 700 + i,
      company_id: 514,
      insumo_id: null,
      nombre,
      unidad,
      orden: i + 1,
      activo: true,
      origen: 'sugerido',
      creado_por: 'g',
      creado_en: '2026-11-20T15:00:00Z',
      actualizado_por: null,
      actualizado_en: null,
    }),
  );
  let cid = 1;
  for (let d = 1; d <= 3; d++)
    for (const momento of ['apertura', 'medio'] as const)
      tienda.insumos.forEach((ins, i) =>
        tienda.conteos.push({
          id: cid++,
          company_id: 514,
          dia: sumarDias(diaOperacion(), -d),
          momento,
          insumo_id: ins.id,
          cantidad:
            Math.max(0, ((i * 7 + d * 3) % 12) - (momento === 'medio' ? 2 : 0)) + (i % 3 === 0 ? 0.5 : 0),
          barista_id: 1,
          nombre: 'Ana López',
          registrado_por: 'cuenta',
          registrado_en: `${sumarDias(diaOperacion(), -d)}T${momento === 'apertura' ? '13:10' : '20:30'}:00Z`,
          sesion: 's',
          dispositivo: 'tablet',
          corrige_id: null,
        }),
      );
}
// Caja sintética: fondo $1,500, tolerancia $20 y efectivo del POS que crece $90 por hora desde las 7:00 (CDMX).
function sembrarCaja() {
  if (estado === 'vacio') return;
  tienda.gastos.push(
    {
      id: 1,
      company_id: 514,
      dia: tienda.dia,
      concepto: '2 bolsas de hielo',
      categoria: 'insumos',
      monto: 80,
      en_efectivo: true,
      comprobante: true,
      nota: null,
      anula_id: null,
      nombre: 'Laura Méndez (gerente)',
      registrado_por: 'g',
      registrado_en: hora(10, 15),
      sesion: 's',
      dispositivo: 'tablet',
    },
    {
      id: 2,
      company_id: 514,
      dia: tienda.dia,
      concepto: 'Papel para ticket',
      categoria: 'papeleria',
      monto: 120,
      en_efectivo: true,
      comprobante: false,
      nota: null,
      anula_id: null,
      nombre: 'Laura Méndez (gerente)',
      registrado_por: 'g',
      registrado_en: hora(11, 0),
      sesion: 's',
      dispositivo: 'tablet',
    },
    {
      id: 3,
      company_id: 514,
      dia: tienda.dia,
      concepto: null,
      categoria: null,
      monto: null,
      en_efectivo: true,
      comprobante: false,
      nota: 'Se capturó doble',
      anula_id: 2,
      nombre: 'Laura Méndez (gerente)',
      registrado_por: 'g',
      registrado_en: hora(11, 5),
      sesion: 's',
      dispositivo: 'tablet',
    },
  );
  tienda.arqueos.push({
    id: 1,
    company_id: 514,
    dia: tienda.dia,
    momento: 'medio',
    contado: 2050,
    observacion: null,
    barista_id: 1,
    nombre: 'Ana López',
    registrado_por: 'cuenta',
    registrado_en: hora(14, 5),
    sesion: 's',
    dispositivo: 'tablet',
    corrige_id: null,
  });
}
const efectivoArnes = (iso: string) => {
  const h = (Date.parse(iso) - Date.parse(hora(7, 0))) / 3_600_000;
  return Math.max(0, Math.round(h * 9000));
};
const cajaDia = (): CajaDia => {
  const vig = tienda.arqueos.filter((a) => !tienda.arqueos.some((x) => x.corrige_id === a.id));
  return {
    config: tienda.cajaConfig,
    posOk: true,
    gastos: [...tienda.gastos].sort((a, b) => b.registrado_en.localeCompare(a.registrado_en)),
    totalGastos: gastosVigentes(tienda.gastos).reduce((s, g) => s + Number(g.monto ?? 0), 0),
    arqueos: vig.map((a) => ({
      momento: a.momento,
      arqueo: a,
      resumen: resumenArqueo({
        contado: Number(a.contado),
        fondo: tienda.cajaConfig?.fondo ?? 0,
        tolerancia: tienda.cajaConfig?.tolerancia ?? 20,
        efectivoCent: efectivoArnes(a.registrado_en),
        gastos: gastosEfectivoHasta(tienda.gastos, a.registrado_en),
      }),
    })),
  };
};
const estadosConteo = (dia: string) =>
  (['apertura', 'medio'] as const).flatMap((m) => {
    const hoy = tienda.conteos.filter((c) => c.dia === dia && c.momento === m);
    const ultimo = hoy.at(-1);
    return ultimo
      ? [
          {
            momento: m,
            nombre: ultimo.nombre,
            registrado_en: ultimo.registrado_en,
            insumos: new Set(hoy.map((c) => c.insumo_id)).size,
          },
        ]
      : [];
  });

// Nombres y estado inicial según ?estado.
const alta = (id: number, nombre: string, activo = true) => ({
  id,
  company_id: 514,
  nombre,
  activo,
  creado_por: 'g',
  creado_en: '2026-11-10T15:00:00Z',
  actualizado_por: null,
  actualizado_en: null,
});
tienda.baristas =
  estado === 'vacio' && tienda.rol === 'barista' && p.get('sinnombres') === '1'
    ? []
    : [
        alta(1, 'Ana López'),
        alta(2, 'Beto Ruiz'),
        alta(3, 'Carla Ortiz'),
        alta(4, 'Diego Salas'),
        alta(5, 'Mónica Treviño', false),
      ];
if (p.get('elegido') === '1') tienda.elegido = 1;
const hora = (h: number, m: number) =>
  new Date(`${tienda.dia}T${String(h + 6).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`).toISOString();
let rid = 1;
const resp = (
  ch: number,
  punto: number,
  cumple: boolean,
  observacion: string | null,
  b: number,
  t: string,
  dato: string | null = null,
) =>
  tienda.respuestas.push({
    id: rid++,
    checklist_id: ch,
    company_id: 514,
    punto_id: punto,
    cumple,
    observacion,
    barista_id: b,
    nombre: tienda.baristas.find((x) => x.id === b)?.nombre ?? 'Ana López',
    registrado_por: 'cuenta',
    registrado_en: t,
    sesion: 's',
    dispositivo: 'tablet',
    corrige_id: null,
    motivo: null,
    dato,
  });
const DATO_EJEMPLO: Record<string, string> = {
  'Qué caduca hoy o mañana (o «nada»)': 'Leche de avena (mañana)',
  'Insumos críticos contados': 'Leche entera 18 L · espresso 4 kg',
  'Inicio de extracción y nivel': '7:30 · 3/4',
};
if (estado !== 'vacio') {
  const n = estado === 'curso' ? 5 : 8;
  tienda.puntos.apertura.slice(0, n).forEach((pt, i) => {
    const no = estado !== 'curso' && i === 2;
    const etiqueta = tienda.meta[pt].dato;
    resp(
      1,
      pt,
      !no,
      no ? 'No llegó la leche del pedido; se rotó la que había' : null,
      i % 2 ? 2 : 1,
      hora(7, 2 + i * 3),
      !no && etiqueta ? (DATO_EJEMPLO[etiqueta] ?? 'ok') : null,
    );
  });
  // Rondas de «Durante la operación» (en la mañana: según la hora real del arnés, algunas salen atrasadas).
  const [, , preparados, cold, sanit, banos] = tienda.puntos.durante;
  resp(2, banos, true, null, 1, hora(8, 5));
  resp(2, banos, true, null, 2, hora(9, 2));
  resp(2, sanit, true, null, 1, hora(8, 0));
  resp(2, cold, true, null, 2, hora(7, 40), DATO_EJEMPLO['Inicio de extracción y nivel']);
  resp(2, preparados, true, null, 1, hora(8, 30), 'Base de chai · 2 L');
  if (estado !== 'curso') resp(2, banos, false, 'Sin papel; se pidió a bodega', 2, hora(10, 1));
  if (estado === 'no' || estado === 'firmado')
    tienda.incidencias.push({
      id: 900,
      company_id: 514,
      dia: tienda.dia,
      texto: 'Se terminó la leche de avena; se pidió a la comercializadora.',
      barista_id: 2,
      nombre: 'Beto Ruiz',
      registrado_por: 'cuenta',
      registrado_en: hora(9, 40),
      sesion: 's',
      dispositivo: 'tablet',
    });
  if (estado === 'firmado') {
    tienda.firmas.push({
      id: 950,
      checklist_id: 1,
      company_id: 514,
      tipo: 'responsable',
      barista_id: 1,
      nombre: 'Ana López',
      registrado_por: 'cuenta',
      registrado_en: hora(7, 48),
      sesion: 's',
      dispositivo: 'tablet',
    });
    tienda.puntos.medio.forEach((pt, i) =>
      resp(3, pt, true, null, 2, hora(15, i * 2), tienda.meta[pt].dato ? 'Leche 9 L · espresso 2 kg' : null),
    );
    tienda.firmas.push({
      id: 951,
      checklist_id: 3,
      company_id: 514,
      tipo: 'entrega',
      barista_id: 2,
      nombre: 'Beto Ruiz',
      registrado_por: 'cuenta',
      registrado_en: hora(15, 30),
      sesion: 's',
      dispositivo: 'tablet',
    });
  }
}

// API del módulo sobre el fetch falso de Sucursales (mismo pipeline), sin neto ni costos.
const cfgVentas = configDe(612)!;
const fetchPrevio = window.fetch.bind(window);
window.fetch = async (entrada, init) => {
  const url = new URL(String(entrada), window.location.origin);
  const m = /^\/api\/franquiciatarios\/(\d+)\/(vivo|pedidos|tira)$/.exec(url.pathname);
  if (!m) return fetchPrevio(entrada, init);
  if (m[2] === 'tira') {
    await new Promise((r) => setTimeout(r, 250));
    const q = url.searchParams;
    const t = await construirTira(
      cfgVentas,
      q.get('dia') ?? enZona(new Date(), cfgVentas.zona).fecha,
      (q.get('origen') ?? 'todos') as 'todos',
      {},
    );
    return Response.json(
      sinDatosSensibles({ ...t, sucursal: { ...t.sucursal, nombre: 'Essentia', ciudad: 'Guadalajara' } }),
    );
  }
  const r = await fetchPrevio(`/api/sucursales/612/${m[2]}${url.search}`, init);
  return Response.json(sinDatosSensibles(await r.json()));
};

function avisosDe(dia: ReturnType<typeof armarDia>): FranqAviso[] {
  const out: FranqAviso[] = [];
  for (const s of dia.secciones)
    for (const pt of s.puntos)
      if (pt.respuesta && !pt.respuesta.cumple)
        out.push({
          tipo: 'no',
          dia: dia.dia,
          seccion: s.clave,
          punto: pt.actividad,
          estandar: pt.estandar,
          observacion: pt.respuesta.observacion,
          nombre: pt.respuesta.nombre,
          registrado_en: pt.respuesta.registrado_en,
          respuesta_id: pt.respuesta.id,
        });
  for (const i of dia.incidencias)
    out.push({
      tipo: 'incidencia',
      dia: dia.dia,
      seccion: null,
      punto: null,
      estandar: null,
      observacion: i.texto,
      nombre: i.nombre,
      registrado_en: i.registrado_en,
      respuesta_id: null,
    });
  return out;
}

sembrarCaja();

export function VistaFranquiciatarios() {
  const [, forzar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('franq-cambio', forzar);
    return () => window.removeEventListener('franq-cambio', forzar);
  }, []);
  const dia = armarDia({
    dia: tienda.dia,
    secciones,
    puntos,
    checklists: (['apertura', 'durante', 'medio', 'cierre'] as const).map((s, i) => ({
      id: i + 1,
      seccion: s,
      seccion_id: i + 1,
    })),
    respuestas: tienda.respuestas,
    firmas: tienda.firmas,
    incidencias: tienda.incidencias,
    vigente: 2,
    ahora: new Date(),
  });
  const gestor = tienda.rol !== 'barista';
  const elegido = tienda.baristas.find((b) => b.id === tienda.elegido && b.activo) ?? null;
  const necesitaNombre = tienda.rol === 'barista' && !elegido;
  const base = '/franquiciatarios/514';
  const titulo =
    {
      hoy: 'Hoy',
      checklist: 'Checklist de turno',
      ventas: 'Ventas y pedidos',
      tira: 'Tira de venta',
      equipo: 'Baristas',
      avisos: 'Avisos e historial',
      propuesta: 'Propuesta: apartados del gerente',
      pedidos: 'Pedidos a la Comercializadora',
      conteo: 'Conteo de insumos',
      caja: 'Caja',
      inventario: 'Inventario',
    }[vista] ?? 'Hoy';
  const actual = dia.secciones.find((s) => s.clave === seccionPedida) ?? dia.secciones[0];
  const hoyVentas = enZona(new Date(), cfgVentas.zona).fecha;
  return (
    <Marco
      perfil={{
        nombre: tienda.rol === 'barista' ? 'Essentia · Baristas' : tienda.perfil,
        rol: tienda.rol === 'barista' ? 'tienda' : 'franquiciado',
      }}
      seccion="franquiciatarios"
      visibles={['franquiciatarios']}
      franquicia={{ companyId: 514, nombre: 'Essentia', gestor, varias: tienda.rol === 'franquiciatario' }}
    >
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      {p.get('admin') === '1' && <VerComo rol={tienda.rol} />}
      <Encabezado
        area="Essentia"
        titulo={titulo}
        descripcion={
          <span className="first-letter:uppercase">
            {diaLargo(tienda.dia)} · día de operación (cambia a las 4:00)
          </span>
        }
      />
      {(vista === 'hoy' || vista === 'checklist') && necesitaNombre ? (
        <QuienEres companyId={514} nombres={tienda.baristas.filter((b) => b.activo)} />
      ) : vista === 'hoy' ? (
        <>
          {elegido && <NombreDeclarado companyId={514} nombre={elegido.nombre} />}
          <h2 className="text-lg">Checklists del turno</h2>
          <ResumenDia dia={dia} base={base} />
          <Incidencias companyId={514} incidencias={dia.incidencias} editable />
        </>
      ) : vista === 'checklist' ? (
        <>
          {elegido && <NombreDeclarado companyId={514} nombre={elegido.nombre} />}
          <Checklist
            key={actual.clave}
            companyId={514}
            seccion={actual}
            quien={elegido?.nombre ?? tienda.perfil}
            gestor={gestor}
            editable
          />
        </>
      ) : vista === 'ventas' ? (
        <VentasFranq companyId={514} zona={cfgVentas.zona} rappi alcance={cfgVentas.alcance} />
      ) : vista === 'tira' ? (
        <TiraVenta
          companyId={514}
          rappi
          dias={Array.from({ length: 7 }, (_, i) => sumarDias(hoyVentas, -i))}
        />
      ) : vista === 'pedidos' ? (
        <PedidosFranq
          companyId={514}
          conMontos={gestor}
          pedidos={armarPedidos(tienda.pedidos, tienda.recepciones, { conMontos: gestor })}
        />
      ) : vista === 'conteo' ? (
        <ConteoFranq
          key={momentoConteo}
          companyId={514}
          momento={momentoConteo}
          insumos={tienda.insumos.filter((i) => i.activo).sort((a, b) => a.orden - b.orden)}
          estados={estadosConteo(tienda.dia)}
          gestor={gestor}
        />
      ) : vista === 'caja' ? (
        <>
          <ArqueoCaptura
            companyId={514}
            estados={tienda.arqueos
              .filter((a) => !tienda.arqueos.some((x) => x.corrige_id === a.id))
              .map((a) => ({ momento: a.momento, nombre: a.nombre, registrado_en: a.registrado_en }))}
            editable
          />
          {gestor && (
            <>
              <ResumenCaja caja={cajaDia()} />
              <CajaChica companyId={514} caja={cajaDia()} editable />
              <ConfigCaja companyId={514} caja={cajaDia()} />
            </>
          )}
        </>
      ) : vista === 'inventario' ? (
        <InventarioFranq
          companyId={514}
          insumos={tienda.insumos}
          {...armarHistorial(tienda.insumos, tienda.conteos)}
        />
      ) : vista === 'propuesta' ? (
        <PropuestaGerente />
      ) : vista === 'equipo' ? (
        <Equipo companyId={514} baristas={tienda.baristas} />
      ) : (
        <Avisos companyId={514} avisos={avisosDe(dia)} />
      )}
    </Marco>
  );
}
