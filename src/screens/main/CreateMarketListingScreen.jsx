import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { getSession } from '../../lib/auth';
import { createMarketListing } from '../../lib/market';
import { uploadPostMedia } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import PhotoPicker from '../../components/common/PhotoPicker';
import BackHeader from '../../components/common/BackHeader';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';

const CreateMarketListingScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { canAccessFeature } = useUser();
  const prefill = route?.params?.prefill ?? {};
  const [userId, setUserId] = useState(null);
  const [description, setDescription] = useState('');
  const [mediaUri, setMediaUri] = useState(prefill.mediaUri ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  const handleCreate = async () => {
    const access = canAccessFeature('market');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else if (access.price) navigation.navigate(ROUTES.PAYWALL, { featureKey: access.featureKey });
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!description.trim()) {
      Alert.alert(t('common.error'), t('market.descriptionRequired'));
      return;
    }
    setSaving(true);

    let photo_url = null;
    let video_url = null;
    if (mediaUri) {
      const { url, isVideo, error } = await uploadPostMedia(userId, mediaUri);
      if (error) {
        Alert.alert(t('common.error'), t('market.photoFailed'));
        setSaving(false);
        return;
      }
      if (isVideo) video_url = url;
      else photo_url = url;
    }

    const { error } = await createMarketListing(userId, description.trim(), photo_url, video_url);
    setSaving(false);
    if (error) {
      Alert.alert(t('common.error'), t('market.createFailed'));
      return;
    }
    navigation.goBack();
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title={t('market.createTitle')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('market.labelPhoto')}</Text>
          <PhotoPicker uri={mediaUri} onChange={setMediaUri} allowVideo />

          <Text style={styles.label}>{t('market.labelDescription')} *</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('market.placeholderDescription')}
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={800}
              autoCapitalize="sentences"
            />
            <EmojiPickerButton onEmojiSelected={(e) => setDescription((prev) => prev + e)} style={styles.emojiBtn} />
          </View>
          <Text style={styles.charCount}>{description.length}/800</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{t('market.paymentNote')}</Text>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleCreate} disabled={saving}>
            {saving
              ? <ActivityIndicator color={COLORS.black} />
              : <Text style={styles.submitText}>{t('market.submit')}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  form: { padding: 20, paddingBottom: 48 },
  label: {
    fontSize: 12, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  inputMulti: { height: 160, textAlignVertical: 'top' },
  inputWrap: { position: 'relative' },
  emojiBtn: { position: 'absolute', right: 8, bottom: 8 },
  charCount: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },
  infoBox: {
    marginTop: 20,
    backgroundColor: 'rgba(253,171,83,0.08)',
    borderRadius: 12, padding: 14,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  infoText: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  submitText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});

export default CreateMarketListingScreen;
