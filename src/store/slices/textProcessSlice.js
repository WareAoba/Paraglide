// src/store/slices/textProcessSlice.js
const { createSlice } = require('@reduxjs/toolkit');
const { TextProcessUtils } = require('../utils/TextProcessUtils');

const initialState = {
  paragraphs: [],
  paragraphsMetadata: [],
  currentFilePath: null,  // 추가
  currentNumber: null,
  currentParagraph: 0,
  processMode: 'paragraph'
};

const textProcessSlice = createSlice({
  name: 'textProcess',
  initialState,
  reducers: {
    updateContent(state, action) {
      state.paragraphs = action.payload.paragraphs;
      state.paragraphsMetadata = action.payload.paragraphsMetadata;
      state.currentNumber = action.payload.currentNumber;
      state.processMode = action.payload.processMode;
      state.currentFilePath = action.payload.currentFilePath;
    },
    updateCurrentParagraph(state, action) {
      state.currentParagraph = action.payload;
    },
    updateProcessMode(state, action) { // 추가된 리듀서
      state.processMode = action.payload;
    }
  }
});

module.exports = {
  textProcessReducer: textProcessSlice.reducer,
  textProcessActions: textProcessSlice.actions
};