import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  FlatList,
  Alert,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { User, Users, Trash2, LogOut, Search, ArrowLeft, Sparkles } from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { PlayerSearch } from '../components/PlayerSearch'
import { PeopleYouMayKnowScreen } from './PeopleYouMayKnowScreen'

type FollowedPlayer = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  followedAt: string
}

type ProfileTab = 'profile' | 'friends'

export function ProfileScreen({
  onSignUpPrompt,
}: {
  onSignUpPrompt?: () => void
}) {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<ProfileTab>('profile')
  const [friends, setFriends] = useState<FollowedPlayer[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSuggested, setShowSuggested] = useState(false)

  const {
    displayName,
    imageUrl,
    reclubUserId,
    hasCompletedOnboarding,
    signOut,
    deleteAccount,
    authedFetch,
    isSignedIn,
  } = useAuthStore()

  const loadFriends = useCallback(async () => {
    setLoadingFriends(true)
    try {
      const res = await authedFetch('/api/follows')
      if (res.ok) {
        setFriends(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setLoadingFriends(false)
    }
  }, [authedFetch])

  useEffect(() => {
    if (tab === 'friends' && isSignedIn()) {
      loadFriends()
    }
  }, [tab])

  const handleUnfollow = async (userId: string) => {
    setFriends((prev) => prev.filter((f) => f.userId !== userId))
    try {
      await authedFetch('/api/follows', {
        method: 'DELETE',
        body: JSON.stringify({ followeeId: userId }),
      })
    } catch {
      loadFriends()
    }
  }

  const handleDeleteData = () => {
    Alert.alert(
      'Delete all my data',
      'This will permanently remove your account, profile, follows, and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount()
          },
        },
      ]
    )
  }

  const handleFollowFromSearch = useCallback(
    async (userId: string) => {
      await authedFetch('/api/follows', {
        method: 'POST',
        body: JSON.stringify({ followeeId: userId }),
      })
    },
    [authedFetch]
  )

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false)
    setShowSuggested(false)
    loadFriends()
  }, [loadFriends])

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: signOut },
    ])
  }

  if (!isSignedIn()) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 20,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <User size={48} color="#444" strokeWidth={1.5} />
        <Text
          style={{
            fontSize: 18,
            fontWeight: '600',
            color: '#fff',
            marginTop: 16,
          }}
        >
          Not signed in
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: '#888',
            marginTop: 6,
            textAlign: 'center',
            paddingHorizontal: 40,
          }}
        >
          Sign in to see your friends, follow players, and track your sessions
        </Text>
        <TouchableOpacity
          onPress={onSignUpPrompt}
          style={{
            marginTop: 24,
            backgroundColor: T.amber,
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 40,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>
            Sign in with Google
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'profile' && styles.tabActive]}
          onPress={() => setTab('profile')}
        >
          <User
            size={16}
            color={tab === 'profile' ? T.amber : '#666'}
            strokeWidth={2}
          />
          <Text
            style={[styles.tabLabel, tab === 'profile' && styles.tabLabelActive]}
          >
            Profile
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'friends' && styles.tabActive]}
          onPress={() => setTab('friends')}
        >
          <Users
            size={16}
            color={tab === 'friends' ? T.amber : '#666'}
            strokeWidth={2}
          />
          <Text
            style={[styles.tabLabel, tab === 'friends' && styles.tabLabelActive]}
          >
            Friends
          </Text>
        </TouchableOpacity>
      </View>

      {/* Profile tab */}
      {tab === 'profile' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Avatar + name */}
          <View style={styles.profileCard}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {(displayName ?? '?')[0]}
                </Text>
              </View>
            )}
            <Text style={styles.profileName}>
              {displayName ?? 'Player'}
            </Text>
            {reclubUserId && (
              <Text style={styles.profileMeta}>
                Reclub ID: {reclubUserId}
              </Text>
            )}
            {!reclubUserId && (
              <Text style={styles.profileMeta}>
                Not linked to Reclub
              </Text>
            )}
          </View>

          {/* Info rows */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Onboarding</Text>
              <Text style={styles.infoValue}>
                {hasCompletedOnboarding ? 'Completed' : 'Not completed'}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleSignOut}
            >
              <LogOut size={18} color="#999" strokeWidth={2} />
              <Text style={styles.actionLabel}>Sign out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleDeleteData}
            >
              <Trash2 size={18} color="#ef4444" strokeWidth={2} />
              <Text style={[styles.actionLabel, { color: '#ef4444' }]}>
                Delete my data
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Friends tab */}
      {tab === 'friends' && (
        <View style={{ flex: 1 }}>
          {showSuggested ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity
                  onPress={handleCloseSearch}
                  style={styles.searchBackBtn}
                >
                  <ArrowLeft size={18} color="#999" strokeWidth={2} />
                  <Text style={{ fontSize: 14, color: '#999' }}>Back to friends</Text>
                </TouchableOpacity>
              </View>
              <PeopleYouMayKnowScreen
                onComplete={handleCloseSearch}
                embedded
              />
            </View>
          ) : showSearch ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity
                  onPress={handleCloseSearch}
                  style={styles.searchBackBtn}
                >
                  <ArrowLeft size={18} color="#999" strokeWidth={2} />
                  <Text style={{ fontSize: 14, color: '#999' }}>Back to friends</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowSearch(false); setShowSuggested(true) }}
                  style={styles.suggestedBtn}
                >
                  <Sparkles size={14} color={T.amber} strokeWidth={2} />
                  <Text style={styles.suggestedLabel}>Suggested</Text>
                </TouchableOpacity>
              </View>
              <PlayerSearch
                mode="follow"
                onFollow={handleFollowFromSearch}
                autoFocus
              />
            </View>
          ) : (
            <>
              {/* Find Friends bar */}
              <TouchableOpacity
                style={styles.findFriendsBar}
                onPress={() => setShowSearch(true)}
                activeOpacity={0.7}
              >
                <Search size={16} color="#666" strokeWidth={2} />
                <Text style={styles.findFriendsText}>Find friends</Text>
              </TouchableOpacity>

              {loadingFriends ? (
                <ActivityIndicator
                  size="large"
                  color={T.amber}
                  style={{ marginTop: 40 }}
                />
              ) : friends.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 60 }}>
                  <Users size={40} color="#444" strokeWidth={1.5} />
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: '#fff',
                      marginTop: 12,
                    }}
                  >
                    No friends yet
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#888',
                      marginTop: 4,
                      textAlign: 'center',
                    }}
                  >
                    Follow players from your sessions to see them here
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={(item) => item.userId}
                  renderItem={({ item }) => (
                    <View style={styles.friendRow}>
                      {item.imageUrl ? (
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.friendAvatar}
                        />
                      ) : (
                        <View
                          style={[styles.friendAvatar, styles.avatarFallback]}
                        >
                          <Text style={styles.avatarInitial}>
                            {(item.displayName ?? '?')[0]}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>
                          {item.displayName ?? 'Unknown'}
                        </Text>
                        {item.duprDoubles != null && (
                          <Text style={styles.friendDupr}>
                            DUPR {item.duprDoubles.toFixed(1)}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.unfollowBtn}
                        onPress={() => handleUnfollow(item.userId)}
                      >
                        <Text style={styles.unfollowLabel}>Unfollow</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  contentContainerStyle={{ paddingBottom: 20 }}
                />
              )}
            </>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 20,
    borderRadius: 10,
    backgroundColor: T.surface,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  tabActive: {
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderBottomWidth: 2,
    borderBottomColor: T.amber,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  tabLabelActive: {
    color: T.amber,
    fontWeight: '600',
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 28,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  profileMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  infoSection: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: '#999',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  actionsSection: {
    backgroundColor: T.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
  },
  actionLabel: {
    fontSize: 15,
    color: '#999',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
  },
  friendAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  friendDupr: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  unfollowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: '#333',
  },
  unfollowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  findFriendsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 16,
  },
  findFriendsText: {
    fontSize: 15,
    color: '#555',
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.2)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: T.amber,
  },
})
