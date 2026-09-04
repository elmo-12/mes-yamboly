import type { Colaborador, Turno, User } from '@mes/types';

export interface UsuarioSeed extends User {
  /** Solo para el mock de login: contraseña en claro del seed. */
  password: string;
}

export const PASSWORD_SEED = 'Yamboly2026';

/**
 * 11 usuarios del seed (mismos correos y contraseña que antes de la migración
 * de maestros). La app opera una única sede (Lima) y los maquinistas quedan
 * asignados a una de las 9 líneas reales.
 */
export const usuarios: UsuarioSeed[] = [
  { id: 'USR-01', nombre: 'Carlos Mendoza', email: 'jefe@yamboly.lat', dni: '41285630', rol: 'jefe', cargo: 'Jefe de producción', iniciales: 'CM', activo: true, password: PASSWORD_SEED },
  { id: 'USR-02', nombre: 'Jorge Quispe', email: 'jorge.quispe@yamboly.lat', dni: '46012784', rol: 'maquinista', cargo: 'Maquinista Extrusora 2', lineaId: 'LIN-EXTR-2', iniciales: 'JQ', activo: true, password: PASSWORD_SEED },
  { id: 'USR-03', nombre: 'Ana Ríos', email: 'ana.rios@yamboly.lat', dni: '43907512', rol: 'supervisor', cargo: 'Supervisora de turno Día', iniciales: 'AR', activo: true, password: PASSWORD_SEED },
  { id: 'USR-04', nombre: 'María Torres', email: 'maria.torres@yamboly.lat', dni: '45118293', rol: 'mermas', cargo: 'Encargada de merma', iniciales: 'MT', activo: true, password: PASSWORD_SEED },
  { id: 'USR-05', nombre: 'Investigador Tesis', email: 'investigador@yamboly.lat', dni: '70233145', rol: 'investigador', cargo: 'Investigador', iniciales: 'IT', activo: true, password: PASSWORD_SEED },
  { id: 'USR-06', nombre: 'Rosa Huamán', email: 'rosa.huaman@yamboly.lat', dni: '44872109', rol: 'calidad', cargo: 'Analista de calidad', iniciales: 'RH', activo: true, password: PASSWORD_SEED },
  { id: 'USR-07', nombre: 'Luis Vargas', email: 'luis.vargas@yamboly.lat', dni: '42335908', rol: 'maquinista', cargo: 'Maquinista Llenadora M2', lineaId: 'LIN-LLEN-M2', iniciales: 'LV', activo: true, password: PASSWORD_SEED },
  { id: 'USR-08', nombre: 'Sofía Cárdenas', email: 'sofia.cardenas@yamboly.lat', dni: '47501263', rol: 'maquinista', cargo: 'Maquinista Llenadora M1', lineaId: 'LIN-LLEN-M1', iniciales: 'SC', activo: true, password: PASSWORD_SEED },
  { id: 'USR-09', nombre: 'Pedro Ccahuana', email: 'pedro.ccahuana@yamboly.lat', dni: '40912877', rol: 'maquinista', cargo: 'Maquinista Moldeadora A3', lineaId: 'LIN-MOLD-A3', iniciales: 'PC', activo: true, password: PASSWORD_SEED },
  { id: 'USR-10', nombre: 'Elena Ramos', email: 'elena.ramos@yamboly.lat', dni: '48230671', rol: 'maquinista', cargo: 'Maquinista Moldeadora A4', lineaId: 'LIN-MOLD-A4', iniciales: 'ER', activo: true, password: PASSWORD_SEED },
  { id: 'USR-11', nombre: 'Diego Salazar', email: 'diego.salazar@yamboly.lat', dni: '43118240', rol: 'supervisor', cargo: 'Supervisor de turno Noche', iniciales: 'DS', activo: true, password: PASSWORD_SEED },
];

export const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));

/** Vista pública (sin contraseña) de un usuario. */
export function toUser(u: UsuarioSeed): User {
  const { password: _password, ...user } = u;
  return user;
}

export function nombreUsuario(id: string): string {
  return usuarioPorId.get(id)?.nombre ?? 'Sistema';
}

export function inicialesUsuario(id: string): string {
  return usuarioPorId.get(id)?.iniciales ?? 'SY';
}

/**
 * Cuadrilla que aparece en el bloque "Equipo" de la OF (6 avatares), con los
 * puestos reales de planta.
 */
export const colaboradoresBase: Colaborador[] = [
  { id: 'COL-01', nombre: 'Kevin Palomino', iniciales: 'KP', rol: 'Mesa' },
  { id: 'COL-02', nombre: 'Nadia Espinoza', iniciales: 'NE', rol: 'Palillero' },
  { id: 'COL-03', nombre: 'Iván Cáceres', iniciales: 'IC', rol: 'Bobinero' },
  { id: 'COL-04', nombre: 'Gladys Ninanya', iniciales: 'GN', rol: 'Llenador' },
  { id: 'COL-05', nombre: 'Milagros Ávila', iniciales: 'MA', rol: 'Encajado' },
  { id: 'COL-06', nombre: 'Óscar Ludeña', iniciales: 'OL', rol: 'Coberturero' },
];

/**
 * Maquinista titular de cada una de las 9 líneas reales: los 5 maquinistas del
 * seed rotan, y cada uno arranca en la línea que lleva en su ficha (`lineaId`).
 */
export const maquinistaPorLinea: Record<string, string> = {
  'LIN-EXTR-2': 'USR-02',
  'LIN-EXTR-3': 'USR-10',
  'LIN-LLEN-A1': 'USR-07',
  'LIN-LLEN-A2': 'USR-08',
  'LIN-LLEN-M1': 'USR-08',
  'LIN-LLEN-M2': 'USR-07',
  'LIN-MOLD-A2': 'USR-09',
  'LIN-MOLD-A3': 'USR-09',
  'LIN-MOLD-A4': 'USR-10',
};

/** Supervisor de cada turno real (`D` Día · `N` Noche). */
export const supervisorPorTurno: Record<Turno, string> = {
  D: 'USR-03',
  N: 'USR-11',
};
