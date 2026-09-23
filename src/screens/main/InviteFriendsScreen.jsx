import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getMyReferralCode, getMyReferrals } from '../../lib/referrals';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import Avatar from '../../components/common/Avatar';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const InviteFriendsScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [code, setCode] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [{ data: codeData }, { data: referralsData }] = await Promise.all([
      getMyReferralCode(profile.id),
      getMyReferrals(profile.id),
    ]);
    setCode(codeData?.referral_code ?? null);
    setReferrals(referralsData ?? []);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleShare = () => {
    Share.share({
      message: `Join me on Out-in-Zmb! Use my code ${code} when you sign up and we both get bonus points. 🎉`,
    });
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
      <BackHeader title="Invite Friends" onBack={() => navigation.goBack()} />

      <GradientBorder radius={18} style={styles.codeOuter}>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your referral code</Text>
          <Text style={styles.codeValue}>{code}</Text>
          <Text style={styles.codeHint}>You get +50 points, they get +20 — for every friend who signs up with it.</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>Share your code</Text>
          </TouchableOpacity>
        </View>
      </GradientBorder>

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionLabel}>Friends who joined ({referrals.length})</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No one yet — share your code to start earning.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar uri={item.photo_url} name={item.full_name} size={38} backgroundColor={COLORS.primaryDark} style={styles.avatar} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.full_name ?? '—'}</Text>
              <Text style={styles.time}>Joined {formatAgo(item.created_at)}</Text>
            </View>
            <Text style={styles.earned}>+50</Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  codeOuter: { margin: 20, marginBottom: 8 },
  codeCard: { backgroundColor: COLORS.surface, borderRadius: 16.5, padding: 22, alignItems: 'center' },
  codeLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 6 },
  codeValue: { fontSize: 34, fontWeight: '800', color: COLORS.primary, letterSpacing: 4 },
  codeHint: { fontSize: 12, color: COLORS.textLight, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  shareBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 16 },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.black },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  list: { paddingBottom: 48 },
  empty: { fontSize: 13, color: COLORS.textMuted, marginHorizontal: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12,
    marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: { marginRight: 10 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  time: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  earned: { fontSize: 15, fontWeight: '800', color: COLORS.success },
});

export default InviteFriendsScreen;
