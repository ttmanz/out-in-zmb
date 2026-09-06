import React, { useState } from 'react';
import { View, Text, ScrollView, ImageBackground, StyleSheet, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { signUpWithEmail, signInWithGoogle, signInWithApple } from '../../lib/auth';
import AuthInput from '../../components/auth/AuthInput';
import SocialButton from '../../components/auth/SocialButton';
import PrimaryButton from '../../components/common/PrimaryButton';
import Divider from '../../components/common/Divider';

const validateRegister = (fullName, email, password, confirmPassword, t) => {
  if (!fullName.trim()) return t('auth.errors.fullNameRequired');
  if (!email || !/\S+@\S+\.\S+/.test(email)) return t('auth.errors.invalidEmail');
  if (!password || password.length < 6) return t('auth.errors.passwordTooShort');
  if (password !== confirmPassword) return t('auth.errors.passwordMismatch');
  return null;
};

const RegisterScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);

  const handleRegister = async () => {
    const error = validateRegister(fullName, email, password, confirmPassword, t);
    if (error) { setFieldError(error); return; }
    setFieldError('');
    setLoading(true);
    const { error: authError } = await signUpWithEmail(email, password, fullName);
    setLoading(false);
    if (authError) {
      Alert.alert(t('auth.errors.registerFailed'), authError.message);
    } else {
      Alert.alert(
        'Welcome! 🎉',
        'Your account is ready.\n\nTo unlock full access, please complete your profile — it only takes a minute.',
        [{ text: 'Complete Profile', style: 'default' }]
      );
      navigation.navigate(ROUTES.LOGIN);
    }
  };

  const handleSocialLogin = async (provider, loginFn) => {
    setSocialLoading(provider);
    const { error } = await loginFn();
    setSocialLoading(null);
    if (error) Alert.alert(t('common.error'), error.message);
  };

  return (
    <ImageBackground source={require('../../../assets/brand/bg.png')} style={styles.bg} resizeMode="cover">
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('common.appName')}</Text>
      <Text style={styles.subtitle}>{t('auth.register')}</Text>

      <AuthInput
        label={t('auth.fullName')}
        placeholder={t('auth.fullNamePlaceholder')}
        value={fullName}
        onChangeText={setFullName}
        error={fieldError}
      />
      <AuthInput
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <AuthInput
        label={t('auth.password')}
        placeholder={t('auth.passwordPlaceholder')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <AuthInput
        label={t('auth.confirmPassword')}
        placeholder={t('auth.confirmPasswordPlaceholder')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      <PrimaryButton label={t('auth.register')} onPress={handleRegister} loading={loading} />

      <Divider label={t('common.or')} />

      <SocialButton
        label={t('auth.continueWithGoogle')}
        color={COLORS.google}
        onPress={() => handleSocialLogin('google', signInWithGoogle)}
        loading={socialLoading === 'google'}
      />
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={10}
          style={styles.appleBtn}
          onPress={() => handleSocialLogin('apple', signInWithApple)}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.hasAccount')} </Text>
        <Text style={styles.link} onPress={() => navigation.navigate(ROUTES.LOGIN)}>
          {t('auth.loginHere')}
        </Text>
      </View>
    </ScrollView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.primary, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 18, color: COLORS.textMuted, textAlign: 'center', marginBottom: 32 },
  appleBtn: { height: 46, marginBottom: 12 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: COLORS.textMuted, fontSize: 14 },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});

export default RegisterScreen;
