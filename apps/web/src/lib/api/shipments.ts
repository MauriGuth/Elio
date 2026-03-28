import { api } from '../api';

export const shipmentsApi = {
  getAll: (params?: { originId?: string; destinationId?: string; status?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number }>('/shipments', params),

  getById: (id: string) => api.get<any>(`/shipments/${id}`),

  updateItem: (shipmentId: string, itemId: string, data: { sentQty: number }) =>
    api.patch<any>(`/shipments/${shipmentId}/items/${itemId}`, data),

  getEstimateDuration: (originId: string, destinationId: string) =>
    api.get<{ durationMin: number | null; reason?: 'no_api_key' | 'no_address' }>(
      '/shipments/estimate-duration',
      { originId, destinationId }
    ),

  create: (data: any) => api.post<any>('/shipments', data),

  /** Varias paradas en orden; cada parada tiene sus ítems (mismo envío / mismo día operativo). */
  createMulti: (data: {
    originId: string;
    notes?: string;
    estimatedArrival?: string;
    stops: Array<{ locationId: string; items: Array<{ productId: string; sentQty: number; unitCost?: number; lotNumber?: string; notes?: string }> }>;
  }) => api.post<any>('/shipments/multi', data),

  reorderStops: (shipmentId: string, stopIds: string[]) =>
    api.patch<any>(`/shipments/${shipmentId}/stop-order`, { stopIds }),

  markStopArrived: (shipmentId: string, stopId: string) =>
    api.post<any>(`/shipments/${shipmentId}/stops/${stopId}/mark-arrived`, {}),

  startStopReceptionControl: (shipmentId: string, stopId: string) =>
    api.post<any>(`/shipments/${shipmentId}/stops/${stopId}/start-reception-control`, {}),

  receiveStop: (shipmentId: string, stopId: string, data: any) =>
    api.post<any>(`/shipments/${shipmentId}/stops/${stopId}/receive`, data),

  prepare: (id: string) => api.post<any>(`/shipments/${id}/prepare`),

  dispatch: (id: string) => api.post<any>(`/shipments/${id}/dispatch`),

  startReceptionControl: (id: string) => api.post<any>(`/shipments/${id}/start-reception-control`),

  receive: (id: string, data: any) => api.post<any>(`/shipments/${id}/receive`, data),

  cancel: (id: string) => api.post<any>(`/shipments/${id}/cancel`),
};
