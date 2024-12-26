import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

const getSystemLanguage = () => {
  const osLang = navigator.language || navigator.userLanguage;
  // 'ja-JP' -> 'ja' 형식으로 변환
  const browserLang = osLang.split('-')[0];
  
  // 지원하는 언어 목록
  const supportedLangs = ['ko', 'en', 'ja'];
  
  return supportedLangs.includes(browserLang) ? browserLang : 'en';
};

const updateHtmlLang = (lng) => {
  document.documentElement.setAttribute('lang', lng);
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja }
    },
    lng: getSystemLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  }).then(() => {
    // 초기 언어 설정시 html lang 속성 업데이트
    updateHtmlLang(i18n.language);
  });

// 언어 변경 이벤트 리스너 추가
i18n.on('languageChanged', (lng) => {
  updateHtmlLang(lng);
});

export default i18n;