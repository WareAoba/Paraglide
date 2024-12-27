import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

const { ipcRenderer } = window.require('electron');

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
  zh: { translation: zh }
};

// 초기 언어 설정 가져오기 
const getInitialLanguage = async () => {
  try {
    const settings = await ipcRenderer.invoke('load-settings');
    if (!settings) throw new Error('설정 로드 실패');

    const savedLanguage = settings.language || 'auto';
    console.log('[i18n] 저장된 언어 설정:', savedLanguage);
    
    const effectiveLanguage = savedLanguage === 'auto' 
      ? navigator.language.split('-')[0]  // 시스템 언어 사용
      : savedLanguage;

    console.log('[i18n] 적용될 언어:', effectiveLanguage);
    return effectiveLanguage;
  } catch (error) {
    console.error('[i18n] 초기 언어 설정 로드 실패:', error);
    const fallbackLang = navigator.language.split('-')[0];
    console.log('[i18n] 폴백 언어 사용:', fallbackLang);
    return fallbackLang;
  }
};

// renderer 프로세스용 i18next 초기화
getInitialLanguage().then(language => {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false
      }
    });
});

// 언어 변경 이벤트 리스너
ipcRenderer.on('language-changed', (_, newLang) => {
  if (i18n.isInitialized) {
    i18n.changeLanguage(newLang);
  }
});

export default i18n;