import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fr', label: 'Français', short: 'FR' },
];

export const LANGUAGE_STORAGE_KEY = 'stayora.language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    // English is the product default; only an explicit choice is persisted.
    lng: localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export function changeLanguage(code) {
  i18n.changeLanguage(code);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  document.documentElement.lang = code;
}

document.documentElement.lang = i18n.language || 'en';

export default i18n;
