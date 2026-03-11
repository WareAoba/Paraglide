// LanguageManager.js — i18next 초기화/언어 변경
const { app, BrowserWindow } = require('electron');
const i18next = require('i18next');
const { state } = require('../state');

// i18n 로케일 파일
const ko = require('../../i18n/locales/ko.json');
const en = require('../../i18n/locales/en.json');
const ja = require('../../i18n/locales/ja.json');
const zh = require('../../i18n/locales/zh.json');

const LanguageManager = {
// i18next 초기화 함수
async initializeI18n() {
  try {
    const config = state.config;
    const savedLanguage = config.language;
    
    console.log('[Main] 저장된 언어 설정:', savedLanguage);
    
    const effectiveLanguage = savedLanguage === 'auto' 
      ? app.getLocale().split('-')[0] 
      : savedLanguage;

    // 지원 언어 확인 및 기본값 설정
    const supportedLanguages = ['ko', 'en', 'ja', 'zh'];
    const finalLanguage = supportedLanguages.includes(effectiveLanguage) 
      ? effectiveLanguage 
      : 'en';  // 기본값을 'en'으로 변경

    // i18next 초기화
    await i18next.init({
      lng: finalLanguage,
      fallbackLng: 'en',
      resources: {
        ko: { translation: ko },
        en: { translation: en },
        ja: { translation: ja },
        zh: { translation: zh }
      },
      interpolation: {
        escapeValue: false
      },
      initImmediate: false
    });

    console.log('[Main] i18next 초기화 완료:', finalLanguage);
    return true;
  } catch (error) {
    console.error('[Main] i18n 초기화 실패:', error);
    return false;
  }
},

async changeLanguage(lang) {
  try {
    // 초기화되지 않았다면 재초기화
    if (!i18next.isInitialized) {
      const initResult = await this.initializeI18n();
      if (!initResult) {
        throw new Error('i18next 재초기화 실패');
      }
    }

    const effectiveLang = lang === 'auto' ? 
      app.getLocale().split('-')[0] : 
      lang;

    await i18next.changeLanguage(effectiveLang);
    
    state.updateLanguage(lang);

    // Lazy require to avoid circular dependency
    const FileManager = require('./FileManager');
    await FileManager.saveConfig({ language: lang });

    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('language-changed', effectiveLang);
      }
    });

    console.log('[Main] 언어 변경 성공:', effectiveLang);
    return true;
  } catch (error) {
    console.error('[Main] 언어 변경 실패:', error);
    return false;
  }
}
};

module.exports = LanguageManager;
