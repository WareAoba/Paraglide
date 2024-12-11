// src/store/store.js
const { configureStore } = require('@reduxjs/toolkit');
const { textProcessReducer } = require('./slices/textProcessSlice');
const { configReducer } = require('./slices/configSlice');

const store = configureStore({
  reducer: {
    textProcess: textProcessReducer,
    config: configReducer
  }
});

module.exports = store;