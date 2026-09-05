import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { signInWithEmail, signInWithGoogle, signInWithApple } from '../../lib/auth';
import AuthInput from '../../components/auth/AuthInput';
import SocialButton from '../../components/auth/SocialButton';
import PrimaryButton from '../../components/common/PrimaryButton';
import Divider from '../../components/common/Divider';

const validateLogin = (email, password, t) => {
  if (!email || !/\S+@\S+\.\S+/.test(email)) return t('auth.errors.invalidEmail');
  if (!password || password.length < 6) return t('auth.errors.passwordTooShort');
  return null;
};

const LoginScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);

  const handleEmailLogin = async () => {
    const error = validateLogin(email, password, t);
    if (error) { setFieldError(error); return; }
    setFieldError('');
    setLoading(true);
    try {
      const { error: authError } = await signInWithEmail(email, password);
      if (authError) {
        Alert.alert(t('auth.errors.loginFailed'), authError.message);
      }
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider, loginFn) => {
    setSocialLoading(provider);
    const { error } = await loginFn();
    setSocialLoading(null);
    if (error) Alert.alert(t('common.error'), error.message);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('common.appName')}</Text>
      <Text style={styles.subtitle}>{t('auth.login')}</Text>

      <AuthInput
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        error={fieldError}
      />
      <AuthInput
        label={t('auth.password')}
        placeholder={t('auth.passwordPlaceholder')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <PrimaryButton label={t('auth.login')} onPress={handleEmailLogin} loading={loading} />

      <Divider label={t('common.or')} />

      <SocialButton
        label={t('auth.continueWithGoogle')}
        color={COLORS.google}
        onPress={() => handleSocialLogin('google', signInWithGoogle)}
        loading={socialLoading === 'google'}
      />
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={10}
          style={styles.appleBtn}
          onPress={() => handleSocialLogin('apple', signInWithApple)}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
        <Text style={styles.link} onPress={() => navigation.navigate(ROUTES.REGISTER)}>
          {t('auth.signUpHere')}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: COLORS.background, justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.primary, textAlign: 'center', marginBottom: 36, letterSpacing: 1.5 },
  appleBtn: { height: 46, marginBottom: 12 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: COLORS.textMuted, fontSize: 14 },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});

export default LoginScreen;
