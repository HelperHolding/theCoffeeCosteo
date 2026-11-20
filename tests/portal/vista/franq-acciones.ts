// Arnés visual: sustituye las server actions de Franquiciatarios por un estado en memoria con las MISMAS reglas que la
// migraciones 75 y 79 (observación en «No», dato en el «Sí» si el punto lo pide, rondas = renglón propio, firma con los
// puntos únicos respondidos, recibe ≠ entrega, visto bueno solo gestores, firmada = solo gestores con motivo).
import type {
  FranqBarista,
  FranqFirma,
  FranqIncidencia,
  FranqPunto,
  FranqRespuesta,
  SeccionClave,
  TipoFirma,
} from '../../../lib/franquiciatarios/tipos';

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
