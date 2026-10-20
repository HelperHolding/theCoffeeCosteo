import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearUsuario } from './utilidades';
import { cargar, revertir, type Lote } from '../../lib/crm/importacion/carga';

let db: PGlite, responsable: string;
const uno = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0];

const tiendas = [
  {
    id: 'zt1',
    Name: 'Tienda Centro',
    Status: 'Operando',
    Cuenta: { id: 'za1', name: 'Franquiciatario Uno' },
    Ciudad: 'Querétaro',
    Fecha_en_que_apertur: '2025-03-01',
    Fecha_de_Apertura: '2025-03-02',
    Aprobaci_n_de_local: null,
    Fecha_aprobaci_n_de_local: '2024-11-10',
    Marca_de_Cafetera: null,
    Tag: [{ name: 'Franquicia Maestra' }, { name: 'Marzocco' }, { name: 'URGENTE' }],
    Alta_en_Google_Maps: true,
    Checklist_Pre_Apertura: 'https://example.com/checklist',
    Rappi: true,
    Created_Time: '2025-01-13T10:00:00-06:00',
    Modified_Time: '2025-06-01T10:00:00-06:00',
  },
  {
    id: 'zt2',
    Name: 'Tienda Norte',
    Status: 'Firma de contrato',
    Cuenta: { id: 'za2', name: 'Franquiciatario Dos' },
    Marca_de_Cafetera: 'Victoria Arduino',
    Tag: [{ name: 'Marzocco' }, { name: 'Franquiciatario' }],
    FECHA_DE_ARRANQUE: '2027-02-01',
    Created_Time: '2025-02-01T10:00:00-06:00',
    Modified_Time: '2025-02-02T10:00:00-06:00',
  },
];
const lote = (cambios: Partial<Lote> = {}): Lote => ({
  runId: randomUUID(),
  tipo: 'piloto',
  snapshot: '2026-10-20T00:00:00Z',
  orgId: 'org-prueba',
  responsableId: responsable,
  tiendas,
  prospectos: [
    {
      id: 'zl1',
      First_Name: 'Ana',
      Last_Name: 'Prueba',
      Email: 'ANA@EXAMPLE.COM',
      Lead_Status: 'Contactado',
      Company: null,
      Nombre_de_Empresa: 'Empresa X',
      Tag: [{ name: 'Info en revisión' }],
    },
    { id: 'zl2', Last_Name: 'Sin Estado', Lead_Status: null },
  ],
  contactos: [
    {
      id: 'zc1',
      First_Name: 'Beto',
      Last_Name: 'Contacto',
      Account_Name: { id: 'za1', name: 'Franquiciatario Uno' },
      Phase: 'Franquiciatarios',
      Tag: [{ name: 'newsletter' }, { name: 'FEE PAGADO' }, { name: 'Querétaro' }],
    },
  ],
  actividades: [
    {
      id: 'zk1',
      Subject: 'Dictamen',
      Status: 'Not Started',
      Priority: 'High',
      $se_module: 'Franquicias',
      What_Id: { id: 'zt1' },
      Who_Id: { id: 'zc1' },
    },
    {
      id: 'zk2',
      Subject: 'De una cuenta',
      Status: 'Completed',
      $se_module: 'Accounts',
      What_Id: { id: 'za1' },
    },
    { id: 'zk3', Subject: 'Sin relación', Status: 'Waiting for input', $se_module: 'Home', What_Id: null },
  ],
  notas: [
    {
      id: 'zn1',
      Note_Content: 'Nota de tienda',
      $se_module: 'Franquicias',
      Parent_Id: { id: 'zt1' },
      Created_Time: '2025-05-01T10:00:00-06:00',
    },
    { id: 'zn2', Note_Content: 'Nota de tarea', $se_module: 'Tasks', Parent_Id: { id: 'zk1' } },
    { id: 'zn3', Note_Content: 'Nota de cuenta', $se_module: 'Accounts', Parent_Id: { id: 'za1' } },
  ],
  estadosProspectos: ['Correo Inicial Enviado - Agenda tu Cita', 'Contactado'],
  transiciones: new Map([
    ['zt1', [{ de: 'Agenda de capacitación', a: 'Operando', fecha: '2025-03-01T12:00:00Z' }]],
  ]),
  ...cambios,
});

beforeAll(async () => {
  db = await crearDbLocal();
  responsable = await crearUsuario(db, 'admin');
});
afterAll(async () => db.close());

it('importa el lote con el mapeo aprobado', async () => {
  const r = await cargar(db, lote());
  expect(r.conteos.tiendas).toMatchObject({ zoho: 2, nuevos: 2 });
  expect(r.conteos.actividades).toMatchObject({ zoho: 3, nuevos: 2, omitidos: 1 });
  expect(r.conteos.notas).toMatchObject({ zoho: 3, nuevos: 2, omitidos: 1 });

  const centro = await uno<Record<string, unknown>>(
    `select *, fecha_apertura::text fecha_apertura, fecha_aprobacion_local::text fecha_aprobacion_local from crm_tiendas where zoho_record_id = 'zt1'`,
  );
  expect(centro).toMatchObject({
    nombre: 'Tienda Centro',
    franquiciatario: 'Franquiciatario Uno',
    tipo_franquicia: 'maestra',
    fecha_apertura: '2025-03-01',
    fecha_aprobacion_local: '2024-11-10',
    marca_cafetera: 'La Marzocco',
    rappi: true,
    responsable_id: responsable,
    zoho_module_api_name: 'Franquicias',
    revisar: ['fecha_apertura'],
  });
  const norte = await uno<Record<string, unknown>>(`select * from crm_tiendas where zoho_record_id = 'zt2'`);
  expect(norte).toMatchObject({
    tipo_franquicia: 'franquiciatario',
    marca_cafetera: 'Victoria Arduino',
    revisar: ['marca_cafetera'],
  });
  expect(
    await uno(
      `select e.nombre from crm_tiendas t join crm_etapas e on e.id = t.etapa_id where t.zoho_record_id = 'zt2'`,
    ),
  ).toEqual({
    nombre: 'Firma de contrato',
  });

  // Etiquetas: solo las que siguen siendo etiquetas.
  const tags = await db.query<{ nombre: string }>(
    `select e.nombre from crm_etiquetas_registro r join crm_etiquetas e on e.id = r.etiqueta_id order by 1`,
  );
  expect(tags.rows.map((x) => x.nombre)).toEqual(['Info en revisión', 'URGENTE']);

  // Checklist "Apertura" con los campos convertidos.
  const items = await db.query<{ texto: string; hecho: boolean; url: string | null }>(
    `select i.texto, i.hecho, i.url from crm_checklist_items i join crm_checklists c on c.id = i.checklist_id
     join crm_tiendas t on t.id = c.tienda_id where t.zoho_record_id = 'zt1' order by i.orden`,
  );
  expect(items.rows).toHaveLength(7);
  expect(items.rows.filter((i) => i.hecho).map((i) => i.texto)).toEqual([
    'Alta en Google Maps',
    'Checklist pre-apertura',
  ]);

  // Prospectos tal cual (con y sin estado), contacto con banderas y plaza, liga por cuenta.
  expect(await uno(`select correo, empresa from crm_prospectos where zoho_record_id = 'zl1'`)).toEqual({
    correo: 'ana@example.com',
    empresa: 'Empresa X',
  });
  expect(await uno(`select etapa_id from crm_prospectos where zoho_record_id = 'zl2'`)).toEqual({
    etapa_id: null,
  });
  expect(
    await uno(`select plaza, recibe_newsletter, fee_pagado, recibe_comunicados from crm_contactos`),
  ).toEqual({
    plaza: 'Querétaro',
    recibe_newsletter: true,
    fee_pagado: true,
    recibe_comunicados: false,
  });
  expect(r.extras.ligas_tienda_contacto).toBe(1);

  // Actividad con tienda y contacto; nota de la tarea ligada a la actividad.
  expect(
    await uno(
      `select (tienda_id is not null) t, (contacto_id is not null) c from crm_actividades where zoho_record_id = 'zk1'`,
    ),
  ).toEqual({ t: true, c: true });
  expect(
    await uno(`select (actividad_id is not null) a from crm_notas where zoho_record_id = 'zn2'`),
  ).toEqual({ a: true });

  // Historial de Zoho e importación, y staging con lo crudo.
  expect(await uno(`select resumen, origen from crm_historial where origen = 'zoho'`)).toEqual({
    resumen: 'Etapa: Agenda de capacitación → Operando',
    origen: 'zoho',
  });
  expect(
    (await uno<{ n: number }>(`select count(*)::int n from crm_historial where origen = 'importacion'`)).n,
  ).toBeGreaterThan(0);
  expect((await uno<{ n: number }>(`select count(*)::int n from zoho_staging.registros`)).n).toBe(11);
  // Sin ruido: la importación no deja entradas por cada nota o ítem de checklist.
  expect(
    (
      await uno<{ n: number }>(
        `select count(*)::int n from crm_historial where origen = 'importacion' and accion in ('nota', 'checklist')`,
      )
    ).n,
  ).toBe(0);
});

it('repetir no duplica; un cambio en Zoho actualiza solo ese registro', async () => {
  const otra = await cargar(db, lote());
  expect(otra.conteos.tiendas).toMatchObject({ nuevos: 0, actualizados: 0, sin_cambio: 2 });
  expect(otra.conteos.notas).toMatchObject({ nuevos: 0, sin_cambio: 2 });
  expect(otra.extras.checklists).toBe(0);
  expect((await uno<{ n: number }>(`select count(*)::int n from crm_tiendas`)).n).toBe(2);
  expect(
    (await uno<{ n: number }>(`select count(*)::int n from crm_historial where origen = 'zoho'`)).n,
  ).toBe(1);

  const cambio = await cargar(db, lote({ tiendas: [{ ...tiendas[0], Ciudad: 'CDMX' }, tiendas[1]] }));
  expect(cambio.conteos.tiendas).toMatchObject({ actualizados: 1, sin_cambio: 1 });
  expect(await uno(`select ciudad from crm_tiendas where zoho_record_id = 'zt1'`)).toEqual({
    ciudad: 'CDMX',
  });
});

it('revertir la última corrida borra lo que dejó y la marca como revertida', async () => {
  const run = randomUUID();
  await cargar(
    db,
    lote({
      runId: run,
      tiendas: [
        { ...tiendas[0], Ciudad: 'Puebla' },
        { ...tiendas[1], Name: 'Norte 2' },
      ],
    }),
  );
  const r = await revertir(db, run);
  expect(r.tiendas).toBe(2);
  expect((await uno<{ n: number }>(`select count(*)::int n from crm_tiendas`)).n).toBe(0);
  expect((await uno<{ n: number }>(`select count(*)::int n from crm_checklists`)).n).toBe(0);
  expect(await uno(`select estado from zoho_staging.importaciones where id = $1`, [run])).toEqual({
    estado: 'revertida',
  });
});
