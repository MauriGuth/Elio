import { api } from '../api';

export const locationsApi = {
  getAll: (params?: {
    type?: string;
    isActive?: boolean;
    search?: string;
    /** Solo ubicaciones con sala de producción (flag en local). */
    isProduction?: boolean;
  }) => api.get<any[]>('/locations', params),

  getById: (id: string) => api.get<any>(`/locations/${id}`),

  getDashboard: (id: string) => api.get<any>(`/locations/${id}/dashboard`),

  create: (data: any) => api.post<any>('/locations', data),

  update: (id: string, data: any) => api.patch<any>(`/locations/${id}`, data),

  delete: (id: string) => api.delete(`/locations/${id}`),
};
