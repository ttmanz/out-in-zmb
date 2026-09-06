import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import AuthInput from '../../components/auth/AuthInput';
import PhotoPicker from '../../components/common/PhotoPicker';
import LinkInput from '../../components/common/LinkInput';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';
import { createSpurPost } from '../../lib/spur';
import { getSession } from '../../lib/auth';
import { uploadPostMedia } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import { checkAndFlagIfCommercial } from '../../lib/moderation';

const CreateSpurScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const prefill = route?.params?.prefill ?? {};
  const [venue, setVenue] = useState('');
  const [activity, setActivity] = useState('');
  const [mediaUri, setMediaUri] = useState(prefill.mediaUri ?? null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [venueError, setVenueError] = useState('');
  const [activityError, setActivityError] = useState('');

  const handlePost = async () => {
    const access = canAccessFeature('spur_of_moment');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else if (access.price) navigation.navigate(ROUTES.PAYWALL, { featureKey: access.featureKey });
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    let valid = true;
    if (!venue.trim()) { setVenueError(t('spur.errors.venueRequired')); valid = false; }
    else setVenueError('');
    if (!activity.trim()) { setActivityError(t('spur.errors.activityRequired')); valid = false; }
    else setActivityError('');
    if (!valid) return;

    setLoading(true);
    const { data: { session } } = await getSession();
    if (!session) { setLoading(false); return; }

    let photo_url = null;
    let video_url = null;
    if (mediaUri) {
      const { url, isVideo, error } = await uploadPostMedia(session.user.id, mediaUri);
      if (error) {
        Alert.alert(t('common.error'), t('common.photoUploadFailed'));
        setLoading(false);
        return;
      }
      if (isVideo) video_url = url;
      else photo_url = url;
    }

    const { error } = await createSpurPost(session.user.id, {
      venue: venue.trim(),
      activity: activity.trim(),
      photo_url,
      video_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('common.error'), t('spur.errors.postFailed'));
    } else {
      checkAndFlagIfCommercial(profile, 'spur', null, `${venue.trim()} ${activity.trim()}`);
      navigation.goBack();
    }
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title={t('spur.post')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <AdBanner page="CreateSpur" />
          <ProfileBanner navigation={navigation} />

          <Text style={styles.preview}>
            {t('spur.goingTo')} {venue.trim() || '___'} {t('spur.forWhat')} {activity.trim() || '___'}, {t('spur.joinMe')}
          </Text>

          <AuthInput
            label={t('spur.labelVenue')}
            placeholder={t('spur.placeholderVenue')}
            value={venue}
            onChangeText={setVenue}
            error={venueError}
            autoCapitalize="words"
          />
          <View style={styles.inputWrap}>
            <AuthInput
              label={t('spur.labelActivity')}
              placeholder={t('spur.placeholderActivity')}
              value={activity}
              onChangeText={setActivity}
              error={activityError}
              autoCapitalize="sentences"
            />
            <EmojiPickerButton onEmojiSelected={(e) => setActivity((prev) => prev + e)} style={styles.emojiBtn} />
          </View>

          <PhotoPicker uri={mediaUri} onChange={setMediaUri} allowVideo />
          <LinkInput preview={linkPreview} onPreviewChange={setLinkPreview} />

          <TouchableOpacity style={styles.postBtn} onPress={handlePost} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.text} />
              : <Text style={styles.postBtnText}>{t('spur.submitPost')}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  form: { padding: 20, paddingBottom: 40 },
  inputWrap: { position: 'relative' },
  emojiBtn: { position: 'absolute', right: 8, bottom: 24 },
  preview: {
    fontSize: 16, fontWeight: '700', color: COLORS.text,
    backgroundColor: 'rgba(253,171,83,0.08)',
    borderRadius: 12, padding: 16, marginBottom: 24, lineHeight: 24,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  postBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  postBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 16 },
});

export default CreateSpurScreen;
