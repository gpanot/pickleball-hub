import { useState, useCallback } from 'react';
import * as api from '../api';
import type { ChestOpenResult } from '../types';

export function useSquadChest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tap = useCallback(async (chestId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.tapChest(chestId);
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const open = useCallback(async (chestId: string): Promise<ChestOpenResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.openChest(chestId);
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const nudge = useCallback(async (squadId: string, chestId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.nudgeChest(squadId, chestId);
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { tap, open, nudge, loading, error };
}
