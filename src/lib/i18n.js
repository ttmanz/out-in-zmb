import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import { CONFIG } from '../constants/config';

const resources = {
  en: { translation: en },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: CONFIG.defaultLanguage,
    fallbackLng: CONFIG.defaultLanguage,
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
  });

export default i18n;
