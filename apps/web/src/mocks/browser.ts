import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Worker de msw para el navegador (solo cuando NEXT_PUBLIC_DATA_SOURCE=mock). */
export const worker = setupWorker(...handlers);
