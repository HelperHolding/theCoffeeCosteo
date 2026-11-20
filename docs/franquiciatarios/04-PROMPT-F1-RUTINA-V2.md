# Encargo F1: Rutina de turno v2 en Franquiciatarios (piloto Essentia)

> **Borrador.** Ejecutar solo cuando Carlos apruebe `03-PLAN-RUTINA-Y-CONEXIONES.md` y responda las decisiones 2 y
> 7 de ese plan. Si no las responde, usa los supuestos marcados [S].

## 1. Encargo y resultado

Los baristas de Essentia (POS `company_id` 514) tienen que poder seguir en tablet la **rutina operativa de turno
v1.0** del gerente Moisés, tal como viene en el PDF:

- **4 fases:** Apertura, Durante la operación, Medio turno y Fin de turno.
- **32 actividades.**
- **Rondas con frecuencia** (baños cada hora, sanitizante cada 2 h, cold brew cada 2–4 h).
- **Firmas:** barista de mañana, barista de tarde/cierre y gerente.

La plantilla v1 actual (Excel: 3 secciones, 33 puntos) se conserva junto con su historial.

- Repositorio: `HelperHolding/theCoffeeCosteo`, en un worktree nuevo desde `origin/main` (rama
  `feat/franq-rutina-v2`).
- Módulo: `app/(franquiciatarios)`, `components/franquiciatarios`, `lib/franquiciatarios`.
- Migración base: `supabase/migrations/20261120000075_franquiciatarios.sql`.
- Contexto del módulo: `docs/franquiciatarios/01-RESULTADO.md` y `03-PLAN-RUTINA-Y-CONEXIONES.md`.

## 2. Contrato de esta ejecución

- **Autorizado ahora:**
  - Explorar el repo.
  - Plan Mode, si está disponible.
  - Implementar en el worktree.
  - Correr pruebas locales y ensayar en producción con `BEGIN…ROLLBACK`, solo lectura y con respaldo.
  - Abrir el PR **en borrador**.
- **Requiere OK explícito de Carlos:** el merge, que aplica la migración en producción; cualquier escritura en
  producción; crear o invitar usuarios.
- **Fuera de alcance:** conteos de inventario con cantidades por insumo (F2), pedidos y recepciones (F3), arqueo y
  caja chica (F4), P&L (F5), recetas, SLA y roles (F6).
  - En F1, los puntos de tipo «con dato» capturan un **valor libre corto** (texto o número) junto al Sí/No, sin
    catálogo de insumos.
- **Conservar:**
  - Plantilla v1 y sus registros. Las tablas son de solo inserción; no borres ni edites nada.
  - Ventas, tira y avisos tal como están.
  - Roles y «Ver como».
  - Corte del día a las 4:00 CDMX.
  - Colores por tipo de información (`components/franquiciatarios/colores.tsx`: brillo de abajo hacia arriba).
  - Diseño formal y modo oscuro por variables.
  - Regla de **nada de costos ni datos de otras sucursales** para usuarios del módulo.
- **Cierre:** el PR en borrador queda con:
  - Pruebas en verde.
  - Ensayo de la migración sobre producción (nada persistido, verificado con una consulta nueva).
  - Capturas del arnés.
  - `01-RESULTADO.md` actualizado.

  Después se reporta y se espera el OK.

## 3. Requisitos

| ID  | Requisito                                                                                                                                                                            | Aceptación observable                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| R1  | 4 fases: `apertura`, `durante`, `medio`, `cierre`                                                                                                                                    | La pantalla Hoy muestra 4 tarjetas, cada una con su color e ícono                    |
| R2  | Plantilla v2 = 32 actividades del PDF (lista abajo), con área y verificación como «estándar»                                                                                         | Conteo por fase: 8 / 6 / 7 / 11                                                      |
| R3  | Tipo por punto: `unico`, `recurrente` (`cada_min`, `margen_min`), `con_dato`                                                                                                         | En Durante, cada ronda se registra varias veces al día con su hora                   |
| R4  | Rondas: la UI muestra «última a las HH:MM · próxima a las HH:MM» y marca **atrasada** si pasó `cada_min + margen_min`                                                                | Simular horas en la prueba; atrasada visible para el barista y en Avisos del gerente |
| R5  | Firmas: apertura = barista mañana; medio turno = entrega (mañana) y recibe (tarde, otra persona); cierre = barista tarde/cierre; **visto bueno del gerente** del día (solo gestores) | No se firma sin todos los puntos únicos respondidos; las rondas no bloquean la firma |
| R6  | «Enviar corte de medio día» y «Enviar corte del día» enlazan a la tira (parcial o del día) y registran quién y a qué hora                                                            | El registro aparece en el checklist y en Avisos                                      |
| R7  | Coexistencia: la v1 sigue legible en días anteriores; la v2 es la vigente desde que se aplica                                                                                        | Consultar un día con v1 muestra sus 3 secciones; hoy muestra v2                      |
| R8  | Seguridad igual que la migración 75: RLS por sucursal, RPC `security definer` con hora del servidor, OAuth bloqueado, solo inserción                                                 | Pruebas PGlite de acceso por rol, otra sucursal, OAuth, inmutabilidad                |

**[S] Supuestos si Carlos no decide:**

- Las rondas solo **avisan**; no bloquean nada.
- Medio turno sin hora fija: se habilita todo el día y se espera alrededor del cambio de turno.
- Cold brew: `cada_min = 120`, `margen_min = 120`.

### Plantilla v2 (del PDF)

- **Apertura** (único salvo donde se indica):
  1. Encender equipos (calibración térmica).
  2. Revisar etiquetas y caducidades (con dato: lo que caduca hoy o mañana).
  3. Hacer PEPS (leche, granos, jarabes).
  4. Colocar sanitizantes.
  5. Verificar limpieza de tienda.
  6. Revisar existencias y actualizar tabletas (App/POS).
  7. Realizar conteos y llenar bitácoras (con dato).
  8. Encender música (playlist y volumen oficial).
- **Durante la operación:**
  1. Reabastecer barra (recurrente por demanda, sin frecuencia).
  2. Hacer previas (recurrente por demanda).
  3. Hacer preparados (recurrente por demanda; con dato: lote).
  4. Revisar cold brew (recurrente 2–4 h; con dato: hora de extracción y nivel).
  5. Cambiar sanitizantes (recurrente 120 min).
  6. Revisar baños (recurrente 60 min).
- **Medio turno:**
  1. Limpieza de tienda.
  2. Reabastecer barra.
  3. Enviar corte de medio día (corte).
  4. Revisar y cambiar bolsas de basura.
  5. Lavar loza.
  6. Conteos de alto valor y rotación (con dato).
  7. Revisar baños (inspección profunda).
- **Fin de turno:**
  1. Limpieza de equipos (purga, backflush, molinos).
  2. Lavar loza.
  3. Limpieza de áreas de preparación.
  4. Limpieza de tienda.
  5. Apagar música.
  6. Apagar equipos.
  7. Enviar corte del día (corte).
  8. Revisar baños.
  9. Apagar luces y guardar mobiliario.
  10. Sacar basura y cambiar bolsas.
  11. Cerrar (accesos y alarma).

Copia los textos de «Área / Enfoque» y «Verificación / Frecuencia» del PDF al estándar de cada punto. El PDF está en
`C:\Users\carlo\Downloads\Checklist_y_Rutina_Operativa_de_Turno_-_The_Coffee.pdf`.

## 4. Exploración necesaria (antes de escribir código)

1. Lee `AGENTS.md`: es un Next.js con cambios importantes, así que consulta `node_modules/next/dist/docs/` antes de
   tocar APIs.
2. Lee la migración 75 completa y `lib/franquiciatarios/{dia,servidor,tipos}.ts`.
3. Lee las pruebas `tests/db/franquiciatarios.test.ts`, `tests/db/guardia-lectura.test.ts` (predicado `franq_`) y
   `tests/db/permisos.test.ts` (exige initPlan `(select fn())`).
4. Confirma la siguiente versión de migración libre: en el repo, `ls supabase/migrations`; en producción, la máxima
   de `supabase_migrations.schema_migrations`. Al 2026-11-20 era la 78, así que se espera la **79**.
5. Revisa cómo arma el día `armarDia` con `checklists` y `respuestas` para decidir:
   - Rondas como respuestas múltiples por punto (columna `ronda` o sin unicidad para los recurrentes), o
   - una tabla `franq_rondas` aparte.

   Justifica la elección en el plan.

## 5. Diseño esperado (propuesta; ajústalo si la exploración lo justifica)

- **Migración 79:**
  - Amplía los `check` de `clave` y `seccion` a 4 fases: agrega `durante` y `medio`; `cambio` sigue válido para la
    v1.
  - Agrega `tipo`, `cada_min`, `margen_min` y `etiqueta_dato` a los puntos (inmutables, como el resto de la
    plantilla).
  - Agrega `dato text` a las respuestas.
  - Permite varias respuestas vigentes por punto recurrente.
  - Agrega la firma `visto_bueno` (solo gestores).
  - Agrega el registro de «corte enviado».
  - Siembra la plantilla v2 y deja la v1 con `vigente = false`.
  - Las RPC nuevas o cambiadas validan `franq_rol`, ponen la hora del servidor y respetan la regla de solo
    inserción.
- **UI:**
  - Tarjeta nueva «Durante la operación» con tono propio: agrega un token en `globals.css` con variante oscura,
    siguiendo el patrón de `colores.tsx`.
  - Cada ronda en lista con botón grande «Registrar ahora» y la próxima hora.
  - Rondas atrasadas con el estado `warn`.
  - «Medio turno» reemplaza a «Cambio de turno» en la v2, con el mismo color.
- **Arnés visual** (`tests/portal/vista/franquiciatarios.tsx`): escenarios v2 vacía, en curso, con ronda atrasada y
  firmada, más la v1 en un día pasado.

## 6. Fases de esta ejecución

| Paso | Acción                                                                                                           | Criterio de salida                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Exploración y plan (Plan Mode si existe)                                                                         | Plan aprobado internamente; elección de rondas justificada             |
| 2    | Migración 79 + pruebas PGlite                                                                                    | Pruebas nuevas y existentes del módulo en verde                        |
| 3    | Lógica (`dia.ts`, acciones) + UI + arnés                                                                         | `tsc`, Prettier solo en archivos propios, capturas claro/oscuro/375 px |
| 4    | Respaldo y ensayo `BEGIN … raise exception` sobre producción (patrón de `scripts/franquiciatarios/ensayo-75.ts`) | 0 objetos persistidos, confirmado con consulta nueva                   |
| 5    | Code review nivel high, correcciones, PR en borrador                                                             | PR con evidencia; **esperar el OK de Carlos para el merge**            |

## 7. Verificación

| Riesgo                      | Comprobación                                                               | Evidencia                                     |
| --------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| Romper la v1 o su historial | Prueba: día con registros v1 sigue armando 3 secciones                     | Prueba PGlite                                 |
| Ronda con hora del cliente  | RPC usa `now()`; la prueba intenta mandar una hora                         | Prueba PGlite                                 |
| Acceso indebido             | Barista, gerente, franquiciatario, admin, sin módulo, OAuth, otra sucursal | Pruebas PGlite + rutas                        |
| Guardas del repo            | `guardia-lectura` y `permisos`                                             | Suite completa `npm test`                     |
| UI en tablet y celular      | Arnés a 375 px y 768 px, claro y oscuro                                    | Capturas en `docs/franquiciatarios/capturas/` |
| Migración en producción     | Ensayo con rollback + consulta nueva                                       | Salida del script en el PR                    |

## 8. Reglas que no cambian

- Trabaja en un **worktree**, nunca en el checkout principal: tiene WIP ajeno, así que no formatees, reviertas ni
  incluyas esos cambios.
- Nunca subas ni imprimas `.env.local`.
- Acceso a producción y al POS **solo de lectura**, salvo respaldo y ensayo con rollback.
- Carlos inicia sesión él mismo. No escribas contraseñas.
- Commits con la línea de coautoría que indique el entorno.

## 9. Primera acción

Crea el worktree desde `origin/main`, lee `AGENTS.md`, la migración 75 y `lib/franquiciatarios/dia.ts`, y presenta
un plan (sin código) que responda:

1. ¿Rondas en las respuestas o en una tabla aparte?
2. ¿Cómo coexisten la v1 y la v2 en `armarDia`?
3. ¿Qué versión de migración toca?

Termina con el PR en borrador y el reporte. No hagas merge.
