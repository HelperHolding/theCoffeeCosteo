# Zoho CRM — Inventario de documentos (Fase 3)

Snapshot 2026-10-19 22:02 UTC. **No se descargó ningún archivo.** Solo se leyó la metadata: nombre (solo para extensión y duplicados, sin guardarlo), tamaño y módulo.

## 1. Adjuntos (related list "Archivos adjuntos")

| Dato | Valor |
| --- | --- |
| Total | **292 archivos** |
| Tamaño total | **95.4 MB** (máximo 9.5 MB por archivo) |
| Por módulo | Leads 136 · Tiendas 117 · Notas 14 · Contactos 10 · Cuentas 8 · Prospectos_Expansion 7 (fuera de alcance) |
| Extensión (MIME inferido) | pdf 261 (application/pdf) · png 14 · jpeg 13 · xml 3 (probablemente CFDI) · sin extensión 1 |
| Duplicados (mismo nombre y tamaño) | 6 grupos con 28 archivos |
| Errores | 0 |

La API no da el MIME: se infiere por extensión y se valida al descargar.

## 2. Campos de archivo (fileupload) en registros

| Módulo | Campo | Registros con archivo | Archivos | Tamaño | Extensiones |
| --- | --- | ---: | ---: | --- | --- |
| Tiendas | Proyecto 3D | 36 | 36 | 5.5 MB (máx. 2.3 MB) | pdf 35 · jpeg 1 |
| Tiendas | Proyecto Ejecutivo | 47 | 47 | 49.7 MB (máx. 9.5 MB) | pdf 46 · sin extensión 1 |
| Cuentas | 7 campos de documentación (INE, CSF, SAT/IMSS, Estado de cuenta, Comprobante de domicilio, Contrato de bloqueo de zona) | 0 | 0 | — | — |

**Posible superposición:** el tamaño máximo coincide exactamente (9,484,495 bytes) entre los adjuntos y Proyecto Ejecutivo. Zoho podría listar los archivos de los campos fileupload también como adjuntos de Tiendas. Se confirma al descargar, deduplicando por `File_Id`. **Volumen único estimado: entre 95.4 MB y 150.6 MB.**

## 3. Ligas externas (no son archivos en Zoho)

| Módulo | Campo | Registros |
| --- | --- | ---: |
| Tiendas | Dictamen de Aprobación de Local | 33 |
| Tiendas | Link a carpeta de contrato | 27 |
| Tiendas | Checklist Pre-Apertura · Funcionamiento de Máquinas · Certificado de Looker | 2 · 1 · 1 |
| Cuentas | LINK (junto al campo de contraseña excluido) | 18 |

Apuntan a almacenamiento externo (por verificar si es Drive o WorkDrive). El CRM nuevo puede guardar la liga sin copiar el contenido.

## 4. Datos sensibles

Por las etiquetas de los módulos `File_Upload_*`, los adjuntos incluyen documentos de identidad (INE), constancias fiscales, comprobantes de domicilio, contratos y facturas. Al copiarlos se necesita Storage privado con RLS, rutas no predecibles y bitácora de acceso.

## 5. Decisión (Carlos, 2026-10-19): copiar todo lo que existe en cada tarjeta y apartado

Se aplica en la fase de importación, después de una descarga piloto de 5 archivos. El plan original queda abajo como referencia; los puntos 1 y 2 se amplían a **todos** los adjuntos de Leads, Contactos, Cuentas, Tiendas y Notas, y los fileupload, en su tarjeta y su sección.


1. Copiar adjuntos y fileupload de **Tiendas, Cuentas y Contactos**, unos 135 archivos más los fileupload, deduplicados por `File_Id`.
2. **Leads (136 adjuntos):** copiar solo los de leads que se importen.
3. Omitir Prospectos_Expansion (fuera de alcance).
4. Guardar las ligas externas como URL.
5. Descarga piloto de 5 archivos para validar el MIME real, el tamaño y la superposición antes de la copia completa.
