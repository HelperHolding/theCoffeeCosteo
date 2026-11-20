-- Spec 2026-11-20 (OC automática: consolidar borradores y alertar OCs emitidas).
-- reemplaza: borradores que la OC nueva sustituyó [{zoho_po_id, po_number, cancelada, error?}].
-- alerta_emitidas: OCs ya emitidas del proveedor al pedir aparte [{zoho_po_id, po_number, fecha_oc}].
-- La función solo las escribe con la bandera config.auto.consolidar = true, que esta migración NO prende.
alter table public.com_oc_auto
  add column if not exists reemplaza jsonb,
  add column if not exists alerta_emitidas jsonb;
