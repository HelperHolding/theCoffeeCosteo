# Dirección de diseño — Portal The Coffee y CRM Franquicias

El CRM debe sentirse como una evolución natural de Costeo: misma marca, misma densidad y mismos componentes. Es familiar para quien usa Zoho, pero no es una copia visual de Zoho.

## Invariantes (salen del repositorio)

| Elemento | Fuente | Regla |
| --- | --- | --- |
| Color | `app/globals.css`: `ink`, `paper`, `surface`, `crema`, `line`, `line-strong`, estados `ok`/`warn`/`bad` | Fondo `paper`, superficies `surface`, lateral `ink`, acento `crema` solo para el estado activo e iconos destacados. Sin gradientes ni glassmorphism |
| Tipografía | Inter (texto) + Zen Kaku Gothic New (`font-display`, títulos) | `h1` del `Encabezado`, `eyebrow` en mayúsculas espaciadas para el área |
| Forma | `rounded-2xl` en tarjetas, `rounded-[10px]` en controles, `shadow-card` | Un solo nivel de sombra; bordes `border-line` |
| Densidad | Tablas de Costeo con texto de 13–14 px y 25 filas por página | Mismo ritmo en listas del CRM |
| Componentes | `components/portal/piezas.tsx` (`Encabezado`, `Tarjeta`, `Kpi`, `Pill`, `Insignia`, `Vacio`), `components/ui` (button, dialog, popover, command) | Reutilizar antes de crear |
| Shell | `Marco` por sección + grupo "Portal" | El CRM usa el mismo marco; sin asistente Ctrl J |
| Movimiento | Transiciones de color solamente | Respetar `prefers-reduced-motion`; nada decorativo |
| Accesibilidad | WCAG AA, `aria-current`, `focus-visible` | Todo lo arrastrable tiene alternativa por menú y teclado |

## Patrones de referencia (Naranti Operations, revisado el 2026-10-20 en su demo pública)

| Patrón | Clasificación | Cómo se usa en The Coffee |
| --- | --- | --- |
| Fila de indicadores por estado con porcentaje | **ADAPT** | `Kpi` de Costeo con conteos por grupo de etapas (en curso, operando, en pausa, cerradas) |
| Columna Kanban con conteo en el encabezado | **COPY** | Encabezado de columna con nombre de etapa y número de tiendas |
| Tarjeta: tipo, título, subtítulo, responsable, fecha, contadores | **ADAPT** | Tienda: nombre, franquiciatario y ciudad, tipo de franquicia, contadores de notas, archivos y checklist |
| Avance "60 % · faltan 2" en la tarjeta | **ADAPT** | Avance de los checklists de la tienda |
| Botón "Mover … a otra etapa" en cada tarjeta | **COPY** | Menú "Mover a…" accesible (popover), con la misma acción que el arrastre |
| Detalle en panel lateral con secciones Información, Notas, Archivos y Actividad | **REIMPLEMENT** | Expediente en página propia (`/crm/tiendas/[id]`), enlazable y con Volver; las secciones siguen el layout de Zoho (Información, Proyecto, Fechas, Cafetera, Contrato, Evidencias) |
| Vistas Calendario, Analytics y Team | **REJECT** (por ahora) | Fuera del alcance aprobado |
| Tema oscuro, marca y colores de Naranti | **REJECT** | Se usa la identidad The Coffee |

## Estados obligatorios

Cada pantalla tiene **cargando** (skeleton con `bg-line/60`), **vacío** (`Vacio` con el siguiente paso) y **error** (mensaje en lenguaje claro, sin códigos). Un movimiento fallido en el Kanban regresa la tarjeta a su lugar y anuncia el error en una región `aria-live`.
