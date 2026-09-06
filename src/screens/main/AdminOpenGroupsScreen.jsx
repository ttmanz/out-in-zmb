import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, FlatList, ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { getOpenGroups, createOpenGroup, updateOpenGroup, deleteOpenGroup } from '../../lib/groups';
import { getSession } from '../../lib/auth';
import { uploadPostPhoto } from '../../lib/storage';
import BackHeader from '../../components/common/BackHeader';
import PhotoPicker from '../../components/common/PhotoPicker';

const BLANK = { name: '', description: '', photo_url: null };

// Defined outside the screen so its identity is stable across renders — nesting
// this inside AdminOpenGroupsScreen made React remount the TextInputs (and drop
// the keyboard) on every keystroke, since setField() re-renders the parent.
const FormCard = ({ form, setField, saving, onSave, onCancel, t }) => (
  <View style={styles.formCard}>
    <Text style={styles.formTitle}>{form?.id ? t('adminGroups.editTitle') : t('adminGroups.addTitle')}</Text>

    <Text style={styles.fieldLabel}>{t('adminGroups.nameLabel')} *</Text>
    <TextInput
      style={styles.input}
      value={form?.name ?? ''}
      onChangeText={(v) => setField('name', v)}
      placeholder={t('adminGroups.namePlaceholder')}
      placeholderTextColor={COLORS.textMuted}
    />

    <Text style={styles.fieldLabel}>{t('adminGroups.descLabel')}</Text>
    <TextInput
      style={[styles.input, styles.inputMulti]}
      value={form?.description ?? ''}
      onChangeText={(v) => setField('description', v)}
      placeholder={t('adminGroups.descPlaceholder')}
      placeholderTextColor={COLORS.textMuted}
      multiline
    />

    <PhotoPicker uri={form?.photo_url} onChange={(uri) => setField('photo_url', uri)} />

    <View style={styles.formBtns}>
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color={COLORS.black} size="small" />
          : <Text style={styles.saveBtnText}>{t('adminGroups.save')}</Text>
        }
      </TouchableOpacity>
    </View>
  </View>
);

const AdminOpenGroupsScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | { ...BLANK, id?: string }
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: { session } }, { data, error }] = await Promise.all([
      getSession(),
      getOpenGroups(),
    ]);
    setUserId(session?.user?.id ?? null);
    if (!error) setGroups(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => setForm({ ...BLANK });
  const openEdit = (g) => setForm({ id: g.id, name: g.name, description: g.description ?? '', photo_url: g.photo_url ?? null });
  const cancelForm = () => setForm(null);
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('adminGroups.nameRequired'));
      return;
    }
    setSaving(true);

    let photo_url = form.photo_url;
    if (photo_url && !photo_url.startsWith('http')) {
      const { url, error } = await uploadPostPhoto(userId, photo_url);
      if (error) {
        Alert.alert(t('common.error'), t('common.photoUploadFailed'));
        setSaving(false);
        return;
      }
      photo_url = url;
    }

    const payload = { name: form.name.trim(), description: form.description.trim() || null, photo_url };
    const { error } = form.id
      ? await updateOpenGroup(form.id, payload)
      : await createOpenGroup(userId, payload);
    setSaving(false);
    if (error) {
      Alert.alert(t('common.error'), t('adminGroups.saveFailed'));
    } else {
      setForm(null);
      load();
    }
  };

  const handleDelete = (group) => {
    Alert.alert(
      t('adminGroups.deleteTitle'),
      t('adminGroups.deleteDesc', { name: group.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('adminGroups.delete'), style: 'destructive',
          onPress: async () => {
            setDeletingId(group.id);
            await deleteOpenGroup(group.id);
            setDeletingId(null);
            load();
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader
        title={t('adminGroups.title')}
        onBack={() => navigation.goBack()}
        right={!form ? (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ {t('adminGroups.addBtn')}</Text>
          </TouchableOpacity>
        ) : null}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : form ? (
        // Rendered as a plain ScrollView, not a FlatList header — putting the
        // TextInputs inside FlatList's ListHeaderComponent caused Android to
        // drop keyboard focus on every keystroke (VirtualizedList re-measures
        // the header on every layout change while the keyboard is open).
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <FormCard form={form} setField={setField} saving={saving} onSave={handleSave} onCancel={cancelForm} t={t} />
        </ScrollView>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>{t('adminGroups.empty')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isDeleting = deletingId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  {item.photo_url
                    ? <Image source={{ uri: item.photo_url }} style={styles.thumb} resizeMode="cover" />
                    : <View style={styles.thumbPlaceholder}><Text style={{ fontSize: 20 }}>🧩</Text></View>
                  }
                  <View style={styles.cardInfo}>
                    <Text style={styles.groupName}>{item.name}</Text>
                    {!!item.description && <Text style={styles.groupDesc}>{item.description}</Text>}
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                    <Text style={styles.editBtnText}>{t('adminGroups.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item)}
                    disabled={isDeleting}
                  >
                    {isDeleting
                      ? <ActivityIndicator size="small" color={COLORS.error} />
                      : <Text style={styles.deleteBtnText}>✕</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 48 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  empty: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },

  addBtn: {
    backgroundColor: 'rgba(253,171,83,0.12)',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  addBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },

  formCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  formTitle: {
    fontSize: 13, fontWeight: '800', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.background,
  },
  inputMulti: { height: 70, textAlignVertical: 'top' },
  formBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  saveBtn: {
    flex: 2, backgroundColor: COLORS.primary,
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 14 },

  card: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, marginRight: 12 },
  thumbPlaceholder: {
    width: 44, height: 44, borderRadius: 10, marginRight: 12,
    backgroundColor: 'rgba(253,171,83,0.08)', justifyContent: 'center', alignItems: 'center',
  },
  cardInfo: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  groupDesc: { fontSize: 12, color: COLORS.textLight, lineHeight: 17 },
  cardActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  editBtn: {
    borderWidth: 1, borderColor: COLORS.borderAccent,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
  },
  editBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(231,76,60,0.1)',
    borderWidth: 1, borderColor: COLORS.error,
    justifyContent: 'center', alignItems: 'center',
  },
  deleteBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 14 },
});

export default AdminOpenGroupsScreen;
