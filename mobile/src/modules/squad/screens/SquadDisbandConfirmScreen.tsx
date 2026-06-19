import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';

const BANGERS = 'Bangers_400Regular';

interface Props {
  squadName: string;
  onConfirmDisband: () => Promise<void>;
  onCancel: () => void;
}

export function SquadDisbandConfirmScreen({ squadName, onConfirmDisband, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const handleDisband = async () => {
    setLoading(true);
    try {
      await onConfirmDisband();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onCancel} />
        <Text style={s.topTitle}>Disband squad</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <Text style={s.skull}>💀</Text>

        {/* Title */}
        <Text style={s.title}>Disband {squadName}?</Text>
        <Text style={s.subtitle}>This is permanent. All members are removed immediately.</Text>

        {/* Consequence rows */}
        <View style={s.rows}>
          <View style={s.row}>
            <Text style={s.rowEmoji}>👥</Text>
            <Text style={s.rowText}>All members removed and notified. Each gets a 7-day cooldown.</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowEmoji}>📊</Text>
            <Text style={s.rowText}>XP and session logs preserved on each member's individual profile.</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowEmoji}>🏆</Text>
            <Text style={s.rowText}>Squad name is freed — someone else can claim it.</Text>
          </View>
        </View>

        {/* Disband CTA */}
        <TouchableOpacity
          style={[s.disbandBtn, loading && { opacity: 0.6 }]}
          onPress={handleDisband}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <Text style={s.disbandText}>Disband {squadName}</Text>
          )}
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={s.cancelBtn}
          onPress={onCancel}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={s.cancelText}>Keep my squad</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  content: {
    paddingHorizontal: 20,
    paddingTop: 36,
    alignItems: 'center',
  },
  skull: { fontSize: 56, marginBottom: 16 },
  title: {
    fontFamily: BANGERS,
    fontSize: 30,
    color: '#ef4444',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'left',
    lineHeight: 20,
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  rows: {
    alignSelf: 'stretch',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
  },
  rowEmoji: { fontSize: 20, marginTop: 1 },
  rowText: { flex: 1, fontSize: 14, color: '#d4d4d8', lineHeight: 20 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  disbandBtn: {
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  disbandText: { fontSize: 16, fontWeight: '800', color: '#ef4444' },
  cancelBtn: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
