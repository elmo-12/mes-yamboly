import type { CreateVelocidadInput, Paginated, RegistroVelocidadListItem, VelocidadListQuery } from '@mes/types';
import { api } from '@/services/api/client';

export const speedsApi = {
  list: (query: VelocidadListQuery = {}) =>
    api.get<Paginated<RegistroVelocidadListItem>>('/velocidades', { ...query }),
  crear: (input: CreateVelocidadInput) => api.post<RegistroVelocidadListItem>('/velocidades', input),
};
