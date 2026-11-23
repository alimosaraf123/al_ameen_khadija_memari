import { Platform } from 'react-native';
import * as Location from 'expo-location';

export interface PreciseLocationInfo {
  locationString: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  source: 'gps' | 'ip';
  mapsUrl: string | null;
  timestamp: number;
}

let cachedLocation: PreciseLocationInfo | null = (() => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const saved = window.sessionStorage.getItem('al_ameen_precise_loc');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - (parsed.timestamp || 0) < 15 * 60 * 1000) {
          return parsed;
        }
      }
    } catch {}
  }
  return null;
})();

let permissionRequested = false;
let inFlightPromise: Promise<PreciseLocationInfo | null> | null = null;

function saveCachedLocation(info: PreciseLocationInfo) {
  cachedLocation = info;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem('al_ameen_precise_loc', JSON.stringify(info));
    } catch {}
  }
}

/**
 * Format a reverse-geocoded place into a clear institutional location name
 */
export function formatAddress(address: Location.LocationGeocodedAddress | any): string {
  if (!address) return '';
  const area = address.name || address.street || '';
  const city = address.city || address.subregion || address.district || '';
  const district = address.district || address.subregion || '';
  const state = address.region || address.state || 'West Bengal';
  const pin = address.postalCode ? `(${address.postalCode})` : '';

  // Specific check for Memari / nearby campus
  const allText = `${area} ${city} ${district}`.toLowerCase();
  if (allText.includes('memari')) {
    return `Memari, ${district || 'Purba Bardhaman'} (GPS)`;
  }

  const parts = [area !== city ? area : '', city || district, state, pin].filter(Boolean);
  const formatted = parts.slice(0, 3).join(', ');
  return formatted ? `${formatted} (GPS)` : `West Bengal (GPS)`;
}

/**
 * Request permission and acquire precise GPS coordinates and human address
 */
export async function getPreciseLocation(forceRefresh = false): Promise<PreciseLocationInfo | null> {
  const now = Date.now();
  if (!forceRefresh && cachedLocation && now - cachedLocation.timestamp < 10 * 60 * 1000) {
    return cachedLocation;
  }
  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      // 1. Web browser native fallback if needed
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        const webPromise = new Promise<PreciseLocationInfo | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const { latitude, longitude, accuracy } = pos.coords;
              const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
              let locStr = `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

              try {
                // Try OpenStreetMap reverse geocode for web
                const osmRes = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
                  { headers: { 'User-Agent': 'AlAmeenMission/1.0' } }
                );
                if (osmRes.ok) {
                  const osmData = await osmRes.json();
                  const addr = osmData.address || {};
                  const town = addr.town || addr.city || addr.suburb || addr.village || addr.county || '';
                  const dist = addr.state_district || addr.county || '';
                  const state = addr.state || 'West Bengal';
                  const parts = [town, dist, state].filter(Boolean);
                  if (parts.length) {
                    locStr = `${parts.join(', ')} (GPS)`;
                  }
                }
              } catch {
                // Fallback to coordinates
              }

              const info: PreciseLocationInfo = {
                locationString: locStr,
                latitude,
                longitude,
                accuracy,
                source: 'gps',
                mapsUrl,
                timestamp: Date.now(),
              };
              saveCachedLocation(info);
              resolve(info);
            },
            () => resolve(null),
            { timeout: 5000, enableHighAccuracy: true }
          );
        });

        const webResult = await webPromise;
        if (webResult) return webResult;
      }

      // 2. Expo Location (Android, iOS, Web)
      const { status } = await Location.requestForegroundPermissionsAsync();
      permissionRequested = true;
      if (status !== 'granted') {
        return cachedLocation;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude, accuracy } = pos.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      let locStr = `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      try {
        const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (rev && rev.length > 0) {
          locStr = formatAddress(rev[0]);
        }
      } catch {
        // Keep coordinates
      }

      const info: PreciseLocationInfo = {
        locationString: locStr,
        latitude,
        longitude,
        accuracy,
        source: 'gps',
        mapsUrl,
        timestamp: Date.now(),
      };
      saveCachedLocation(info);
      return info;
    } catch {
      return cachedLocation;
    }
  })().finally(() => {
    inFlightPromise = null;
  });

  return inFlightPromise;
}

function formatHeaders(loc: PreciseLocationInfo | null): Record<string, string> {
  if (!loc || !loc.locationString) return {};
  return {
    'X-Client-Location': loc.locationString,
    'X-Client-Lat': loc.latitude !== null ? String(loc.latitude) : '',
    'X-Client-Lon': loc.longitude !== null ? String(loc.longitude) : '',
    'X-Client-Accuracy': loc.accuracy !== null ? String(loc.accuracy) : '',
    'X-Client-Source': loc.source,
  };
}

/**
 * Returns headers with precise location if available
 */
export async function getPreciseLocationHeaders(): Promise<Record<string, string>> {
  if (cachedLocation && cachedLocation.locationString) {
    return formatHeaders(cachedLocation);
  }
  const loc = await Promise.race([
    getPreciseLocation(),
    new Promise<null>((r) => setTimeout(() => r(null), 400)),
  ]);
  return formatHeaders(loc || cachedLocation);
}
