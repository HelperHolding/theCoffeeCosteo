// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la configuración de Importaciones y Café del sitio viejo (app/index.html a9e4a22, líneas 35800–36038):
// los parámetros que vienen de las Sheets (_IMP_HOJA_*, _CAFE_*), _impCfgDef/_impCfgNorm, _cafeCfgDef/_cafeCfgNorm y las
// etiquetas del historial (_IMP_ETQ, _impCafeEtq). Mismos nombres sin el guion bajo. impCafeCfg_parity_test.ts compara
// contra la app.
import { planCfgNum } from "./planEngine.ts";
import { impFechaOk, impTxt } from "./planDatos.ts";

// ── Parámetros que vienen de tu Sheet de importados (se precargan; son tuyos y se pueden cambiar) ──
export var IMP_HOJA_ITEMS: any[][] = [
  ['INS-DES-021','Vaso caliente 12 oz','Vaso caliente','Green Packaging','cajas',0.6314,1.95,1,200,568.19,0.079,'Confirmado por Procurement (1-oct-26)','KRAFT 12 OZ'],
  ['INS-DES-002','Vaso 120 ml (espresso)','Vaso 120 ml','Green Packaging','cajas',0.025,0.8,1,40,697.44,0.06,'Estimado: confirmar','KRAFT ESPRESSO'],
  ['INS-DES-003','Vaso frío 20 oz','Vaso frío','Green Packaging','cajas',0.5482,1.35,1,100,1360,0.096,'Confirmado por Procurement (1-oct-26)','PET 20 OZ'],
  ['INS-DES-004','Vaso caliente 8 oz','Vaso caliente','Green Packaging','cajas',0.7013,2.55,1,200,510,0.065,'Confirmado por Procurement (1-oct-26)','KRAFT 8 OZ'],
  ['INS-DES-005','Vaso frío 14 oz (440 ml)','Vaso frío','Green Packaging','cajas',0.9029,1.5,1,100,960,0.1,'Confirmado por Procurement (1-oct-26)','PET 14 OZ'],
  ['INS-DES-012','Tapa caliente 80 mm (8 oz)','Tapa caliente','Green Packaging','cajas',0.3489,1.25,1,50,360,0.035,'Confirmado por Procurement (1-oct-26)','PS BLACK LID 80 MM'],
  ['INS-DES-013','Tapa caliente 90 mm (12 oz)','Tapa caliente','Green Packaging','cajas',0.3367,1,1,50,349.62,0.046,'Confirmado por Procurement (1-oct-26)','PS BLACK LID 90 MM'],
  ['INS-DES-008','Tapa plana vaso frío','Tapa fría','Green Packaging','cajas',1.3946,2.75,1,50,296.44,0.031,'Confirmado por Procurement (1-oct-26)','PET TRANSPARENT FLAT LID'],
  ['MER-TER-001','Termo 240 ml blanco','Termos','Easy Drinkware','piezas',0.7589,4.75,48,1000,120.15,0.001375,'',''],
  ['MER-TER-002','Termo 240 ml negro','Termos','Easy Drinkware','piezas',0.6493,4.9,48,1000,120.15,0.001375,'',''],
  ['MER-TER-003','Termo 360 ml blanco','Termos','Easy Drinkware','piezas',0.7881,3.5,48,1000,127.71,0.001667,'',''],
  ['MER-TER-004','Termo 360 ml negro','Termos','Easy Drinkware','piezas',0.7641,2.15,48,1000,127.71,0.001667,'',''],
  ['MER-TAZ-001','Taza 300 ml negra','Tazas','Proveedor actual (vía SIMBS)','piezas',0.2369,4.7,1,0,76.22,0,'',''],
  ['MER-TAZ-002','Taza 300 ml blanca','Tazas','Proveedor actual (vía SIMBS)','piezas',0.2975,4.7,1,0,76.22,0,'',''],
  ['MER-PAR-001','Paraguas blanco','Paraguas','Proveedor actual (vía SIMBS)','piezas',0.0931,2.85,1,0,172.07,0,'',''],
  ['MER-PAR-002','Paraguas transparente','Paraguas','Proveedor actual (vía SIMBS)','piezas',0.1249,2.9,1,0,172.07,0,'',''],
  ['INS-BA-063','Bolsa café 250 g negra','Merch café / bolsas','LQC Printing','paq. 25',0.0612,0.182,56,0,189.25,0,'',''],
  ['INS-BA-064','Bolsa café 250 g kraft','Merch café / bolsas','LQC Printing','paq. 25',0.1153,0.186,52,0,189.25,0,'',''],
  ['INS-BA-065','Bolsa café 250 g blanca','Merch café / bolsas','LQC Printing','paq. 25',0.2336,0.318,56,0,189.25,0,'','']
];
export var IMP_HOJA_PROV: any[] = [
  {clave:'Green Packaging',nombre:'Green Packaging (vasos y tapas)',lead:85,cierres:15,nota:'Órdenes reales: 79-97 días a puerto + aduana y flete. Cierres: Año Nuevo Chino / fin de año.',contenedor:true},
  {clave:'Easy Drinkware',nombre:'Easy Drinkware (termos)',lead:90,cierres:8,nota:'35 días de producción confirmados por el proveedor; resto estimado.',contenedor:false},
  {clave:'Proveedor actual (vía SIMBS)',nombre:'Tazas y paraguas (vía SIMBS)',lead:90,cierres:10,nota:'Lead time registrado en Zoho.',contenedor:false},
  {clave:'LQC Printing',nombre:'LQC Printing (bolsas)',lead:90,cierres:10,nota:'Supuesto: el proveedor no ha confirmado tiempos.',contenedor:false}
];
export var IMP_HOJA_TEMP: Record<string, number[]> = {
  'Vaso caliente':[1.277,1.085,1,1,1,1,1,1,1,1.048,1.129,1.249],
  'Tapa caliente':[1.277,1.085,1,1,1,1,1,1,1,1.048,1.129,1.249],
  'Vaso frío':[0.842,1.101,1,1,1,1,1,1,1,0.919,0.862,0.809],
  'Tapa fría':[0.842,1.101,1,1,1,1,1,1,1,0.919,0.862,0.809],
  'Vaso 120 ml':[1,1,1,1,1,1,1,1,1,1,1,1],
  'Termos':[1.11,0.96,1,1,1,1,1,1,1,1.36,1.84,2.06],
  'Tazas':[1.33,0.87,1,1,1,1,1,1,1,0.95,2.38,2.53],
  'Paraguas':[0.12,0.1,0.3,0.5,1,1.3,1.3,1.3,1,0.3,0.1,0.1],
  'Merch café / bolsas':[1.561,1.146,1,1,1,1,1,1,1,1,1.142,1.529],
  'General':[1,1,1,1,1,1,1,1,1,1,1,1]
};
// ── Parámetros que vienen de tu Sheet de café 2027 ──
export var CAFE_PROD: { id: string; nombre: string; color: string; pres: string; kg: number }[] = [
  {id:'white_1kg',nombre:'White 1 kg',color:'White',pres:'1 kg',kg:1},
  {id:'kraft_1kg',nombre:'Kraft 1 kg',color:'Kraft',pres:'1 kg',kg:1},
  {id:'black_1kg',nombre:'Black 1 kg',color:'Black',pres:'1 kg',kg:1},
  {id:'white_250g',nombre:'White 250 g',color:'White',pres:'250 g',kg:0.25},
  {id:'kraft_250g',nombre:'Kraft 250 g',color:'Kraft',pres:'250 g',kg:0.25},
  {id:'black_250g',nombre:'Black 250 g',color:'Black',pres:'250 g',kg:0.25}
];
export var CAFE_HOJA: any = {
  mezcla:[0.886,0.031,0.023,0.03,0.019,0.011],precio:[280,310,400,280,310,400],empaque:[0,0,0,7.57,7.57,7.57],venta:[400,426.6,500,100,106.65,125],
  nuevo_precio:[220,250,280,220,250,280],nuevo_empaque:[null,null,null,7.57,7.57,7.57],
  nota_empaque:'Empaque fijo $7.57 (precio actual). Revisar precio de venta.'
};

export var IMP_ESCS = ['Pesimista','Base','Optimista','Manual'];
export var CAFE_ESCS = ['Pesimista','Base','Optimista'];
export var IMP_CONT_TIPOS = ["40' HQ","45' HQ",'Personalizado'];
export var MESES_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
var IMP_DEF_JSON: string | null = null, CAFE_DEF_JSON: string | null = null;
// Las claves (SKU, proveedor, familia) viajan dentro de rutas "a.b.c" del historial de cambios: no pueden llevar puntos.
export function impClave(v: any): string { return impTxt(v,60).replace(/\./g,' ').replace(/\s+/g,' '); }
export function impArr(a: any, n: number, rango: [number, number, number], def: any[]): any[] { var o: any[] = [],i; for(i=0;i<n;i++)o.push(planCfgNum(Array.isArray(a)?a[i]:undefined,rango,def[i])); return o; }
// Mapa por mes calendario 'AAAA-MM' -> número (el plan no se corre cuando pasa el tiempo: cada mes conserva su valor).
export function impMapMes(src: any, rango: [number, number, number], def: any): Record<string, number> {
  if(src&&typeof src==='object'&&!Array.isArray(src)){
    var out: Record<string, number> = {};
    Object.keys(src).slice(0,240).forEach(function(k){if(/^20\d\d-(0[1-9]|1[0-2])$/.test(k)&&src[k]!==null&&src[k]!==''&&src[k]!==undefined)out[k]=planCfgNum(src[k],rango,0);});
    return out;
  }
  return JSON.parse(JSON.stringify(def));
}
export function impMesTxt(k: any): string { var p=String(k).split('-'); return p.length<2||!(+p[1]>=1&&+p[1]<=12)?String(k):MESES_ABR[+p[1]-1]+' '+p[0].slice(2); }

export function impCfgDef(): any {
  if(!IMP_DEF_JSON){
    var items: Record<string, any> = {},orden: string[] = [],temporada: Record<string, number[]> = {};
    IMP_HOJA_ITEMS.forEach(function(a){
      items[a[0]]={nombre:a[1],familia:a[2],prov:a[3],unidad:a[4],venta:a[5],kit:a[6],empaque:a[7],minimo:a[8],costo:a[9],cbm:a[10],cbm_fuente:a[11],alias:a[12],activo:true,camino_qty:0,camino_fecha:''};
      orden.push(a[0]);
    });
    Object.keys(IMP_HOJA_TEMP).forEach(function(k){temporada[k]=IMP_HOJA_TEMP[k].slice();});
    IMP_DEF_JSON=JSON.stringify({
      escenario:'Base',
      escenarios:{Pesimista:{crec:0.05,cumpl:0.6,ajuste:-0.1},Base:{crec:0.1,cumpl:1,ajuste:0},Optimista:{crec:0.15,cumpl:1.2,ajuste:0.1},Manual:{crec:0.06,cumpl:1,ajuste:0}},
      red:{suc_hoy_modo:'auto',suc_hoy:75,meses_pipeline:3,plan_def:10,plan:{'2026-10':9,'2026-11':8,'2026-12':8},cierres:{}},
      politica:{meses_cobertura:3,meses_respaldo:1,dias_margen:7,dias_juntar:60},
      prov:IMP_HOJA_PROV,
      contenedor:{tipo:"40' HQ",cbm40:70,cbm45:86,cbmp:70,llenado:1,por_embarque:1,dias_respaldo:15},
      puente:{dias_colchon:7,multiplo:5},
      temporada:temporada,
      fuentes:{venta:'hoja',kit:'hoja'},venta_ventana:90,
      corregir_hoja:true,prorratear_mes1:true,
      orden:orden,items:items
    });
  }
  return JSON.parse(IMP_DEF_JSON as string);
}
export function impCfgNorm(x: any): any {
  var c=impCfgDef(),d=impCfgDef(),N=planCfgNum;
  if(!x||typeof x!=='object')return c;
  var es=x.escenarios&&typeof x.escenarios==='object'?x.escenarios:{};
  IMP_ESCS.forEach(function(k){
    var e=es[k];if(!e||typeof e!=='object')return;
    c.escenarios[k]={crec:N(e.crec,[-0.5,1,0],d.escenarios[k].crec),cumpl:N(e.cumpl,[0,3,0],d.escenarios[k].cumpl),ajuste:N(e.ajuste,[-0.9,2,0],d.escenarios[k].ajuste)};
  });
  if(IMP_ESCS.indexOf(x.escenario)>=0)c.escenario=x.escenario;
  var r=x.red&&typeof x.red==='object'?x.red:{};
  c.red.suc_hoy_modo=r.suc_hoy_modo==='manual'?'manual':'auto';
  c.red.suc_hoy=N(r.suc_hoy,[0,5000,1],d.red.suc_hoy);
  c.red.meses_pipeline=N(r.meses_pipeline,[0,15,1],d.red.meses_pipeline);
  c.red.plan_def=N(r.plan_def,[0,500,1],d.red.plan_def);
  c.red.plan=impMapMes(r.plan,[0,500,1],d.red.plan);
  c.red.cierres=impMapMes(r.cierres,[0,500,1],d.red.cierres);
  var po=x.politica&&typeof x.politica==='object'?x.politica:{};
  c.politica={meses_cobertura:N(po.meses_cobertura,[1,14,1],3),meses_respaldo:N(po.meses_respaldo,[0,6,0],1),dias_margen:N(po.dias_margen,[0,60,1],7),dias_juntar:N(po.dias_juntar,[0,180,1],60)};
  if(Array.isArray(x.prov)){
    var provs: any[] = [],vistos: Record<string, 1> = {};
    x.prov.slice(0,12).forEach(function(p: any){
      if(!p||typeof p!=='object')return;
      var k=impClave(p.clave);if(!k||vistos[k.toLowerCase()])return;
      vistos[k.toLowerCase()]=1;
      provs.push({clave:k,nombre:impTxt(p.nombre,80)||k,lead:N(p.lead,[1,400,1],90),cierres:N(p.cierres,[0,120,1],0),nota:impTxt(p.nota,200),contenedor:p.contenedor===true});
    });
    if(provs.length){
      var ic=provs.findIndex(function(p){return p.contenedor;});if(ic<0)ic=0;
      provs.forEach(function(p,j){p.contenedor=j===ic;});
      c.prov=provs;
    }
  }
  var ct=x.contenedor&&typeof x.contenedor==='object'?x.contenedor:{};
  c.contenedor={tipo:IMP_CONT_TIPOS.indexOf(ct.tipo)>=0?ct.tipo:"40' HQ",cbm40:N(ct.cbm40,[1,300,0],70),cbm45:N(ct.cbm45,[1,300,0],86),cbmp:N(ct.cbmp,[1,300,0],70),
    llenado:N(ct.llenado,[0.1,1,0],1),por_embarque:N(ct.por_embarque,[1,10,1],1),dias_respaldo:N(ct.dias_respaldo,[0,120,1],15)};
  var pu=x.puente&&typeof x.puente==='object'?x.puente:{};
  c.puente={dias_colchon:N(pu.dias_colchon,[0,60,1],7),multiplo:N(pu.multiplo,[1,1000,1],5)};
  if(x.temporada&&typeof x.temporada==='object'){
    var tmp: Record<string, number[]> = {};
    Object.keys(x.temporada).slice(0,40).forEach(function(f){
      var k=impClave(f),a=x.temporada[f];
      if(!k||!Array.isArray(a)||a.length!==12)return;
      tmp[k]=a.map(function(v){return N(v,[0,10,0],1);});
    });
    if(Object.keys(tmp).length)c.temporada=tmp;
  }
  if(!c.temporada.General)c.temporada.General=[1,1,1,1,1,1,1,1,1,1,1,1];
  var fu=x.fuentes&&typeof x.fuentes==='object'?x.fuentes:{};
  c.fuentes={venta:fu.venta==='plataforma'?'plataforma':'hoja',kit:fu.kit==='plataforma'?'plataforma':'hoja'};
  c.venta_ventana=N(x.venta_ventana,[30,365,1],90);
  if(typeof x.corregir_hoja==='boolean')c.corregir_hoja=x.corregir_hoja;
  if(typeof x.prorratear_mes1==='boolean')c.prorratear_mes1=x.prorratear_mes1;
  if(x.items&&typeof x.items==='object'){
    var src=x.items,ord: string[]=Array.isArray(x.orden)?x.orden.slice():[],items: Record<string, any> = {},orden: string[] = [];
    Object.keys(src).forEach(function(k){if(ord.indexOf(k)<0)ord.push(k);});
    ord.slice(0,300).forEach(function(k0){
      var a=src[k0],k=impClave(k0);
      if(!k||items[k]||!a||typeof a!=='object')return;
      items[k]={nombre:impTxt(a.nombre,120)||k,familia:impClave(a.familia)||'General',prov:impClave(a.prov),unidad:impTxt(a.unidad,20)||'piezas',
        venta:N(a.venta,[0,10000,0],0),kit:N(a.kit,[0,10000,0],0),empaque:N(a.empaque,[1,1e6,0],1),minimo:N(a.minimo,[0,1e7,0],0),costo:N(a.costo,[0,1e7,0],0),
        cbm:N(a.cbm,[0,100,0],0),cbm_fuente:impTxt(a.cbm_fuente,120),alias:impTxt(a.alias,80),activo:a.activo!==false,
        camino_qty:N(a.camino_qty,[0,1e7,0],0),camino_fecha:impFechaOk(a.camino_fecha)?a.camino_fecha:''};
      orden.push(k);
    });
    c.items=items;c.orden=orden;
  }
  return c;
}

// ── Café 2027 ──
export function cafeCfgDef(): any {
  if(!CAFE_DEF_JSON){
    var prod: Record<string, any> = {};
    CAFE_PROD.forEach(function(p,i){prod[p.id]={mezcla:CAFE_HOJA.mezcla[i],precio:CAFE_HOJA.precio[i],empaque:CAFE_HOJA.empaque[i],venta:CAFE_HOJA.venta[i],nuevo_precio:CAFE_HOJA.nuevo_precio[i],nuevo_empaque:CAFE_HOJA.nuevo_empaque[i]};});
    var a12=function(n: number){var o: number[] = [],i;for(i=0;i<12;i++)o.push(n);return o;};
    CAFE_DEF_JSON=JSON.stringify({
      anio:2027,escenario:'Base',q4_modo:'auto',
      escenarios:{Pesimista:{crec:0.05,madura:35,apertura:45,ini:100,a0:3,aper:a12(3)},Base:{crec:0.1,madura:37,apertura:64,ini:100,a0:5,aper:a12(10)},Optimista:{crec:0.15,madura:39,apertura:75,ini:100,a0:5,aper:a12(8)}},
      cierres:a12(0),ajuste:0,comprometer:0.85,curva:[38,37,34,34,34],
      estacionalidad:[1.03,0.98,1.12,0.94,0.97,0.94,0.98,1.06,0.93,1,1.07,1.11],compra_ant:32700,prod:prod
    });
  }
  return JSON.parse(CAFE_DEF_JSON as string);
}
export function cafeCfgNorm(x: any): any {
  var c=cafeCfgDef(),d=cafeCfgDef(),N=planCfgNum;
  if(!x||typeof x!=='object')return c;
  c.anio=N(x.anio,[2026,2040,1],2027);
  if(['Pesimista','Base','Optimista'].indexOf(x.escenario)>=0)c.escenario=x.escenario;
  c.q4_modo=x.q4_modo==='manual'?'manual':'auto';
  var es=x.escenarios&&typeof x.escenarios==='object'?x.escenarios:{};
  ['Pesimista','Base','Optimista'].forEach(function(k){
    var e=es[k];if(!e||typeof e!=='object')return;
    var q=d.escenarios[k];
    c.escenarios[k]={crec:N(e.crec,[-0.5,1,0],q.crec),madura:N(e.madura,[0,1000,0],q.madura),apertura:N(e.apertura,[0,1000,0],q.apertura),ini:N(e.ini,[0,5000,1],q.ini),a0:N(e.a0,[0,200,1],q.a0),aper:impArr(e.aper,12,[0,200,1],q.aper)};
  });
  c.cierres=impArr(x.cierres,12,[0,200,1],d.cierres);
  c.ajuste=N(x.ajuste,[-0.9,2,0],0);
  c.comprometer=N(x.comprometer,[0,1,0],0.85);
  c.curva=impArr(x.curva,5,[0,1000,0],d.curva);
  c.estacionalidad=impArr(x.estacionalidad,12,[0,10,0],d.estacionalidad);
  c.compra_ant=N(x.compra_ant,[0,1e8,0],32700);
  var pr=x.prod&&typeof x.prod==='object'?x.prod:{};
  CAFE_PROD.forEach(function(p){
    var a=pr[p.id];if(!a||typeof a!=='object')return;
    var q=d.prod[p.id],nn=function(v: any,rg: [number, number, number],def: any){return v===null||v===''||v===undefined?null:N(v,rg,def);};
    c.prod[p.id]={mezcla:N(a.mezcla,[0,1,0],q.mezcla),precio:N(a.precio,[0,1e5,0],q.precio),empaque:N(a.empaque,[0,1e4,0],q.empaque),venta:N(a.venta,[0,1e5,0],q.venta),
      nuevo_precio:nn(a.nuevo_precio,[0,1e5,0],q.nuevo_precio),nuevo_empaque:nn(a.nuevo_empaque,[0,1e4,0],q.nuevo_empaque)};
  });
  return c;
}

// Etiquetas legibles para el historial de cambios de las secciones imp y cafe.
export var IMP_ETQ: Record<string, string> = {'imp.escenario':'Importaciones: escenario activo','imp.red.suc_hoy_modo':'Importaciones: sucursales hoy (modo)','imp.red.suc_hoy':'Importaciones: sucursales hoy','imp.red.plan_def':'Importaciones: aperturas por mes sin plan propio','imp.red.meses_pipeline':'Importaciones: meses que manda el pipeline',
  'imp.politica.meses_cobertura':'Importaciones: meses de cobertura','imp.politica.meses_respaldo':'Importaciones: meses de respaldo','imp.politica.dias_margen':'Importaciones: días de margen','imp.politica.dias_juntar':'Importaciones: días para juntar pedidos',
  'imp.contenedor.tipo':'Importaciones: tipo de contenedor','imp.contenedor.cbm40':'Importaciones: CBM del 40 HQ','imp.contenedor.cbm45':'Importaciones: CBM del 45 HQ','imp.contenedor.cbmp':'Importaciones: CBM personalizado','imp.contenedor.llenado':'Importaciones: llenado real','imp.contenedor.por_embarque':'Importaciones: contenedores por embarque','imp.contenedor.dias_respaldo':'Importaciones: días de respaldo del siguiente',
  'imp.puente.dias_colchon':'Importaciones: colchón de la compra puente','imp.puente.multiplo':'Importaciones: múltiplo de la compra puente','imp.fuentes.venta':'Importaciones: fuente de venta por sucursal','imp.fuentes.kit':'Importaciones: fuente del kit por apertura','imp.venta_ventana':'Importaciones: ventana de venta de la plataforma','imp.corregir_hoja':'Importaciones: corregir errores de la hoja','imp.prorratear_mes1':'Importaciones: ajustar el mes en curso',
  'cafe.anio':'Café: año','cafe.escenario':'Café: escenario activo','cafe.q4_modo':'Café: arranque del año (modo)','cafe.ajuste':'Café: ajuste general','cafe.comprometer':'Café: % a comprometer con el proveedor','cafe.compra_ant':'Café: compra del año anterior'};
export var IMP_ETQ_CAMPO: Record<string, string> = {nombre:'nombre',familia:'familia de temporada',prov:'proveedor',unidad:'unidad',venta:'venta por sucursal al mes',kit:'kit por apertura',empaque:'múltiplo de empaque',minimo:'mínimo del proveedor',costo:'costo',cbm:'CBM por unidad',cbm_fuente:'fuente del CBM',alias:'alias',activo:'incluido en el plan',camino_qty:'en camino manual (cantidad)',camino_fecha:'en camino manual (fecha)',
  crec:'crecimiento anual',cumpl:'cumplimiento de aperturas',ajuste:'ajuste de demanda',lead:'lead time',cierres:'cierres (días extra)',nota:'nota',contenedor:'es de contenedores',nombre_prov:'nombre',
  madura:'compra de sucursal madura (kg)',apertura:'compra del mes de apertura (kg)',ini:'sucursales al 1 de enero',a0:'aperturas por mes del último trimestre',aper:'aperturas',mezcla:'mezcla',precio:'precio del café por kg',venta_bolsa:'precio de venta',nuevo_precio:'precio nuevo por kg',nuevo_empaque:'empaque nuevo'};
/** _impCafeEtq. `imp` es la sección imp con la que se nombra al proveedor (el viejo leía el borrador global). */
export function impCafeEtq(clave: string, imp?: any): string {
  if(IMP_ETQ[clave])return IMP_ETQ[clave];
  var p: any[]=clave.split('.'),r=p[0]==='imp'?'Importaciones':'Café',M=MESES_ABR;
  if(p[0]==='imp'){
    if(p[1]==='items')return r+': '+p[2]+(p[3]?' · '+(IMP_ETQ_CAMPO[p[3]]||p[3]):'');
    if(p[1]==='escenarios')return r+': escenario '+p[2]+' · '+(IMP_ETQ_CAMPO[p[3]]||p[3]);
    if(p[1]==='red'&&p[2]==='plan')return r+': plan de aperturas, '+impMesTxt(p[3]);
    if(p[1]==='red'&&p[2]==='cierres')return r+': cierres, '+impMesTxt(p[3]);
    if(p[1]==='temporada')return r+': temporada '+p[2]+(p[3]!=null?' de '+M[+p[3]]:'');
    if(p[1]==='prov')return r+': proveedor '+((imp&&imp.prov[+p[2]])?imp.prov[+p[2]].nombre:('#'+(+p[2]+1)))+' · '+(IMP_ETQ_CAMPO[p[3]]||p[3]);
    if(p[1]==='orden')return r+': orden de artículos';
  }else{
    if(p[1]==='escenarios')return r+': escenario '+p[2]+' · '+(IMP_ETQ_CAMPO[p[3]]||p[3])+(p[4]!=null?' de '+M[+p[4]]:'');
    if(p[1]==='cierres')return r+': cierres de '+M[+p[2]];
    if(p[1]==='curva')return r+': curva de compra, mes '+(+p[2]+2);
    if(p[1]==='estacionalidad')return r+': estacionalidad de '+M[+p[2]];
    if(p[1]==='prod'){var pp=CAFE_PROD.find(function(q){return q.id===p[2];});return r+': '+(pp?pp.nombre:p[2])+' · '+(IMP_ETQ_CAMPO[p[3]==='venta'?'venta_bolsa':p[3]]||p[3]);}
  }
  return clave;
}
