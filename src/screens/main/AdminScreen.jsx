import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, StatusBar, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getAllMembers, setMemberStatus, setStaffStatus, setAccountType, banMember, unbanMember } from '../../lib/admin';
import { getOrCreateConversation } from '../../lib/messages';
import { useUser } from '../../contexts/UserContext';
import { ROUTES } from '../../constants/routes';
import Avatar from '../../components/common/Avatar';

const STATUS_CYCLE = { active: 'restricted', restricted: 'disabled', disabled: 'active' };
const STATUS_COLOR = {
  active: '#2ecc71',
  restricted: '#f39c12',
  disabled: '#e74c3c',
  banned: '#e74c3c',
};
const STATUS_LABEL = {
  active: 'Active',
  restricted: 'Restricted',
  disabled: 'Disabled',
  banned: 'Banned',
};

const AdminScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [staffUpdating, setStaffUpdating] = useState(null);
  const [blockUpdating, setBlockUpdating] = useState(null);
  const [typeUpdating, setTypeUpdating] = useState(null);
  const [messagingId, setMessagingId] = useState(null);
  const statusBarHeight = StatusBar.currentHeight ?? 44;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getAllMembers();
    if (!error) setMembers(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleMessage = async (member) => {
    if (member.id === profile?.id) return;
    setMessagingId(member.id);
    const { data, error } = await getOrCreateConversation(profile.id, member.id);
    setMessagingId(null);
    if (error || !data) {
      Alert.alert('Error', 'Could not start a conversation.');
      return;
    }
    navigation.navigate('MessagesTab', {
      screen: ROUTES.CHAT,
      params: {
        conversationId: data.id,
        friendName: member.full_name ?? 'Member',
        friendIsAdmin: member.is_admin === true,
      },
    });
  };

  const handleStaffToggle = async (member) => {
    const next = !member.is_staff;
    Alert.alert(
      next ? 'Grant Staff Access' : 'Remove Staff Access',
      `${next ? 'Give' : 'Remove'} free subscription for ${member.full_name ?? 'this member'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setStaffUpdating(member.id);
            const { data, error } = await setStaffStatus(member.id, next);
            setStaffUpdating(null);
            if (error || !data?.length) { Alert.alert('Error', 'Could not update staff status.'); return; }
            load();
          },
        },
      ]
    );
  };

  const handleAccountTypeToggle = (member) => {
    const next = member.account_type === 'venue_owner' ? 'member' : 'venue_owner';
    Alert.alert(
      'Change Account Type',
      `Set ${member.full_name ?? 'this member'} to ${next === 'venue_owner' ? 'Venue Owner' : 'Member'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setTypeUpdating(member.id);
            const { data, error } = await setAccountType(member.id, next);
            setTypeUpdating(null);
            if (error || !data?.length) { Alert.alert('Error', 'Could not update account type.'); return; }
            load();
          },
        },
      ]
    );
  };

  const handleBlockToggle = (member) => {
    if (member.id === profile?.id) {
      Alert.alert('Cannot block your own account.');
      return;
    }
    const blocking = member.status !== 'banned';
    Alert.alert(
      blocking ? 'Block Member' : 'Unblock Member',
      blocking
        ? `Block ${member.full_name ?? 'this member'}? They'll be hidden from search and locked out of the app.`
        : `Unblock ${member.full_name ?? 'this member'} and restore normal access?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: blocking ? 'destructive' : 'default',
          onPress: async () => {
            setBlockUpdating(member.id);
            const { data, error } = await (blocking ? banMember(member.id) : unbanMember(member.id));
            setBlockUpdating(null);
            if (error || !data?.length) { Alert.alert('Error', 'Could not update block status.'); return; }
            load();
          },
        },
      ]
    );
  };

  const handleStatusPress = (member) => {
    if (member.id === profile?.id) {
      Alert.alert('Cannot change your own status.');
      return;
    }
    if (member.status === 'banned') {
      Alert.alert('This member is blocked — unblock them first to change their status.');
      return;
    }
    const next = STATUS_CYCLE[member.status ?? 'active'];
    Alert.alert(
      'Change Status',
      `Set ${member.full_name ?? 'this member'} to ${STATUS_LABEL[next]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setUpdating(member.id);
            const { data, error } = await setMemberStatus(member.id, next);
            setUpdating(null);
            if (error || !data?.length) { Alert.alert('Error', 'Could not update member status.'); return; }
            load();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <Text style={styles.title}>Members</Text>
      </View>
      <View style={styles.navGrid}>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_TOP_VENUES)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>📍</Text>
          <Text style={styles.navCardText}>Venues</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_OPEN_GROUPS)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>🧩</Text>
          <Text style={styles.navCardText}>Groups</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_SUBSCRIPTION_PLANS)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>⭐</Text>
          <Text style={styles.navCardText}>Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_ADS)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>📢</Text>
          <Text style={styles.navCardText}>Ads</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_ACCESS_CONTROL)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>💳</Text>
          <Text style={styles.navCardText}>Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_REPORTS)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>🚩</Text>
          <Text style={styles.navCardText}>Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_CLIPS)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>🎬</Text>
          <Text style={styles.navCardText}>Clips</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => navigation.navigate(ROUTES.ADMIN_FLAGGED_MEMBERS)}
          activeOpacity={0.75}
        >
          <Text style={styles.navCardEmoji}>📊</Text>
          <Text style={styles.navCardText}>Flagged</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.count}>{members.length} members</Text>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const status = item.status ?? 'active';
          const isUpdating = updating === item.id;
          const isStaffUpdating = staffUpdating === item.id;
          const isBlockUpdating = blockUpdating === item.id;
          const isTypeUpdating = typeUpdating === item.id;
          const isBanned = status === 'banned';
          const isVenueOwner = item.account_type === 'venue_owner';
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Avatar
                  uri={item.photo_url}
                  name={item.full_name}
                  size={42}
                  backgroundColor={COLORS.primaryDark}
                  style={styles.avatar}
                />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.full_name ?? '—'}</Text>
                  {item.is_admin && <Text style={styles.adminBadge}>Admin</Text>}
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
                {item.id !== profile?.id && (
                  <TouchableOpacity
                    style={styles.messageChip}
                    onPress={() => handleMessage(item)}
                    disabled={messagingId === item.id}
                  >
                    {messagingId === item.id
                      ? <ActivityIndicator size="small" color={COLORS.black} />
                      : <Text style={styles.messageChipText}>💬 Message</Text>
                    }
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.staffChip, item.is_staff && styles.staffChipActive]}
                  onPress={() => handleStaffToggle(item)}
                  disabled={isStaffUpdating}
                >
                  {isStaffUpdating
                    ? <ActivityIndicator size="small" color={item.is_staff ? COLORS.black : COLORS.textMuted} />
                    : <Text style={[styles.staffChipText, item.is_staff && styles.staffChipTextActive]}>
                        {item.is_staff ? '✓ Staff' : 'Staff'}
                      </Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.venueChip, isVenueOwner && styles.venueChipActive]}
                  onPress={() => handleAccountTypeToggle(item)}
                  disabled={isTypeUpdating}
                >
                  {isTypeUpdating
                    ? <ActivityIndicator size="small" color={isVenueOwner ? COLORS.black : COLORS.textMuted} />
                    : <Text style={[styles.venueChipText, isVenueOwner && styles.venueChipTextActive]}>
                        {isVenueOwner ? '🍸 Venue Owner' : 'Member'}
                      </Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBtn, { borderColor: STATUS_COLOR[status] }]}
                  onPress={() => handleStatusPress(item)}
                  disabled={isUpdating}
                >
                  {isUpdating
                    ? <ActivityIndicator size="small" color={STATUS_COLOR[status]} />
                    : <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>
                        {STATUS_LABEL[status]}
                      </Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.blockChip, isBanned && styles.blockChipActive]}
                  onPress={() => handleBlockToggle(item)}
                  disabled={isBlockUpdating}
                >
                  {isBlockUpdating
                    ? <ActivityIndicator size="small" color={isBanned ? COLORS.black : COLORS.error} />
                    : <Text style={[styles.blockChipText, isBanned && styles.blockChipTextActive]}>
                        {isBanned ? 'Unblock' : 'Block'}
                      </Text>
                  }
                </TouchableOpacity>
              </ScrollView>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.primary },
  navGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  count: { fontSize: 13, color: COLORS.textMuted, paddingHorizontal: 20, paddingVertical: 8 },
  navCard: {
    flexBasis: '30%', flexGrow: 1,
    backgroundColor: 'rgba(41,93,255,0.12)',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8,
    borderWidth: 1, borderColor: COLORS.borderAccent,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  navCardEmoji: { fontSize: 26 },
  navCardText: { color: COLORS.primary, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  list: { paddingBottom: 40 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  chipScrollContent: { gap: 8 },
  messageChip: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    minWidth: 58, alignItems: 'center',
  },
  messageChipText: { fontSize: 11, fontWeight: '700', color: COLORS.black },
  avatar: { marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  adminBadge: { fontSize: 10, color: COLORS.primary, fontWeight: '700', marginTop: 2 },
  staffChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 58,
    alignItems: 'center',
  },
  staffChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  staffChipText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  staffChipTextActive: { color: COLORS.black },
  venueChip: {
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 58,
    alignItems: 'center',
  },
  venueChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  venueChipText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  venueChipTextActive: { color: COLORS.black },
  statusBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 90,
    alignItems: 'center',
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  blockChip: {
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  blockChipActive: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  blockChipText: { fontSize: 11, fontWeight: '700', color: COLORS.error },
  blockChipTextActive: { color: COLORS.black },
});

export default AdminScreen;
