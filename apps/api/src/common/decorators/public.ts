import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'mes:public';

/** `@Public()` — exime al handler del `JwtAuthGuard` global (login, encuesta). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
