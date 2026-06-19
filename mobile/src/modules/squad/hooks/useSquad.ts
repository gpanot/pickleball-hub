import { useState, useCallback } from 'react';
import * as api from '../api';
import type { Squad, SquadPreview, CreateSquadPayload, SquadInviteEnriched, SquadDisbandedNotice } from '../types';

export function useSquad() {
  const [squad, setSquad] = useState<Squad | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [disbandedNotice, setDisbandedNotice] = useState<SquadDisbandedNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMySquad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMySquad();
      setSquad(data.squad);
      setMyRole(data.myRole ?? null);
      setDisbandedNotice(data.disbandedNotice ?? null);
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (payload: CreateSquadPayload) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.createSquad(payload);
      setSquad(data.squad);
      setMyRole('founder');
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const invite = useCallback(async (squadId: string, profileIds: string[]) => {
    setError(null);
    try {
      return await api.sendInvites(squadId, profileIds);
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, []);

  const fetchInviteStatus = useCallback(async (squadId: string) => {
    try {
      const data = await api.getInviteStatus(squadId);
      return data.invites;
    } catch (e: any) {
      setError(e.message);
      return [] as SquadInviteEnriched[];
    }
  }, []);

  const accept = useCallback(async (squadId: string, inviteId: number) => {
    setLoading(true);
    try {
      await api.acceptInvite(squadId, inviteId);
      await fetchMySquad();
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [fetchMySquad]);

  const decline = useCallback(async (squadId: string, inviteId: number) => {
    try {
      await api.declineInvite(squadId, inviteId);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const resend = useCallback(async (squadId: string, inviteId: number) => {
    try {
      await api.resendInvite(squadId, inviteId);
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, []);

  const cancelInvite = useCallback(async (squadId: string, inviteId: number) => {
    try {
      await api.cancelInvite(squadId, inviteId);
      await fetchMySquad();
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, [fetchMySquad]);

  const removeMember = useCallback(async (squadId: string, profileId: string) => {
    try {
      await api.removeMember(squadId, profileId);
      await fetchMySquad();
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, [fetchMySquad]);

  const fetchByCode = useCallback(async (code: string): Promise<SquadPreview | null> => {
    setLoading(true);
    try {
      return await api.getSquadByCode(code);
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const joinByCode = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.joinByCode(code);
      setSquad(data.squad);
      setMyRole('member');
      return data; // return full { squad, welcomeChestClaimed }
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const leave = useCallback(async (squadId: string) => {
    setLoading(true);
    try {
      await api.leaveSquad(squadId);
      setSquad(null);
      setMyRole(null);
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const disband = useCallback(async (squadId: string) => {
    setLoading(true);
    try {
      await api.disbandSquad(squadId);
      setSquad(null);
      setMyRole(null);
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    squad,
    myRole,
    disbandedNotice,
    loading,
    error,
    fetchMySquad,
    create,
    invite,
    fetchInviteStatus,
    accept,
    decline,
    resend,
    cancelInvite,
    removeMember,
    fetchByCode,
    joinByCode,
    leave,
    disband,
  };
}
