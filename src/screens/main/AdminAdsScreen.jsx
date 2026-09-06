import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getAllAds, createAd, updateAd, deleteAd } from '../../lib/ads';
import { getSession } from '../../lib/auth';
import { uploadAdMedia } from '../../lib/storage';
import PhotoPicker from '../../components/common/PhotoPicker';
import BackHeader from '../../components/common/BackHeader';

// Every value ever passed as <AdBanner page="..." /> across the app.
const AD_PAGES = [
  'ClubGroups', 'CreateSpur', 'EventFeed', 'Events', 'Friends', 'FriendsHub',
  'HappeningFeed', 'Market', 'MemberProfile', 'MembersAt', 'Messages',
  'MyStory', 'Notifications', 'OpenChat', 'OpenGroupDetail', 'OpenGroups',
  'ProfileSettings', 'SearchUsers', 'SpurOfMoment', 'TopVenues', 'VenueHub',
  'VenueReviews', 'VenueSearch', 'WhatHappening', 'WhereToGo',
];

const emptyForm = { page: AD_PAGES[0], mediaUri: null, mediaType: 'image', link_url: '', position: '0', active: true };

const AdminAdsScreen = ({ navigation }) => {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getAllAds();
    if (!error) setAds(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setComposing(true);
  };

  const startEdit = (ad) => {
    setEditingId(ad.id);
    setForm({
      page: ad.page,
      mediaUri: ad.image_url,
      mediaType: ad.media_type ?? 'image',
      link_url: ad.link_url ?? '',
      position: String(ad.position ?? 0),
      active: ad.active,
    });
    setComposing(true);
  };

  const handleMediaChange = (uri, type) => {
    const isVideo = type === 'video' || /\.(mp4|mov|avi|mkv|m4v)$/i.test(uri ?? '');
    setForm((f) => ({ ...f, mediaUri: uri, mediaType: uri ? (isVideo ? 'video' : 'image') : f.mediaType }));
  };

  const handleSave = async () => {
    if (!form.mediaUri) { Alert.alert('Error', 'Add an image or video for this ad.'); return; }
    setSaving(true);

    let image_url = form.mediaUri;
    // Only re-upload if it's a local file (not already a hosted URL from editing)
    if (!/^https?:\/\//.test(form.mediaUri)) {
      const { data: { session } } = await getSession();
      if (!session) { setSaving(false); return; }
      const { url, error } = await uploadAdMedia(session.user.id, form.mediaUri);
      if (error) {
        Alert.alert('Error', 'Media upload failed.');
        setSaving(false);
        return;
      }
      image_url = url;
    }

    const payload = {
      page: form.page,
      image_url,
      media_type: form.mediaType,
      link_url: form.link_url.trim() || null,
      position: parseInt(form.position, 10) || 0,
      active: form.active,
    };

    const { error } = editingId ? await updateAd(editingId, payload) : await createAd(payload);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setComposing(false);
    load();
  };

  const handleToggleActive = async (ad) => {
    setTogglingId(ad.id);
    await updateAd(ad.id, { active: !ad.active });
    setTogglingId(null);
    load();
  };

  const handleDelete = (ad) => {
    Alert.alert('Delete ad?', 'This will permanently remove this ad.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeletingId(ad.id);
          await deleteAd(ad.id);
          setDeletingId(null);
          load();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader
        title="Ads"
        onBack={() => navigation.goBack()}
        right={(
          <TouchableOpacity onPress={startCreate} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      />

      {composing && (
        <ScrollView style={styles.composeWrap} contentContainerStyle={styles.composeContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Page</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pageRow}>
            {AD_PAGES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pageChip, form.page === p && styles.pageChipActive]}
                onPress={() => setForm((f) => ({ ...f, page: p }))}
              >
                <Text style={[styles.pageChipText, form.page === p && styles.pageChipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Media</Text>
          <PhotoPicker uri={form.mediaUri} onChange={handleMediaChange} allowVideo />

          <Text style={styles.label}>Link URL (optional)</Text>
          <TextInput
            style={styles.input}
            value={form.link_url}
            onChangeText={(v) => setForm((f) => ({ ...f, link_url: v }))}
            placeholder="https://..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>Position</Text>
          <TextInput
            style={styles.input}
            value={form.position}
            onChangeText={(v) => setForm((f) => ({ ...f, position: v.replace(/[^0-9]/g, '') }))}
            keyboardType="number-pad"
          />

          <View style={styles.activeRow}>
            <Text style={styles.label}>Active</Text>
            <Switch
              value={form.active}
              onValueChange={(v) => setForm((f) => ({ ...f, active: v }))}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
            />
          </View>

          <View style={styles.composeBtnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setComposing(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={COLORS.black} size="small" />
                : <Text style={styles.saveBtnText}>{editingId ? 'Save' : 'Create'}</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {ads.length === 0 ? (
            <Text style={styles.empty}>No ads yet — tap "+ New" to add one.</Text>
          ) : (
            ads.map((ad) => (
              <View key={ad.id} style={styles.card}>
                <Image source={{ uri: ad.image_url }} style={styles.thumb} resizeMode="cover" />
                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.pageLabel}>{ad.page}</Text>
                    <Text style={styles.mediaBadge}>{ad.media_type === 'video' ? '🎬 video' : '🖼 image'}</Text>
                  </View>
                  <Text style={styles.posLabel}>Position {ad.position}</Text>
                  {!!ad.link_url && <Text style={styles.linkLabel} numberOfLines={1}>{ad.link_url}</Text>}
                  <View style={styles.cardBtnRow}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, ad.active && styles.toggleBtnActive]}
                      onPress={() => handleToggleActive(ad)}
                      disabled={togglingId === ad.id}
                    >
                      {togglingId === ad.id
                        ? <ActivityIndicator size="small" color={ad.active ? COLORS.black : COLORS.textMuted} />
                        : <Text style={[styles.toggleBtnText, ad.active && styles.toggleBtnTextActive]}>
                            {ad.active ? '✓ Active' : 'Inactive'}
                          </Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={() => startEdit(ad)}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(ad)}
                      disabled={deletingId === ad.id}
                    >
                      {deletingId === ad.id
                        ? <ActivityIndicator size="small" color={COLORS.error} />
                        : <Text style={styles.deleteBtnText}>Delete</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  addBtn: {
    backgroundColor: 'rgba(253,171,83,0.12)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  addBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  composeWrap: { maxHeight: '65%', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  composeContent: { padding: 20 },
  label: {
    fontSize: 12, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 14,
  },
  pageRow: { marginBottom: 4 },
  pageChip: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 8,
    backgroundColor: COLORS.surface,
  },
  pageChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pageChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  pageChipTextActive: { color: COLORS.black },
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  composeBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 8 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  saveBtn: {
    flex: 1, backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 14 },
  list: { padding: 16, paddingBottom: 48 },
  empty: { color: COLORS.textLight, fontSize: 14, textAlign: 'center', marginTop: 60 },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 14,
    marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  thumb: { width: 96, height: 96 },
  cardBody: { flex: 1, padding: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  mediaBadge: { fontSize: 11, color: COLORS.textLight },
  posLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  linkLabel: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  cardBtnRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  toggleBtn: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  toggleBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  toggleBtnTextActive: { color: COLORS.black },
  editBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  deleteBtn: {
    borderWidth: 1, borderColor: COLORS.error, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  deleteBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.error },
});

export default AdminAdsScreen;
