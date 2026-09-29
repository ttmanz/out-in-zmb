import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { COLORS } from '../../constants/colors';
import { PARTICIPATION_OPTIONS } from '../../lib/cashback';
import { setParticipation } from '../../lib/profile';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const ALL_KEYS = PARTICIPATION_OPTIONS.map((o) => o.key);

const ParticipationScreen = ({ navigation }) => {
  const { profile, refreshProfile } = useUser();
  const [selected, setSelected] = useState(profile?.participation ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (key) =>
    setSelected((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      return ALL_KEYS.filter((k) => next.includes(k));
    });

  const handleSave = async () => {
    setSaving(true);
    const { error } = await setParticipation(profile.id, selected);
    if (error) {
      setSaving(false);
      Alert.alert('Error', error.message ?? 'Could not save your choices. Please try again.');
      return;
    }
    await refreshProfile();
    setSaving(false);
    navigation.goBack();
  };

  return (
    <View style={styles.safe}>
      <BackHeader title="Participation" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Choose which rewards your venue offers. Customers only see the ones you tick. You set the percentage for each
          under Cash Back & Credit, and you can change this any time.
        </Text>

        {PARTICIPATION_OPTIONS.map((o) => {
          const on = selected.includes(o.key);
          return (
            <TouchableOpacity key={o.key} onPress={() => toggle(o.key)} activeOpacity={0.85}>
              <GradientBorder radius={14} style={styles.cardOuter}>
                <View style={[styles.card, on && styles.cardOn]}>
                  <Text style={styles.emoji}>{o.emoji}</Text>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{o.label}</Text>
                    <Text style={styles.cardDesc}>{o.desc}</Text>
                  </View>
                  <Text style={[styles.box, on && styles.boxOn]}>{on ? '✓' : ''}</Text>
                </View>
              </GradientBorder>
            </TouchableOpacity>
          );
        })}

        {selected.length === 0 && (
          <Text style={styles.warning}>
            With nothing ticked your venue offers no rewards, so customers won't see it.
          </Text>
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  intro: { fontSize: 13, color: COLORS.textLight, lineHeight: 19, marginBottom: 16 },
  cardOuter: { marginBottom: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 13.5, padding: 14,
  },
  cardOn: { backgroundColor: COLORS.surfaceAlt },
  emoji: { fontSize: 26, marginRight: 12 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 2, lineHeight: 17 },
  box: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.borderAccent,
    textAlign: 'center', lineHeight: 23, fontSize: 16, fontWeight: '800', color: COLORS.black, overflow: 'hidden',
  },
  boxOn: { backgroundColor: COLORS.primary },
  warning: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, lineHeight: 17 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
});

export default ParticipationScreen;
