import { useState, useEffect, useRef, useCallback } from 'react';
import {
  reverseGeocode,
  getCachedLocation,
  getCoordinateKey,
  ResolvedLocation,
} from '@/services/api/reverseGeocodingService';

/**
 * Hook to resolve a single coordinate pair to a human-readable location
 */
export function useSingleResolvedLocation(
  lat: number | null | undefined,
  lng: number | null | undefined,
  language = 'en'
): {
  location: ResolvedLocation | null;
  isLoading: boolean;
} {
  const [location, setLocation] = useState<ResolvedLocation | null>(() => {
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
      return getCachedLocation(lat, lng, language) || null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
      return getCachedLocation(lat, lng, language) === undefined;
    }
    return false;
  });

  useEffect(() => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      setLocation(null);
      setIsLoading(false);
      return;
    }

    const cached = getCachedLocation(lat, lng, language);
    if (cached !== undefined) {
      setLocation(cached);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    reverseGeocode(lat, lng, language).then((res) => {
      if (isMounted) {
        setLocation(res);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [lat, lng, language]);

  return { location, isLoading };
}

export interface LocatableItem {
  latitude: number | null;
  longitude: number | null;
  permission_status?: string;
}

/**
 * Hook to resolve multiple coordinates for paginated tables/lists.
 * Resolves only visible records with permission_status === 'granted' and valid coordinates.
 * Strictly ignores denied/prompt/unavailable sessions.
 */
export function useResolvedLocations(
  items: LocatableItem[],
  language = 'en'
): {
  getLocation: (lat: number | null | undefined, lng: number | null | undefined) => ResolvedLocation | null;
  isLoadingLocation: (lat: number | null | undefined, lng: number | null | undefined) => boolean;
} {
  // Store map of key -> ResolvedLocation | null
  const [resolvedMap, setResolvedMap] = useState<Record<string, ResolvedLocation | null>>({});
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});

  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let isCancelled = false;

    // Filter candidate coordinates: strictly only 'granted' sessions with valid numbers
    const candidates: Array<{ lat: number; lng: number; key: string }> = [];

    items.forEach((item) => {
      const isGranted = item.permission_status === 'granted';
      if (
        isGranted &&
        item.latitude !== null &&
        item.latitude !== undefined &&
        item.longitude !== null &&
        item.longitude !== undefined &&
        !isNaN(item.latitude) &&
        !isNaN(item.longitude)
      ) {
        const key = getCoordinateKey(item.latitude, item.longitude, language);
        if (!candidates.some((c) => c.key === key)) {
          candidates.push({ lat: item.latitude, lng: item.longitude, key });
        }
      }
    });

    // Immediate check against in-memory cache
    const initialResolved: Record<string, ResolvedLocation | null> = {};
    const uncached: Array<{ lat: number; lng: number; key: string }> = [];

    candidates.forEach((c) => {
      const cached = getCachedLocation(c.lat, c.lng, language);
      if (cached !== undefined) {
        initialResolved[c.key] = cached;
      } else {
        uncached.push(c);
      }
    });

    if (Object.keys(initialResolved).length > 0) {
      setResolvedMap((prev) => ({ ...prev, ...initialResolved }));
    }

    if (uncached.length === 0) return;

    // Mark uncached as loading
    const newLoading: Record<string, boolean> = {};
    uncached.forEach((u) => {
      newLoading[u.key] = true;
    });
    setLoadingKeys((prev) => ({ ...prev, ...newLoading }));

    // Fetch uncached candidates via rate-limited queue
    uncached.forEach(({ lat, lng, key }) => {
      reverseGeocode(lat, lng, language).then((result) => {
        if (!isCancelled) {
          setResolvedMap((prev) => ({ ...prev, [key]: result }));
          setLoadingKeys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [items, language]);

  const getLocation = useCallback(
    (lat: number | null | undefined, lng: number | null | undefined): ResolvedLocation | null => {
      if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
      const key = getCoordinateKey(lat, lng, language);
      if (key in resolvedMap) {
        return resolvedMap[key];
      }
      const cached = getCachedLocation(lat, lng, language);
      return cached || null;
    },
    [resolvedMap, language]
  );

  const isLoadingLocation = useCallback(
    (lat: number | null | undefined, lng: number | null | undefined): boolean => {
      if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
      const key = getCoordinateKey(lat, lng, language);
      if (loadingKeys[key]) return true;
      const cached = getCachedLocation(lat, lng, language);
      return cached === undefined && !(key in resolvedMap);
    },
    [loadingKeys, resolvedMap, language]
  );

  return { getLocation, isLoadingLocation };
}
