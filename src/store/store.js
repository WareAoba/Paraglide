// src/store/store.js
const { configureStore } = require('@reduxjs/toolkit');
const { textProcessReducer } = require('./slices/textProcessSlice');

const store = configureStore({
  reducer: {
    textProcess: textProcessReducer
  }
});

module.exports = store;