// Mapeo Zoho → CRM aprobado en docs/zoho/CRM-SCOPE-DECISIONS.md. Funciones puras: sin red ni base.
import { createHash } from 'node:crypto';
import {
  ESTADOS_ACTIVIDAD,
  ESTATUS_CAFETERA,
  ESTATUS_CONTRATO,
  MARCAS_CAFETERA,
  PRIORIDADES,
  TIPOS_CONTACTO,
} from '../tipos';

export type Zoho = Record<string, unknown>;
export interface Contexto {
  orgId: string | null;
  responsableId: string;
  /** zoho_valor → id de etapa, por embudo. */
  etapasTiendas: Map<string, string>;
  etapasProspectos: Map<string, string>;
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const fecha = (v: unknown): string | null => {
  const s = texto(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);
const opcion = <T extends readonly string[]>(v: unknown, opciones: T): T[number] | null => {
  const s = texto(v);
  return s && (opciones as readonly string[]).includes(s) ? (s as T[number]) : null;
};
const lookup = (v: unknown): { id: string; name: string | null } | null =>
  v && typeof v === 'object' && 'id' in v
    ? { id: String((v as { id: unknown }).id), name: texto((v as { name?: unknown }).name) }
    : null;
export const etiquetasDe = (r: Zoho): string[] =>
  (Array.isArray(r.Tag) ? r.Tag : [])
    .map((t) => texto((t as { name?: unknown }).name))
    .filter((t): t is string => t !== null);

/** Hash estable del contenido mapeado: decide si un registro cambió entre corridas. */
export function huella(fila: Record<string, unknown>): string {
  const orden = Object.keys(fila).sort();
  return createHash('sha256')
    .update(JSON.stringify(orden.map((k) => [k, fila[k]])))
    .digest('hex');
}

const trazabilidad = (r: Zoho, modulo: string, ctx: Contexto) => ({
  zoho_org_id: ctx.orgId,
  zoho_module_api_name: modulo,
  zoho_record_id: String(r.id),
  zoho_created_at: texto(r.Created_Time),
  zoho_modified_at: texto(r.Modified_Time),
});

// Etiquetas que se convierten en campos (decisión "Campos duplicados" y "Etiquetas").
const TIPO_POR_ETIQUETA: Record<string, 'franquiciatario' | 'maestra'> = {
  Franquiciatario: 'franquiciatario',
  'Franquicia Maestra': 'maestra',
};
const MARCA_POR_ETIQUETA: Record<string, (typeof MARCAS_CAFETERA)[number]> = {
  Marzocco: 'La Marzocco',
  'Victoria Arduino': 'Victoria Arduino',
};

export interface TiendaMapeada {
  fila: Record<string, unknown>;
  etiquetas: string[];
  checklist: { texto: string; hecho: boolean; url: string | null }[];
  etapaZoho: string | null;
}

export function mapearTienda(r: Zoho, ctx: Contexto): TiendaMapeada {
  const tags = etiquetasDe(r);
  const revisar: string[] = [];
  const etapaZoho = texto(r.Status);
  let etapa = etapaZoho ? ctx.etapasTiendas.get(etapaZoho) : undefined;
  if (!etapa) {
    revisar.push('etapa');
    etapa = [...ctx.etapasTiendas.values()][0];
  }
  const tipo = tags.includes('Franquicia Maestra')
    ? 'maestra'
    : (tags.map((t) => TIPO_POR_ETIQUETA[t]).find(Boolean) ?? null);

  // Apertura: "Fecha en que aperturó" manda; "Fecha de Apertura" completa. Si difieren, se marca.
  const apertura1 = fecha(r.Fecha_en_que_apertur);
  const apertura2 = fecha(r.Fecha_de_Apertura);
  if (apertura1 && apertura2 && apertura1 !== apertura2) revisar.push('fecha_apertura');

  const marcaCampo = opcion(r.Marca_de_Cafetera, MARCAS_CAFETERA);
  const marcaEtiqueta = tags.map((t) => MARCA_POR_ETIQUETA[t]).find(Boolean) ?? null;
  if (marcaCampo && marcaEtiqueta && marcaCampo !== marcaEtiqueta) revisar.push('marca_cafetera');

  const url = (v: unknown) => texto(v);
  const fila = {
    nombre: texto(r.Name) ?? '(sin nombre)',
    etapa_id: etapa,
    responsable_id: ctx.responsableId,
    franquiciatario: lookup(r.Cuenta)?.name ?? null,
    tipo_franquicia: tipo,
    ciudad: texto(r.Ciudad),
    direccion: texto(r.Direcci_n),
    numero_tienda_jestor: entero(r.N_mero_de_Tienda_Jestor),
    arquitecto_asignado: texto(r.Arquitecto_Asignado),
    fecha_entrega_proyecto: fecha(r.Fecha_de_Entrega_de_Proyecto),
    fecha_aprobacion_local: fecha(r.Aprobaci_n_de_local) ?? fecha(r.Fecha_aprobaci_n_de_local),
    fecha_firma_contrato: fecha(r.Firma_de_Contrato),
    fecha_firma_franquicia: fecha(r.Fecha_de_Firma),
    estatus_contrato_franquicia: opcion(r.Contrato_de_franquicia_5_a_os, ESTATUS_CONTRATO),
    fecha_vencimiento_franquicia: fecha(r.Fecha_de_Vencimiento),
    fecha_programada_arranque: fecha(r.FECHA_DE_ARRANQUE),
    fecha_apertura: apertura1 ?? apertura2,
    marca_cafetera: marcaCampo ?? marcaEtiqueta,
    estatus_cafetera: opcion(r.Status_de_Cafetera, ESTATUS_CAFETERA),
    rappi: r.Rappi === true,
    rollout: r.Rollout === true,
    correo_tienda: texto(r.Correo_de_la_tienda)?.toLowerCase() ?? null,
    url_carpeta_contrato: url(r.Link_a_carpeta_de_contrato),
    url_dictamen_local: url(r.Dictamen_de_Aprobaci_n_de_Local),
    revisar,
    ...trazabilidad(r, 'Franquicias', ctx),
  };
  // Campos sin uso o ligas sueltas → checklist "Apertura" (decisión: convertir en checklist).
  const checklist = [
    { texto: 'Alta en Google Maps', hecho: r.Alta_en_Google_Maps === true, url: null },
    { texto: 'Configuración Partoo', hecho: r.Configuraci_n_Partoo === true, url: null },
    { texto: 'Certificado de facturación', url: url(r.Certificado_de_Facturaci_n) },
    { texto: 'Perfiles de baristas', url: url(r.Perfiles_de_Baristas) },
    { texto: 'Checklist pre-apertura', url: url(r.Checklist_Pre_Apertura) },
    { texto: 'Funcionamiento de máquinas', url: url(r.Evidencias_de_M_quinas) },
    { texto: 'Certificado de Looker', url: url(r.Evidencias_de_Tienda) },
  ].map((i) => ({ hecho: 'hecho' in i ? Boolean(i.hecho) : i.url !== null, ...i }));
  const etiquetas = tags.filter((t) => !TIPO_POR_ETIQUETA[t] && !MARCA_POR_ETIQUETA[t]);
  return { fila, etiquetas, checklist, etapaZoho };
}

export function mapearProspecto(r: Zoho, ctx: Contexto) {
  const estado = texto(r.Lead_Status);
  return {
    fila: {
      nombre: texto(r.First_Name),
      apellidos: texto(r.Last_Name) ?? texto(r.Full_Name) ?? '(sin apellido)',
      correo: texto(r.Email)?.toLowerCase() ?? null,
      telefono: texto(r.Phone),
      etapa_id: estado ? (ctx.etapasProspectos.get(estado) ?? null) : null,
      responsable_id: ctx.responsableId,
      empresa: texto(r.Company) ?? texto(r.Nombre_de_Empresa),
      ciudad_interes: texto(r.Ciudad_de_Inter_s),
      estado_interes: texto(r.Estado_de_Inter_s),
      ciudad_residencia: texto(r.City),
      estado_residencia: texto(r.State),
      pais: texto(r.Country),
      inversion: texto(r.Inversi_n),
      capital_disponible: texto(r.Capital_disponible),
      fuente_capital: texto(r.Fuente_de_capital),
      interes_en_the_coffee: texto(r.Inter_s_en_The_Coffee),
      por_que_tendra_exito: texto(r.Porque_The_Coffee_tendra_xito_en_la_zona),
      plan_operacion: texto(r.Plan_de_operaci_n),
      involucrado_otra_marca: texto(r.Involucrado_en_otra_marca_de_retail_o_franquicia),
      marca_involucramiento: texto(r.Marca_de_involucramiento),
      pagina_web: texto(r.P_gina_web_de_empresa),
      sin_correos: r.Email_Opt_Out === true,
      ...trazabilidad(r, 'Leads', ctx),
    },
    etiquetas: etiquetasDe(r),
    estadoZoho: estado,
  };
}

// Etiquetas de Contactos que pasan a campos booleanos; el resto describe la plaza.
const BANDERAS_CONTACTO: Record<string, 'recibe_newsletter' | 'recibe_comunicados' | 'fee_pagado'> = {
  newsletter: 'recibe_newsletter',
  comunicado: 'recibe_comunicados',
  'fee pagado': 'fee_pagado',
};

export function mapearContacto(r: Zoho, ctx: Contexto) {
  const tags = etiquetasDe(r);
  const banderas = { recibe_newsletter: false, recibe_comunicados: false, fee_pagado: false };
  const plazas: string[] = [];
  for (const t of tags) {
    const b = BANDERAS_CONTACTO[t.toLocaleLowerCase('es')];
    if (b) banderas[b] = true;
    else plazas.push(t);
  }
  return {
    fila: {
      nombre: texto(r.First_Name),
      apellidos: texto(r.Last_Name) ?? texto(r.Full_Name) ?? '(sin apellido)',
      correo: texto(r.Email)?.toLowerCase() ?? null,
      telefono: texto(r.Phone),
      puesto: texto(r.Puesto_Relaci_n),
      tipo_contacto: opcion(r.Phase, TIPOS_CONTACTO),
      franquiciatario: lookup(r.Account_Name)?.name ?? null,
      plaza: plazas.length ? plazas.join(' · ') : null,
      ...banderas,
      responsable_id: ctx.responsableId,
      ...trazabilidad(r, 'Contacts', ctx),
    },
    cuentaZoho: lookup(r.Account_Name)?.id ?? null,
    plazas: plazas.length,
  };
}

/** Relación polimórfica de Zoho → columna del CRM. Cuentas y módulos fuera de alcance → null (se omite). */
export type Relacion = {
  tienda_id?: string;
  prospecto_id?: string;
  contacto_id?: string;
  actividad_id?: string;
};
export type Resolver = (modulo: string, zohoId: string) => Relacion | null;

export function mapearActividad(r: Zoho, ctx: Contexto, resolver: Resolver) {
  const modulo = texto(r.$se_module);
  const what = lookup(r.What_Id);
  const who = lookup(r.Who_Id);
  let rel: Relacion = {};
  if (modulo && what) {
    const x = resolver(modulo, what.id);
    if (!x) return null;
    rel = x;
  }
  if (who) {
    const c = resolver('Contacts', who.id);
    if (c?.contacto_id) rel = { ...rel, contacto_id: c.contacto_id };
  }
  return {
    fila: {
      asunto: texto(r.Subject) ?? '(sin asunto)',
      fecha_vencimiento: fecha(r.Due_Date),
      estado:
        opcion(r.Status, Object.keys(ESTADOS_ACTIVIDAD) as (keyof typeof ESTADOS_ACTIVIDAD)[]) ??
        'Not Started',
      prioridad: opcion(r.Priority, Object.keys(PRIORIDADES) as (keyof typeof PRIORIDADES)[]),
      descripcion: texto(r.Description),
      cerrada_en: texto(r.Closed_Time),
      recordatorio_zoho: r.Remind_At ? JSON.stringify(r.Remind_At) : null,
      responsable_id: ctx.responsableId,
      tienda_id: rel.tienda_id ?? null,
      prospecto_id: rel.prospecto_id ?? null,
      contacto_id: rel.contacto_id ?? null,
      ...trazabilidad(r, 'Tasks', ctx),
    },
  };
}

export function mapearNota(r: Zoho, ctx: Contexto, resolver: Resolver) {
  const modulo = texto(r.$se_module);
  const padre = lookup(r.Parent_Id);
  if (!modulo || !padre) return null;
  const rel = resolver(modulo, padre.id);
  if (!rel) return null;
  return {
    fila: {
      titulo: texto(r.Note_Title),
      contenido: texto(r.Note_Content) ?? '(nota sin texto)',
      autor_id: null,
      tienda_id: rel.tienda_id ?? null,
      prospecto_id: rel.prospecto_id ?? null,
      contacto_id: rel.contacto_id ?? null,
      actividad_id: rel.actividad_id ?? null,
      ...trazabilidad(r, 'Notes', ctx),
    },
  };
}
