import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Search, Check, UserPlus } from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { PlayerAvatar } from './PlayerAvatar'

export type SearchResult = {
  userId: string
  displayName: string | null
  username: string | null
  imageUrl: string | null
  duprDoubles: number | null
}

/**
 * mode="select" — pick one player (used in onboarding)
 * mode="follow" — follow multiple players (used in Friends tab)
 */
export function PlayerSearch({
  mode = 'select',
  selectedPlayer,
  onSelectPlayer,
  onFollow,
  onUnfollow,
  initialFollowedIds,
  autoFocus = false,
}: {
  mode?: 'select' | 'follow'
  selectedPlayer?: SearchResult | null
  onSelectPlayer?: (player: SearchResult | null) => void
  onFollow?: (userId: string) => Promise<void>
  onUnfollow?: (userId: string) => Promise<void>
  initialFollowedIds?: string[]
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [followedIds, setFollowedIds] = useState<Set<string>>(
    () => new Set(initialFollowedIds ?? [])
  )
  const { authedFetch } = useAuthStore()

  useEffect(() => {
    if (initialFollowedIds) {
      setFollowedIds(new Set(initialFollowedIds))
    }
  }, [initialFollowedIds])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setError(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      setError(false)
      try {
        const res = await authedFetch(
          `/api/players/search?q=${encodeURIComponent(query)}`
        )
        if (res.ok) {
          setResults(await res.json())
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleFollowToggle = useCallback(
    async (userId: string) => {
      const isFollowed = followedIds.has(userId)
      if (isFollowed) {
        setFollowedIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
        if (onUnfollow) {
          try {
            await onUnfollow(userId)
          } catch {
            setFollowedIds((prev) => new Set(prev).add(userId))
          }
        }
        return
      }

      setFollowedIds((prev) => new Set(prev).add(userId))
      if (onFollow) {
        try {
          await onFollow(userId)
        } catch {
          setFollowedIds((prev) => {
            const next = new Set(prev)
            next.delete(userId)
            return next
          })
        }
      }
    },
    [followedIds, onFollow, onUnfollow]
  )

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => {
      if (mode === 'select') {
        const isSelected = selectedPlayer?.userId === item.userId
        return (
          <TouchableOpacity
            onPress={() => onSelectPlayer?.(isSelected ? null : item)}
            style={[styles.row, isSelected && styles.rowSelected]}
            activeOpacity={0.7}
          >
            <PlayerAvatar
              userId={item.userId}
              displayName={item.displayName}
              imageUrl={item.imageUrl}
              size={40}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.displayName ?? item.username ?? 'Unknown'}
              </Text>
              {item.duprDoubles != null && (
                <Text style={styles.dupr}>DUPR {item.duprDoubles.toFixed(2)}</Text>
              )}
            </View>
            {isSelected && <Check size={20} color={T.green} strokeWidth={2.5} />}
          </TouchableOpacity>
        )
      }

      const isFollowed = followedIds.has(item.userId)
      return (
        <View style={styles.row}>
          <PlayerAvatar
            userId={item.userId}
            displayName={item.displayName}
            imageUrl={item.imageUrl}
            size={40}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {item.displayName ?? item.username ?? 'Unknown'}
            </Text>
            {item.duprDoubles != null && (
              <Text style={styles.dupr}>DUPR {item.duprDoubles.toFixed(2)}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.followBtn, isFollowed && styles.followedBtn]}
            onPress={() => handleFollowToggle(item.userId)}
            accessibilityLabel={isFollowed ? 'Remove friend' : 'Follow player'}
          >
            {isFollowed ? (
              <Check size={14} color={T.green} strokeWidth={2.5} />
            ) : (
              <UserPlus size={14} color={T.amber} strokeWidth={2} />
            )}
            <Text
              style={isFollowed ? styles.followedLabel : styles.followLabel}
            >
              {isFollowed ? 'Added' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>
      )
    },
    [mode, selectedPlayer, followedIds, handleFollowToggle, onSelectPlayer]
  )

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBox}>
        <Search size={16} color="#666" strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name..."
          placeholderTextColor="#555"
          autoFocus={autoFocus}
        />
        {searching && <ActivityIndicator size="small" color={T.amber} />}
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.userId}
        renderItem={renderItem}
        style={{ flex: 1, marginTop: 8 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.length >= 2 && !searching ? (
            <Text style={styles.emptyText}>
              {error ? 'Could not reach server — try again' : 'No players found'}
            </Text>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: T.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
  },
  rowSelected: {
    backgroundColor: 'rgba(245,166,35,0.06)',
    borderRadius: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dupr: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
  },
  followedBtn: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  followLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: T.amber,
  },
  followedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: T.green,
  },
})
