import { api } from '../api';

export const runningAccountsApi = {
  getClients: (locationId?: string) =>
    api.get<any[]>('/running-accounts/clients', locationId ? { locationId } : {}),

  getOrdersByCustomer: (locationId: string, customerId: string, month?: string) =>
    api.get<any[]>('/running-accounts/orders', { locationId, customerId, month }),

  markRemitoSent: (orderId: string) =>
    api.post<any>(`/running-accounts/orders/${orderId}/remito-sent`, {}),

  markInvoiced: (orderId: string) =>
    api.post<any>(`/running-accounts/orders/${orderId}/invoiced`, {}),

  markMonthRemitoSent: (locationId: string, customerId: string, month: string) => {
    const qs = new URLSearchParams({ locationId, customerId, month }).toString();
    return api.post<any>(`/running-accounts/orders/mark-month-remito-sent?${qs}`, {});
  },

  markMonthInvoiced: (locationId: string, customerId: string, month: string) => {
    const qs = new URLSearchParams({ locationId, customerId, month }).toString();
    return api.post<any>(`/running-accounts/orders/mark-month-invoiced?${qs}`, {});
  },
};
