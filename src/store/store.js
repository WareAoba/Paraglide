// src/store/store.js
const { configureStore } = require('@reduxjs/toolkit');
const { textProcessReducer } = require('./slices/textProcessSlice');
const { configReducer } = require('./slices/configSlice');
const { logReducer } = require('./slices/logSlice');  // 추가

const store = configureStore({
  reducer: {
    textProcess: textProcessReducer,
    config: configReducer,
    log: logReducer  // 추가
  }
});

module.exports = store;