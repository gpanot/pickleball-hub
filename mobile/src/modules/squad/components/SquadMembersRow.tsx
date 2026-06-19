import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import type { SquadMemberWithProfile } from '../types';

const GOLD = '#facc15';
const LIME = '#a3e635';

interface Props {
  members: SquadMemberWithProfile[];
  founderId: string;
  myProfileId?: string | null;
  isFounder?: boolean;
  onInviteMore?: () => void;
  onRemoveMember?: (profileId: string, name: string) => Promise<void>;
}

interface PopupState {
  profileId: string;
  name: string;
  isFounder: boolean;
}

export function SquadMembersRow({
  members,
  founderId,
  myProfileId,
  isFounder,
  onInviteMore,
  onRemoveMember,
}: Props) {
  const emptyCount = Math.max(0, 8 - members.length);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [removing, setRemoving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleLongPress = useCallback((m: SquadMemberWithProfile) => {
    if (!isFounder || !onRemoveMember) return;
    const isMemberFounder = m.profileId === founderId;
    if (isMemberFounder) return; // can't remove yourself as founder
    const name = m.profile.squadNickname
      ? `@${m.profile.squadNickname}`
      : m.profile.displayName?.split(' ')[0] ?? '?';
    setPopup({ profileId: m.profileId, name, isFounder: isMemberFounder });
  }, [isFounder, onRemoveMember, founderId]);

  const handleConfirmRemove = useCallback(async () => {
    if (!popup || !onRemoveMember) return;
    setRemoving(true);
    try {
      await onRemoveMember(popup.profileId, popup.name);
    } finally {
      setRemoving(false);
      setPopup(null);
    }
  }, [popup, onRemoveMember]);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
        // Dismiss popup on scroll
        onScrollBeginDrag={() => setPopup(null)}
      >
        {members.map((m) => {
          const isFounderMember = m.profileId === founderId;
          const label = m.profile.squadNickname
            ? `@${m.profile.squadNickname}`
            : m.profile.displayName?.split(' ')[0] ?? '?';
          const initial = (m.profile.squadNickname ?? m.profile.displayName)
            ?.charAt(0).toUpperCase() ?? '?';
          const canRemove = isFounder && !isFounderMember && !!onRemoveMember;
          const isPopupTarget = popup?.profileId === m.profileId;

          return (
            <Pressable
              key={m.id}
              style={s.slot}
              onLongPress={canRemove ? () => handleLongPress(m) : undefined}
              onPress={() => { if (popup) setPopup(null); }}
              delayLongPress={400}
            >
              <View style={[
                s.avatar,
                isFounderMember ? s.founderBorder : s.memberBorder,
                isPopupTarget && s.avatarHighlight,
              ]}>
                <Text style={s.initial}>{initial}</Text>
                {isFounderMember && <Text style={s.crown}>👑</Text>}
              </View>
              <Text style={s.name} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}

        {Array.from({ length: emptyCount }).map((_, i) => (
          <Pressable
            key={`empty-${i}`}
            style={s.slot}
            onPress={isFounder && onInviteMore ? onInviteMore : undefined}
          >
            <View style={[s.avatar, s.emptyBorder]}>
              <Text style={{ color: '#52525b', fontSize: 14 }}>+</Text>
            </View>
            <Text style={[s.name, { color: '#52525b' }]}>open</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Inline popup — shown below the row when a member is long-pressed */}
      {popup && (
        <Pressable style={s.popupOverlay} onPress={() => setPopup(null)}>
          <View style={s.popup}>
            {/* Caret */}
            <View style={s.caret} />

            <Text style={s.popupIcon}>🚫</Text>
            <Text style={s.popupTitle}>Remove {popup.name}?</Text>

            <View style={s.popupInfoRow}>
              <Text style={s.popupInfoIcon}>📊</Text>
              <Text style={s.popupInfoText}>
                Session history and XP contributions remain in the squad log.
              </Text>
            </View>
            <View style={s.popupDivider} />
            <View style={s.popupInfoRow}>
              <Text style={s.popupInfoIcon}>⏱️</Text>
              <Text style={s.popupInfoText}>
                {popup.name} has a 7-day cooldown before joining another squad.
              </Text>
            </View>
            <View style={s.popupDivider} />

            <TouchableOpacity
              style={s.removeBtn}
              onPress={handleConfirmRemove}
              disabled={removing}
              activeOpacity={0.8}
            >
              {removing ? (
                <ActivityIndicator color="#ef4444" />
              ) : (
                <Text style={s.removeBtnText}>
                  Remove from {popup.name.replace('@', '')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setPopup(null)}
              disabled={removing}
              activeOpacity={0.7}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  slot: { alignItems: 'center', gap: 4, width: 48 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#1e1e1e',
    alignItems: 'center', justifyContent: 'center',
  },
  founderBorder: { borderWidth: 2, borderColor: GOLD },
  memberBorder: { borderWidth: 2, borderColor: LIME },
  emptyBorder: {
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.07)',
    borderStyle: 'dashed', backgroundColor: 'transparent',
  },
  avatarHighlight: { borderColor: '#ef4444', opacity: 0.7 },
  initial: { fontSize: 16, fontWeight: '900', color: '#fff' },
  crown: { position: 'absolute', top: -8, fontSize: 11 },
  name: {
    fontSize: 10, color: '#a1a1aa', fontWeight: '700',
    maxWidth: 48, textAlign: 'center',
  },
  // Popup
  popupOverlay: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  popup: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: 20,
    alignItems: 'center',
  },
  caret: {
    position: 'absolute',
    top: -7,
    left: 60,
    width: 14,
    height: 14,
    backgroundColor: '#1a1a1a',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    transform: [{ rotate: '45deg' }],
  },
  popupIcon: { fontSize: 40, marginBottom: 8 },
  popupTitle: {
    fontSize: 18, fontWeight: '900', color: '#fff',
    marginBottom: 16, textAlign: 'center',
  },
  popupInfoRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  popupInfoIcon: { fontSize: 18 },
  popupInfoText: {
    flex: 1, fontSize: 14, color: '#a1a1aa', lineHeight: 20,
  },
  popupDivider: {
    width: '100%', height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  removeBtn: {
    marginTop: 16,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
  },
  removeBtnText: {
    fontSize: 15, fontWeight: '800', color: '#ef4444',
  },
  cancelBtn: {
    marginTop: 10,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#111',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#71717a' },
});
