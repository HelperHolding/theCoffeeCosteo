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
import type { FranqAviso, FranqPunto, FranqSeccion, SeccionClave } from '../../../lib/franquiciatarios/tipos';
import { configDe } from '../../../lib/sucursales/config';
import { construirTira, sinDatosSensibles } from '../../../lib/franquiciatarios/ventas';
import { enZona, sumarDias } from '../../../lib/sucursales/tiempo';
import { tienda } from './franq-acciones';
import { PropuestaGerente } from './propuesta-gerente';

/**
 * Franquiciatarios con DATOS SINTÉTICOS (sin Auth ni base): las acciones corren contra un estado en memoria con las
 * reglas de la migración 75; ventas y tira usan el pipeline real de Sucursales sobre el fetch falso del arnés.
 * ?franquiciatarios&vista=hoy|checklist|ventas|tira|equipo|avisos&rol=barista|gerente|franquiciatario
 * &estado=vacio|curso|no|firmado&elegido=1&seccion=apertura|cambio|cierre&sinred=1
 */
const p = new URLSearchParams(window.location.search);
const vista = p.get('vista') ?? 'hoy';
const estado = p.get('estado') ?? 'curso';
const seccionPedida = (p.get('seccion') ?? 'apertura') as SeccionClave;
tienda.rol = (p.get('rol') ?? 'barista') as typeof tienda.rol;
tienda.sinRed = p.get('sinred') === '1';
tienda.dia = diaOperacion();

// Plantilla v1 (la misma de la migración 75, resumida a actividad y estándar).
const PLANTILLA: [SeccionClave, string, ('responsable' | 'entrega' | 'recibe')[], [string, string][]][] = [
  ['apertura', 'Apertura', ['responsable'], [
    ['Registro de entrada', 'Todo el personal checó entrada a tiempo'],
    ['Recorrido de seguridad', 'Accesos, alarma, gas, luz y agua sin incidencias'],
    ['Sistemas y delivery', 'POS, tablets y apps operando; tienda abierta en plataformas'],
    ['Arqueo de caja', 'Fondo completo; cambio solicitado si aplica'],
    ['Montado de barra', 'Insumos a la mano y espresso calibrado'],
    ['Conteo de inventario', 'Registrado en libro de control de turno'],
    ['Inocuidad alimentaria', 'Retenes a concentración, temperaturas, etiquetado y PEPS'],
    ['Baños', 'Limpios, surtidos (papel, jabón, toallas) y bitácora de baño llenada'],
    ['Comedor', 'Mesas, sillas, cristales y piso limpios, sin huellas ni marcas'],
    ['Vitrina', 'Limpia, mejor pan al frente, preparados antojables'],
    ['Imagen de personal', 'Todo el equipo con uniforme completo'],
    ['Junta de arranque', 'Posiciones, metas y pendientes del día comunicados'],
  ]],
  ['cambio', 'Cambio de turno', ['entrega', 'recibe'], [
    ['Conteo de cambio de turno', 'Registrado en libro de control de turno'],
    ['Arqueo y corte parcial', 'Caja cuadrada, diferencias reportadas'],
    ['Delivery', 'Conectividad y cancelaciones revisadas'],
    ['Re-stock de barra', 'Productos, previas e insumos completos'],
    ['Inocuidad alimentaria', 'Retenes a concentración, temperaturas, etiquetado y PEPS'],
    ['Comedor y baños', 'Barra de servicio surtida, baño limpio y surtido, piso y mesas'],
    ['Vitrina', 'Limpia y surtida con el mejor pan al frente'],
    ['Imagen de personal', 'Todo el equipo con uniforme completo'],
    ['Mermas del turno', 'Capturadas en formato de mermas'],
    ['Entrega de turno', 'Pendientes e incidencias comunicadas al turno entrante'],
  ]],
  ['cierre', 'Cierre', ['responsable'], [
    ['Conteo de cierre', 'Registrado en libro de control de turno'],
    ['Arqueo y corte de turno', 'Caja cuadrada y efectivo resguardado'],
    ['Plataformas y tablets', 'Delivery cerrado y tablets apagadas o cargando'],
    ['Mermas del día', 'Capturadas en formato de mermas'],
    ['Barra y bodega', 'Limpias; insumos acomodados por PEPS'],
    ['Limpieza de equipos', 'Según calendario de limpieza profunda'],
    ['Temperaturas', 'Tomadas y registradas en bitácora'],
    ['Baño y comedor', 'Limpieza profunda realizada'],
    ['Listo para apertura', 'Basura retirada, áreas ordenadas y surtidas'],
    ['Registro de salida', 'Todo el personal checó salida'],
    ['Cierre de la unidad', 'Equipos apagados, gas, luz, puertas y alarma'],
  ]],
];
const secciones: FranqSeccion[] = [];
const puntos: FranqPunto[] = [];
PLANTILLA.forEach(([clave, nombre, firmas, ps], i) => {
  secciones.push({ id: i + 1, plantilla_id: 1, clave, nombre, orden: i + 1, firmas });
  tienda.puntos[clave] = ps.map((_, j) => (i + 1) * 100 + j + 1);
  ps.forEach(([actividad, estandar], j) =>
    puntos.push({ id: (i + 1) * 100 + j + 1, seccion_id: i + 1, orden: j + 1, actividad, estandar }),
  );
});

// Nombres y estado inicial según ?estado.
const alta = (id: number, nombre: string, activo = true) => ({
  id, company_id: 514, nombre, activo, creado_por: 'g', creado_en: '2026-11-10T15:00:00Z', actualizado_por: null, actualizado_en: null,
});
tienda.baristas = estado === 'vacio' && tienda.rol === 'barista' && p.get('sinnombres') === '1'
  ? []
  : [alta(1, 'Ana López'), alta(2, 'Beto Ruiz'), alta(3, 'Carla Ortiz'), alta(4, 'Diego Salas'), alta(5, 'Mónica Treviño', false)];
if (p.get('elegido') === '1') tienda.elegido = 1;
const hora = (h: number, m: number) => new Date(`${tienda.dia}T${String(h + 6).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`).toISOString();
let rid = 1;
const resp = (ch: number, punto: number, cumple: boolean, observacion: string | null, b: number, t: string) =>
  tienda.respuestas.push({
    id: rid++, checklist_id: ch, company_id: 514, punto_id: punto, cumple, observacion, barista_id: b,
    nombre: tienda.baristas.find((x) => x.id === b)?.nombre ?? 'Ana López', registrado_por: 'cuenta', registrado_en: t,
    sesion: 's', dispositivo: 'tablet', corrige_id: null, motivo: null,
  });
if (estado !== 'vacio') {
  const n = estado === 'curso' ? 5 : 12;
  tienda.puntos.apertura.slice(0, n).forEach((pt, i) => {
    const no = estado !== 'curso' && i === 1;
    resp(1, pt, !no, no ? 'La alarma no armó; se avisó a seguridad' : null, i % 2 ? 2 : 1, hora(7, 2 + i * 3));
  });
  if (estado === 'no' || estado === 'firmado')
    tienda.incidencias.push({
      id: 900, company_id: 514, dia: tienda.dia, texto: 'Se terminó la leche de avena; se pidió a la comercializadora.',
      barista_id: 2, nombre: 'Beto Ruiz', registrado_por: 'cuenta', registrado_en: hora(9, 40), sesion: 's', dispositivo: 'tablet',
    });
  if (estado === 'firmado') {
    tienda.firmas.push({ id: 950, checklist_id: 1, company_id: 514, tipo: 'responsable', barista_id: 1, nombre: 'Ana López', registrado_por: 'cuenta', registrado_en: hora(7, 48), sesion: 's', dispositivo: 'tablet' });
    tienda.puntos.cambio.forEach((pt, i) => resp(2, pt, true, null, 2, hora(15, i * 2)));
    tienda.firmas.push({ id: 951, checklist_id: 2, company_id: 514, tipo: 'entrega', barista_id: 2, nombre: 'Beto Ruiz', registrado_por: 'cuenta', registrado_en: hora(15, 30), sesion: 's', dispositivo: 'tablet' });
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
    const t = await construirTira(cfgVentas, q.get('dia') ?? enZona(new Date(), cfgVentas.zona).fecha, (q.get('origen') ?? 'todos') as 'todos', {});
    return Response.json(sinDatosSensibles({ ...t, sucursal: { ...t.sucursal, nombre: 'Essentia', ciudad: 'Guadalajara' } }));
  }
  const r = await fetchPrevio(`/api/sucursales/612/${m[2]}${url.search}`, init);
  return Response.json(sinDatosSensibles(await r.json()));
};

function avisosDe(dia: ReturnType<typeof armarDia>): FranqAviso[] {
  const out: FranqAviso[] = [];
  for (const s of dia.secciones)
    for (const pt of s.puntos)
      if (pt.respuesta && !pt.respuesta.cumple)
        out.push({ tipo: 'no', dia: dia.dia, seccion: s.clave, punto: pt.actividad, estandar: pt.estandar, observacion: pt.respuesta.observacion, nombre: pt.respuesta.nombre, registrado_en: pt.respuesta.registrado_en, respuesta_id: pt.respuesta.id });
  for (const i of dia.incidencias)
    out.push({ tipo: 'incidencia', dia: dia.dia, seccion: null, punto: null, estandar: null, observacion: i.texto, nombre: i.nombre, registrado_en: i.registrado_en, respuesta_id: null });
  return out;
}

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
    checklists: (['apertura', 'cambio', 'cierre'] as const).map((s, i) => ({ id: i + 1, seccion: s, seccion_id: i + 1 })),
    respuestas: tienda.respuestas,
    firmas: tienda.firmas,
    incidencias: tienda.incidencias,
    vigente: 1,
  });
  const gestor = tienda.rol !== 'barista';
  const elegido = tienda.baristas.find((b) => b.id === tienda.elegido && b.activo) ?? null;
  const necesitaNombre = tienda.rol === 'barista' && !elegido;
  const base = '/franquiciatarios/514';
  const titulo = { hoy: 'Hoy', checklist: 'Checklist de turno', ventas: 'Ventas y pedidos', tira: 'Tira de venta', equipo: 'Baristas', avisos: 'Avisos e historial', propuesta: 'Propuesta: apartados del gerente' }[vista] ?? 'Hoy';
  const actual = dia.secciones.find((s) => s.clave === seccionPedida) ?? dia.secciones[0];
  const hoyVentas = enZona(new Date(), cfgVentas.zona).fecha;
  return (
    <Marco
      perfil={{ nombre: tienda.rol === 'barista' ? 'Essentia · Baristas' : tienda.perfil, rol: tienda.rol === 'barista' ? 'tienda' : 'franquiciado' }}
      seccion="franquiciatarios"
      visibles={['franquiciatarios']}
      franquicia={{ companyId: 514, nombre: 'Essentia', gestor, varias: tienda.rol === 'franquiciatario' }}
    >
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      <Encabezado
        area="Essentia"
        titulo={titulo}
        descripcion={<span className="first-letter:uppercase">{diaLargo(tienda.dia)} · día de operación (cambia a las 4:00)</span>}
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
          <Checklist key={actual.clave} companyId={514} seccion={actual} quien={elegido?.nombre ?? tienda.perfil} gestor={gestor} editable />
        </>
      ) : vista === 'ventas' ? (
        <VentasFranq companyId={514} zona={cfgVentas.zona} rappi alcance={cfgVentas.alcance} />
      ) : vista === 'tira' ? (
        <TiraVenta companyId={514} rappi dias={Array.from({ length: 7 }, (_, i) => sumarDias(hoyVentas, -i))} />
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
