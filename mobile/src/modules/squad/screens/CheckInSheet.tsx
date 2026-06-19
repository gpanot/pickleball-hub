import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView, Image, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { checkin, getNearbyVenues } from '../api';
import { dropPulse } from '../conquestApi';
import type { SquadMemberWithProfile } from '../types';

const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const BANGERS = 'Bangers_400Regular';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');

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
  members: SquadMemberWithProfile[];
  myProfileId?: string | null;
  onClose: () => void;
  onSuccess: (result: { chestId: string; xpAwarded: number }) => void;
  onPulseDropped?: (venueId: number, venueName: string) => void;
  onCheckinComplete?: (venue: { id: number; name: string }) => void;
  onPulseResult?: (result: { venueId: number; venueName: string; ok: boolean; error?: string }) => void;
}

type Stage = 'main' | 'success';

export function CheckInSheet({
  visible, squadId, squadName, members, myProfileId, onClose, onSuccess,
  onPulseDropped, onCheckinComplete, onPulseResult,
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
    setLocationLoading(true);
    setVenueError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location required', 'Enable location to find nearby courts');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { venues, fallback } = await getNearbyVenues(loc.coords.latitude, loc.coords.longitude, 20);
      if (venues.length === 0) {
        setVenueError('No courts in database. Add venues to test check-in.');
        setNearbyVenues([]);
        setVenuesFallback(false);
        return;
      }
      setVenuesFallback(!!fallback);
      const mapped = venues.map(v => ({
        id: v.id,
        name: v.name,
        distance: v.distance,
        address: v.address,
        district: v.address?.split(',').pop()?.trim(),
      }));
      setNearbyVenues(mapped);
      // Auto-select the closest venue
      setSelectedVenue(mapped[0]);
    } catch (e: unknown) {
      setVenueError(e instanceof Error ? e.message : 'Could not load nearby courts');
    } finally {
      setLocationLoading(false);
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
    try {
      const res = await checkin({
        squadId,
        venueName: selectedVenue.name,
        venueId: selectedVenue.id,
        taggedProfileIds: taggedIds,
      });
      setResult({ chestId: res.chest.id, xpAwarded: res.xpAwarded });
      setStage('success');
      onCheckinComplete?.({ id: selectedVenue.id, name: selectedVenue.name });

      if (onPulseDropped || onPulseResult) {
        const taggedForPulse = taggedIds.filter(id => id !== myProfileId);
        dropPulse(selectedVenue.id, taggedForPulse)
          .then(() => {
            onPulseResult?.({ venueId: selectedVenue.id, venueName: selectedVenue.name, ok: true });
            onPulseDropped?.(selectedVenue.id, selectedVenue.name);
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            onPulseResult?.({ venueId: selectedVenue.id, venueName: selectedVenue.name, ok: false, error: message });
          });
      }
    } catch (e: any) {
      if (e.message === 'already_checked_in') {
        Alert.alert('Already checked in', 'You can only check in once per day.');
      } else if (e.message === 'rate_limited') {
        Alert.alert('Too soon', 'Wait a bit before checking in again.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [squadId, selectedVenue, taggedIds, myProfileId, onPulseDropped, onCheckinComplete, onPulseResult]);

  const handleDone = useCallback(() => {
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
            <View style={s.successWrap}>
              <Image source={CHEST_IMAGE} style={s.successChest} resizeMode="contain" />
              <Text style={s.successTitle}>CHECKED IN!</Text>
              <Text style={s.successSub}>Squad chest created for {squadName}</Text>
              <View style={s.rewardPills}>
                <View style={s.rewardPill}>
                  <Text style={s.rewardPillText}>+{result?.xpAwarded ?? 60} Squad XP</Text>
                </View>
                <View style={[s.rewardPill, { backgroundColor: 'rgba(250,204,21,0.12)' }]}>
                  <Text style={[s.rewardPillText, { color: GOLD }]}>+12 Kudos</Text>
                </View>
              </View>
              <TouchableOpacity style={s.doneBtn} onPress={handleDone} activeOpacity={0.8}>
                <Text style={s.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
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
  successWrap: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  successChest: { width: 100, height: 100, marginBottom: 16 },
  successTitle: {
    fontFamily: BANGERS, fontSize: 28, color: LIME,
    textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0,
    marginBottom: 4,
  },
  successSub: { fontSize: 14, color: '#a1a1aa', marginBottom: 16 },
  rewardPills: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  rewardPill: {
    backgroundColor: 'rgba(163,230,53,0.13)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
  },
  rewardPillText: { fontSize: 13, fontWeight: '800', color: LIME },
  doneBtn: {
    width: '100%', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#a1a1aa' },
});
