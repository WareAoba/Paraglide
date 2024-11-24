// src/store/slices/textProcessSlice.js
const { createSlice } = require('@reduxjs/toolkit');
const { TextProcessUtils } = require('../utils/TextProcessUtils');

const initialState = {
  paragraphs: [],
  paragraphsMetadata: [],
  currentNumber: null,
  currentParagraph: 0
};

const textProcessSlice = createSlice({
  name: 'textProcess',
  initialState,
  reducers: {
    processParagraphs(state, action) {
      const result = TextProcessUtils.processParagraphs(action.payload);
      state.paragraphs = result.paragraphsToDisplay;
      state.paragraphsMetadata = result.paragraphsMetadata;
      state.currentNumber = result.currentNumber;
    },
    updateCurrentParagraph(state, action) {
      state.currentParagraph = action.payload;
      state.currentNumber = state.paragraphsMetadata[action.payload]?.pageNumber || null;
    }
  }
});

module.exports = {
  textProcessReducer: textProcessSlice.reducer,
  textProcessActions: textProcessSlice.actions
};