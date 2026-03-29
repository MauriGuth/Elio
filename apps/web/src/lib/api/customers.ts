import { api } from '../api';

export const customersApi = {
  getAll: (locationId: string, search?: string, runningAccountOnly?: boolean) =>
    api.get<any[]>('/customers', { locationId, search, runningAccountOnly: runningAccountOnly ? 'true' : undefined }),

  getByCuit: (locationId: string, cuit: string) =>
    api.get<any>('/customers/by-cuit', { locationId, cuit }),

  getById: (id: string) => api.get<any>(`/customers/${id}`),

  create: (data: {
    locationId: string;
    name: string;
    cuit: string;
    email?: string;
    address?: string;
    phone?: string;
    creditLimit?: number;
    accountKind?: 'client' | 'employee';
  }) => api.post<any>('/customers', data),

  update: (
    id: string,
    data: {
      name?: string;
      cuit?: string;
      email?: string;
      address?: string;
      phone?: string;
      creditLimit?: number;
      accountKind?: 'client' | 'employee';
    }
  ) => api.patch<any>(`/customers/${id}`, data),

  remove: (id: string) => api.delete<any>(`/customers/${id}`),
};
