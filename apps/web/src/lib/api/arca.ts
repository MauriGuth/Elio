import { api } from "../api"

export const arcaApi = {
  getOrderStatus: (orderId: string) => api.get<any>(`/arca/orders/${orderId}/status`),

  retryOrder: (orderId: string) => api.post<any>(`/arca/orders/${orderId}/retry`),

  /** Verifica en AFIP que el comprobante figure correctamente (FECompConsultar). */
  verifyOrder: (orderId: string) => api.get<any>(`/arca/orders/${orderId}/verify`),
}
