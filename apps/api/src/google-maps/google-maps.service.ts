import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Servicio opcional para estimar duración de rutas con Google Directions API.
 * Si GOOGLE_MAPS_API_KEY no está definida, todos los métodos retornan null.
 */
@Injectable()
export class GoogleMapsService {
  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
  }

  /** Indica si la API de Google Maps está configurada (clave definida). */
  isConfigured(): boolean {
    return !!this.apiKey?.trim();
  }

  /**
   * Obtiene la duración estimada del trayecto en minutos (solo conducción).
   * @param originAddress Dirección de origen (texto o "lat,lng")
   * @param destinationAddress Dirección de destino (texto o "lat,lng")
   * @returns Duración en minutos, o null si no hay clave, error o sin resultados
   */
  async getRouteDurationInMinutes(
    originAddress: string,
    destinationAddress: string,
  ): Promise<number | null> {
    if (!this.apiKey?.trim()) {
      return null;
    }
    const origin = encodeURIComponent(originAddress.trim());
    const destination = encodeURIComponent(destinationAddress.trim());
    if (!origin || !destination) return null;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' || !data.routes?.length) return null;
      const leg = data.routes[0].legs?.[0];
      if (!leg?.duration?.value) return null;
      const seconds = Number(leg.duration.value);
      return Math.round(seconds / 60);
    } catch {
      return null;
    }
  }

  /**
   * Obtiene duración en minutos y polyline de la ruta (para guardar en Shipment).
   */
  async getRouteDetails(
    originAddress: string,
    destinationAddress: string,
  ): Promise<{ durationMin: number; polyline: string } | null> {
    if (!this.apiKey?.trim()) return null;
    const origin = encodeURIComponent(originAddress.trim());
    const destination = encodeURIComponent(destinationAddress.trim());
    if (!origin || !destination) return null;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' || !data.routes?.length) return null;
      const route = data.routes[0];
      const leg = route.legs?.[0];
      if (!leg?.duration?.value) return null;
      const seconds = Number(leg.duration.value);
      const durationMin = Math.round(seconds / 60);
      const polyline = route.overview_polyline?.points ?? null;
      return { durationMin, polyline: polyline || '' };
    } catch {
      return null;
    }
  }

  /**
   * Igual que getRouteDetails pero con departure_time=now para que Google devuelva
   * duration_in_traffic (considera tráfico en tiempo real). Usar al despachar envío.
   */
  async getRouteDetailsWithTraffic(
    originAddress: string,
    destinationAddress: string,
  ): Promise<{ durationMin: number; polyline: string } | null> {
    if (!this.apiKey?.trim()) return null;
    const origin = encodeURIComponent(originAddress.trim());
    const destination = encodeURIComponent(destinationAddress.trim());
    if (!origin || !destination) return null;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&departure_time=now&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' || !data.routes?.length) return null;
      const route = data.routes[0];
      const leg = route.legs?.[0];
      if (!leg?.duration?.value) return null;
      const seconds =
        leg.duration_in_traffic?.value != null
          ? Number(leg.duration_in_traffic.value)
          : Number(leg.duration.value);
      const durationMin = Math.round(seconds / 60);
      const polyline = route.overview_polyline?.points ?? null;
      return { durationMin, polyline: polyline || '' };
    } catch {
      return null;
    }
  }

  /**
   * Ruta depósito → varias paradas en orden (última = destination).
   * waypoints = direcciones de las paradas intermedias (sin la última).
   */
  async getRouteWithWaypoints(
    originAddress: string,
    waypointAddresses: string[],
    destinationAddress: string,
    withTraffic = false,
  ): Promise<{
    durationMinTotal: number;
    polyline: string;
    legs: Array<{
      durationMin: number;
      distanceMeters: number;
      polyline: string | null;
    }>;
  } | null> {
    if (!this.apiKey?.trim()) return null;
    const o = encodeURIComponent(originAddress.trim());
    const d = encodeURIComponent(destinationAddress.trim());
    if (!o || !d) return null;

    const wps = waypointAddresses
      .map((a) => a?.trim())
      .filter(Boolean)
      .map((a) => encodeURIComponent(a));
    const wpParam =
      wps.length > 0 ? `&waypoints=${wps.join('%7C')}` : '';

    const traffic = withTraffic ? '&departure_time=now' : '';
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${o}&destination=${d}${wpParam}&mode=driving${traffic}&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' || !data.routes?.length) return null;
      const route = data.routes[0];
      const overview = route.overview_polyline?.points ?? '';
      const rawLegs = route.legs ?? [];
      if (!rawLegs.length) return null;

      let durationMinTotal = 0;
      const legs = rawLegs.map((leg: any) => {
        const seconds =
          withTraffic && leg.duration_in_traffic?.value != null
            ? Number(leg.duration_in_traffic.value)
            : Number(leg.duration?.value ?? 0);
        const dm = Math.round(seconds / 60);
        durationMinTotal += dm;
        const dist = Number(leg.distance?.value ?? 0);
        return {
          durationMin: dm,
          distanceMeters: Math.round(dist),
          polyline: null,
        };
      });

      return {
        durationMinTotal,
        polyline: overview || '',
        legs,
      };
    } catch {
      return null;
    }
  }
}
