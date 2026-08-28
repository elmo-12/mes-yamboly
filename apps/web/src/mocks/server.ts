import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Servidor de msw para tests y renderizado en servidor. */
export const server = setupServer(...handlers);
