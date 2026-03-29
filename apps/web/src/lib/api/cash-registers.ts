import { api } from '../api';

export const cashRegistersApi = {
  getAll: (locationId: string) =>
    api.get<any[]>('/cash-registers', { locationId }),

  getCurrentOpen: (locationId: string) =>
    api.get<any | null>(`/cash-registers/current/${locationId}`),

  getById: (id: string) =>
    api.get<any>(`/cash-registers/${id}`),

  getShiftMetrics: (id: string) =>
    api.get<any>(`/cash-registers/${id}/shift-metrics`),

  getReport: (
    locationId: string,
    type: 'daily' | 'weekly' | 'monthly',
    dateFrom: string,
    dateTo: string
  ) =>
    api.get<any>('/cash-registers/reports/' + locationId, {
      type,
      dateFrom,
      dateTo,
    }),

  open: (data: {
    locationId: string;
    openingAmount: number;
    denominations?: Record<string, number>;
    name?: string;
    shift?: string;
  }) => api.post<any>('/cash-registers/open', data),

  close: (
    id: string,
    data: {
      closingAmount: number;
      denominations?: Record<string, number>;
      closingCardsTotal?: number;
      closingTransferTotal?: number;
      closingQrTotal?: number;
      notes?: string;
      shift?: string;
      salesNoTicket?: number;
      internalConsumption?: number;
      closedBySignature?: string;
    }
  ) => api.post<any>(`/cash-registers/${id}/close`, data),
};
