import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, FlatList, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { getTopVenues, createTopVenue, updateTopVenue, deleteTopVenue, VENUE_CATEGORIES } from '../../lib/venues';
import BackHeader from '../../components/common/BackHeader';

const CATS = VENUE_CATEGORIES.filter((c) => c.id !== 'all');
const MEDALS = ['🥇', '🥈', '🥉'];
const BLANK = { name: '', address: '', description: '', rank: '', category: 'eat' };

// Defined outside the screen so its identity is stable across renders — nesting
// this inside AdminTopVenuesScreen made React remount the TextInputs (and drop
// the keyboard) on every keystroke, since setField() re-renders the parent.
const FormCard = ({ form, setField, saving, onSave, onCancel, t }) => (
  <View style={styles.formCard}>
    <Text style={styles.formTitle}>{form?.id ? t('adminVenues.editTitle') : t('adminVenues.addTitle')}</Text>

    <Text style={styles.fieldLabel}>{t('adminVenues.nameLabel')} *</Text>
    <TextInput
      style={styles.input}
      value={form?.name ?? ''}
      onChangeText={(v) => setField('name', v)}
      placeholder={t('adminVenues.namePlaceholder')}
      placeholderTextColor={COLORS.textMuted}
    />

    <Text style={styles.fieldLabel}>{t('adminVenues.addressLabel')}</Text>
    <TextInput
      style={styles.input}
      value={form?.address ?? ''}
      onChangeText={(v) => setField('address', v)}
      placeholder={t('adminVenues.addressPlaceholder')}
      placeholderTextColor={COLORS.textMuted}
    />

    <Text style={styles.fieldLabel}>{t('adminVenues.descLabel')}</Text>
    <TextInput
      style={[styles.input, styles.inputMulti]}
      value={form?.description ?? ''}
      onChangeText={(v) => setField('description', v)}
      placeholder={t('adminVenues.descPlaceholder')}
      placeholderTextColor={COLORS.textMuted}
      multiline
    />

    <Text style={styles.fieldLabel}>{t('adminVenues.rankLabel')} *</Text>
    <TextInput
      style={styles.input}
      value={form?.rank ?? ''}
      onChangeText={(v) => setField('rank', v.replace(/[^0-9]/g, ''))}
      placeholder="1"
      placeholderTextColor={COLORS.textMuted}
      keyboardType="number-pad"
    />

    <Text style={styles.fieldLabel}>{t('adminVenues.categoryLabel')}</Text>
    <View style={styles.catRow}>
      {CATS.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={[styles.catChip, form?.category === c.id && { backgroundColor: c.pinColor, borderColor: c.pinColor }]}
          onPress={() => setField('category', c.id)}
        >
          <Text style={[styles.catChipText, form?.category === c.id && styles.catChipTextActive]}>
            {c.emoji}
          </Text>
        </TouchableOpacity>
      ))}
    </View>

    <View style={styles.formBtns}>
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color={COLORS.black} size="small" />
          : <Text style={styles.saveBtnText}>{t('adminVenues.save')}</Text>
        }
      </TouchableOpacity>
    </View>
  </View>
);

const AdminTopVenuesScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | { ...BLANK, id?: string }
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getTopVenues();
    if (!error) setVenues(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => setForm({ ...BLANK });
  const openEdit = (v) => setForm({
    id: v.id,
    name: v.name,
    address: v.address ?? '',
    description: v.description ?? '',
    rank: String(v.rank),
    category: v.category ?? 'eat',
  });
  const cancelForm = () => setForm(null);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('adminVenues.nameRequired'));
      return;
    }
    const rankNum = parseInt(form.rank, 10);
    if (!rankNum || rankNum < 1) {
      Alert.alert(t('common.error'), t('adminVenues.rankRequired'));
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      description: form.description.trim() || null,
      rank: rankNum,
      category: form.category,
    };
    const { error } = form.id
      ? await updateTopVenue(form.id, payload)
      : await createTopVenue(payload);
    setSaving(false);
    if (error) {
      Alert.alert(t('common.error'), t('adminVenues.saveFailed'));
    } else {
      setForm(null);
      load();
    }
  };

  const handleDelete = (venue) => {
    Alert.alert(
      t('adminVenues.deleteTitle'),
      t('adminVenues.deleteDesc', { name: venue.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('adminVenues.delete'), style: 'destructive',
          onPress: async () => {
            setDeletingId(venue.id);
            await deleteTopVenue(venue.id);
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
        title={t('adminVenues.title')}
        onBack={() => navigation.goBack()}
        right={!form ? (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ {t('adminVenues.addBtn')}</Text>
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
          data={venues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>{t('adminVenues.empty')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cat = VENUE_CATEGORIES.find((c) => c.id === item.category);
            const isDeleting = deletingId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.medal}>{MEDALS[item.rank - 1] ?? `#${item.rank}`}</Text>
                  <View style={styles.cardInfo}>
                    <Text style={styles.venueName}>{item.name}</Text>
                    {!!item.address && <Text style={styles.venueAddr}>📍 {item.address}</Text>}
                    {!!item.description && <Text style={styles.venueDesc}>{item.description}</Text>}
                  </View>
                  {cat && (
                    <View style={[styles.catBadge, { borderColor: cat.pinColor }]}>
                      <Text style={{ fontSize: 16 }}>{cat.emoji}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                    <Text style={styles.editBtnText}>{t('adminVenues.edit')}</Text>
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
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  catChipText: { fontSize: 18 },
  catChipTextActive: { color: COLORS.black },
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
  medal: { fontSize: 26, marginRight: 10, lineHeight: 32 },
  cardInfo: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  venueAddr: { fontSize: 12, color: COLORS.textMuted, marginBottom: 3 },
  venueDesc: { fontSize: 12, color: COLORS.textLight, lineHeight: 17 },
  catBadge: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, justifyContent: 'center', alignItems: 'center',
    marginLeft: 8,
  },
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

export default AdminTopVenuesScreen;
