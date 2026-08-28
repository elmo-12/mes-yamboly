import type { CreateMermaInput, MermaListItem, MermaListQuery, Paginated, UpdateMermaInput } from '@mes/types';
import { api } from '@/services/api/client';

export const scrapApi = {
  list: (query: MermaListQuery = {}) => api.get<Paginated<MermaListItem>>('/mermas', { ...query }),
  crear: (input: CreateMermaInput) => api.post<MermaListItem>('/mermas', input),
  actualizar: (id: string, input: UpdateMermaInput) => api.patch<MermaListItem>(`/mermas/${id}`, input),
};
