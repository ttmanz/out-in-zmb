import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { getReports, updateReportStatus } from '../../lib/reports';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';

const STATUS_FILTERS = ['pending', 'resolved', 'dismissed', 'all'];

const STATUS_COLORS = {
  pending: COLORS.primary,
  resolved: COLORS.success,
  dismissed: COLORS.textMuted,
};

const AdminReportsScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  const load = useCallback(async (status = filter) => {
    setLoading(true);
    const { data, error } = await getReports(status === 'all' ? null : status);
    if (!error) setReports(data ?? []);
    setLoading(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (id, status) => {
    setUpdating(id);
    const { error } = await updateReportStatus(id, status);
    setUpdating(null);
    if (!error) setReports((prev) => prev.filter((r) => r.id !== id || filter === 'all'));
    if (!error && filter === 'all') load('all');
  };

  return (
    <View style={styles.safe}>
      <BackHeader title="Reports" onBack={() => navigation.goBack()} />

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No {filter === 'all' ? '' : filter + ' '}reports 🎉</Text>}
          renderItem={({ item }) => {
            const busy = updating === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.reason}>{t(`report.reasons.${item.reason}`)}</Text>
                  <Text style={[styles.status, { color: STATUS_COLORS[item.status] ?? COLORS.text }]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {item.target_type} • {formatAgo(item.created_at)} • by {item.reporter?.full_name ?? 'Unknown'}
                </Text>
                {!!item.content_excerpt && (
                  <Text style={styles.excerpt} numberOfLines={3}>"{item.content_excerpt}"</Text>
                )}
                {!!item.details && <Text style={styles.details}>{item.details}</Text>}

                {!!item.reported?.id && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('MessagesTab', {
                      screen: ROUTES.MEMBER_PROFILE,
                      params: { userId: item.reported.id, fullName: item.reported.full_name },
                      initial: false,
                    })}
                  >
                    <Text style={styles.memberLink}>👤 {item.reported.full_name ?? 'View member'}</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'pending' && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.resolveBtn]}
                      onPress={() => setStatus(item.id, 'resolved')}
                      disabled={busy}
                    >
                      {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.resolveText}>Resolve</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.dismissBtn]}
                      onPress={() => setStatus(item.id, 'dismissed')}
                      disabled={busy}
                    >
                      <Text style={styles.dismissText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  filterChipActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(253,171,83,0.12)' },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  filterTextActive: { color: COLORS.primary },
  list: { padding: 16, paddingBottom: 48 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reason: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  status: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  excerpt: { fontSize: 13, color: COLORS.textLight, fontStyle: 'italic', marginBottom: 6 },
  details: { fontSize: 13, color: COLORS.textLight, marginBottom: 6 },
  memberLink: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  resolveBtn: { backgroundColor: COLORS.primary },
  resolveText: { color: COLORS.black, fontWeight: '800', fontSize: 13 },
  dismissBtn: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt },
  dismissText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },
});

export default AdminReportsScreen;
