import { useState, useEffect, useCallback, useRef } from 'react';

export function useSupermarketData(filterOptions = {}) {
  const [stores, setStores] = useState([]);
  const [offers, setOffers] = useState([]);
  const [flyers, setFlyers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facets, setFacets] = useState({ categories: {}, stores: {}, discountRanges: {} });
  const [status, setStatus] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    dataSource: 'live',
    lastSyncTimestamp: new Date().toISOString(),
    storeCount: 5
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalOffers, setTotalOffers] = useState(0);

  const abortControllerRef = useRef(null);

  // 1. Fetch Store Directory & System Status
  const fetchMetadata = useCallback(async () => {
    try {
      const [storesRes, statusRes] = await Promise.all([
        fetch('/api/stores').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/status').then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);

      if (storesRes?.stores) {
        setStores(storesRes.stores);
      }
      if (statusRes) {
        setStatus(statusRes);
      } else {
        setStatus((prev) => ({ ...prev, isOnline: false, dataSource: 'seed' }));
      }
    } catch (err) {
      console.warn('[useSupermarketData] Metadata fetch warning:', err.message);
      setStatus((prev) => ({ ...prev, isOnline: false, dataSource: 'seed' }));
    }
  }, []);

  // 2. Fetch Flyers (optional filter by storeId)
  const fetchFlyers = useCallback(async (storeId) => {
    try {
      const url = storeId ? `/api/flyers?storeId=${encodeURIComponent(storeId)}` : '/api/flyers';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setFlyers(data.flyers || []);
      }
    } catch (err) {
      console.warn('[useSupermarketData] Flyers fetch warning:', err.message);
    }
  }, []);

  // 3. Fetch Offers with filtering, sorting, pagination
  const fetchOffers = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    if (filterOptions.storeId) queryParams.set('storeId', filterOptions.storeId);
    if (filterOptions.domain) queryParams.set('domain', filterOptions.domain);
    if (filterOptions.profileId) queryParams.set('profileId', filterOptions.profileId);
    if (filterOptions.hideIncompatible) queryParams.set('hideIncompatible', 'true');
    if (filterOptions.q && filterOptions.q.trim()) queryParams.set('q', filterOptions.q.trim());
    if (filterOptions.category) queryParams.set('category', filterOptions.category);
    if (filterOptions.minDiscount) queryParams.set('minDiscount', filterOptions.minDiscount);
    if (filterOptions.sortBy) queryParams.set('sortBy', filterOptions.sortBy);
    if (filterOptions.page) queryParams.set('page', filterOptions.page);
    queryParams.set('limit', filterOptions.limit || 1000);

    try {
      const res = await fetch(`/api/offers?${queryParams.toString()}`, {
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to load offers`);
      }

      const data = await res.json();
      setOffers(data.offers || []);
      setTotalOffers(data.totalOffers || 0);
      if (data.categories) setCategories(data.categories);
      if (data.facets) setFacets(data.facets);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setStatus((prev) => ({ ...prev, isOnline: false }));
      }
    } finally {
      setLoading(false);
    }
  }, [
    filterOptions.storeId,
    filterOptions.domain,
    filterOptions.profileId,
    filterOptions.hideIncompatible,
    filterOptions.q,
    filterOptions.category,
    filterOptions.minDiscount,
    filterOptions.sortBy,
    filterOptions.page,
    filterOptions.limit
  ]);

  // Initial metadata load
  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Flyers load on store change
  useEffect(() => {
    fetchFlyers(filterOptions.storeId);
  }, [fetchFlyers, filterOptions.storeId]);

  // Offers load on filter change
  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Online / Offline window events listener
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
      fetchMetadata();
      fetchOffers();
    };

    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false, dataSource: 'seed' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchMetadata, fetchOffers]);

  // Sync / refresh trigger (supports both Quick Sync and Deep Sync across all 14 stores)
  const syncData = useCallback(async (force = true, deep = false) => {
    try {
      setLoading(true);
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, deep })
      });
      const result = await res.json().catch(() => ({}));
      await fetchMetadata();
      await fetchOffers();
      await fetchFlyers(filterOptions.storeId);
      return { success: res.ok, dataSource: result.dataSource || 'live', result };
    } catch (err) {
      console.warn('[useSupermarketData] Sync error:', err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [fetchMetadata, fetchOffers, fetchFlyers, filterOptions.storeId]);

  return {
    stores,
    offers,
    flyers,
    categories,
    facets,
    status,
    setStatus,
    loading,
    error,
    totalOffers,
    syncData,
    refetchOffers: fetchOffers
  };
}

export default useSupermarketData;
