import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { getSession } from '../../lib/auth';
import { getVenueReviews, createVenueReview, deleteVenueReview } from '../../lib/venueReviews';
import { useUser } from '../../contexts/UserContext';
import { formatAgo } from '../../utils/format';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';

const STARS = [1, 2, 3, 4, 5];
const STAR_DISPLAY = ['', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'];

const StarRow = ({ value, onChange }) => (
  <View style={styles.starRow}>
    {STARS.map((n) => (
      <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={styles.star}>{n <= value ? '★' : '☆'}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const VenueReviewsScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { canAccessFeature } = useUser();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [composing, setComposing] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [{ data: { session } }, { data, error }] = await Promise.all([
      getSession(),
      getVenueReviews(),
    ]);
    if (session) setUserId(session.user.id);
    if (!error) setReviews(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(load);

  const handleSubmit = async () => {
    const access = canAccessFeature('venue_hub');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else if (access.price) navigation.navigate(ROUTES.PAYWALL, { featureKey: access.featureKey });
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!venueName.trim()) return Alert.alert(t('venueReviews.errorTitle'), t('venueReviews.errorVenue'));
    if (rating === 0) return Alert.alert(t('venueReviews.errorTitle'), t('venueReviews.errorRating'));
    if (!body.trim()) return Alert.alert(t('venueReviews.errorTitle'), t('venueReviews.errorBody'));
    setSubmitting(true);
    const { error } = await createVenueReview(userId, venueName, rating, body);
    setSubmitting(false);
    if (error) return Alert.alert(t('common.error'), error.message);
    setVenueName('');
    setRating(0);
    setBody('');
    setComposing(false);
    load();
  };

  const handleDelete = (id) => {
    Alert.alert(t('venueReviews.deleteConfirm'), '', [
      { text: t('venueReviews.cancel'), style: 'cancel' },
      { text: t('venueReviews.delete'), style: 'destructive', onPress: async () => {
        await deleteVenueReview(id, userId);
        setReviews((prev) => prev.filter((r) => r.id !== id));
      }},
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader
        title={t('venueReviews.title')}
        onBack={() => navigation.goBack()}
        right={(
          <TouchableOpacity onPress={() => setComposing((v) => !v)} style={styles.writeBtn}>
            <Text style={styles.writeBtnText}>{composing ? '✕' : '+ ' + t('venueReviews.rate')}</Text>
          </TouchableOpacity>
        )}
      />

      {composing && (
        <View style={styles.composeCard}>
          <TextInput
            style={styles.input}
            placeholder={t('venueReviews.venueNamePlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            value={venueName}
            onChangeText={setVenueName}
          />
          <TextInput
            style={[styles.input, styles.bodyInput]}
            placeholder={t('venueReviews.bodyPlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={500}
          />
          <View style={styles.composeFooter}>
            <StarRow value={rating} onChange={setRating} />
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color={COLORS.black} size="small" />
                : <Text style={styles.submitText}>{t('venueReviews.submit')}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={() => (
            <>
              <AdBanner page="VenueReviews" />
              <ProfileBanner navigation={navigation} />
            </>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>⭐</Text>
              <Text style={styles.empty}>{t('venueReviews.empty')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.venueName}>{item.venue_name}</Text>
                <Text style={styles.stars}>{STAR_DISPLAY[item.rating] ?? ''}</Text>
              </View>
              {!!item.body && <Text style={styles.reviewBody}>{item.body}</Text>}
              <View style={styles.cardFooter}>
                <Text style={styles.author}>{item.author?.full_name ?? t('notifications.someone')}</Text>
                <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
                {item.user_id === userId && (
                  <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  writeBtn: {
    backgroundColor: 'rgba(253,171,83,0.12)',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  writeBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  composeCard: {
    margin: 16, padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.background, marginBottom: 10,
  },
  bodyInput: { minHeight: 70, textAlignVertical: 'top' },
  composeFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  starRow: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 24, color: COLORS.primary },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  submitText: { color: COLORS.black, fontWeight: '800', fontSize: 13 },
  list: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  empty: { color: COLORS.textMuted, fontSize: 15 },
  card: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  venueName: { fontSize: 15, fontWeight: '700', color: COLORS.primary, flex: 1, marginRight: 8 },
  stars: { fontSize: 13, color: COLORS.primary },
  reviewBody: { fontSize: 13, color: COLORS.textLight, lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', flex: 1 },
  time: { fontSize: 11, color: COLORS.textMuted },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  deleteText: { color: COLORS.error, fontSize: 13, fontWeight: '700' },
});

export default VenueReviewsScreen;
