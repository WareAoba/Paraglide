import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

const getSystemLanguage = () => {
  const osLang = navigator.language || navigator.userLanguage;
  const browserLang = osLang.split('-')[0];
  const supportedLangs = ['ko', 'en', 'ja'];
  return supportedLangs.includes(browserLang) ? browserLang : 'en';
};

const updateHtmlLang = (lng) => {
  document.documentElement.setAttribute('lang', lng);
};

// 설정에서 언어 가져오기
const getConfigLanguage = () => {
  // electron store에서 설정 가져오기
  const configLanguage = window.electron?.store?.getState()?.config?.language || 'auto';
  return configLanguage === 'auto' ? getSystemLanguage() : configLanguage;
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja }
    },
    lng: getConfigLanguage(), // 설정된 언어 사용
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

i18n.on('languageChanged', (lng) => {
  updateHtmlLang(lng);
});

export default i18n;