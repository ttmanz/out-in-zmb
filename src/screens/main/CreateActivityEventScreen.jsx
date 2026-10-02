import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { createActivityEvent } from '../../lib/activityEvents';
import { getSession } from '../../lib/auth';
import { uploadPostMedia } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import { checkAndFlagIfCommercial } from '../../lib/moderation';
import PhotoPicker from '../../components/common/PhotoPicker';
import LinkInput from '../../components/common/LinkInput';
import BackHeader from '../../components/common/BackHeader';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';

const CreateActivityEventScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const { category } = route.params;
  const prefill = route.params?.prefill ?? {};
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('date');
  const [description, setDescription] = useState('');
  const [mediaUri, setMediaUri] = useState(prefill.mediaUri ?? null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const formatDate = (date) =>
    date.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  // Android shows date and time as two separate dialogs
  const onPickerChange = (event, selected) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed') return;
      const date = selected ?? eventDate ?? new Date();
      setEventDate(date);
      if (pickerMode === 'date') {
        setPickerMode('time');
        setShowPicker(true);
      } else {
        setPickerMode('date');
      }
    } else {
      setEventDate(selected ?? eventDate);
    }
  };

  const handlePost = async () => {
    const access = canAccessFeature('whats_happening');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('activityEvents.nameRequired'));
      return;
    }
    setSaving(true);

    const { data: { session } } = await getSession();
    if (!session) { setSaving(false); return; }

    let photo_url = null;
    let video_url = null;
    if (mediaUri) {
      const { url, isVideo, error } = await uploadPostMedia(session.user.id, mediaUri);
      if (error) {
        Alert.alert(t('common.error'), t('common.photoUploadFailed'));
        setSaving(false);
        return;
      }
      if (isVideo) video_url = url;
      else photo_url = url;
    }

    const { error } = await createActivityEvent({
      category,
      name: name.trim(),
      venue: venue.trim() || null,
      event_date: eventDate ? eventDate.toISOString() : null,
      description: description.trim() || null,
      photo_url,
      video_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setSaving(false);
    if (error) {
      Alert.alert(t('common.error'), t('activityEvents.postFailed'));
    } else {
      checkAndFlagIfCommercial(profile, 'activity_event', null, [name, description].filter(Boolean).join('\n'));
      navigation.goBack();
    }
  };

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader
          title={`${t('activityEvents.post')} — ${t(`happenings.${category}`)}`}
          onBack={() => navigation.goBack()}
        />

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('activityEvents.labelName')} *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('activityEvents.placeholderName')}
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
          />

          <Text style={styles.label}>{t('activityEvents.labelVenue')}</Text>
          <TextInput
            style={styles.input}
            value={venue}
            onChangeText={setVenue}
            placeholder={t('activityEvents.placeholderVenue')}
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
          />

          <Text style={styles.label}>{t('activityEvents.labelDate')}</Text>
          <TouchableOpacity
            style={[styles.input, styles.dateBtn]}
            onPress={() => { setPickerMode('date'); setShowPicker(true); }}
            activeOpacity={0.7}
          >
            <Text style={eventDate ? styles.dateText : styles.datePlaceholder}>
              {eventDate ? formatDate(eventDate) : t('activityEvents.tapToSetDate')}
            </Text>
            <Text style={styles.dateIcon}>📅</Text>
          </TouchableOpacity>

          {showPicker && (
            <DateTimePicker
              value={eventDate ?? new Date()}
              mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={onPickerChange}
            />
          )}
          {Platform.OS === 'ios' && showPicker && (
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowPicker(false)}>
              <Text style={styles.doneBtnText}>{t('common.done')}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>{t('activityEvents.labelDescription')}</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('activityEvents.placeholderDescription')}
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={300}
            />
            <EmojiPickerButton onEmojiSelected={(e) => setDescription((prev) => prev + e)} style={styles.emojiBtn} />
          </View>

          <Text style={styles.label}>{t('activityEvents.labelLink')}</Text>
          <LinkInput preview={linkPreview} onPreviewChange={setLinkPreview} />

          <Text style={styles.label}>{t('activityEvents.labelPhoto')}</Text>
          <PhotoPicker uri={mediaUri} onChange={setMediaUri} allowVideo />

          <TouchableOpacity style={styles.submitBtn} onPress={handlePost} disabled={saving}>
            {saving
              ? <ActivityIndicator color={COLORS.black} />
              : <Text style={styles.submitText}>{t('activityEvents.submit')}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  label: {
    fontSize: 12, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surface, marginBottom: 4,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  inputWrap: { position: 'relative' },
  emojiBtn: { position: 'absolute', right: 8, bottom: 8 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 15, color: COLORS.text, flex: 1 },
  datePlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },
  dateIcon: { fontSize: 18 },
  doneBtn: {
    alignSelf: 'flex-end', marginTop: 6, marginBottom: 4,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.primary, borderRadius: 8,
  },
  doneBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 13 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 28,
  },
  submitText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});

export default CreateActivityEventScreen;
