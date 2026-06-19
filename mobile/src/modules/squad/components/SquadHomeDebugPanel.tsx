import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ConquestSession, SquadChest, SquadStreak } from '../types';
import { debugLog } from '../../../lib/debug';

export interface SquadHomeDebugSnapshot {
  apiBase: string;
  lastSessionError: string | null;
  lastCheckinVenue: { id: number; name: string } | null;
  lastCheckinAt: string | null;
  lastPulseOk: boolean | null;
  lastPulseError: string | null;
  lastPulseAt: string | null;
  activeSession: ConquestSession | null;
  sessionLoading: boolean;
  activeChest: SquadChest | null;
  streak: SquadStreak;
  unreadAlertCount: number;
  onRefreshSession?: () => void;
}

function BoolRow({ label, value, detail }: { label: string; value: boolean; detail?: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.bool, value ? s.boolOn : s.boolOff]}>{value ? 'YES' : 'NO'}</Text>
      {detail ? <Text style={s.detail}>{detail}</Text> : null}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export function SquadHomeDebugPanel(props: SquadHomeDebugSnapshot) {
  const [expanded, setExpanded] = useState(true);

  const showChestCard = props.activeChest !== null;
  const showPlaceholderChest = !showChestCard;
  const showSessionBanner = props.activeSession !== null;
  const showStreakTracker = true; // always rendered on home

  useEffect(() => {
    if (!__DEV__) return;
    debugLog('SQUADD_UI', 'home debug snapshot', {
      showChestCard,
      showPlaceholderChest,
      showSessionBanner,
      showStreakTracker,
      streakDays: props.streak.days,
      chestVenue: props.activeChest?.venueName ?? null,
      chestId: props.activeChest?.id ?? null,
      lastCheckinVenue: props.lastCheckinVenue,
      lastPulseOk: props.lastPulseOk,
      lastPulseError: props.lastPulseError,
      apiBase: props.apiBase,
      lastSessionError: props.lastSessionError,
      activeSession: props.activeSession
        ? {
            id: props.activeSession.id,
            venueId: props.activeSession.venueId,
            venueName: props.activeSession.venueName,
            secondsRemaining: props.activeSession.secondsRemaining,
            state: props.activeSession.state,
            copresentCount: props.activeSession.copresentCount,
            isClashActive: props.activeSession.isClashActive,
          }
        : null,
      sessionLoading: props.sessionLoading,
    });
  }, [
    showChestCard,
    showPlaceholderChest,
    showSessionBanner,
    props.streak.days,
    props.activeChest?.id,
    props.activeChest?.venueName,
    props.lastCheckinVenue,
    props.lastPulseOk,
    props.lastPulseError,
    props.apiBase,
    props.lastSessionError,
    props.activeSession,
    props.sessionLoading,
  ]);

  if (!__DEV__) return null;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <Text style={s.headerTitle}>🛠 DEV · MY SQUADD UI</Text>
        <Text style={s.headerToggle}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          <Text style={s.section}>API target</Text>
          <InfoRow label="apiBase" value={props.apiBase} />
          {props.lastSessionError ? (
            <View style={s.errorBox}>
              <Text style={s.errorTitle}>Conquest API error</Text>
              <Text style={s.errorText}>{props.lastSessionError}</Text>
              {props.lastSessionError.includes('404') ? (
                <Text style={s.errorHint}>
                  404 = route missing on this server. Expo dev often falls back to Railway prod — conquest is not deployed there yet. Run pickleball-hub locally on a free port (not CourtFlow :3000).
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text style={s.section}>Visible cards</Text>
          <BoolRow label="Chest card" value={showChestCard} detail={showChestCard ? props.activeChest!.id.slice(0, 8) + '…' : 'placeholder shown'} />
          <BoolRow label="Session active banner" value={showSessionBanner} />
          <BoolRow label="Streak tracker" value={showStreakTracker} detail={`${props.streak.days} day(s)`} />
          <BoolRow label="Alerts bell" value={props.unreadAlertCount > 0} detail={`${props.unreadAlertCount} unread`} />

          <Text style={s.section}>Last check-in (sheet)</Text>
          {props.lastCheckinVenue ? (
            <>
              <InfoRow label="Venue" value={`#${props.lastCheckinVenue.id} · ${props.lastCheckinVenue.name}`} />
              <InfoRow label="At" value={props.lastCheckinAt ?? '—'} />
              <Text style={s.hint}>Venue id must exist in DB — use GPS nearby list, not hardcoded ids</Text>
            </>
          ) : (
            <InfoRow label="Venue" value="(none this session)" />
          )}

          <Text style={s.section}>Radar pulse</Text>
          <BoolRow
            label="Pulse OK"
            value={props.lastPulseOk === true}
            detail={
              props.lastPulseOk === null
                ? 'not fired yet'
                : props.lastPulseOk
                  ? props.lastPulseAt ?? ''
                  : props.lastPulseError ?? 'failed'
            }
          />
          {props.lastPulseError ? (
            <InfoRow label="Pulse error" value={props.lastPulseError} />
          ) : null}

          <Text style={s.section}>Active conquest session (API)</Text>
          <BoolRow label="sessionLoading" value={props.sessionLoading} />
          {props.activeSession ? (
            <>
              <InfoRow label="Session" value={props.activeSession.id.slice(0, 12) + '…'} />
              <InfoRow label="Venue" value={`#${props.activeSession.venueId} · ${props.activeSession.venueName}`} />
              <InfoRow label="Timer" value={`${props.activeSession.secondsRemaining}s · ${props.activeSession.state}`} />
              <InfoRow label="Co-present" value={String(props.activeSession.copresentCount)} />
              <InfoRow label="Clash" value={props.activeSession.isClashActive ? (props.activeSession.clashPartnerSquadName ?? 'yes') : 'no'} />
            </>
          ) : (
            <InfoRow label="Session" value="null — banner hidden" />
          )}

          {props.activeChest ? (
            <>
              <Text style={s.section}>Active chest (API)</Text>
              <InfoRow label="Venue" value={props.activeChest.venueName ?? '(no venue name)'} />
              <InfoRow label="Earner" value={props.activeChest.earnerName} />
            </>
          ) : null}

          {props.onRefreshSession ? (
            <TouchableOpacity style={s.btn} onPress={props.onRefreshSession} activeOpacity={0.8}>
              <Text style={s.btnText}>↻ Refresh conquest session</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.35)',
    backgroundColor: 'rgba(250,204,21,0.06)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#facc15',
  },
  headerToggle: { fontSize: 10, color: '#a1a1aa' },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  section: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#71717a',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  label: { fontSize: 11, color: '#a1a1aa', minWidth: 120 },
  bool: { fontSize: 11, fontWeight: '900' },
  boolOn: { color: '#a3e635' },
  boolOff: { color: '#ef4444' },
  detail: { flex: 1, fontSize: 10, color: '#71717a' },
  value: { flex: 1, fontSize: 11, color: '#e4e4e7', textAlign: 'right' },
  hint: { fontSize: 9, color: '#52525b', fontStyle: 'italic', marginTop: 2 },
  btn: {
    marginTop: 12,
    backgroundColor: 'rgba(163,230,53,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.35)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnText: { fontSize: 11, fontWeight: '800', color: '#a3e635' },
  errorBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  errorTitle: { fontSize: 10, fontWeight: '900', color: '#ef4444', marginBottom: 4 },
  errorText: { fontSize: 11, color: '#fca5a5', fontWeight: '700' },
  errorHint: { fontSize: 9, color: '#a1a1aa', marginTop: 6, lineHeight: 14 },
});
