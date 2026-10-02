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
import { createOpenChatPost } from '../../lib/openChat';
import { getSession } from '../../lib/auth';
import { moderateContent, checkAndFlagIfCommercial } from '../../lib/moderation';
import { uploadPostPhoto } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';

const CreateOpenChatScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const [message, setMessage] = useState('');
  const [venue, setVenue] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [messageError, setMessageError] = useState('');

  const handlePost = async () => {
    const access = canAccessFeature('open_chat');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!message.trim()) {
      setMessageError(t('openChat.errors.messageRequired'));
      return;
    }
    setMessageError('');
    setLoading(true);

    const [{ flagged, reason }, { data: { session } }] = await Promise.all([
      moderateContent(message.trim()),
      getSession(),
    ]);
    if (flagged) {
      setLoading(false);
      Alert.alert(t('openChat.flaggedTitle'), t('openChat.flaggedBody', { reason }));
      return;
    }
    if (!session) { setLoading(false); return; }

    let photo_url = null;
    if (photoUri) {
      const { url, error } = await uploadPostPhoto(session.user.id, photoUri);
      if (error) {
        Alert.alert(t('common.error'), t('common.photoUploadFailed'));
        setLoading(false);
        return;
      }
      photo_url = url;
    }

    const { error } = await createOpenChatPost(session.user.id, {
      message: message.trim(),
      venue: venue.trim(),
      photo_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('common.error'), t('openChat.errors.postFailed'));
    } else {
      checkAndFlagIfCommercial(profile, 'open_chat', null, message.trim());
      navigation.goBack();
    }
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title={t('openChat.post')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.inputWrap}>
            <AuthInput
              label={t('openChat.labelMessage')}
              placeholder={t('openChat.placeholderMessage')}
              value={message}
              onChangeText={setMessage}
              error={messageError}
              multiline
              autoCapitalize="sentences"
            />
            <EmojiPickerButton onEmojiSelected={(e) => setMessage((prev) => prev + e)} style={styles.emojiBtn} />
          </View>
          <AuthInput
            label={t('openChat.labelVenue')}
            placeholder={t('openChat.placeholderVenue')}
            value={venue}
            onChangeText={setVenue}
            autoCapitalize="words"
          />
          <PhotoPicker uri={photoUri} onChange={setPhotoUri} />
          <LinkInput preview={linkPreview} onPreviewChange={setLinkPreview} />

          <TouchableOpacity style={styles.postBtn} onPress={handlePost} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.black} />
              : <Text style={styles.postBtnText}>{t('openChat.submitPost')}</Text>
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

export default CreateOpenChatScreen;
