import React, { useState } from 'react';
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
import { createClub } from '../../lib/clubs';
import { uploadPostPhoto } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import PhotoPicker from '../../components/common/PhotoPicker';
import BackHeader from '../../components/common/BackHeader';

const CreateClubScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { canAccessFeature } = useUser();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const access = canAccessFeature('club_groups');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else if (access.price) navigation.navigate(ROUTES.PAYWALL, { featureKey: access.featureKey });
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('club.nameRequired'));
      return;
    }
    setSaving(true);

    const { data: { session } } = await getSession();
    if (!session) { setSaving(false); return; }

    let photo_url = null;
    if (photoUri) {
      const { url, error } = await uploadPostPhoto(session.user.id, photoUri);
      if (error) {
        Alert.alert(t('common.error'), t('common.photoUploadFailed'));
        setSaving(false);
        return;
      }
      photo_url = url;
    }

    const { data, error } = await createClub(session.user.id, {
      name: name.trim(),
      description: description.trim(),
      photo_url,
    });

    setSaving(false);
    if (error) {
      Alert.alert(t('common.error'), t('club.createFailed'));
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title={t('club.create')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('club.nameLabel')} *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('club.namePlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            maxLength={80}
            autoCapitalize="words"
          />

          <Text style={styles.label}>{t('club.descLabel')}</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('club.descPlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={300}
            autoCapitalize="sentences"
          />

          <Text style={styles.label}>{t('club.photoLabel')}</Text>
          <PhotoPicker uri={photoUri} onChange={setPhotoUri} />

          <View style={styles.adminNote}>
            <Text style={styles.adminNoteText}>✦  {t('club.adminNote')}</Text>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleCreate} disabled={saving}>
            {saving
              ? <ActivityIndicator color={COLORS.black} />
              : <Text style={styles.submitText}>{t('club.submit')}</Text>
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
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  adminNote: {
    backgroundColor: 'rgba(253,171,83,0.08)',
    borderRadius: 12, padding: 14, marginTop: 8,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  adminNoteText: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  submitText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});

export default CreateClubScreen;
