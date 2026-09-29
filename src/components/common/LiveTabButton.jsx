import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { captureLiveMedia } from '../../lib/liveCapture';

// A "Live" segment styled to match the feed toggle bars. Tapping it opens the
// native camera and, on a successful capture, navigates to `createRoute` with
// the shot pre-attached via route params: { prefill: { mediaUri, isVideo, ...extraParams } }.
export const LiveTabButton = ({ navigation, createRoute, extraParams = {}, disabled }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    const media = await captureLiveMedia();
    setBusy(false);
    if (!media) return;
    navigation.navigate(createRoute, {
      ...extraParams,
      prefill: { ...extraParams, mediaUri: media.uri, isVideo: media.isVideo },
    });
  };

  return (
    <TouchableOpacity
      style={[styles.toggleBtn, styles.liveBtn]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <Text style={[styles.toggleText, styles.liveText]}>📷 {t('common.live')}</Text>
      )}
    </TouchableOpacity>
  );
};

// Standalone bar for feeds that have no existing toggle bar: [ label | 📷 Live ].
export const LiveTabBar = ({ navigation, createRoute, extraParams, label }) => (
  <View style={styles.bar}>
    <View style={[styles.toggleBtn, styles.toggleBtnActive]}>
      <Text style={[styles.toggleText, styles.toggleTextActive]}>{label}</Text>
    </View>
    <LiveTabButton navigation={navigation} createRoute={createRoute} extraParams={extraParams} />
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', margin: 16, marginBottom: 4,
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.borderAccent, overflow: 'hidden',
  },
  toggleBtn: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  toggleTextActive: { color: COLORS.black },
  liveBtn: { flexDirection: 'row', gap: 6 },
  liveText: { color: COLORS.primary },
});
