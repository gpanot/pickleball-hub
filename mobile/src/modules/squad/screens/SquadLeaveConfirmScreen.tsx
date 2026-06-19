import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';

interface Props {
  squadName: string;
  founderName: string;
  onConfirmLeave: () => Promise<void>;
  onCancel: () => void;
}

export function SquadLeaveConfirmScreen({
  squadName, founderName, onConfirmLeave, onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const handleLeave = async () => {
    setLoading(true);
    try {
      await onConfirmLeave();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onCancel} />
        <Text style={s.topTitle}>Leave squad</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.icon}>⛓️‍💥</Text>

        <Text style={s.title}>LEAVE {squadName.toUpperCase()}?</Text>
        <Text style={s.subtitle}>You will be removed from the squad immediately.</Text>

        <View style={s.card}>
          <Text style={s.cardLabel}>WHAT HAPPENS</Text>

          <View style={s.row}>
            <Text style={s.rowEmoji}>⏱️</Text>
            <Text style={s.rowText}>
              7-day cooldown before joining or creating another squad
            </Text>
          </View>
          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowEmoji}>⚡</Text>
            <Text style={s.rowText}>
              Your XP contributions stay on your personal profile
            </Text>
          </View>
          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowEmoji}>🔔</Text>
            <Text style={s.rowText}>
              {founderName} will be notified you left
            </Text>
          </View>

          <View style={s.warningBox}>
            <Text style={s.warningText}>
              If you are the only remaining member, the squad will be automatically disbanded.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[s.leaveBtn, loading && { opacity: 0.6 }]}
          onPress={handleLeave}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <Text style={s.leaveText}>Leave {squadName}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.stayBtn}
          onPress={onCancel}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={s.stayText}>Stay in squad</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row', alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  content: {
    paddingHorizontal: 20, paddingTop: 36, alignItems: 'center',
  },
  icon: { fontSize: 56, marginBottom: 16 },
  title: {
    fontFamily: BANGERS, fontSize: 30, color: '#fff',
    textAlign: 'center', letterSpacing: 0.5, marginBottom: 10,
  },
  subtitle: {
    fontSize: 14, color: '#a1a1aa', textAlign: 'left',
    lineHeight: 20, alignSelf: 'stretch', marginBottom: 24,
  },
  card: {
    alignSelf: 'stretch', backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 28,
  },
  cardLabel: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, color: '#52525b', paddingVertical: 14,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  rowEmoji: { fontSize: 20, marginTop: 1 },
  rowText: { flex: 1, fontSize: 14, color: '#d4d4d8', lineHeight: 20 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  warningBox: {
    marginTop: 8, borderWidth: 1, borderColor: 'rgba(250,204,21,0.35)',
    borderRadius: 12, padding: 12, backgroundColor: 'rgba(250,204,21,0.06)',
  },
  warningText: { fontSize: 13, color: GOLD, lineHeight: 19 },
  leaveBtn: {
    alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginBottom: 14,
  },
  leaveText: { fontSize: 16, fontWeight: '800', color: '#ef4444' },
  stayBtn: {
    alignSelf: 'stretch', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  stayText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
