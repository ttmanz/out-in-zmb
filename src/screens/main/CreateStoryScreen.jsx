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
import { createStory } from '../../lib/stories';
import { uploadStoryMedia } from '../../lib/storage';
import { getSession } from '../../lib/auth';
import { useUser } from '../../contexts/UserContext';
import { checkAndFlagIfCommercial } from '../../lib/moderation';

const CreateStoryScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const [text, setText] = useState('');
  const [mediaUri, setMediaUri] = useState(route?.params?.prefill?.mediaUri ?? null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePost = async () => {
    const access = canAccessFeature('my_story');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!text.trim() && !mediaUri) {
      Alert.alert(t('common.error'), t('stories.errors.contentRequired'));
      return;
    }
    setLoading(true);
    const { data: { session } } = await getSession();
    if (!session) { setLoading(false); return; }

    let photo_url = null;
    let video_url = null;
    if (mediaUri) {
      const { url, isVideo, error } = await uploadStoryMedia(session.user.id, mediaUri);
      if (error) {
        Alert.alert(t('common.error'), t('stories.errors.mediaFailed'));
        setLoading(false);
        return;
      }
      if (isVideo) video_url = url;
      else photo_url = url;
    }

    const { error } = await createStory(session.user.id, {
      text: text.trim() || null,
      photo_url,
      video_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('common.error'), t('stories.errors.postFailed'));
    } else {
      checkAndFlagIfCommercial(profile, 'story', null, text.trim());
      navigation.goBack();
    }
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title={t('stories.createPost')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.inputWrap}>
            <AuthInput
              label={t('stories.labelText')}
              placeholder={t('stories.placeholderText')}
              value={text}
              onChangeText={setText}
              multiline
              autoCapitalize="sentences"
            />
            <EmojiPickerButton onEmojiSelected={(e) => setText((prev) => prev + e)} style={styles.emojiBtn} />
          </View>
          <PhotoPicker uri={mediaUri} onChange={setMediaUri} allowVideo />
          <LinkInput preview={linkPreview} onPreviewChange={setLinkPreview} />
          <TouchableOpacity style={styles.postBtn} onPress={handlePost} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.black} />
              : <Text style={styles.postBtnText}>{t('stories.submitPost')}</Text>
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

export default CreateStoryScreen;
