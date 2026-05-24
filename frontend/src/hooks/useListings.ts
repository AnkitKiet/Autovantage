"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchListingsAPI, fetchUserListingsAPI, Listing } from "@/lib/api";

export function useListings(mode: "all" | "user" = "all", username?: string | null, filters?: any) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Stringify the filters object so React safely checks for value updates in the dependency array
  const filtersKey = JSON.stringify(filters || {});

  const loadData = useCallback(async (cursor?: string | null, isRefresh: boolean = false) => {
    if (mode === "user" && !username) {
      return; // Do nothing until username is available
    }

    setLoading(true);
    setError(null);
    
    try {
      const parsedFilters = JSON.parse(filtersKey);
      const res = mode === "user" && username
        ? await fetchUserListingsAPI(username, cursor) 
        : await fetchListingsAPI(cursor, 12, parsedFilters);
        
      // Safely access array based on common Spring Boot response wrappers
      const newData = res.data || res.content || res.items || [];
      
      setListings((prev) => (cursor && !isRefresh ? [...prev, ...newData] : newData));
      setNextCursor(res.nextCursor || null);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while fetching data.");
    } finally {
      setLoading(false);
    }
  }, [mode, username, filtersKey]);

  useEffect(() => {
    loadData(null, true);
  }, [loadData]);

  const refresh = useCallback(() => {
    loadData(null, true);
  }, [loadData]);

  return {
    listings,
    loading,
    error,
    nextCursor,
    fetchNextPage: () => { if (nextCursor) loadData(nextCursor, false); },
    refresh
  };
}