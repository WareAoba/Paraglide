// store/slices/logSlice.js
const { createSlice } = require('@reduxjs/toolkit');

const logSlice = createSlice({
    name: 'log',
    initialState: {
      logs: [],
      filter: 'all'
    },
    reducers: {
      addLog: (state, action) => {
        state.logs.push(action.payload);
      },
      clearLogs: (state) => {
        state.logs = [];
      }
    }
});

module.exports = {
    logReducer: logSlice.reducer,
    logActions: logSlice.actions
};