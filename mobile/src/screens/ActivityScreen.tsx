import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Heart, UserPlus, X } from 'lucide-react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { SquaddLoader } from '../components/SquaddLoader'

const PAGE_SIZE = 50

type ActivityItem = {
  id: string
  type: 'kudos' | 'follow'
  displayName: string
  imageUrl: string | null
  timestamp: string
  kudosType?: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function kudosLabel(type: string): string {
  if (type === 'fistbump') return '🤜 Gave you kudos'
  if (type === 'flame') return '🔥 Gave you kudos'
  if (type === 'star') return '⭐ Gave you kudos'
  return 'Gave you kudos'
}

export function ActivityScreen({ onClose }: { onClose: () => void }) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const insets = useSafeAreaInsets()
  const { authedFetch, jwt, reclubUserId } = useAuthStore()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const fetchPage = useCallback(
    async (pageOffset: number, append: boolean) => {
      const res = await authedFetch(
        `/api/activity?limit=${PAGE_SIZE}&offset=${pageOffset}`
      )
      if (!res.ok) return null
      const data = await res.json()
      const pageItems: ActivityItem[] = data.items ?? []
      setHasMore(data.hasMore ?? false)
      setOffset(pageOffset + pageItems.length)
      setItems((prev) => (append ? [...prev, ...pageItems] : pageItems))
      return pageItems
    },
    [authedFetch]
  )

  const loadInitial = useCallback(async () => {
    if (!jwt) return
    if (!reclubUserId) {
      setItems([])
      setHasMore(false)
      setOffset(0)
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      await fetchPage(0, false)
    } catch (e) {
      if (__DEV__) console.warn('[Activity] load error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [jwt, reclubUserId, fetchPage])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setOffset(0)
    await fetchPage(0, false)
    setRefreshing(false)
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      await fetchPage(offset, true)
    } catch (e) {
      if (__DEV__) console.warn('[Activity] loadMore error', e)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, offset, fetchPage])

  const renderItem = ({ item }: { item: ActivityItem }) => (
    <View style={styles.row}>
      <View style={styles.avatarWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {(item.displayName ?? '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>
          {item.displayName}
        </Text>
        <View style={styles.typeRow}>
          {item.type === 'kudos' ? (
            <Text style={styles.typeTextKudos}>
              {kudosLabel(item.kudosType ?? '')}
            </Text>
          ) : (
            <>
              <UserPlus size={12} color="#4a90e2" />
              <Text style={styles.typeTextFollow}>Started following you</Text>
            </>
          )}
        </View>
      </View>
      <Text style={styles.time}>{timeAgo(item.timestamp)}</Text>
    </View>
  )

  const listFooter = hasMore ? (
    <TouchableOpacity
      style={styles.loadMoreBtn}
      onPress={loadMore}
      disabled={loadingMore}
    >
      {loadingMore ? (
        <ActivityIndicator size="small" color={T.amber} />
      ) : (
        <Text style={styles.loadMoreText}>Load more</Text>
      )}
    </TouchableOpacity>
  ) : null

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Activity</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} color={T.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {!reclubUserId ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Link your Reclub account</Text>
            <Text style={styles.emptySub}>
              Connect Reclub in your profile to see kudos and followers here.
            </Text>
          </View>
        ) : loading ? (
          <SquaddLoader />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Heart size={36} color={T.borderSubtle} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySub}>
              Kudos and new followers from the last 7 days will show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListFooterComponent={listFooter}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={T.amber}
              />
            }
          />
        )}
      </View>
    </View>
  )
}

function createStyles(T: ThemeColors) {
  const sheetHeight = Dimensions.get('window').height * 0.8
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9500,
      elevation: 9500,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    sheet: {
      height: sheetHeight,
      backgroundColor: T.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingHorizontal: 16,
      borderWidth: 0.5,
      borderColor: T.border,
      borderBottomWidth: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: T.text,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: T.surface,
    },
    avatarWrap: {
      marginRight: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: T.borderSubtle,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      fontSize: 16,
      fontWeight: '600',
      color: T.textTertiary,
    },
    textWrap: {
      flex: 1,
      marginRight: 8,
    },
    name: {
      fontSize: 14,
      fontWeight: '600',
      color: T.text,
      marginBottom: 3,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    typeTextKudos: {
      fontSize: 12,
      color: '#e74c6f',
      fontWeight: '500',
    },
    typeTextFollow: {
      fontSize: 12,
      color: '#4a90e2',
      fontWeight: '500',
    },
    time: {
      fontSize: 11,
      color: T.textTertiary,
      flexShrink: 0,
    },
    loadMoreBtn: {
      padding: 16,
      alignItems: 'center',
    },
    loadMoreText: {
      fontSize: 13,
      color: T.textTertiary,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: T.textTertiary,
      marginTop: 4,
    },
    emptySub: {
      fontSize: 13,
      color: T.textTertiary,
      textAlign: 'center',
      lineHeight: 18,
    },
  })
}
