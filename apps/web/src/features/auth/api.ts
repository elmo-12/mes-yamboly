import type { LoginInput, LoginResponse, User } from '@mes/types';
import { api } from '@/services/api/client';

export const authApi = {
  login: (input: LoginInput) => api.post<LoginResponse>('/auth/login', input),
  me: () => api.get<User>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
};
