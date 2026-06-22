import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView, Image, Alert, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { checkin, getNearbyVenues } from '../api';
import { dropPulse } from '../conquestApi';
import type { SquadMemberWithProfile } from '../types';
import { ClubTokenIcon } from '../components/TokenIcons';
import { useAuthStore } from '../../../stores/authStore';
import type { NextLevelInfo } from './TokenSplitScreen';
import { debugLog } from '../../../lib/debug';

// Tokens instantly awarded on check-in (no chest-open step needed in the modal)
const CHECKIN_TOKEN_REWARD = 100;
// 5-step donation split
const SPLIT_STEPS = [0, 0.25, 0.5, 0.75, 1];

const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const BLUE = '#60a5fa';
const PURPLE = '#a78bfa';
const BANGERS = 'Bangers_400Regular';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');

function SuccessStage({
  result,
  squadName,
  onCollect,
}: {
  result: { chestId: string; xpAwarded: number } | null;
  squadName: string;
  onCollect: () => void;
}) {
  const chestScale = useRef(new Animated.Value(0.5)).current;
  const chestRotate = useRef(new Animated.Value(-5)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(chestScale, { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }),
      Animated.timing(chestRotate, { toValue: 0, duration: 800, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: 500, delay: 350, useNativeDriver: true }),
      Animated.timing(contentY, { toValue: 0, duration: 500, delay: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.successWrap}>
      {/* Compact chest visual */}
      <Animated.View style={{
        transform: [
          { scale: chestScale },
          { rotate: chestRotate.interpolate({ inputRange: [-5, 0], outputRange: ['-5deg', '0deg'] }) },
        ],
      }}>
        <Image source={CHEST_IMAGE} style={s.successChest} resizeMode="contain" />
      </Animated.View>

      <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentY }], alignItems: 'center', width: '100%' }}>
        <Text style={s.successTitle}>CHECKED IN!</Text>
        <Text style={s.successSub}>{squadName} · rewards unlocked</Text>

        {/* Reward cards — compact row */}
        <View style={s.rewardRow}>
          <View style={[s.rewardCard, { borderColor: 'rgba(163,230,53,0.3)' }]}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>⚡</Text>
            <Text style={[s.rewardValue, { color: LIME }]}>+{result?.xpAwarded ?? 60}</Text>
            <Text style={s.rewardCardLabel}>SQUAD XP</Text>
          </View>
          <View style={[s.rewardCard, { borderColor: 'rgba(250,204,21,0.3)' }]}>
            <Image source={CHEST_IMAGE} style={{ width: 28, height: 28, marginBottom: 4 }} resizeMode="contain" />
            <Text style={[s.rewardValue, { color: GOLD }]}>1</Text>
            <Text style={s.rewardCardLabel}>CHEST</Text>
          </View>
          <View style={[s.rewardCard, { borderColor: 'rgba(96,165,250,0.3)' }]}>
            <View style={{ marginBottom: 4 }}>
              <ClubTokenIcon size={26} />
            </View>
            <Text style={[s.rewardValue, { color: BLUE }]}>+{CHECKIN_TOKEN_REWARD}</Text>
            <Text style={s.rewardCardLabel}>TOKENS</Text>
          </View>
        </View>
      </Animated.View>

      <TouchableOpacity onPress={onCollect} activeOpacity={0.85} style={{ width: '100%' }}>
        <LinearGradient colors={[LIME, LIME_DARK]} style={s.collectBtn}>
          <Text style={s.collectBtnText}>Collect & Split Tokens 🎁</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ── Inline compact token-split stage ──────────────────────────────────────────
function SplitStage({
  squadId,
  squadName,
  squadEmoji,
  nextLevel,
  onDone,
}: {
  squadId: string;
  squadName: string;
  squadEmoji: string;
  nextLevel?: NextLevelInfo | null;
  onDone: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(2); // default 50%
  const [confirming, setConfirming] = useState(false);

  const donateRatio = SPLIT_STEPS[stepIdx] ?? 0.5;
  const donateAmount = Math.floor(CHECKIN_TOKEN_REWARD * donateRatio);
  const keepAmount = CHECKIN_TOKEN_REWARD - donateAmount;
  const pct = Math.round(donateRatio * 100);

  const handleConfirm = async () => {
    setConfirming(true);
    debugLog('CHECKIN', `token split confirm: donate=${donateAmount} keep=${keepAmount} squad=${squadId}`);
    try {
      if (donateAmount > 0) {
        await useAuthStore.getState().authedFetch('/api/wallet/donate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ squadId, clubTokens: donateAmount }),
        });
        debugLog('CHECKIN', `donate OK ${donateAmount} tokens`);
      }
    } catch (e: any) {
      debugLog('CHECKIN', `donate FAILED: ${e?.message ?? String(e)}`);
      // Silent — tokens stay in wallet if donate fails
    }
    setConfirming(false);
    onDone();
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.splitWrap}>
      <Text style={s.splitTitle}>Split Club Tokens</Text>
      <Text style={s.splitSub}>Donate some to boost {squadEmoji} {squadName}'s XP</Text>

      {/* Visual split */}
      <View style={s.splitCard}>
        <View style={s.splitRow}>
          <View style={s.splitCol}>
            <ClubTokenIcon size={28} />
            <Text style={s.splitAmount}>{keepAmount}</Text>
            <Text style={s.splitLabel}>You keep</Text>
          </View>
          <View style={s.splitDivider} />
          <View style={s.splitCol}>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>{squadEmoji}</Text>
            <Text style={[s.splitAmount, { color: LIME }]}>{donateAmount}</Text>
            <Text style={s.splitLabel}>Squad XP</Text>
          </View>
        </View>

        <Text style={s.splitPct}>{pct}% donated</Text>

        {/* 5-step selector */}
        <View style={s.stepsRow}>
          {SPLIT_STEPS.map((step, idx) => (
            <TouchableOpacity
              key={idx}
              style={[s.stepBtn, idx === stepIdx && s.stepBtnActive]}
              onPress={() => setStepIdx(idx)}
              activeOpacity={0.7}
            >
              <Text style={[s.stepLabel, idx === stepIdx && s.stepLabelActive]}>
                {Math.round(step * 100)}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Next Level */}
      {nextLevel && (
        <View style={s.nextLevelCard}>
          <Text style={s.nextLevelTitle}>🎯 NEXT LEVEL</Text>
          <View style={s.nextLevelRow}>
            <Text style={s.nextLevelIcon}>🏓</Text>
            <Text style={s.nextLevelLabel}>Lvl {nextLevel.paddleLevel + 1} Paddle in</Text>
            <Text style={[s.nextLevelValue, { color: PURPLE }]}>{nextLevel.paddleTokensToNext} tkn</Text>
          </View>
          <View style={[s.nextLevelRow, s.nextLevelRowBorder]}>
            <Text style={s.nextLevelIcon}>🏛</Text>
            <Text style={s.nextLevelLabel}>Next Clubhouse in</Text>
            <Text style={[s.nextLevelValue, { color: BLUE }]}>{nextLevel.clubhouseTokensToNext} tkn</Text>
          </View>
          <View style={[s.nextLevelRow, s.nextLevelRowBorder]}>
            <Text style={s.nextLevelIcon}>⚡</Text>
            <Text style={s.nextLevelLabel}>Next Team in</Text>
            <Text style={[s.nextLevelValue, { color: GOLD }]}>{nextLevel.teamXpToNext} XP</Text>
          </View>
        </View>
      )}

      <TouchableOpacity onPress={handleConfirm} disabled={confirming} activeOpacity={0.85} style={{ width: '100%' }}>
        <LinearGradient colors={[LIME, LIME_DARK]} style={s.collectBtn}>
          {confirming ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={s.collectBtnText}>
              {donateAmount > 0
                ? `Donate ${donateAmount} · Keep ${keepAmount} →`
                : `Keep all ${CHECKIN_TOKEN_REWARD} tokens →`}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

// How old a last-known location can be before we skip the fast-path (ms)
const LAST_KNOWN_MAX_AGE_MS = 60_000;
// Haversine distance threshold (km) to trigger a silent venue re-sort
const REFRESH_DELTA_KM = 0.3;
// Timeout for fresh location request (ms) before falling back
const LOCATION_TIMEOUT_MS = 4_000;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NearbyVenue {
  id: number;
  name: string;
  distance: number;
  district?: string;
  address?: string;
}

interface Props {
  visible: boolean;
  squadId: string;
  squadName: string;
  squadEmoji?: string;
  members: SquadMemberWithProfile[];
  myProfileId?: string | null;
  nextLevel?: NextLevelInfo | null;
  onClose: () => void;
  onSuccess: (result: { chestId: string; xpAwarded: number }) => void;
  onPulseDropped?: (venueId: number, venueName: string) => void;
  onCheckinComplete?: (venue: { id: number; name: string }) => void;
  onPulseResult?: (result: { venueId: number; venueName: string; ok: boolean; error?: string }) => void;
}

type Stage = 'main' | 'success' | 'split';

function mapVenues(venues: { id: number; name: string; distance: number; address: string }[]): NearbyVenue[] {
  return venues.map(v => ({
    id: v.id,
    name: v.name,
    distance: v.distance,
    address: v.address,
    district: v.address?.split(',').pop()?.trim(),
  }));
}

export function CheckInSheet({
  visible, squadId, squadName, squadEmoji = '🏓', members, myProfileId, nextLevel,
  onClose, onSuccess, onPulseDropped, onCheckinComplete, onPulseResult,
}: Props) {
  const [stage, setStage] = useState<Stage>('main');
  const [selectedVenue, setSelectedVenue] = useState<NearbyVenue | null>(null);
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [nearbyVenues, setNearbyVenues] = useState<NearbyVenue[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [venuesFallback, setVenuesFallback] = useState(false);
  const [result, setResult] = useState<{ chestId: string; xpAwarded: number } | null>(null);

  // Reset when sheet opens
  useEffect(() => {
    if (visible) {
      setStage('main');
      setSelectedVenue(null);
      setTaggedIds([]);
      setResult(null);
      setNearbyVenues([]);
      setVenueError(null);
      setVenuesFallback(false);
    }
  }, [visible]);

  const loadNearbyVenues = useCallback(async () => {
    const t0 = Date.now();
    debugLog('CHECKIN_PERF', `[0ms] loadNearbyVenues start`);
    setLocationLoading(true);
    setVenueError(null);

    // ── Step 1: Permission check (fast — OS caches this) ──────────────────
    const { status } = await Location.requestForegroundPermissionsAsync();
    debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] permission check done: ${status}`);
    if (status !== 'granted') {
      Alert.alert('Location required', 'Enable location to find nearby courts');
      setLocationLoading(false);
      return;
    }

    // ── Step 2: Try last-known location for instant fast-path ─────────────
    let fastCoords: { latitude: number; longitude: number } | null = null;
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      if (lastKnown) {
        fastCoords = lastKnown.coords;
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] last-known position available (age=${Date.now() - lastKnown.timestamp}ms), using as fast-path`);
      } else {
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] no last-known position, waiting for fresh fix`);
      }
    } catch (e) {
      debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] getLastKnownPositionAsync failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── Step 3: Kick off fresh location in parallel (with timeout) ────────
    const freshLocPromise: Promise<{ latitude: number; longitude: number } | null> = (async () => {
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS));
      const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(
        loc => loc.coords,
      ).catch(e => {
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] getCurrentPositionAsync error: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
      return Promise.race([fresh, timeout]);
    })();

    // ── Step 4: Fetch venues with fast-path coords if available ──────────
    const coordsForInitialFetch = fastCoords;

    const applyVenues = (venues: { id: number; name: string; distance: number; address: string }[], fallback: boolean) => {
      if (venues.length === 0) {
        setVenueError('No courts in database. Add venues to test check-in.');
        setNearbyVenues([]);
        setVenuesFallback(false);
        return false;
      }
      setVenuesFallback(!!fallback);
      const mapped = mapVenues(venues);
      setNearbyVenues(mapped);
      setSelectedVenue(prev => prev ?? mapped[0]);
      return true;
    };

    if (coordsForInitialFetch) {
      // Fast path: use last-known to hit API immediately, show list right away
      debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] fast-path API call start`);
      try {
        const { venues, fallback } = await getNearbyVenues(
          coordsForInitialFetch.latitude,
          coordsForInitialFetch.longitude,
          20,
        );
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] fast-path API done, ${venues.length} venues`);
        applyVenues(venues, !!fallback);
        setLocationLoading(false);

        // ── Step 5: Background — await fresh fix, silently re-sort if moved ──
        freshLocPromise.then(async freshCoords => {
          if (!freshCoords) {
            debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] fresh location timed out or failed — keeping fast-path result`);
            return;
          }
          debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] fresh location resolved`);
          const delta = haversineKm(
            coordsForInitialFetch.latitude, coordsForInitialFetch.longitude,
            freshCoords.latitude, freshCoords.longitude,
          );
          debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] position delta=${delta.toFixed(3)}km (threshold=${REFRESH_DELTA_KM}km)`);
          if (delta >= REFRESH_DELTA_KM) {
            debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] delta exceeds threshold — silently refreshing venue list`);
            try {
              const { venues: freshVenues, fallback: freshFallback } = await getNearbyVenues(
                freshCoords.latitude, freshCoords.longitude, 20,
              );
              debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] background refresh done, ${freshVenues.length} venues`);
              applyVenues(freshVenues, !!freshFallback);
            } catch (e) {
              debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] background refresh API failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        });
      } catch (e: unknown) {
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] fast-path API failed: ${e instanceof Error ? e.message : String(e)}`);
        // Fall through to slow path
        setLocationLoading(false);
        setVenueError(e instanceof Error ? e.message : 'Could not load nearby courts');
      }
    } else {
      // Slow path: no cached coords — wait for fresh fix (up to timeout), then API
      debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] slow-path: waiting for fresh location (timeout=${LOCATION_TIMEOUT_MS}ms)`);
      const freshCoords = await freshLocPromise;
      debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] slow-path location resolved: ${freshCoords ? 'ok' : 'timeout/null'}`);

      if (!freshCoords) {
        setLocationLoading(false);
        setVenueError('Could not determine your location. Please try again.');
        return;
      }

      try {
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] slow-path API call start`);
        const { venues, fallback } = await getNearbyVenues(freshCoords.latitude, freshCoords.longitude, 20);
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] slow-path API done, ${venues.length} venues`);
        applyVenues(venues, !!fallback);
      } catch (e: unknown) {
        debugLog('CHECKIN_PERF', `[${Date.now() - t0}ms] slow-path API failed: ${e instanceof Error ? e.message : String(e)}`);
        setVenueError(e instanceof Error ? e.message : 'Could not load nearby courts');
      } finally {
        setLocationLoading(false);
      }
    }
  }, []);

  // Auto-load on open
  useEffect(() => {
    if (visible && stage === 'main' && nearbyVenues.length === 0 && !locationLoading) {
      void loadNearbyVenues();
    }
  }, [visible, stage, nearbyVenues.length, locationLoading, loadNearbyVenues]);

  const toggleTag = useCallback((profileId: string) => {
    setTaggedIds(prev =>
      prev.includes(profileId) ? prev.filter(id => id !== profileId) : [...prev, profileId]
    );
  }, []);

  const handleCheckin = useCallback(async () => {
    if (!selectedVenue) return;
    setLoading(true);
    debugLog('CHECKIN', `attempting check-in venue #${selectedVenue.id} "${selectedVenue.name}" squad=${squadId} tagged=${taggedIds.length}`);
    try {
      const res = await checkin({
        squadId,
        venueName: selectedVenue.name,
        venueId: selectedVenue.id,
        taggedProfileIds: taggedIds,
      });
      debugLog('CHECKIN', `check-in OK chestId=${res.chest.id} xp=${res.xpAwarded}`);
      setResult({ chestId: res.chest.id, xpAwarded: res.xpAwarded });
      setStage('success');
      onCheckinComplete?.({ id: selectedVenue.id, name: selectedVenue.name });

      if (onPulseDropped || onPulseResult) {
        const taggedForPulse = taggedIds.filter(id => id !== myProfileId);
        debugLog('CHECKIN', `dropping pulse venue #${selectedVenue.id} tagged=${taggedForPulse.length}`);
        dropPulse(selectedVenue.id, taggedForPulse)
          .then(() => {
            debugLog('CHECKIN', `pulse OK venue #${selectedVenue.id}`);
            onPulseResult?.({ venueId: selectedVenue.id, venueName: selectedVenue.name, ok: true });
            onPulseDropped?.(selectedVenue.id, selectedVenue.name);
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            debugLog('CHECKIN', `pulse FAILED venue #${selectedVenue.id}: ${message}`);
            onPulseResult?.({ venueId: selectedVenue.id, venueName: selectedVenue.name, ok: false, error: message });
          });
      }
    } catch (e: any) {
      debugLog('CHECKIN', `check-in ERROR: ${e?.message ?? String(e)} (type=${e?.constructor?.name ?? 'unknown'})`);
      if (e.message === 'already_checked_in') {
        const reset = e.nextCheckinAt ? new Date(e.nextCheckinAt) : null;
        const resetStr = reset
          ? reset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'tomorrow';
        Alert.alert('Already checked in', `You already checked in today. Come back at ${resetStr} for your next chest.`);
      } else if (e.message === 'rate_limited') {
        const retry = e.retryAfter ? new Date(e.retryAfter) : null;
        const retryStr = retry
          ? retry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'in a bit';
        Alert.alert('Too soon', `You already earned a chest recently. Try again after ${retryStr}.`);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [squadId, selectedVenue, taggedIds, myProfileId, onPulseDropped, onCheckinComplete, onPulseResult]);

  // "Collect" on success stage → move to split stage
  const handleCollect = useCallback(() => {
    setStage('split');
  }, []);

  // "Confirm" on split stage → fire onSuccess + close
  const handleSplitDone = useCallback(() => {
    if (result) onSuccess(result);
    onClose();
  }, [result, onSuccess, onClose]);

  const otherMembers = members.filter(m => m.profileId !== myProfileId);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        {/* Tap outside to close */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* ── MAIN: venue + tag merged ─────────────────────────── */}
          {stage === 'main' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

              {/* Title */}
              <Text style={s.sheetTitle}>📍 Where are you playing?</Text>
              <View style={s.divider} />

              {/* Loading state */}
              {locationLoading && nearbyVenues.length === 0 && (
                <View style={s.loadingRow}>
                  <ActivityIndicator color={LIME} />
                  <Text style={s.loadingText}>Finding courts near you…</Text>
                </View>
              )}

              {/* Fallback hint */}
              {venuesFallback && nearbyVenues.length > 0 && (
                <Text style={s.fallbackNote}>
                  No courts within 20 km — showing closest venues for testing.
                </Text>
              )}

              {/* Venue list — 3 visible rows, scroll for up to 5 total */}
              {nearbyVenues.length > 0 && (
                <ScrollView
                  style={s.venueListScroll}
                  scrollEnabled={nearbyVenues.length > 3}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {nearbyVenues.slice(0, 5).map((v, i) => {
                    const selected = selectedVenue?.id === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[s.venueRow, selected && s.venueRowSelected]}
                        onPress={() => setSelectedVenue(v)}
                        activeOpacity={0.75}
                      >
                        <View style={[s.venueIcon, selected && s.venueIconSelected]}>
                          <Text style={{ fontSize: 17 }}>🏓</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.venueName, selected && s.venueNameSelected]}>{v.name}</Text>
                          <Text style={s.venueDist}>
                            {v.distance < 1
                              ? `${Math.round(v.distance * 1000)}m`
                              : `${v.distance} km`}
                            {v.district ? ` · ${v.district}` : ''}
                          </Text>
                        </View>
                        {i === 0 && (
                          <View style={s.homeBadge}>
                            <Text style={s.homeBadgeText}>Home</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {venueError && <Text style={s.venueErrorText}>{venueError}</Text>}

              {/* Tag squadmates */}
              {otherMembers.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>TAG SQUADMATES?</Text>
                  <View style={s.tagRow}>
                    {otherMembers.map(m => {
                      const raw = m.profile.squadNickname
                        ? `@${m.profile.squadNickname}`
                        : m.profile.displayName?.split(' ')[0] ?? '?';
                      const name = raw.replace('@', '');
                      const isTagged = taggedIds.includes(m.profileId);
                      return (
                        <TouchableOpacity
                          key={m.profileId}
                          style={[s.tagPill, isTagged && s.tagPillActive]}
                          onPress={() => toggleTag(m.profileId)}
                          activeOpacity={0.75}
                        >
                          <View style={[s.tagAvatar, isTagged && s.tagAvatarActive]}>
                            <Text style={s.tagAvatarText}>
                              {name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={[s.tagName, isTagged && s.tagNameActive]}>{name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={s.tagHint}>
                    Tagged squadmates get a push · checking in from court boosts your squad INF
                  </Text>
                </>
              )}

              {/* CTA */}
              <TouchableOpacity
                style={[s.ctaBtn, !selectedVenue && s.ctaBtnDisabled]}
                onPress={handleCheckin}
                disabled={loading || !selectedVenue}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <LinearGradient
                    colors={selectedVenue ? [LIME, LIME_DARK] : ['#333', '#222']}
                    style={s.ctaGradient}
                  >
                    <Text style={[s.ctaBtnText, !selectedVenue && s.ctaBtnTextDisabled]}>
                      📡 Drop Radar Pulse
                    </Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>

            </ScrollView>
          )}

          {/* ── SUCCESS ──────────────────────────────────────────── */}
          {stage === 'success' && (
            <SuccessStage
              result={result}
              squadName={squadName}
              onCollect={handleCollect}
            />
          )}

          {/* ── TOKEN SPLIT ──────────────────────────────────────── */}
          {stage === 'split' && (
            <SplitStage
              squadId={squadId}
              squadName={squadName}
              squadEmoji={squadEmoji}
              nextLevel={nextLevel}
              onDone={handleSplitDone}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0d1a0d',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 32,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#2a2a2a',
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 6,
  },
  scrollContent: { paddingBottom: 8 },

  sheetTitle: {
    fontSize: 20, fontWeight: '900', color: '#fff',
    paddingHorizontal: 20, paddingTop: 10, marginBottom: 12,
  },
  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20, marginBottom: 16,
  },

  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginBottom: 12,
  },
  loadingText: { fontSize: 13, color: '#a1a1aa' },

  fallbackNote: {
    fontSize: 11, color: GOLD,
    paddingHorizontal: 20, marginBottom: 10, lineHeight: 16,
  },

  // Venue list — fixed height shows 3 rows (each ~66px), scroll reveals up to 5
  venueListScroll: {
    maxHeight: 66 * 3 + 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  venueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 14, marginBottom: 6,
    backgroundColor: '#1a2a1a',
    borderWidth: 2, borderColor: 'transparent',
  },
  venueRowSelected: {
    borderColor: LIME,
    backgroundColor: 'rgba(163,230,53,0.1)',
  },
  venueIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
  },
  venueIconSelected: { backgroundColor: 'rgba(163,230,53,0.15)' },
  venueName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  venueNameSelected: { color: LIME },
  venueDist: { fontSize: 11, color: '#52525b', marginTop: 2 },
  homeBadge: {
    backgroundColor: LIME, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  homeBadgeText: { fontSize: 11, fontWeight: '900', color: '#000' },

  venueErrorText: { fontSize: 12, color: '#ef4444', paddingHorizontal: 20, marginBottom: 12 },

  // Tag section
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 20, marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 20, marginBottom: 10,
  },
  tagPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#1e1e1e', borderRadius: 100,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  tagPillActive: {
    borderColor: LIME, backgroundColor: 'rgba(163,230,53,0.1)',
  },
  tagAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#3a3a3a',
    alignItems: 'center', justifyContent: 'center',
  },
  tagAvatarActive: { backgroundColor: 'rgba(163,230,53,0.2)' },
  tagAvatarText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  tagName: { fontSize: 14, fontWeight: '700', color: '#e4e4e7' },
  tagNameActive: { color: LIME },
  tagHint: {
    fontSize: 12, color: '#52525b', paddingHorizontal: 20,
    lineHeight: 18, marginBottom: 20,
  },

  // CTA
  ctaBtn: {
    marginHorizontal: 20, marginBottom: 4,
    borderRadius: 18, overflow: 'hidden',
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaGradient: {
    paddingVertical: 17, alignItems: 'center',
  },
  ctaBtnText: { fontSize: 17, fontWeight: '900', color: '#000', letterSpacing: 0.3 },
  ctaBtnTextDisabled: { color: '#555' },

  // Success
  successWrap: {
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12,
  },
  successChest: { width: 110, height: 110 },
  successTitle: {
    fontFamily: BANGERS, fontSize: 30, color: LIME,
    textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0,
    marginBottom: 2,
  },
  successSub: { fontSize: 13, color: '#71717a', textAlign: 'center', marginBottom: 8 },
  rewardRow: { flexDirection: 'row', gap: 10, marginBottom: 8, width: '100%' },
  rewardCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  rewardValue: { fontSize: 22, fontWeight: '900' },
  rewardCardLabel: {
    fontSize: 10, fontWeight: '800', color: '#71717a',
    textTransform: 'uppercase', marginTop: 2, textAlign: 'center',
  },
  // Split stage
  splitWrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 12 },
  splitTitle: { fontSize: 20, fontWeight: '900', color: '#fff', textAlign: 'center' },
  splitSub: { fontSize: 13, color: '#71717a', textAlign: 'center', lineHeight: 18 },
  splitCard: {
    backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 18, padding: 16,
  },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  splitCol: { flex: 1, alignItems: 'center', gap: 3 },
  splitDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.07)' },
  splitAmount: { fontSize: 26, fontWeight: '900', color: '#fff' },
  splitLabel: { fontSize: 11, color: '#71717a', fontWeight: '600' },
  splitPct: { fontSize: 12, fontWeight: '800', color: '#a1a1aa', textAlign: 'center', marginBottom: 12 },
  stepsRow: { flexDirection: 'row', gap: 5 },
  stepBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: '#1e1e1e', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
  },
  stepBtnActive: { backgroundColor: 'rgba(163,230,53,0.15)', borderColor: LIME },
  stepLabel: { fontSize: 11, fontWeight: '800', color: '#52525b' },
  stepLabelActive: { color: LIME },
  nextLevelCard: {
    backgroundColor: '#111', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14,
  },
  nextLevelTitle: {
    fontSize: 10, fontWeight: '900', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  nextLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  nextLevelRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  nextLevelIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  nextLevelLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: '#a1a1aa' },
  nextLevelValue: { fontSize: 13, fontWeight: '900' },
  collectBtn: {
    paddingVertical: 16, borderRadius: 16, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: '#365314',
  },
  collectBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
