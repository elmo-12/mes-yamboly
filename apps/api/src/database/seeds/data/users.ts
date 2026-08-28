import type { Colaborador, User } from '@mes/types';

export interface UsuarioSeed extends User {
  /** Solo para el mock de login: contraseña en claro del seed. */
  password: string;
}

export const PASSWORD_SEED = 'Yamboly2026';

export const usuarios: UsuarioSeed[] = [
  { id: 'USR-01', nombre: 'Carlos Mendoza', email: 'jefe@yamboly.lat', dni: '41285630', rol: 'jefe', cargo: 'Jefe de producción', sedeId: 'SED-01', iniciales: 'CM', activo: true, password: PASSWORD_SEED },
  { id: 'USR-02', nombre: 'Jorge Quispe', email: 'jorge.quispe@yamboly.lat', dni: '46012784', rol: 'maquinista', cargo: 'Maquinista L2 Conos', sedeId: 'SED-01', lineaId: 'LIN-02', iniciales: 'JQ', activo: true, password: PASSWORD_SEED },
  { id: 'USR-03', nombre: 'Ana Ríos', email: 'ana.rios@yamboly.lat', dni: '43907512', rol: 'supervisor', cargo: 'Supervisora de turno', sedeId: 'SED-01', iniciales: 'AR', activo: true, password: PASSWORD_SEED },
  { id: 'USR-04', nombre: 'María Torres', email: 'maria.torres@yamboly.lat', dni: '45118293', rol: 'mermas', cargo: 'Encargada de merma', sedeId: 'SED-01', iniciales: 'MT', activo: true, password: PASSWORD_SEED },
  { id: 'USR-05', nombre: 'Investigador Tesis', email: 'investigador@yamboly.lat', dni: '70233145', rol: 'investigador', cargo: 'Investigador', sedeId: 'SED-01', iniciales: 'IT', activo: true, password: PASSWORD_SEED },
  { id: 'USR-06', nombre: 'Rosa Huamán', email: 'rosa.huaman@yamboly.lat', dni: '44872109', rol: 'calidad', cargo: 'Analista de calidad', sedeId: 'SED-01', iniciales: 'RH', activo: true, password: PASSWORD_SEED },
  { id: 'USR-07', nombre: 'Luis Vargas', email: 'luis.vargas@yamboly.lat', dni: '42335908', rol: 'maquinista', cargo: 'Maquinista L1 Paletas', sedeId: 'SED-01', lineaId: 'LIN-01', iniciales: 'LV', activo: true, password: PASSWORD_SEED },
  { id: 'USR-08', nombre: 'Sofía Cárdenas', email: 'sofia.cardenas@yamboly.lat', dni: '47501263', rol: 'maquinista', cargo: 'Maquinista L3 Vasos', sedeId: 'SED-01', lineaId: 'LIN-03', iniciales: 'SC', activo: true, password: PASSWORD_SEED },
  { id: 'USR-09', nombre: 'Pedro Ccahuana', email: 'pedro.ccahuana@yamboly.lat', dni: '40912877', rol: 'maquinista', cargo: 'Maquinista L4 Sándwich', sedeId: 'SED-01', lineaId: 'LIN-04', iniciales: 'PC', activo: true, password: PASSWORD_SEED },
  { id: 'USR-10', nombre: 'Elena Ramos', email: 'elena.ramos@yamboly.lat', dni: '48230671', rol: 'maquinista', cargo: 'Maquinista L5 Bombones', sedeId: 'SED-01', lineaId: 'LIN-05', iniciales: 'ER', activo: true, password: PASSWORD_SEED },
  { id: 'USR-11', nombre: 'Diego Salazar', email: 'diego.salazar@yamboly.lat', dni: '43118240', rol: 'supervisor', cargo: 'Supervisor de turno Tarde', sedeId: 'SED-01', iniciales: 'DS', activo: true, password: PASSWORD_SEED },
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

/** Cuadrilla que aparece en el bloque "Equipo" de la OF (6 avatares). */
export const colaboradoresBase: Colaborador[] = [
  { id: 'COL-01', nombre: 'Rosa Huamán', iniciales: 'RH', rol: 'Calidad' },
  { id: 'COL-02', nombre: 'María Torres', iniciales: 'MT', rol: 'Merma' },
  { id: 'COL-03', nombre: 'Kevin Palomino', iniciales: 'KP', rol: 'Operario' },
  { id: 'COL-04', nombre: 'Nadia Espinoza', iniciales: 'NE', rol: 'Operaria' },
  { id: 'COL-05', nombre: 'Iván Cáceres', iniciales: 'IC', rol: 'Operario' },
  { id: 'COL-06', nombre: 'Gladys Ninanya', iniciales: 'GN', rol: 'Operaria' },
];

/** Maquinista titular por línea (para generar órdenes deterministas). */
export const maquinistaPorLinea: Record<string, string> = {
  'LIN-01': 'USR-07',
  'LIN-02': 'USR-02',
  'LIN-03': 'USR-08',
  'LIN-04': 'USR-09',
  'LIN-05': 'USR-10',
  'LIN-PT': 'USR-07',
};

export const supervisorPorTurno: Record<string, string> = {
  M: 'USR-03',
  T: 'USR-11',
  N: 'USR-03',
};
