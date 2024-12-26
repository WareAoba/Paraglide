// src/i18n/index.js 생성
const i18next = require('i18next');

const resources = {
  ko: {
    translation: require('./locales/ko.json')
  },
  en: {
    translation: require('./locales/en.json')
  },
  ja: {
    translation: require('./locales/ja.json')
  }
};

i18next.init({
  resources,
  lng: 'ko', // 기본 언어
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

module.exports = i18next;