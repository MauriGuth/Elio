import { api } from '../api';

export const categoriesApi = {
  getAll: (params?: { search?: string; isActive?: boolean; parentId?: string }) =>
    api.get<any[]>('/categories', params),

  getById: (id: string) => api.get<any>(`/categories/${id}`),

  create: (data: any) => api.post<any>('/categories', data),

  update: (id: string, data: any) => api.patch<any>(`/categories/${id}`, data),

  delete: (id: string) => api.delete(`/categories/${id}`),
};
