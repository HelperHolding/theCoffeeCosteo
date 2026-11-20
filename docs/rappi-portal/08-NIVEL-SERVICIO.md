# 08 · Nivel de servicio y Conectividad de Rappi (fase 1: datos)

Fecha: 2026-11-20. Carlos pidió llevar «Nivel de servicio» y «Conectividad» del portal de Rappi Partners a la
plataforma:

- una 4.ª sección en cada sucursal (junto a Ventas, Costeo y Consumo);
- un apartado en el Tablero de México;
- un reporte descargable con filtro de día.

Hay tres fases:

1. **Datos.** Este documento: el lector lee, n8n guarda y Supabase conserva.
2. **Sección por sucursal** con su Excel.
3. **Apartado nacional.**

La integración con el módulo la revisó la sesión «Módulo Sucursales». Su respuesta está resumida en §6.

## 1. Fuentes (auditoría del 2026-11-20, solo lectura)

Las sondas corrieron en el contenedor del lector, con su sesión, sin clics y bloqueando todo lo que no fuera GET o
estas consultas. La marca The Coffee es `brandId 575472`. El portal manda las fechas en hora del centro.

| Consulta (base `services.rappi.com/rests-partners-gateway/cauth`)                   | Qué trae                                                                                                                                                                                        | Cómo se pide                                                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| POST `/api/rest-aliados-state-ms/store-status-detail/retrieve?country=MX`           | Estado en vivo: `ACTIVE`/`INACTIVE`, «Until 20/11/2026 - 20:30:00» (cierre de hoy), motivo («Not ready to sell»)                                                                                | IDs numéricos, de 10 en 10                                                                   |
| POST `/partners-indicators/indicators/v2/summary/metrics`                           | Por día:<br>• rechazos: CBPI, CBPR, tienda cerrada, sin stock, demora en tienda<br>• reclamos: mal estado, faltante, incorrecto<br>• disponibilidad e indisponibilidad (%)<br>• cocina demorada | Una tienda por llamada (si no, suma). Rango de hasta 31 días: con más de ~45, agrupa por mes |
| POST `/partners-indicators/indicators/unavailability/metrics`                       | Minutos sin disponibilidad y eventos por franja, por tienda                                                                                                                                     | Todas las tiendas, un día por llamada (un rango lo suma)                                     |
| POST `/partners-indicators/summary/sales/indicators?with_variation=false`           | Espera promedio del repartidor (`rt_wait_time`)                                                                                                                                                 | Una tienda y un día por llamada                                                              |
| POST `/partners-indicators/indicators/defects`                                      | Cada reclamo:<br>• motivo y subtipo<br>• producto<br>• comentario del cliente<br>• `order_id` y fecha<br>• nombre de la tienda (no su ID)<br>• monto compensado                                 | Todas las tiendas; páginas de 200                                                            |
| GET `/partners-indicators/indicators/store/availability-monitoring/{id}?country=MX` | «Promedio en 15 días»: fracción del tiempo disponible por hora × día de la semana                                                                                                               | Ventana móvil fija; ignora `from`/`to`                                                       |
| GET `/api/rests-score/performance-system/find/brandId/575472?country=MX`            | Categoría de Top Restaurantes por tienda (actual y próxima)                                                                                                                                     | Una llamada                                                                                  |

**Historial:** Rappi tiene datos desde antes del 10 de agosto de 2026; el 1 de mayo ya hay pedidos.

**Botones de escritura:** en la misma página existen los de abrir y cerrar tiendas (`groot/partners/switch-stores…`,
`rest-stores-adm/stores/on-hold/timed`). **No están en ninguna lista del lector.** Tampoco se usa «Descargar Excel» del
portal.

## 2. Qué lee cada corrida (`planServicio` en `servicios/rappi-portal/servicio.mjs`)

| Corrida                   | Conectividad | Indicadores y reclamos                            | Espera del repartidor                | Calor de 15 días · Top |
| ------------------------- | ------------ | ------------------------------------------------- | ------------------------------------ | ---------------------- |
| Vivo (cada 10 min)        | Siempre      | Solo la de cada hora (minuto < 10 en México): hoy | Hoy, en la de cada hora              | Top en la de cada hora |
| Cierre 5:07               | Sí           | Los 7 días anteriores (Rappi corrige tarde)       | Ayer                                 | Ambos                  |
| Repaso (domingo)          | Sí           | Los 14 días anteriores                            | —                                    | —                      |
| Manual (`servicio: true`) | —            | Los días pedidos (≤ 31)                           | Con `espera: true` (≤ 400 consultas) | —                      |

**Si algo falla, la corrida de pedidos no se cae.**

- Lo que falla se reporta en `servicio_error` y en el mensaje.
- Lo que sí se leyó se guarda.
- A los 8 min se corta, porque n8n espera 10.

**Prueba real del 2026-11-20** (copia del lector en otro puerto y otra carpeta, 3 tiendas):

- **Cierre en 21 s.** Trajo:
  - conectividad;
  - 21 tienda-días;
  - 3 reclamos, cada uno con su tienda;
  - el calor de 15 días;
  - Top Restaurantes.
- **Manual del 10 y 11 de agosto en 29 s,** con la espera del repartidor.

## 3. Formato del lote

El lector agrega `servicio` (y `servicio_error`, si hubo fallas) al lote de pedidos. «Armar lote» en n8n lo separa:

- los pedidos van a `rappi_importar`;
- `{p: servicio}` va a `rappi_importar_servicio`.

```json
{
  "momento": "2026-11-20T18:07:00.000Z",
  "conectividad": [
    { "tienda": "MX1930384164", "estado": "ACTIVE", "motivo": "", "cierre": "Until 20/11/2026 - 20:30:00" }
  ],
  "dias": [
    {
      "tienda": "MX1930384164",
      "fecha": "2026-11-19",
      "pedidos": 12,
      "rech_cbpi": 0,
      "…": "…",
      "sin_disp_minutos": 120,
      "sin_disp_franjas": { "madrugada": 0, "…": 0 },
      "espera_repartidor": 0
    }
  ],
  "reclamos": [
    {
      "pedido": "2489855527",
      "tienda": "MX1930384164",
      "fecha": "2026-11-18",
      "motivo": "missing_item",
      "subtipo": "missing_ingredient",
      "producto": "Miel",
      "comentario": "…",
      "monto": 2.13
    }
  ],
  "disponibilidad_semana": [
    { "tienda": "MX1930384164", "fecha": "2026-11-20", "matriz": { "09:00": { "mon": 0.714 } } }
  ],
  "top": [
    { "tienda": "MX1930384164", "fecha": "2026-11-20", "categoria": "1. Top 5%", "proxima": "1. Top 5%" }
  ]
}
```

**De qué tienda es cada reclamo.** Se busca primero por el pedido, si lo trajo el historial de esa corrida. Si no, por el
nombre de la tienda. Si no se sabe, se reporta como «sin tienda»: no se adivina.

## 4. Tablas (migración 81)

Todas tienen RLS sin políticas y quedan cerradas para anon y authenticated. Solo `service_role` las escribe, por
`rappi_importar_servicio`.

- **`rappi_servicio_dia`** (tienda, fecha): los indicadores de §1. Cada fuente llena sus columnas y no borra las de las
  demás.
- **`rappi_reclamos`** (pedido): un reclamo por pedido; si Rappi cambia el monto, se actualiza.
- **`rappi_conectividad`**: tramos de estado.
  - `desde` es la primera foto con ese estado, `visto` la última que lo confirmó y `hasta` la primera con otro estado.
  - Una foto más vieja que la última se ignora.
  - `cierra` sale de «Until …» en hora del centro.
- **`rappi_disponibilidad_semana`** (tienda, día de lectura): la matriz de 15 días.
- **`rappi_top_restaurantes`** (tienda, día de lectura): categoría actual y próxima.

Una tienda que no está en `rappi_tiendas` se cuenta en `ignoradas` y no rompe el lote. n8n la reporta.

## 5. Avisos (flujo de n8n)

**Un problema de Nivel de servicio no cambia el estado de la corrida**, porque los pedidos sí se guardaron. Se junta en
el correo diario del cierre (5:07) como «falla de Nivel de servicio», junto a las corridas que se recuperaron solas y
las fallas sueltas. Cuenta como problema que el lector no lo leyera, que Supabase no lo guardara o que trajera tiendas
sin alta.

La credencial de «Guardar servicio» es la misma de «Guardar en Supabase»; el script que sube el flujo la copia.

## 6. Integración con Sucursales (respuesta de «Módulo Sucursales», para las fases 2 y 3)

**Sección por sucursal**

- Archivos que se tocan:
  - `components/sucursales/secciones.tsx` (`IdSeccion`, `SECCIONES`, `visibles`);
  - `app/(sucursales)/sucursales/[companyId]/page.tsx` (`?seccion=`);
  - una ruta nueva con `autorizar(params)` y `leerPeriodo(...)`.
- No usa origen: va sin él, como Ventas.
- Sin `cfg.rappiPortal`: 404 y sin sección.

**Lecturas:** por RPC `security definer` con candado `sucursales_acceso`, `revoke public, anon` y
`grant authenticated`. Para lo nacional, una RPC con `p_companias integer[]` en una sola llamada.

**Zona horaria:** convertir por zona. Tijuana y Hermosillo van −1 h y Cancún +1 h.

**Tablero de México**

- Va en `vistas-mexico.tsx` (`?vista=`) y `mexico/page.tsx`.
- Muestra «N de 79 con Rappi». Las 6 sin tienda en el portal aparecen listadas, nunca como cero.

**Excel:** patrón de `lib/sucursales/consumo-excel.ts`, con función pura y descarga en el cliente con `xlsx`.

**Diseño**

- Skills frontend-design, dataviz y movimiento-web.
- Colores de `colores.tsx`: Rappi `#1baf7a`.
- Reutilizar `CalendarioVenta`, `MapaMexico` y `Tooltip` de `graficas-mexico.tsx`, avisando a su dueño.
- KPI de 40 px como máximo; nada estimado se muestra como dato.
