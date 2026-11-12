import { assertEquals } from "@std/assert";
import { camposDeZoho, difCatalogo, estatusDeZoho, leadTimeDeZoho } from "./catalogoZoho.ts";

Deno.test("estatusDeZoho: misma regla que el Excel", () => {
  assertEquals(estatusDeZoho({ status: "inactive", cf_estatus_operativo: "Compra Recurrente" }), "Inactivo");
  assertEquals(estatusDeZoho({ status: "active", cf_estatus_operativo: "Inactivo" }), "Inactivo");
  for (const e of ["Compra Recurrente", "Compra Unica", "Prueba", "Hasta Agotar Existencias"]) assertEquals(estatusDeZoho({ status: "active", cf_estatus_operativo: e }), e);
  assertEquals(estatusDeZoho({ status: "active", cf_estatus_operativo: "" }), null);
  assertEquals(estatusDeZoho({ status: "active", cf_estatus_operativo: "Otro" }), null);
});

Deno.test("camposDeZoho: solo valores utilizables; costo 0 o vacío no se toma", () => {
  assertEquals(camposDeZoho({ status: "active", cf_estatus_operativo: "Compra Recurrente", cf_local_o_importado: "local", purchase_rate: 420,
    vendor_name: "CAFICULTORES OMAC", cf_modelo_de_negocio: "The Coffee", cf_clasificacion: "Insumos Operativos", cf_clasificacion_detallada: "Café", cf_exclusivo_gdl: "No" }),
    { estatus: "Compra Recurrente", origen: "LOCAL", costo_unitario: 420, proveedor_preferido: "CAFICULTORES OMAC", modelo_negocio: "The Coffee",
      clasificacion: "Insumos Operativos", clasificacion_detallada: "Café", exclusivo_gdl: false });
  assertEquals(camposDeZoho({ status: "active", purchase_rate: 0, vendor_name: "", cf_exclusivo_gdl: "Sí" }), { exclusivo_gdl: true });
  assertEquals(camposDeZoho({ status: "active", purchase_rate: "abc" }), {});
});

Deno.test("leadTimeDeZoho: entero > 0 o null", () => {
  assertEquals(leadTimeDeZoho({ cf_lead_time_proveedor: "3" }), 3);
  assertEquals(leadTimeDeZoho({ cf_lead_time_proveedor: "" }), null);
  assertEquals(leadTimeDeZoho({ cf_lead_time_proveedor: "0" }), null);
});

Deno.test("difCatalogo: solo lo que cambia; números comparados como número", () => {
  assertEquals(difCatalogo({ estatus: "Compra Recurrente", costo_unitario: "420", origen: "LOCAL" }, { estatus: "Compra Recurrente", costo_unitario: 420, origen: "IMPORTADO" }),
    [{ campo: "origen", antes: "LOCAL", despues: "IMPORTADO" }]);
  assertEquals(difCatalogo({ estatus: null }, {}), []);
});
