import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { fetchNearbyVenues, getPinColor } from '../../lib/venues';
import { getHappenings } from '../../lib/happenings';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';

const DEFAULT_REGION = {
  latitude: 34.9,
  longitude: 33.1,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const WhereToGoScreen = ({ navigation }) => {
  useFeatureGate('where_to_go');
  const { t } = useTranslation();
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [venues, setVenues] = useState([]);
  const [happenings, setHappenings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(null);

    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    let locationResult = null;
    if (permStatus === 'granted') {
      try {
        locationResult = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        locationResult = null;
      }
    }
    const happeningsRes = await getHappenings();

    if (!happeningsRes.error) setHappenings(happeningsRes.data ?? []);

    // Without GPS, still show venues — search a wider radius around the default area
    const center = locationResult
      ? locationResult.coords
      : { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude };
    if (locationResult) {
      setRegion({ ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    }
    try {
      setVenues(await fetchNearbyVenues(center.latitude, center.longitude, locationResult ? 1500 : 8000));
    } catch {
      setVenues([]);
    }

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Loose two-way match — members rarely type a venue name exactly as OSM has it
  const memberCount = (venueName) => {
    const name = venueName.toLowerCase();
    return happenings.filter((h) => {
      if (!h.venue) return false;
      const posted = h.venue.toLowerCase();
      return posted.includes(name) || name.includes(posted);
    }).length;
  };

  return (
    <View style={styles.safe}>
      <BackHeader title={t('venues.title')} onBack={() => navigation.goBack()} />

      <AdBanner page="WhereToGo" />
      <ProfileBanner navigation={navigation} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('venues.loading')}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <MapView
            style={styles.map}
            region={region}
            onRegionChangeComplete={setRegion}
            showsUserLocation
            showsMyLocationButton
            onPress={() => setSelected(null)}
          >
            {venues.map((venue) => (
              <Marker
                key={venue.id}
                coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
                pinColor={getPinColor(venue.category)}
                onPress={() => setSelected(venue)}
              />
            ))}
          </MapView>

          {selected && (
            <View style={styles.card}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
              <Text style={styles.venueName}>{selected.name}</Text>
              <Text style={styles.venueType}>{selected.type}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  👥 {memberCount(selected.name)} {t('venues.membersHere')}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  map: { flex: 1 },
  card: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: COLORS.borderAccent,
    padding: 14,
    paddingBottom: 20,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  closeBtn: { position: 'absolute', top: 16, right: 20 },
  closeText: { fontSize: 26, color: COLORS.textMuted, lineHeight: 30 },
  venueName: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4, marginRight: 30 },
  venueType: { fontSize: 13, color: COLORS.textMuted, textTransform: 'capitalize', marginBottom: 16 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(253,171,83,0.12)',
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  badgeText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
});

export default WhereToGoScreen;
