import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { submitReport, REPORT_REASONS } from '../../lib/reports';

// Shared "Report" dialog for any content type or member.
// Usage: keep { targetType, targetId, reportedUserId, contentExcerpt } in
// state and render <ReportModal target={target} onClose={() => setTarget(null)} />
const ReportModal = ({ target, onClose }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => { setReason(null); setDetails(''); setSending(false); setDone(false); };
  const close = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!reason || sending) return;
    setSending(true);
    const { error } = await submitReport({
      targetType: target.targetType,
      targetId: target.targetId,
      reportedUserId: target.reportedUserId ?? null,
      reason,
      details: details.trim() || null,
      contentExcerpt: target.contentExcerpt ?? null,
    });
    setSending(false);
    if (!error) setDone(true);
  };

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={styles.sheet}>
          {done ? (
            <>
              <Text style={styles.title}>✅ {t('report.thanksTitle')}</Text>
              <Text style={styles.subtitle}>{t('report.thanksBody')}</Text>
              <TouchableOpacity style={styles.submitBtn} onPress={close}>
                <Text style={styles.submitText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>🚩 {t('report.title')}</Text>
              <Text style={styles.subtitle}>{t('report.subtitle')}</Text>

              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.option, reason === r && styles.optionSelected]}
                  onPress={() => setReason(r)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, reason === r && styles.optionTextSelected]}>
                    {t(`report.reasons.${r}`)}
                  </Text>
                </TouchableOpacity>
              ))}

              <TextInput
                style={styles.input}
                placeholder={t('report.detailsPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={500}
              />

              <TouchableOpacity
                style={[styles.submitBtn, !reason && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!reason || sending}
              >
                {sending
                  ? <ActivityIndicator color={COLORS.black} />
                  : <Text style={styles.submitText}>{t('report.submit')}</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={close}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: COLORS.surface, borderRadius: 18, padding: 22,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 18 },
  option: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: 'rgba(253,171,83,0.12)' },
  optionText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  optionTextSelected: { color: COLORS.primary },
  input: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, fontSize: 14, minHeight: 70, textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },
});

export default ReportModal;
