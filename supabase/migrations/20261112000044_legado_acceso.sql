-- Migración de thecoffeemexico, Fase 0 (docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md).

-- 1. Roles SIN Costeo para cuentas que vienen del sitio viejo. Mismo camino que 'sucursales' (migración 24): la RLS
--    de Costeo exige tiene_rol('compras','operaciones','finanzas','admin'), así que estos roles no leen Costeo.
--    Sus accesos llegan solo por perfil_modulos, módulo por módulo.
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno', 'franquiciado', 'proveedor'));

-- 2. Vínculo usuario del sitio viejo -> cuenta del portal. Privado: solo lo usan los scripts de
--    scripts/migracion-legado con DATABASE_URL. Cada módulo reasigna con él sus FKs a usuarios.
create schema migracion_legado;
revoke all on schema migracion_legado from public, anon, authenticated;

create table migracion_legado.usuarios (
  legado_id text primary key,
  auth_uid_legado uuid unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null,
  correo text,
  rol_legado text not null,
  subtipo text,
  supplier_key text,
  parent_legado_id text,
  permisos jsonb,
  activo_legado boolean not null,
  origen text not null check (origen in ('creado', 'vinculado')),
  importado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
revoke all on all tables in schema migracion_legado from public, anon, authenticated;
