// Mide (solo lectura) cuánto tardan las consultas de la pantalla del Pipeline.
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { pipeline, etapasGenerales } from '../../lib/crm/unificado/consultas';
import { leerTodo } from '../../lib/crm/consultas';

const env = await leerEnvLocal();
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false },
}) as never;
const t = async <T>(nombre: string, f: () => Promise<T>) => {
  const a = performance.now();
  const r = await f();
  console.log(nombre.padEnd(34), Math.round(performance.now() - a), 'ms');
  return r;
};
const d = db as any;
await t('etapasGenerales', () => etapasGenerales(db));
await t('layout: tiendas (Ctrl K)', () => leerTodo(db, 'crm_tiendas', 'id,nombre,ciudad,embudo', (q: any) => q.is('archivado_en', null)));
await t('layout: contactos (Ctrl K)', () => leerTodo(db, 'crm_contactos', 'id,nombre,apellidos,franquiciatario', (q: any) => q.is('archivado_en', null)));
await t('entrada: crm_v_candados completa', () => d.from('crm_v_candados').select('etapa_id,total,listos,liberado,carril_total,carril_listos').limit(20000));
await t('leerTodo franquiciatarios ligeros', () => leerTodo(db, 'crm_franquiciatarios', 'id,etapa_id,actualizado_en,muestra', (q: any) => q.is('archivado_en', null)));
const r = await t('pipeline() completo', () => pipeline(db));
console.log('cards armadas:', r.cards.length, 'etapas:', r.etapas.length);
const { armarCards } = await import('../../lib/crm/unificado/consultas');
const lista = r.cards.map((c) => ({ id: c.id, tipo: c.tipo }));
await t('armarCards (328)', () => armarCards(db, lista));
const ids = lista.map((c) => c.id);
const tr = (xs: string[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
await t('  candados por id', () => Promise.all(tr(ids).map((x) => d.from('crm_v_candados').select('*').in('card_id', x))));
await t('  vencimientos', () => Promise.all(tr(ids).map((x) => d.from('crm_v_vencimientos').select('*').in('tienda_id', x))));
await t('  franq select *', () => Promise.all(tr(ids).map((x) => d.from('crm_franquiciatarios').select('*').in('id', x))));
await t('  historial', () => Promise.all(tr(ids).map((x) => d.from('crm_historial').select('tienda_id,franquiciatario_id,actor_nombre,fecha,origen').in('franquiciatario_id', x).neq('origen','importacion').order('fecha',{ascending:false}).limit(450))));
await t('etapasGenerales (2a)', () => etapasGenerales(db));
const es = r.etapas;
await t('46 conteos head', () => Promise.all(es.map((e) => d.from(e.card === 'sucursal' ? 'crm_tiendas' : 'crm_franquiciatarios').select('id', { count: 'exact', head: true }).eq('etapa_id', e.id).is('archivado_en', null))));
await t('23 primeras 50', () => Promise.all(es.map((e) => d.from(e.card === 'sucursal' ? 'crm_tiendas' : 'crm_franquiciatarios').select('id,etapa_id,actualizado_en').eq('etapa_id', e.id).is('archivado_en', null).order('actualizado_en', { ascending: false }).limit(50))));
await t('1 conteo etapa grande', () => d.from('crm_franquiciatarios').select('id', { count: 'exact', head: true }).eq('etapa_id', es[0].id).is('archivado_en', null));
await t('1 consulta trivial', () => d.from('crm_etapas').select('id').limit(1));
