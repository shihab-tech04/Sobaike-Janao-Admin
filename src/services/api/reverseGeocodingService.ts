/**
 * Reverse Geocoding Service (Nominatim Policy Compliant)
 * Resolves human-readable addresses from latitude/longitude coordinates.
 * Strictly adheres to OpenStreetMap Nominatim Usage Policy:
 * - Maximum concurrency = 1
 * - Minimum delay between consecutive network requests = 1100ms (<= 1 req/sec)
 * - In-memory coordinate caching to avoid duplicate requests
 * - In-flight promise deduplication
 * - Attribution: © OpenStreetMap contributors
 * - Privacy-safe: Only latitude and longitude are transmitted.
 */

export interface ResolvedLocation {
  shortLabel: string;
  fullAddress: string;
  locality?: string;
  city?: string;
  district?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
}

export const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
};

// In-memory cache keyed by normalized "lat,lng:lang"
const locationCache = new Map<string, ResolvedLocation | null>();

// In-flight active request promises to prevent duplicate network calls
const inFlightPromises = new Map<string, Promise<ResolvedLocation | null>>();

// Rate-limiting and single-concurrency queue enforcement
const MIN_REQUEST_INTERVAL_MS = 1100; // >= 1100ms spacing between network requests
let lastRequestTimestamp = 0;

interface QueuedTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const requestQueue: Array<QueuedTask<unknown>> = [];
let isQueueProcessing = false;

async function processQueue(): Promise<void> {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    if (!task) break;

    const now = Date.now();
    const elapsed = now - lastRequestTimestamp;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((res) => setTimeout(res, MIN_REQUEST_INTERVAL_MS - elapsed));
    }

    try {
      lastRequestTimestamp = Date.now();
      const result = await task.execute();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    }
  }

  isQueueProcessing = false;
}

function enqueueRequest<T>(execute: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push({
      execute: execute as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    void processQueue();
  });
}

/**
 * Normalizes coordinates into a cache key (rounded to 5 decimal places ~1.1m precision)
 */
export function getCoordinateKey(lat: number, lng: number, lang = 'en'): string {
  const roundedLat = Number(lat).toFixed(5);
  const roundedLng = Number(lng).toFixed(5);
  return `${roundedLat},${roundedLng}:${lang}`;
}

/**
 * Deduplicates and builds a clean short label (e.g. "Dhanmondi, Dhaka")
 */
export function buildShortLocationLabel(address: Record<string, string | undefined>): string {
  if (!address) return '';

  const pointOrRoad =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.street ||
    address.path ||
    '';

  const neighborhoodOrArea =
    address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.residential ||
    address.hamlet ||
    address.village ||
    address.town ||
    address.locality ||
    '';

  const cityOrDistrict =
    address.city ||
    address.municipality ||
    address.county ||
    address.district ||
    address.state_district ||
    '';

  const stateOrRegion = address.state || address.region || address.province || '';
  const country = address.country || '';

  // Select candidates with prioritized hierarchy
  const parts: string[] = [];

  const addIfNew = (part?: string) => {
    if (!part || !part.trim()) return;
    const clean = part.trim();
    const cleanLower = clean.toLowerCase();
    // Avoid duplicates or substring collisions (e.g. "Dhaka City" vs "Dhaka")
    const isDuplicate = parts.some(
      (existing) =>
        existing.toLowerCase() === cleanLower ||
        existing.toLowerCase().includes(cleanLower) ||
        cleanLower.includes(existing.toLowerCase())
    );
    if (!isDuplicate) {
      parts.push(clean);
    }
  };

  // 1. Primary place/road/area
  if (neighborhoodOrArea) {
    addIfNew(neighborhoodOrArea);
  } else if (pointOrRoad) {
    addIfNew(pointOrRoad);
  }

  // 2. City / District
  if (cityOrDistrict) {
    addIfNew(cityOrDistrict);
  }

  // 3. Fallback to state or country if too short
  if (parts.length < 2) {
    if (stateOrRegion) {
      addIfNew(stateOrRegion);
    } else if (country) {
      addIfNew(country);
    }
  }

  // If still empty, try road or anything available
  if (parts.length === 0) {
    if (pointOrRoad) addIfNew(pointOrRoad);
    if (country) addIfNew(country);
  }

  // Limit to max 2-3 concise tokens
  return parts.slice(0, 2).join(', ');
}

/**
 * Reverse geocode a single coordinate pair.
 * Strictly single concurrency and >= 1100ms interval between network calls.
 * Returns normalized ResolvedLocation or null if resolution failed.
 */
export async function reverseGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined,
  language = 'en'
): Promise<ResolvedLocation | null> {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }

  if (isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const cacheKey = getCoordinateKey(lat, lng, language);

  // 1. Check in-memory cache first
  if (locationCache.has(cacheKey)) {
    return locationCache.get(cacheKey) || null;
  }

  // 2. Check in-flight requests to avoid duplicate queueing/fetching
  if (inFlightPromises.has(cacheKey)) {
    return inFlightPromises.get(cacheKey)!;
  }

  const fetchPromise = enqueueRequest<ResolvedLocation | null>(async (): Promise<ResolvedLocation | null> => {
    try {
      // Re-check cache in case resolved while waiting in queue
      if (locationCache.has(cacheKey)) {
        return locationCache.get(cacheKey) || null;
      }

      const acceptLanguage = language === 'bn' ? 'bn,en;q=0.8' : 'en,bn;q=0.8';
      const endpoint = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&addressdetails=1&zoom=18&accept-language=${encodeURIComponent(
        acceptLanguage
      )}`;

      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': acceptLanguage,
        },
      });

      if (!response.ok) {
        // Safe null on HTTP error
        locationCache.set(cacheKey, null);
        return null;
      }

      const data = await response.json();
      if (!data || data.error) {
        locationCache.set(cacheKey, null);
        return null;
      }

      const address = (data.address || {}) as Record<string, string | undefined>;
      const shortLabel =
        buildShortLocationLabel(address) ||
        data.name ||
        data.display_name?.split(',')[0] ||
        `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      const fullAddress = data.display_name || shortLabel;

      const resolved: ResolvedLocation = {
        shortLabel,
        fullAddress,
        locality: address.neighbourhood || address.suburb || address.quarter || address.village || address.town,
        city: address.city || address.municipality || address.town,
        district: address.county || address.district || address.state_district,
        region: address.state || address.region,
        country: address.country,
        countryCode: address.country_code?.toUpperCase(),
        latitude: lat,
        longitude: lng,
      };

      locationCache.set(cacheKey, resolved);
      return resolved;
    } catch (err) {
      console.warn('Reverse geocoding lookup failed gracefully:', err);
      locationCache.set(cacheKey, null);
      return null;
    } finally {
      inFlightPromises.delete(cacheKey);
    }
  });

  inFlightPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Lookup synchronously from cache if already resolved
 */
export function getCachedLocation(
  lat: number | null | undefined,
  lng: number | null | undefined,
  language = 'en'
): ResolvedLocation | null | undefined {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }
  const cacheKey = getCoordinateKey(lat, lng, language);
  return locationCache.get(cacheKey);
}

export const reverseGeocodingService = {
  reverseGeocode,
  getCachedLocation,
  getCoordinateKey,
  buildShortLocationLabel,
  OSM_ATTRIBUTION,
};

export default reverseGeocodingService;
