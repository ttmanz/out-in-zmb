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
import BackHeader from '../../components/common/BackHeader';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';
import { createHappening } from '../../lib/happenings';
import { getSession } from '../../lib/auth';
import { uploadPostMedia } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import { checkAndFlagIfCommercial } from '../../lib/moderation';

const CreateHappeningScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const prefill = route.params?.prefill ?? {};
  const [title, setTitle] = useState(prefill.title ?? '');
  const [venue, setVenue] = useState(prefill.venue ?? '');
  const [when] = useState(prefill.when ?? 'today');
  const [description, setDescription] = useState('');
  const [mediaUri, setMediaUri] = useState(prefill.mediaUri ?? null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [titleError, setTitleError] = useState('');

  const handlePost = async () => {
    const access = canAccessFeature('whats_happening');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!title.trim()) { setTitleError(t('happenings.errors.titleRequired')); return; }
    setTitleError('');

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

    const { error } = await createHappening(session.user.id, {
      title: title.trim(),
      venue: venue.trim() || null,
      happening_at: when,
      description: description.trim() || null,
      photo_url,
      video_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('common.error'), t('happenings.errors.postFailed'));
    } else {
      checkAndFlagIfCommercial(profile, 'happening', null, [title, description].filter(Boolean).join('\n'));
      navigation.goBack();
    }
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title={t('happenings.post')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <AuthInput
            label={t('happenings.labelTitle')}
            placeholder={t('happenings.placeholderTitle')}
            value={title}
            onChangeText={setTitle}
            error={titleError}
            autoCapitalize="sentences"
          />
          <AuthInput
            label={t('happenings.labelVenue')}
            placeholder={t('happenings.placeholderVenue')}
            value={venue}
            onChangeText={setVenue}
            autoCapitalize="words"
          />

          <View style={styles.inputWrap}>
            <AuthInput
              label={t('happenings.labelDescription')}
              placeholder={t('happenings.placeholderDescription')}
              value={description}
              onChangeText={setDescription}
              multiline
              autoCapitalize="sentences"
            />
            <EmojiPickerButton onEmojiSelected={(e) => setDescription((prev) => prev + e)} style={styles.emojiBtn} />
          </View>

          <PhotoPicker uri={mediaUri} onChange={setMediaUri} allowVideo />
          <LinkInput preview={linkPreview} onPreviewChange={setLinkPreview} />

          <TouchableOpacity style={styles.postBtn} onPress={handlePost} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.black} />
              : <Text style={styles.postBtnText}>{t('happenings.submitPost')}</Text>
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
  postBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  postBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 16 },
});

export default CreateHappeningScreen;
