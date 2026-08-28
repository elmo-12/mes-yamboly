import type {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Producto,
  Sede,
  TurnoDef,
} from '@mes/types';

export const sedes: Sede[] = [
  { id: 'SED-01', nombre: 'Planta Lima', ciudad: 'Lima', activa: true },
  { id: 'SED-02', nombre: 'Planta Chincha', ciudad: 'Chincha', activa: false },
];

export const SEDE_PRINCIPAL = 'SED-01';

export const lineas: Linea[] = [
  { id: 'LIN-01', codigo: 'L1', nombre: 'Paletas', sedeId: SEDE_PRINCIPAL, estado: 'activo', capacidadUnidadesMin: 95 },
  { id: 'LIN-02', codigo: 'L2', nombre: 'Conos', sedeId: SEDE_PRINCIPAL, estado: 'activo', capacidadUnidadesMin: 120 },
  { id: 'LIN-03', codigo: 'L3', nombre: 'Vasos', sedeId: SEDE_PRINCIPAL, estado: 'activo', capacidadUnidadesMin: 110 },
  { id: 'LIN-04', codigo: 'L4', nombre: 'Sándwich', sedeId: SEDE_PRINCIPAL, estado: 'activo', capacidadUnidadesMin: 80 },
  { id: 'LIN-05', codigo: 'L5', nombre: 'Bombones', sedeId: SEDE_PRINCIPAL, estado: 'activo', capacidadUnidadesMin: 140 },
  { id: 'LIN-PT', codigo: 'PT-01', nombre: 'Pasteurizador', sedeId: SEDE_PRINCIPAL, estado: 'activo', capacidadUnidadesMin: 60 },
];

export const productos: Producto[] = [
  { id: 'PRD-001', codigo: 'PAL-CHO-70', nombre: 'Paleta Chocolate', sabor: 'Chocolate', presentacion: '70 g', lineaId: 'LIN-01', velocidadEstandar: 95, estado: 'activo' },
  { id: 'PRD-002', codigo: 'PAL-FRE-70', nombre: 'Paleta Fresa', sabor: 'Fresa', presentacion: '70 g', lineaId: 'LIN-01', velocidadEstandar: 95, estado: 'activo' },
  { id: 'PRD-003', codigo: 'CON-VAI-120', nombre: 'Cono Vainilla 120 ml', sabor: 'Vainilla', presentacion: '120 ml', lineaId: 'LIN-02', velocidadEstandar: 120, estado: 'activo' },
  { id: 'PRD-004', codigo: 'CON-CHO-120', nombre: 'Cono Chocolate 120 ml', sabor: 'Chocolate', presentacion: '120 ml', lineaId: 'LIN-02', velocidadEstandar: 118, estado: 'activo' },
  { id: 'PRD-005', codigo: 'VAS-LUC-160', nombre: 'Vaso Lúcuma', sabor: 'Lúcuma', presentacion: '160 ml', lineaId: 'LIN-03', velocidadEstandar: 110, estado: 'activo' },
  { id: 'PRD-006', codigo: 'VAS-VAI-160', nombre: 'Vaso Vainilla', sabor: 'Vainilla', presentacion: '160 ml', lineaId: 'LIN-03', velocidadEstandar: 110, estado: 'activo' },
  { id: 'PRD-007', codigo: 'SAN-CLA-90', nombre: 'Sándwich Clásico', sabor: 'Vainilla', presentacion: '90 g', lineaId: 'LIN-04', velocidadEstandar: 80, estado: 'activo' },
  { id: 'PRD-008', codigo: 'SAN-CHO-90', nombre: 'Sándwich Chocolate', sabor: 'Chocolate', presentacion: '90 g', lineaId: 'LIN-04', velocidadEstandar: 78, estado: 'activo' },
  { id: 'PRD-009', codigo: 'BOM-FRE-25', nombre: 'Bombón Fresa', sabor: 'Fresa', presentacion: '25 g', lineaId: 'LIN-05', velocidadEstandar: 140, estado: 'activo' },
  { id: 'PRD-010', codigo: 'BOM-CHO-25', nombre: 'Bombón Chocolate', sabor: 'Chocolate', presentacion: '25 g', lineaId: 'LIN-05', velocidadEstandar: 140, estado: 'activo' },
  { id: 'PRD-011', codigo: 'MEZ-BAS-PT', nombre: 'Mezcla base pasteurizada', sabor: 'Base', presentacion: '1 000 L', lineaId: 'LIN-PT', velocidadEstandar: 60, estado: 'activo' },
];

export const maquinas: Maquina[] = [
  { id: 'MAQ-01', codigo: 'MQ-L1-01', nombre: 'Moldeadora de paletas', tipo: 'Moldeadora', lineaId: 'LIN-01', estado: 'operativa', paradas30d: 6 },
  { id: 'MAQ-02', codigo: 'MQ-L1-02', nombre: 'Túnel de frío L1', tipo: 'Túnel de frío', lineaId: 'LIN-01', estado: 'operativa', paradas30d: 3 },
  { id: 'MAQ-03', codigo: 'MQ-L2-01', nombre: 'Dosificadora de conos', tipo: 'Dosificadora', lineaId: 'LIN-02', estado: 'operativa', paradas30d: 5 },
  { id: 'MAQ-04', codigo: 'MQ-L2-02', nombre: 'Envolvedora L2', tipo: 'Envolvedora', lineaId: 'LIN-02', estado: 'operativa', paradas30d: 11 },
  { id: 'MAQ-05', codigo: 'MQ-L2-03', nombre: 'Tolva de cobertura L2', tipo: 'Tolva', lineaId: 'LIN-02', estado: 'operativa', paradas30d: 4 },
  { id: 'MAQ-06', codigo: 'MQ-L3-01', nombre: 'Llenadora de vasos', tipo: 'Llenadora', lineaId: 'LIN-03', estado: 'operativa', paradas30d: 7 },
  { id: 'MAQ-07', codigo: 'MQ-L3-02', nombre: 'Selladora L3', tipo: 'Selladora', lineaId: 'LIN-03', estado: 'mantenimiento', paradas30d: 9 },
  { id: 'MAQ-08', codigo: 'MQ-L4-01', nombre: 'Formadora de galleta', tipo: 'Formadora', lineaId: 'LIN-04', estado: 'operativa', paradas30d: 8 },
  { id: 'MAQ-09', codigo: 'MQ-L4-02', nombre: 'Ensambladora de sándwich', tipo: 'Ensambladora', lineaId: 'LIN-04', estado: 'operativa', paradas30d: 10 },
  { id: 'MAQ-10', codigo: 'MQ-L5-01', nombre: 'Bañadora de bombones', tipo: 'Bañadora', lineaId: 'LIN-05', estado: 'operativa', paradas30d: 5 },
  { id: 'MAQ-11', codigo: 'MQ-L5-02', nombre: 'Encajadora L5', tipo: 'Encajadora', lineaId: 'LIN-05', estado: 'operativa', paradas30d: 2 },
  { id: 'MAQ-12', codigo: 'MQ-PT-01', nombre: 'Pasteurizador PT-01', tipo: 'Pasteurizador', lineaId: 'LIN-PT', estado: 'operativa', paradas30d: 3 },
];

const TODAS_LINEAS = ['LIN-01', 'LIN-02', 'LIN-03', 'LIN-04', 'LIN-05'];

type CausaSemilla = Omit<CausaParada, 'id' | 'paradasHistoricas'> & { paradasHistoricas?: number };

function causa(c: CausaSemilla): CausaParada {
  return { id: `CPA-${c.codigo}`, paradasHistoricas: c.paradasHistoricas ?? 0, ...c };
}

/** Árbol Tipo → General → Específica. 7 tipos, 15 generales, 24 específicas. */
export const causasParada: CausaParada[] = [
  /* PM-01 Falla mecánica ------------------------------------------- */
  causa({ codigo: 'PM-01', nombre: 'Falla mecánica', nivel: 'tipo', parentId: null, clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 20, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 142 }),
  causa({ codigo: 'PM-01-A', nombre: 'Transmisión', nivel: 'general', parentId: 'CPA-PM-01', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 18, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 41 }),
  causa({ codigo: 'PM-01-01', nombre: 'Rotura de faja', nivel: 'especifica', parentId: 'CPA-PM-01-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 22, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 27 }),
  causa({ codigo: 'PM-01-03', nombre: 'Rotura de cadena', nivel: 'especifica', parentId: 'CPA-PM-01-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 25, lineasAplicables: ['LIN-02', 'LIN-04', 'LIN-05'], estado: 'activo', paradasHistoricas: 14 }),
  causa({ codigo: 'PM-01-B', nombre: 'Formado y envoltura', nivel: 'general', parentId: 'CPA-PM-01', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 15, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 55 }),
  causa({ codigo: 'PM-01-02', nombre: 'Atasco en envolvedora', nivel: 'especifica', parentId: 'CPA-PM-01-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 12, lineasAplicables: ['LIN-01', 'LIN-02', 'LIN-05'], estado: 'activo', paradasHistoricas: 33 }),
  causa({ codigo: 'PM-01-04', nombre: 'Desalineación de moldes', nivel: 'especifica', parentId: 'CPA-PM-01-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 16, lineasAplicables: ['LIN-01', 'LIN-04'], estado: 'activo', paradasHistoricas: 22 }),
  causa({ codigo: 'PM-01-C', nombre: 'Dosificación', nivel: 'general', parentId: 'CPA-PM-01', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 14, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 19 }),
  causa({ codigo: 'PM-01-05', nombre: 'Obstrucción de boquilla', nivel: 'especifica', parentId: 'CPA-PM-01-C', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 10, lineasAplicables: ['LIN-02', 'LIN-03'], estado: 'activo', paradasHistoricas: 19 }),

  /* PE-02 Falla eléctrica ------------------------------------------ */
  causa({ codigo: 'PE-02', nombre: 'Falla eléctrica', nivel: 'tipo', parentId: null, clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 25, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 37 }),
  causa({ codigo: 'PE-02-A', nombre: 'Suministro', nivel: 'general', parentId: 'CPA-PE-02', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 30, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 16 }),
  causa({ codigo: 'PE-02-01', nombre: 'Corte de energía', nivel: 'especifica', parentId: 'CPA-PE-02-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 35, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 9 }),
  causa({ codigo: 'PE-02-02', nombre: 'Caída de tensión', nivel: 'especifica', parentId: 'CPA-PE-02-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 18, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 7 }),
  causa({ codigo: 'PE-02-B', nombre: 'Control', nivel: 'general', parentId: 'CPA-PE-02', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 22, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 21 }),
  causa({ codigo: 'PE-02-03', nombre: 'Falla de variador', nivel: 'especifica', parentId: 'CPA-PE-02-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: true, tiempoEstandarMin: 28, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 12 }),
  causa({ codigo: 'PE-02-04', nombre: 'Sensor fuera de servicio', nivel: 'especifica', parentId: 'CPA-PE-02-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 15, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 9 }),

  /* PL-03 Limpieza CIP --------------------------------------------- */
  causa({ codigo: 'PL-03', nombre: 'Limpieza CIP', nivel: 'tipo', parentId: null, clasificacion: 'programada', afectaOee: false, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 15, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 96 }),
  causa({ codigo: 'PL-03-A', nombre: 'Limpieza programada', nivel: 'general', parentId: 'CPA-PL-03', clasificacion: 'programada', afectaOee: false, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 15, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 71 }),
  causa({ codigo: 'PL-03-01', nombre: 'CIP de inicio de turno', nivel: 'especifica', parentId: 'CPA-PL-03-A', clasificacion: 'programada', afectaOee: false, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 20, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 38 }),
  causa({ codigo: 'PL-03-02', nombre: 'CIP entre sabores', nivel: 'especifica', parentId: 'CPA-PL-03-A', clasificacion: 'programada', afectaOee: false, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 14, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 33 }),
  causa({ codigo: 'PL-03-B', nombre: 'Sanitización', nivel: 'general', parentId: 'CPA-PL-03', clasificacion: 'programada', afectaOee: false, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 25, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 25 }),
  causa({ codigo: 'PL-03-03', nombre: 'Sanitizado de tolvas', nivel: 'especifica', parentId: 'CPA-PL-03-B', clasificacion: 'programada', afectaOee: false, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 25, lineasAplicables: ['LIN-02', 'LIN-03', 'LIN-PT'], estado: 'activo', paradasHistoricas: 25 }),

  /* PC-04 Cambio de producto --------------------------------------- */
  causa({ codigo: 'PC-04', nombre: 'Cambio de producto', nivel: 'tipo', parentId: null, clasificacion: 'programada', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 30, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 88 }),
  causa({ codigo: 'PC-04-A', nombre: 'Cambio de formato', nivel: 'general', parentId: 'CPA-PC-04', clasificacion: 'programada', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 35, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 52 }),
  causa({ codigo: 'PC-04-01', nombre: 'Cambio de molde', nivel: 'especifica', parentId: 'CPA-PC-04-A', clasificacion: 'programada', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 40, lineasAplicables: ['LIN-01', 'LIN-04', 'LIN-05'], estado: 'activo', paradasHistoricas: 29 }),
  causa({ codigo: 'PC-04-02', nombre: 'Cambio de bobina', nivel: 'especifica', parentId: 'CPA-PC-04-A', clasificacion: 'programada', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 12, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 23 }),
  causa({ codigo: 'PC-04-B', nombre: 'Cambio de sabor', nivel: 'general', parentId: 'CPA-PC-04', clasificacion: 'programada', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 28, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 36 }),
  causa({ codigo: 'PC-04-03', nombre: 'Purga de mezcla', nivel: 'especifica', parentId: 'CPA-PC-04-B', clasificacion: 'programada', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 28, lineasAplicables: ['LIN-02', 'LIN-03', 'LIN-PT'], estado: 'activo', paradasHistoricas: 36 }),

  /* PA-05 Falta de insumo ------------------------------------------ */
  causa({ codigo: 'PA-05', nombre: 'Falta de insumo', nivel: 'tipo', parentId: null, clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: true, tiempoEstandarMin: 18, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 51 }),
  causa({ codigo: 'PA-05-A', nombre: 'Materia prima', nivel: 'general', parentId: 'CPA-PA-05', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: true, tiempoEstandarMin: 22, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 24 }),
  causa({ codigo: 'PA-05-01', nombre: 'Falta de mezcla base', nivel: 'especifica', parentId: 'CPA-PA-05-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: true, tiempoEstandarMin: 25, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 14 }),
  causa({ codigo: 'PA-05-02', nombre: 'Falta de cobertura', nivel: 'especifica', parentId: 'CPA-PA-05-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 18, lineasAplicables: ['LIN-01', 'LIN-05'], estado: 'activo', paradasHistoricas: 10 }),
  causa({ codigo: 'PA-05-B', nombre: 'Empaque', nivel: 'general', parentId: 'CPA-PA-05', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 14, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 27 }),
  causa({ codigo: 'PA-05-03', nombre: 'Falta de bobina', nivel: 'especifica', parentId: 'CPA-PA-05-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 12, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 17 }),
  causa({ codigo: 'PA-05-04', nombre: 'Falta de cajas', nivel: 'especifica', parentId: 'CPA-PA-05-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 16, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 10 }),

  /* PO-06 Ajuste operativo ----------------------------------------- */
  causa({ codigo: 'PO-06', nombre: 'Ajuste operativo', nivel: 'tipo', parentId: null, clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 10, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 44 }),
  causa({ codigo: 'PO-06-A', nombre: 'Calibración', nivel: 'general', parentId: 'CPA-PO-06', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 8, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 31 }),
  causa({ codigo: 'PO-06-01', nombre: 'Ajuste de peso', nivel: 'especifica', parentId: 'CPA-PO-06-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 7, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 19 }),
  causa({ codigo: 'PO-06-02', nombre: 'Ajuste de temperatura', nivel: 'especifica', parentId: 'CPA-PO-06-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 12, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 12 }),
  causa({ codigo: 'PO-06-B', nombre: 'Calidad', nivel: 'general', parentId: 'CPA-PO-06', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 12, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 13 }),
  causa({ codigo: 'PO-06-03', nombre: 'Ajuste de sellado', nivel: 'especifica', parentId: 'CPA-PO-06-B', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: true, requiereSolicitud: false, tiempoEstandarMin: 12, lineasAplicables: ['LIN-02', 'LIN-03', 'LIN-04'], estado: 'activo', paradasHistoricas: 13 }),

  /* PS-07 Sin personal --------------------------------------------- */
  causa({ codigo: 'PS-07', nombre: 'Sin personal', nivel: 'tipo', parentId: null, clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 20, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 18 }),
  causa({ codigo: 'PS-07-A', nombre: 'Dotación', nivel: 'general', parentId: 'CPA-PS-07', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 20, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 18 }),
  causa({ codigo: 'PS-07-01', nombre: 'Falta de operario', nivel: 'especifica', parentId: 'CPA-PS-07-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 25, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 11 }),
  causa({ codigo: 'PS-07-02', nombre: 'Refrigerio no cubierto', nivel: 'especifica', parentId: 'CPA-PS-07-A', clasificacion: 'imprevista', afectaOee: true, requiereEvidencia: false, requiereSolicitud: false, tiempoEstandarMin: 15, lineasAplicables: TODAS_LINEAS, estado: 'activo', paradasHistoricas: 7 }),
];

export const causasMerma: CausaMerma[] = [
  { id: 'CME-MR-01', codigo: 'MR-01', nombre: 'Sobrepeso', aplicaA: ['EP', 'PT'], requiereEvidencia: false, estado: 'activo' },
  { id: 'CME-MR-02', codigo: 'MR-02', nombre: 'Rotura', aplicaA: ['EP', 'PT'], requiereEvidencia: true, estado: 'activo' },
  { id: 'CME-MR-03', codigo: 'MR-03', nombre: 'Arranque', aplicaA: ['MP', 'EP'], requiereEvidencia: false, estado: 'activo' },
  { id: 'CME-MR-04', codigo: 'MR-04', nombre: 'Contaminación', aplicaA: ['MP', 'EP', 'PT'], requiereEvidencia: true, estado: 'activo' },
];

export const turnos: TurnoDef[] = [
  { id: 'TUR-M', codigo: 'M', label: 'Mañana', inicio: '06:00', fin: '14:00', activo: true },
  { id: 'TUR-T', codigo: 'T', label: 'Tarde', inicio: '14:00', fin: '22:00', activo: true },
  { id: 'TUR-N', codigo: 'N', label: 'Noche', inicio: '22:00', fin: '06:00', activo: true },
];

export const SABORES = ['Vainilla', 'Chocolate', 'Fresa', 'Lúcuma'] as const;

/* Índices de acceso rápido usados por los handlers. */
export const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
export const productoPorId = new Map(productos.map((p) => [p.id, p]));
export const maquinaPorId = new Map(maquinas.map((m) => [m.id, m]));
export const causaParadaPorId = new Map(causasParada.map((c) => [c.id, c]));
export const causaMermaPorId = new Map(causasMerma.map((c) => [c.id, c]));

export const causasEspecificas = causasParada.filter((c) => c.nivel === 'especifica');
export const tiposCausa = causasParada.filter((c) => c.nivel === 'tipo');

/** Devuelve el tipo (raíz) al que pertenece una causa de cualquier nivel. */
export function tipoDeCausa(causaId: string): CausaParada | undefined {
  let actual = causaParadaPorId.get(causaId);
  while (actual && actual.parentId) actual = causaParadaPorId.get(actual.parentId);
  return actual;
}
