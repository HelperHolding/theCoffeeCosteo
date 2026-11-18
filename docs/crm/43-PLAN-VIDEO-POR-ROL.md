# 43 · Plan del video por rol: «Lo tuyo en el CRM»

Fecha: 2026-11-15. Sale del video general «El viaje de una sucursal» (doc 41, §13) y del encargo de Carlo: explicar por usuario qué ve, dónde y qué le toca hacer, y corregir en el camino lo que no se entienda.

## 1. Qué es y para quién

Una serie corta, no un solo video largo: **un capítulo de 60 a 90 s por rol**, con la misma intro de 10 s. Cada persona ve solo el suyo y luego, si quiere, los de las áreas con las que se pasa la bolita.

| Capítulo | Para | Duración |
| --- | --- | --- |
| 0 · Así se lee el CRM | Todos | 40 s |
| 1 · Ventas | Vendedores | 90 s |
| 2 · Aprobación de locales | Quien dictamina locales (Ventas + función) | 60 s |
| 3 · Legal | Legal | 90 s |
| 4 · Proyectos | Proyectos | 90 s |
| 5 · Finanzas | Finanzas | 60 s |
| 6 · Heads y Dirección | Heads y desarrollador | 75 s |
| 7 · Consulta | Todos | 45 s |

Mismo sistema visual del video general (riel de etapas sobre la madera, placas con capturas reales, color por área) y el mismo tono: español de México, cercano y con jerga ligera, sin groserías.

## 2. Matriz por rol (cómo funciona hoy)

| Rol | Ve datos sensibles (PLD, Survey, fiscales, CSF, comprobantes, factura) | Registra | Mueve | Avisos |
| --- | --- | --- | --- | --- |
| Ventas | Sí | Etapas 1–5 y el ID de Jestor | 1 → 5, Standby y cierre | — |
| Aprobación de locales | Sí (es membresía de Ventas) | Etapa 6 y la solicitud de constancia | 6 → 7 | — |
| Legal | Sí | Contrato enviado, carta de intención, constancia, fecha límite, transferencia, COF y contrato, liberación | 7 → 8 → 26.1 | COF, 5 días hábiles, 120 días, multa |
| Proyectos | **No** | Fechas estimada y confirmada, entregables 26.1–26.7, fecha real de apertura | 26.1 → 26.8 (solo con el carril Legal completo) | 120 días, multa, COF tardía, transferencia |
| Finanzas | Sí | Apartado, pago y factura | — | Multa por vencimiento |
| Head (cualquier área) | Según su área | Todo | Todo; libera candados con motivo | Todos |
| Dirección (`desarrollador`) | Sí | Todo | Todo; administra membresías | Todos |
| Solo lectura | No, salvo que tenga Ventas, Legal o Finanzas | — | — | Los ve, no los atiende |

Todos ven el mismo menú; lo que cambia es qué botones aparecen y qué cae en **Mis pendientes**.

## 3. Guion por capítulo

Cada capítulo sigue el mismo esqueleto, en el orden en que la persona trabaja:

1. **Tu puerta de entrada:** Mis pendientes, filtrado a su área.
2. **Lo que te toca registrar:** una card de ejemplo, el requisito, el botón y la evidencia.
3. **Tu candado:** qué bloquea tu etapa y a quién le pasas la bolita.
4. **Tus avisos y fechas.**
5. **Lo que no ves y por qué** (solo cuando aplica, p. ej. Proyectos y datos sensibles).
6. **Pregúntale al agente:** dos preguntas reales de ese rol.

Ejemplo, capítulo 3 · Legal (frases de narración, ≤ 19 palabras por escena):

- «¿Qué onda, Legal? Tu día arranca en Mis pendientes: ahí cae todo lo que espera tu firma.»
- «En "Te toca registrar" salen las constancias, y también COF y contratos del carril Legal.»
- «Abres la card, subes la constancia firmada y pones la fecha límite. Arrancan los ciento veinte días.»
- «Mientras Proyectos le chambea, tú vas con la COF y el contrato. Sin eso, no abre nadie.»
- «A dos meses de abrir, el CRM te avisa solito. ¡Aguas con las fechas!»
- «¿Dudas? "¿Qué COF se nos vencen este mes?" y listo.»

Preguntas de consulta por rol (el agente ya las contesta con `consultar_card`, `consultar_bloqueadas`, `consultar_vencimientos` e `historial_card`):

| Rol | Pregunta |
| --- | --- |
| Ventas | «¿Qué onda con Mariana? ¿Qué le falta para la etapa 5?» · «¿Cuáles de mis leads están atorados?» |
| Aprobación de locales | «¿Qué sucursales esperan dictamen?» |
| Legal | «¿Qué tiene atorado Legal?» · «¿Qué COF se nos vencen este mes?» |
| Proyectos | «¿Cómo va Juriquilla? ¿Cuántos días le quedan?» · «¿Qué obras están por vencer?» |
| Finanzas | «¿Qué pagos faltan por validar?» · «¿Qué sucursales ya traen multa?» |
| Heads | «¿Quién liberó el candado de León Plaza Sur y por qué?» |

## 4. Arreglos hechos en este encargo (rama `feat/crm-agente-card`)

Lo que se vio al armar el guion y que confundiría a alguien en su primer día:

| # | Antes | Ahora |
| --- | --- | --- |
| 1 | Los avisos de Finanzas caían en Mis pendientes de Ventas; Finanzas no veía los suyos. | Cada área ve sus avisos. |
| 2 | «Avanzar» y el arrastre en el Pipeline se activaban para cualquier editor; el error salía hasta la base. | Solo se activan en las etapas de tu área (y función de Aprobación de locales), igual que la regla de la base. |
| 3 | En 26.7, «Avanzar a 26.8» parecía listo con el carril Legal incompleto, y se ofrecía «Liberar candado», que no lo cubre. | El botón se apaga y dice cuántos hitos de Legal faltan; «Liberar candado» solo sale si falta algo de la etapa. |
| 4 | Legal nunca salía en «Te toca registrar» (el carril corre en paralelo). Las cards de la etapa 6 les salían a todos en Ventas. | Legal ve las sucursales con COF o contrato pendiente; la etapa 6 solo le sale a quien tiene la función. |
| 5 | Un requisito ajeno no tenía botón ni explicación. | Dice «Lo registra X; tú lo ves para dar seguimiento», y marca cuando es de Aprobación de locales. |
| 6 | «Por validar · los registró otra persona» incluía lo que registraste tú. | Ya no los incluye. |
| 7 | «Mis leads como vendedor» salía a Legal, Proyectos y Finanzas. | Solo a Ventas, heads o a quien tenga leads a su nombre. |
| 8 | Proyectos podía elegir PLD, Survey o factura al subir y la carga fallaba con un error genérico. | Esos tipos solo aparecen a quien los puede ver. |
| 9 | El carril Legal decía «cinco hitos» y cuenta cuatro; el aviso de transferencia dejaba vacío «Próximo vencimiento». | Texto corregido; la transferencia tiene su etiqueta. |
| 10 | El agente no sabía decir cómo va una card. | Nueva herramienta `consultar_card`: paso, faltantes, carril Legal y días al límite. |

## 5. Pendientes que necesitan decisión de Carlo (tocan la base)

1. ~~**Un head de cualquier área actúa como head de todas.**~~ **Decidido (Carlo, 2026-11-15): se queda así.** Solo los heads liberan candados, y lo hacen en cualquier área, siempre con motivo. Los miembros mueven solo las etapas de su área. El capítulo 6 del video lo explica así.
2. ~~**Requisitos por campo**~~ **Hecho (migración 55):** cada dato lo captura solo su área o un head; la base lo exige y Resumen muestra «Lo captura Legal». Quién y cuándo salen de la bitácora y se ven junto al requisito. Antes: (fecha límite, fechas de apertura, Jestor) quedan «Validado» sin quién ni cuándo, y cualquier editor los puede capturar desde Resumen. Propuesta: registrar autor en la bitácora del requisito y limitar el campo al área que lo cumple.
3. **La bitácora muestra nombres internos** («comprobante_apartado», «fecha_limite_apertura»). Propuesta: traducirlos en la vista de la bitácora (sin migración) y cambiar los textos del disparador en la próxima migración.
4. ~~**Avisos atendidos desaparecen sin rastro.**~~ **Hecho:** Vencimientos tiene «Atendidos» con quién y cuándo (los últimos 30). Antes: Propuesta: sección «Atendidos» con quién y cuándo en Vencimientos.
5. ~~**No hay pantalla para reasignar vendedor ni para cancelar en cascada,**~~ **Hecho:** en la ficha del franquiciatario un head tiene «Reasignar» (a alguien de Ventas, con motivo; migración 55) y «Descartar con sus sucursales» (con motivo). Un lead sin vendedor lo puede tomar cualquiera de Ventas. Antes: aunque los mensajes de error las mencionan.
6. **Admin:** falta el head de Finanzas; la casilla de Aprobación de locales se puede marcar en cualquier área pero solo sirve en Ventas; «Usuarios por área» solo muestra tu propia fila si no eres admin de Costeo.
7. **Vencimientos, Panel y Pipeline sin filtro «Lo mío».** Se puede hacer sin migración; queda para la siguiente vuelta junto con el capítulo 0.
8. **Decidido: sin doble firma.** «Validar» casi nunca aparece, porque desde la migración 50 cada requisito lo cumple y valida la misma área. Si se quiere la doble firma (p. ej. Finanzas valida lo que sube Ventas), hay que cambiar `area_valida`.

## 6. Producción

1. Capturas por rol con usuarios sintéticos (`?vista-crm=` del arnés, una sesión por área), mismas reglas que doc 41 §13: datos ficticios, nada de PII.
2. Guion en `guion-roles.json`, con la misma estructura que `guion.json` y la escena nueva `tipo: "rol"` (qué ves / qué no ves).
3. Voz: la misma del video general. HeyGen pide plan pagado para TTS; la música del catálogo sí funciona con la cuenta gratis.
4. Render por capítulo y un compilado; capítulos `.vtt` para incrustarlos en `/crm/proceso` junto al video general.
