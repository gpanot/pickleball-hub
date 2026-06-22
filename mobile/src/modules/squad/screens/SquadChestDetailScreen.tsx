import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, Image, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadChestMemberGrid } from '../components/SquadChestMemberGrid';
import { SquadBackButton } from '../components/SquadBackButton';
import { useSquadChest } from '../hooks/useSquadChest';
import type { SquadChest, ChestOpenResult } from '../types';

const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
function nudgeKey(chestId: string) { return `nudged_${chestId}`; }
function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');

interface Props {
  chest: SquadChest;
  squadId: string;
  squadName: string;
  myProfileId?: string | null;
  onOpen: (result: ChestOpenResult) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export function SquadChestDetailScreen({ chest, squadId, squadName, myProfileId, onOpen, onBack, onRefresh }: Props) {
  const insets = useSafeAreaInsets();
  const { tap, open, nudge, loading } = useSquadChest();
  const y = useRef(new Animated.Value(0)).current;
  const autoTapFired = useRef(false);

  const myOpening = chest.myOpening ?? chest.openings.find(o => o.profileId === myProfileId);
  const status = myOpening?.status ?? 'pending';

  // Auto-start the unlock timer when the screen opens and player hasn't tapped yet
  useEffect(() => {
    if (status === 'pending' && !autoTapFired.current) {
      autoTapFired.current = true;
      tap(chest.id).then(() => onRefresh()).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [timeLeft, setTimeLeft] = useState('');
  const [expiryText, setExpiryText] = useState('');
  const [nudgeAlreadySent, setNudgeAlreadySent] = useState(false);
  const [nudgeCooldownLeft, setNudgeCooldownLeft] = useState(0);

  // Check local nudge cooldown on mount + tick countdown
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    function startCountdown(sentAt: number) {
      const remaining = NUDGE_COOLDOWN_MS - (Date.now() - sentAt);
      if (remaining <= 0) {
        setNudgeAlreadySent(false);
        setNudgeCooldownLeft(0);
        AsyncStorage.removeItem(nudgeKey(chest.id));
        return;
      }
      setNudgeAlreadySent(true);
      setNudgeCooldownLeft(remaining);
      interval = setInterval(() => {
        const left = NUDGE_COOLDOWN_MS - (Date.now() - sentAt);
        if (left <= 0) {
          clearInterval(interval);
          setNudgeAlreadySent(false);
          setNudgeCooldownLeft(0);
          AsyncStorage.removeItem(nudgeKey(chest.id));
        } else {
          setNudgeCooldownLeft(left);
        }
      }, 1000);
    }

    AsyncStorage.getItem(nudgeKey(chest.id)).then(val => {
      if (!val) return;
      startCountdown(parseInt(val, 10));
    });

    return () => { if (interval) clearInterval(interval); };
  }, [chest.id]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [y]);

  // Unlock timer countdown
  useEffect(() => {
    if (status !== 'unlocking' || !myOpening?.unlocksAt) return;
    const interval = setInterval(() => {
      const diff = new Date(myOpening.unlocksAt!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Ready!'); clearInterval(interval); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${h}h ${m}m`);
    }, 1000);
    return () => clearInterval(interval);
  }, [status, myOpening?.unlocksAt]);

  // Expiry countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = new Date(chest.expiresAt).getTime() - Date.now();
      if (diff <= 0) { setExpiryText('Expired'); clearInterval(interval); return; }
      const h = Math.floor(diff / 3600000);
      setExpiryText(`Expires in ${h}h`);
    }, 60000);
    const diff = new Date(chest.expiresAt).getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    setExpiryText(diff <= 0 ? 'Expired' : `Expires in ${h}h`);
    return () => clearInterval(interval);
  }, [chest.expiresAt]);

  const handleTap = useCallback(async () => {
    try {
      await tap(chest.id);
      await onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }, [chest.id, tap, onRefresh]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await open(chest.id);
      onOpen(result);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }, [chest.id, open, onOpen]);

  const handleNudge = useCallback(async () => {
    if (nudgeAlreadySent) return;
    try {
      const result = await nudge(squadId, chest.id);
      const sentAt = Date.now();
      await AsyncStorage.setItem(nudgeKey(chest.id), String(sentAt));
      setNudgeAlreadySent(true);
      setNudgeCooldownLeft(NUDGE_COOLDOWN_MS);
      if (result.nudged === 0) {
        Alert.alert('No one to nudge', 'All members have already started their unlock timer.');
      } else {
        Alert.alert('Nudged! 👋', `${result.nudged} squad member${result.nudged !== 1 ? 's' : ''} notified`);
      }
    } catch (e: any) {
      if (e.message?.includes('already_nudged')) {
        setNudgeAlreadySent(true);
      } else {
        Alert.alert('Error', e.message);
      }
    }
  }, [squadId, chest.id, nudge, nudgeAlreadySent]);

  const pendingNames = chest.openings
    .filter(o => o.status === 'pending' && o.profileId !== myProfileId)
    .map(o => o.displayName?.replace('@', '') ?? '?');

  const isReady = status === 'ready' || (status === 'unlocking' && myOpening?.unlocksAt && new Date(myOpening.unlocksAt) <= new Date());

  // Auto-open the chest as soon as it's ready — skip the "Ready to open" intermediate
  const autoOpenFired = useRef(false);
  useEffect(() => {
    if (isReady && !autoOpenFired.current && !loading) {
      autoOpenFired.current = true;
      handleOpen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Squad Chest</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.chestSection}>
          <Animated.View style={{ transform: [{ translateY: y }] }}>
            <Image source={CHEST_IMAGE} style={s.chestImg} resizeMode="contain" />
          </Animated.View>
        </View>

        <View style={s.header}>
          {isReady ? (
            <Text style={[s.title, { color: LIME }]}>Ready to open!</Text>
          ) : (
            <Text style={s.title}>{squadName} Chest</Text>
          )}
          <Text style={s.sub}>
            {isReady ? 'Your 4h timer is done · claim your rewards' : `${chest.earnerName} played at ${chest.venueName ?? 'a venue'} · ${getTimeAgo(chest.createdAt)}`}
          </Text>
          <Text style={s.expiry}>🧨 {expiryText}</Text>
        </View>

        <View style={s.memberSection}>
          <SquadChestMemberGrid
            openings={chest.openings}
            myProfileId={myProfileId}
            size="large"
          />
        </View>

        <View style={s.actions}>
          {status === 'pending' && (
            <View style={s.unlockingBtn}>
              <Text style={s.unlockingText}>Starting unlock timer…</Text>
            </View>
          )}
          {status === 'unlocking' && !isReady && (
            <View style={s.unlockingBtn}>
              <Text style={s.unlockingText}>Unlocking · {timeLeft} remaining</Text>
            </View>
          )}
          {isReady && (
            <TouchableOpacity style={s.openBtn} onPress={handleOpen} disabled={loading} activeOpacity={0.8}>
              <Text style={s.openBtnText}>Open chest</Text>
            </TouchableOpacity>
          )}
          {pendingNames.length > 0 && (
            <TouchableOpacity
              style={[s.nudgeBtn, nudgeAlreadySent && s.nudgeBtnDone]}
              onPress={handleNudge}
              disabled={loading || nudgeAlreadySent}
              activeOpacity={0.7}
            >
              <Text style={[s.nudgeBtnText, nudgeAlreadySent && s.nudgeBtnDoneText]}>
                {nudgeAlreadySent
                  ? `Nudged ✓ · ${formatCooldown(nudgeCooldownLeft)}`
                  : `Nudge ${pendingNames.join(' and ')} 👋`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {(status === 'pending' || status === 'unlocking') && !isReady && (
          <Text style={s.hint}>You'll get a push notification when it's ready to open.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function getTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  scroll: { paddingBottom: 60 },
  chestSection: { alignItems: 'center', paddingVertical: 24 },
  chestImg: { width: 120, height: 120 },
  header: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  title: { fontFamily: BANGERS, fontSize: 22, color: GOLD, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0, marginBottom: 4 },
  sub: { fontSize: 13, color: '#a1a1aa', textAlign: 'center' },
  expiry: { fontSize: 12, color: GOLD, fontWeight: '700', marginTop: 6 },
  memberSection: { paddingHorizontal: 20, marginBottom: 20 },
  actions: { paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  tapBtn: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.3)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  tapBtnText: { fontSize: 16, fontWeight: '900', color: GOLD },
  unlockingBtn: {
    backgroundColor: 'rgba(250,204,21,0.08)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  unlockingText: { fontSize: 16, fontWeight: '800', color: GOLD },
  openBtn: {
    backgroundColor: LIME,
    borderBottomWidth: 3, borderBottomColor: '#365314',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  openBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
  nudgeBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#111', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center',
  },
  nudgeBtnDone: {
    borderColor: 'rgba(163,230,53,0.2)',
    backgroundColor: 'rgba(163,230,53,0.06)',
  },
  nudgeBtnText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
  nudgeBtnDoneText: { color: '#a3e635' },
  hint: { fontSize: 12, color: '#52525b', textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 },
});
