// Arnés visual: sustituye las server actions de Franquiciatarios por un estado en memoria con las MISMAS reglas que la
// migraciones 75 y 79 (observación en «No», dato en el «Sí» si el punto lo pide, rondas = renglón propio, firma con los
// puntos únicos respondidos, recibe ≠ entrega, visto bueno solo gestores, firmada = solo gestores con motivo).
import type {
  FranqBarista,
  FranqFirma,
  FranqArqueo,
  FranqCajaConfig,
  FranqConteo,
  FranqGasto,
  FranqIncidencia,
  FranqInsumo,
  FranqPunto,
  FranqRecepcion,
  MomentoArqueo,
  MomentoConteo,
  FranqRespuesta,
  FranqAsignacion,
  FranqMerma,
  FranqMermaTolerancia,
  FranqMermasCierre,
  FranqPosicion,
  FranqTurno,
  MotivoMerma,
  SeccionClave,
  TipoFirma,
} from '../../../lib/franquiciatarios/tipos';

import { armarPedidos, type FilaPedidoLegado } from '../../../lib/franquiciatarios/pedidos';

export type Resultado = { ok: true } | { error: string };

export const tienda = {
  rol: 'barista' as 'barista' | 'gerente' | 'franquiciatario',
  perfil: 'Laura Méndez (gerente)',
  elegido: null as number | null,
  sinRed: false,
  baristas: [] as FranqBarista[],
  respuestas: [] as FranqRespuesta[],
  firmas: [] as FranqFirma[],
  incidencias: [] as FranqIncidencia[],
  /** checklist id por sección y puntos por sección; meta = el punto completo (tipo y dato). */
  puntos: {} as Record<SeccionClave, number[]>,
  meta: {} as Record<number, FranqPunto>,
  pedidos: [] as FilaPedidoLegado[],
  recepciones: [] as FranqRecepcion[],
  insumos: [] as FranqInsumo[],
  conteos: [] as FranqConteo[],
  arqueos: [] as FranqArqueo[],
  gastos: [] as FranqGasto[],
  cajaConfig: { fondo: 1500, tolerancia: 20 } as Pick<FranqCajaConfig, 'fondo' | 'tolerancia'> | null,
  posiciones: [] as FranqPosicion[],
  turnos: [] as FranqTurno[],
  asignaciones: [] as FranqAsignacion[],
  mermas: [] as FranqMerma[],
  tolerancias: [] as FranqMermaTolerancia[],
  cierres: [] as FranqMermasCierre[],
  dia: '',
};
let id = 1000;
const ahora = () => new Date().toISOString();
const avisar = () => window.dispatchEvent(new Event('franq-cambio'));
const CHECK: Record<SeccionClave, number> = { apertura: 1, durante: 2, cambio: 3, medio: 3, cierre: 4 };
const vigentes = (ch: number, punto: number) =>
  tienda.respuestas.filter(
    (r) =>
      r.checklist_id === ch && r.punto_id === punto && !tienda.respuestas.some((x) => x.corrige_id === r.id),
  );
const quien = (): { barista_id: number | null; nombre: string } | string => {
  if (tienda.rol !== 'barista') return { barista_id: null, nombre: tienda.perfil };
  const b = tienda.baristas.find((x) => x.id === tienda.elegido && x.activo);
  return b ? { barista_id: b.id, nombre: b.nombre } : 'Elige tu nombre antes de registrar.';
};
const base = (q: { barista_id: number | null; nombre: string }) => ({
  ...q,
  company_id: 514,
  registrado_por: 'cuenta',
  registrado_en: ahora(),
  sesion: 'sesion-arnes',
  dispositivo: navigator.userAgent.slice(0, 300),
});
const espera = async () => {
  await new Promise((r) => setTimeout(r, 300));
  if (tienda.sinRed) throw new Error('sin red');
};

export async function elegirBarista(_c: number, b: number | null): Promise<Resultado> {
  await espera();
  tienda.elegido = b;
  avisar();
  return { ok: true };
}

export async function responder(d: {
  seccion: SeccionClave;
  punto: number;
  cumple: boolean;
  observacion?: string | null;
  motivo?: string | null;
  dato?: string | null;
}): Promise<Resultado> {
  await espera();
  const q = quien();
  if (typeof q === 'string') return { error: q };
  const ch = CHECK[d.seccion];
  if (!d.cumple && (d.observacion ?? '').trim().length < 3)
    return { error: 'Todo «No» se explica en Observaciones.' };
  const punto = tienda.meta[d.punto];
  const dato = (d.dato ?? '').trim() || null;
  if (d.cumple && punto?.dato && !dato) return { error: `Anota ${punto.dato.toLowerCase()}.` };
  if (punto?.tipo === 'recurrente') {
    tienda.respuestas.push({
      ...base(q),
      id: ++id,
      checklist_id: ch,
      punto_id: d.punto,
      cumple: d.cumple,
      observacion: d.cumple ? null : (d.observacion ?? '').trim(),
      corrige_id: null,
      motivo: null,
      dato,
    });
    avisar();
    return { ok: true };
  }
  const previa = vigentes(ch, d.punto).at(-1);
  const firmada = tienda.firmas.some((f) => f.checklist_id === ch);
  if (firmada && tienda.rol === 'barista')
    return { error: 'La sección ya está firmada; pide al gerente que registre la corrección.' };
  if (firmada && (d.motivo ?? '').trim().length < 3) return { error: 'Escribe el motivo de la corrección.' };
  tienda.respuestas.push({
    ...base(q),
    id: ++id,
    checklist_id: ch,
    punto_id: d.punto,
    cumple: d.cumple,
    observacion: d.cumple ? null : (d.observacion ?? '').trim(),
    corrige_id: previa?.id ?? null,
    motivo: firmada ? (d.motivo ?? '').trim() : null,
    dato,
  });
  avisar();
  return { ok: true };
}

export async function firmar(_c: number, seccion: SeccionClave, tipo: TipoFirma): Promise<Resultado> {
  await espera();
  const q = quien();
  if (typeof q === 'string') return { error: q };
  const ch = CHECK[seccion];
  if (tipo === 'visto_bueno') {
    if (tienda.rol === 'barista') return { error: 'El visto bueno lo da el gerente o el franquiciatario.' };
    if (!tienda.firmas.some((f) => f.checklist_id === ch && f.tipo === 'responsable'))
      return { error: 'Primero firma el responsable del cierre.' };
  }
  const faltan = tienda.puntos[seccion].filter(
    (p) =>
      tipo !== 'visto_bueno' &&
      tienda.meta[p]?.tipo !== 'recurrente' &&
      !tienda.respuestas.some((r) => r.checklist_id === ch && r.punto_id === p),
  );
  if (faltan.length) return { error: `Faltan ${faltan.length} puntos por responder antes de firmar.` };
  if (tipo === 'recibe') {
    const e = tienda.firmas.find((f) => f.checklist_id === ch && f.tipo === 'entrega');
    if (!e) return { error: 'Primero firma quien entrega el turno.' };
    if (e.nombre.toLowerCase() === q.nombre.toLowerCase())
      return { error: 'Recibe el turno una persona distinta de quien lo entrega.' };
  }
  tienda.firmas.push({ ...base(q), id: ++id, checklist_id: ch, tipo });
  avisar();
  return { ok: true };
}

export async function registrarIncidencia(_c: number, texto: string): Promise<Resultado> {
  await espera();
  const q = quien();
  if (typeof q === 'string') return { error: q };
  if (texto.trim().length < 3) return { error: 'Describe la incidencia.' };
  tienda.incidencias.push({ ...base(q), id: ++id, dia: tienda.dia, texto: texto.trim() });
  avisar();
  return { ok: true };
}

export async function corregir(d: {
  respuesta: number;
  cumple: boolean;
  observacion?: string | null;
  motivo: string;
  dato?: string | null;
}): Promise<Resultado> {
  await espera();
  const previa = tienda.respuestas.find((r) => r.id === d.respuesta);
  if (!previa) return { error: 'No existe ese registro.' };
  if (d.motivo.trim().length < 3) return { error: 'Escribe el motivo de la corrección.' };
  tienda.respuestas.push({
    ...previa,
    ...base({ barista_id: null, nombre: tienda.perfil }),
    id: ++id,
    cumple: d.cumple,
    observacion: d.cumple ? null : (d.observacion ?? '').trim(),
    corrige_id: previa.id,
    motivo: d.motivo.trim(),
    dato: (d.dato ?? '').trim() || previa.dato,
  });
  avisar();
  return { ok: true };
}

export async function guardarBarista(d: {
  id: number | null;
  nombre: string;
  activo: boolean;
}): Promise<Resultado> {
  await espera();
  const nombre = d.nombre.trim().replace(/\s+/g, ' ');
  if (nombre.length < 2) return { error: 'El nombre debe tener entre 2 y 60 caracteres.' };
  if (
    tienda.baristas.some((b) => b.activo && b.id !== d.id && b.nombre.toLowerCase() === nombre.toLowerCase())
  )
    return { error: 'Ya hay un barista activo con ese nombre.' };
  if (d.id === null)
    tienda.baristas.push({
      id: ++id,
      company_id: 514,
      nombre,
      activo: true,
      creado_por: 'gerente',
      creado_en: ahora(),
      actualizado_por: null,
      actualizado_en: null,
    });
  else
    Object.assign(
      tienda.baristas.find((b) => b.id === d.id)!,
      { nombre, activo: d.activo, actualizado_en: ahora() },
    );
  avisar();
  return { ok: true };
}

export async function verComo(rol: string): Promise<Resultado> {
  await espera();
  tienda.rol = rol === 'admin' ? 'gerente' : (rol as typeof tienda.rol);
  avisar();
  return { ok: true };
}

/** Recepción con las reglas de franq_recibir y de recibirPedido (diferencias contra lo pedido, observación). */
export async function recibirPedido(d: {
  pedido: string;
  recibidos: number[];
  observacion?: string | null;
}): Promise<Resultado> {
  await espera();
  if (tienda.rol === 'barista')
    return { error: 'Solo el gerente o el franquiciatario registran recepciones.' };
  const q = quien();
  if (typeof q === 'string') return { error: q };
  const p = armarPedidos(
    tienda.pedidos.filter((x) => x.id === d.pedido),
    tienda.recepciones,
    { conMontos: false },
  )[0];
  if (!p) return { error: 'Ese pedido no es de esta sucursal.' };
  if (!p.recibible) return { error: 'Este pedido ya tiene su recepción registrada.' };
  const diferencias = p.lineas
    .map((l, i) => ({ nombre: l.nombre, sku: l.sku, pedido: l.cantidad, recibido: d.recibidos[i] }))
    .filter((x) => x.pedido !== x.recibido);
  if (diferencias.length && (d.observacion ?? '').trim().length < 3)
    return { error: 'Explica qué pasó con lo que llegó distinto.' };
  tienda.recepciones.push({
    ...base(q),
    id: ++id,
    pedido_id: p.id,
    folio: p.folio,
    completo: diferencias.length === 0,
    diferencias,
    observacion: (d.observacion ?? '').trim() || null,
  });
  avisar();
  return { ok: true };
}

/** Conteo con las reglas de franq_contar: todos los insumos activos, cantidades ≥ 0, un recuento corrige al vigente. */
export async function contar(d: {
  momento: MomentoConteo;
  conteos: { insumo: number; cantidad: number }[];
}): Promise<Resultado> {
  await espera();
  const q = quien();
  if (typeof q === 'string') return { error: q };
  const activos = tienda.insumos.filter((i) => i.activo);
  const faltan = activos.filter((i) => !d.conteos.some((c) => c.insumo === i.id)).length;
  if (faltan) return { error: `Faltan ${faltan} insumos por contar.` };
  if (d.conteos.some((c) => c.cantidad < 0)) return { error: 'Las cantidades van de 0 en adelante.' };
  for (const c of d.conteos) {
    const previo = tienda.conteos
      .filter(
        (x) =>
          x.dia === tienda.dia &&
          x.momento === d.momento &&
          x.insumo_id === c.insumo &&
          !tienda.conteos.some((y) => y.corrige_id === x.id),
      )
      .at(-1);
    tienda.conteos.push({
      ...base(q),
      id: ++id,
      dia: tienda.dia,
      momento: d.momento,
      insumo_id: c.insumo,
      cantidad: c.cantidad,
      corrige_id: previo?.id ?? null,
    });
  }
  avisar();
  return { ok: true };
}

export async function sugerirInsumos(): Promise<Resultado> {
  await espera();
  if (tienda.rol === 'barista') return { error: 'Solo el gerente o el franquiciatario arman la lista.' };
  if (tienda.insumos.some((i) => i.activo)) return { error: 'La sucursal ya tiene su lista de insumos.' };
  [
    'Café Tostado En Grano White 1.5 Kg',
    'Leche Deslactosadas',
    'Leche Entera',
    'Croissant Tradicional',
  ].forEach((nombre, i) =>
    tienda.insumos.push({
      id: ++id,
      company_id: 514,
      insumo_id: null,
      nombre,
      unidad: i === 3 ? 'pza' : 'paquete',
      orden: i + 1,
      activo: true,
      origen: 'sugerido',
      creado_por: 'g',
      creado_en: ahora(),
      actualizado_por: null,
      actualizado_en: null,
    }),
  );
  avisar();
  return { ok: true };
}

export async function guardarInsumo(d: {
  id: number | null;
  nombre: string;
  unidad: string;
  orden: number | null;
  activo: boolean;
}): Promise<Resultado> {
  await espera();
  const nombre = d.nombre.trim().replace(/\s+/g, ' ');
  if (nombre.length < 2 || !d.unidad.trim())
    return { error: 'Escribe el nombre y la unidad en que se cuenta.' };
  if (
    tienda.insumos.some((i) => i.activo && i.id !== d.id && i.nombre.toLowerCase() === nombre.toLowerCase())
  )
    return { error: 'Ya hay un insumo activo con ese nombre.' };
  if (d.id === null)
    tienda.insumos.push({
      id: ++id,
      company_id: 514,
      insumo_id: null,
      nombre,
      unidad: d.unidad.trim(),
      orden: tienda.insumos.length + 1,
      activo: true,
      origen: 'manual',
      creado_por: 'g',
      creado_en: ahora(),
      actualizado_por: null,
      actualizado_en: null,
    });
  else
    Object.assign(
      tienda.insumos.find((i) => i.id === d.id)!,
      { nombre, unidad: d.unidad.trim(), activo: d.activo },
    );
  avisar();
  return { ok: true };
}

/** Arqueo ciego con las reglas de franq_arquear (recuento corrige al vigente del mismo momento). */
export async function arquear(d: {
  momento: MomentoArqueo;
  contado: number;
  observacion?: string | null;
}): Promise<Resultado> {
  await espera();
  const q = quien();
  if (typeof q === 'string') return { error: q };
  if (!(d.contado >= 0)) return { error: 'Escribe el efectivo contado (de 0 en adelante).' };
  const previo = tienda.arqueos
    .filter(
      (a) =>
        a.dia === tienda.dia && a.momento === d.momento && !tienda.arqueos.some((x) => x.corrige_id === a.id),
    )
    .at(-1);
  tienda.arqueos.push({
    ...base(q),
    id: ++id,
    dia: tienda.dia,
    momento: d.momento,
    contado: Math.round(d.contado * 100) / 100,
    observacion: (d.observacion ?? '').trim() || null,
    corrige_id: previo?.id ?? null,
  });
  avisar();
  return { ok: true };
}

export async function registrarGasto(d: {
  concepto: string;
  categoria: string;
  monto: number;
  enEfectivo: boolean;
  comprobante: boolean;
}): Promise<Resultado> {
  await espera();
  if (tienda.rol === 'barista')
    return { error: 'Solo el gerente o el franquiciatario manejan la caja chica.' };
  if (d.concepto.trim().length < 3) return { error: 'Describe el gasto.' };
  if (!(d.monto > 0)) return { error: 'Escribe el monto del gasto.' };
  tienda.gastos.push({
    ...base({ barista_id: null, nombre: tienda.perfil }),
    id: ++id,
    dia: tienda.dia,
    concepto: d.concepto.trim(),
    categoria: d.categoria,
    monto: Math.round(d.monto * 100) / 100,
    en_efectivo: d.enEfectivo,
    comprobante: d.comprobante,
    nota: null,
    anula_id: null,
  });
  avisar();
  return { ok: true };
}

export async function anularGasto(_c: number, gasto: number, motivo: string): Promise<Resultado> {
  await espera();
  if (motivo.trim().length < 3) return { error: 'Escribe por qué se anula.' };
  if (tienda.gastos.some((g) => g.anula_id === gasto)) return { error: 'Ese gasto ya está anulado.' };
  const g = tienda.gastos.find((x) => x.id === gasto)!;
  tienda.gastos.push({
    ...base({ barista_id: null, nombre: tienda.perfil }),
    id: ++id,
    dia: g.dia,
    concepto: null,
    categoria: null,
    monto: null,
    en_efectivo: g.en_efectivo,
    comprobante: false,
    nota: motivo.trim(),
    anula_id: gasto,
  });
  avisar();
  return { ok: true };
}

export async function configurarCaja(_c: number, fondo: number, tolerancia: number): Promise<Resultado> {
  await espera();
  if (!(fondo >= 0) || !(tolerancia >= 0)) return { error: 'Revisa el fondo y la tolerancia.' };
  tienda.cajaConfig = { fondo, tolerancia };
  avisar();
  return { ok: true };
}

/** Gasto fijo (franq_gasto_fijo): en el arnés solo valida; el P&L sintético no cambia. */
export async function guardarGastoFijo(d: { concepto: string; monto: number }): Promise<Resultado> {
  await espera();
  if (tienda.rol === 'barista')
    return { error: 'Solo el gerente o el franquiciatario capturan los gastos fijos.' };
  if (!(d.monto >= 0)) return { error: 'Escribe el monto (de 0 en adelante).' };
  avisar();
  return { ok: true };
}

// ── F6 · Roles por posición y mermas (reglas de la migración 92) ─────────────────────────────────────────────────
const soloGestor = (texto: string) => (tienda.rol === 'barista' ? { error: texto } : null);
const SOLO_ROLES = 'Solo el gerente o el franquiciatario arman la matriz de roles.';

export async function rolesBase(): Promise<Resultado> {
  await espera();
  const no = soloGestor(SOLO_ROLES);
  if (no) return no;
  if (!tienda.posiciones.length)
    ['Caja/Mostrador', 'Barra caliente', 'Barra fría', 'Alimentos', 'Rappi/Delivery'].forEach((nombre, i) =>
      tienda.posiciones.push({ id: ++id, company_id: 514, nombre, orden: i + 1, activo: true }),
    );
  if (!tienda.turnos.length)
    tienda.turnos.push(
      {
        id: ++id,
        company_id: 514,
        nombre: 'Matutino',
        entrada: '07:00:00',
        salida: '15:00:00',
        orden: 1,
        activo: true,
      },
      {
        id: ++id,
        company_id: 514,
        nombre: 'Vespertino',
        entrada: '15:00:00',
        salida: '22:00:00',
        orden: 2,
        activo: true,
      },
    );
  avisar();
  return { ok: true };
}

export async function guardarPosicion(d: {
  id: number | null;
  nombre: string;
  activo: boolean;
}): Promise<Resultado> {
  await espera();
  const no = soloGestor(SOLO_ROLES);
  if (no) return no;
  const nombre = d.nombre.trim().replace(/\s+/g, ' ');
  if (nombre.length < 2) return { error: 'Escribe el nombre de la posición.' };
  if (
    tienda.posiciones.some((p) => p.activo && p.id !== d.id && p.nombre.toLowerCase() === nombre.toLowerCase())
  )
    return { error: 'Ya hay una posición activa con ese nombre.' };
  if (d.id === null)
    tienda.posiciones.push({
      id: ++id,
      company_id: 514,
      nombre,
      orden: tienda.posiciones.length + 1,
      activo: true,
    });
  else Object.assign(tienda.posiciones.find((p) => p.id === d.id)!, { nombre, activo: d.activo });
  avisar();
  return { ok: true };
}

export async function guardarTurno(d: {
  id: number | null;
  nombre: string;
  entrada: string;
  salida: string;
  activo: boolean;
}): Promise<Resultado> {
  await espera();
  const no = soloGestor(SOLO_ROLES);
  if (no) return no;
  if (d.nombre.trim().length < 2 || !d.entrada || !d.salida || d.entrada === d.salida)
    return { error: 'Escribe el nombre del turno y sus horas de entrada y salida.' };
  const t = {
    nombre: d.nombre.trim(),
    entrada: `${d.entrada}:00`,
    salida: `${d.salida}:00`,
    activo: d.activo,
  };
  if (d.id === null) tienda.turnos.push({ id: ++id, company_id: 514, orden: tienda.turnos.length + 1, ...t });
  else Object.assign(tienda.turnos.find((x) => x.id === d.id)!, t);
  avisar();
  return { ok: true };
}

const asignacionVigente = (dia: string, turno: number, posicion: number, barista: number) =>
  tienda.asignaciones.find(
    (a) =>
      a.dia === dia &&
      a.turno_id === turno &&
      a.posicion_id === posicion &&
      a.barista_id === barista &&
      !a.anulada &&
      !tienda.asignaciones.some((x) => x.corrige_id === a.id),
  );

export async function asignar(d: {
  dia: string;
  turno: number;
  posicion: number;
  barista: number;
  quitar: boolean;
}): Promise<Resultado> {
  await espera();
  const no = soloGestor(SOLO_ROLES);
  if (no) return no;
  const previa = asignacionVigente(d.dia, d.turno, d.posicion, d.barista);
  const fila = {
    company_id: 514,
    dia: d.dia,
    turno_id: d.turno,
    posicion_id: d.posicion,
    barista_id: d.barista,
    registrado_por: 'g',
    registrado_en: ahora(),
  };
  if (d.quitar) {
    if (previa) tienda.asignaciones.push({ id: ++id, ...fila, anulada: true, corrige_id: previa.id });
  } else if (!previa) tienda.asignaciones.push({ id: ++id, ...fila, anulada: false, corrige_id: null });
  avisar();
  return { ok: true };
}

export async function copiarSemana(_c: number, lunes: string): Promise<Resultado> {
  await espera();
  const no = soloGestor(SOLO_ROLES);
  if (no) return no;
  const mas = (d: string, n: number) =>
    new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const vig = tienda.asignaciones.filter(
    (a) => !a.anulada && !tienda.asignaciones.some((x) => x.corrige_id === a.id),
  );
  const ocupados = new Set(vig.map((a) => a.dia));
  for (const a of vig.filter((x) => x.dia >= mas(lunes, -7) && x.dia < lunes))
    if (!ocupados.has(mas(a.dia, 7)))
      tienda.asignaciones.push({ ...a, id: ++id, dia: mas(a.dia, 7), registrado_en: ahora() });
  avisar();
  return { ok: true };
}

export async function registrarMerma(d: {
  insumo: number | null;
  cantidad: number | null;
  motivo: MotivoMerma | null;
  nota?: string | null;
  corrige?: number | null;
  anular?: boolean;
  motivoCorreccion?: string | null;
}): Promise<Resultado> {
  await espera();
  const q = quien();
  if (typeof q === 'string') return { error: q };
  const cerrado = tienda.cierres.some((c) => c.dia === tienda.dia);
  if (cerrado && tienda.rol === 'barista')
    return { error: 'Las mermas de hoy ya se cerraron; pide a la gerencia que lo registre.' };
  if (cerrado && (d.motivoCorreccion ?? '').trim().length < 3)
    return { error: 'El día ya se cerró: escribe el motivo del cambio.' };
  const comun = {
    id: ++id,
    company_id: 514,
    dia: tienda.dia,
    barista_id: q.barista_id,
    nombre: q.nombre,
    registrado_por: 'cuenta',
    registrado_en: ahora(),
    motivo_correccion: d.motivoCorreccion ?? null,
  };
  if (d.anular) {
    const o = tienda.mermas.find((m) => m.id === d.corrige);
    if (!o || tienda.mermas.some((x) => x.corrige_id === o.id)) return { error: 'Ese registro ya no está vigente.' };
    tienda.mermas.push({ ...o, ...comun, anulada: true, corrige_id: o.id });
  } else {
    if (!d.insumo || !(Number(d.cantidad) > 0) || !d.motivo) return { error: 'Completa insumo, cantidad y motivo.' };
    if (d.motivo === 'otro' && (d.nota ?? '').trim().length < 3) return { error: 'Con «Otro», escribe qué pasó.' };
    tienda.mermas.push({
      ...comun,
      insumo_id: d.insumo,
      cantidad: Number(d.cantidad),
      motivo: d.motivo,
      nota: d.nota?.trim() || null,
      anulada: false,
      corrige_id: d.corrige ?? null,
    });
  }
  avisar();
  return { ok: true };
}

export async function cerrarMermas(_c: number, dia: string): Promise<Resultado> {
  await espera();
  const no = soloGestor('Solo el gerente o el franquiciatario cierran las mermas.');
  if (no) return no;
  if (!tienda.cierres.some((c) => c.dia === dia))
    tienda.cierres.push({ company_id: 514, dia, nombre: tienda.perfil, cerrado_por: 'g', cerrado_en: ahora() });
  avisar();
  return { ok: true };
}

export async function guardarTolerancia(_c: number, insumo: number, pct: number): Promise<Resultado> {
  await espera();
  const no = soloGestor('Solo el gerente o el franquiciatario ajustan la tolerancia.');
  if (no) return no;
  if (!(pct >= 0 && pct <= 100)) return { error: 'La tolerancia va de 0 a 100 %.' };
  tienda.tolerancias.push({
    id: ++id,
    company_id: 514,
    insumo_id: insumo,
    pct,
    registrado_por: 'g',
    registrado_en: ahora(),
  });
  avisar();
  return { ok: true };
}
