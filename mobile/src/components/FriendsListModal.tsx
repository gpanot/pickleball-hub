import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { T } from '../theme'
import { FriendListRow, type FriendListItem } from './FriendListRow'

/**
 * Root-level overlay bottom sheet — no RN Modal.
 * Rendered at the top of the tree so it always covers gesture handlers
 * and scroll views without z-index conflicts.
 */
export function FriendsListModal({
  visible,
  onClose,
  title,
  subtitle,
  friends,
  overflowNote,
  onUnfollow,
  onFollow,
}: {
  visible: boolean
  onClose: () => void
  title: string
  subtitle?: string
  friends: FriendListItem[]
  overflowNote?: string
  onUnfollow?: (userId: string) => void
  onFollow?: (userId: string) => void
}) {
  const insets = useSafeAreaInsets()

  if (!visible) return null

  return (
    <View style={styles.host} pointerEvents="box-none">
      {/* Dimmed backdrop — tap to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet slides up from bottom */}
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
        pointerEvents="auto"
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} color="#999" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {subtitle ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : null}

        {overflowNote ? (
          <Text style={styles.overflow}>{overflowNote}</Text>
        ) : null}

        {friends.length === 0 ? (
          <Text style={styles.empty}>No friends on this session yet.</Text>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <FriendListRow
                item={item}
                onFollow={onFollow ? () => onFollow(item.userId) : undefined}
                onUnfollow={onUnfollow ? () => onUnfollow(item.userId) : undefined}
              />
            )}
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: T.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: T.border,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    paddingRight: 12,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f5a623',
    marginBottom: 10,
  },
  overflow: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  empty: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 24,
  },
})
