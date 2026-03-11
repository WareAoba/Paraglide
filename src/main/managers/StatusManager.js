// StatusManager.js — 상태 전환 유효성 검증
const { state, updateState } = require('../state');
const { ProgramStatus } = require('../constants');

const StatusManager = {
  async transition(newStatus) {
    if (!this.validateTransition(state.globalState.programStatus, newStatus)) {
      throw new Error(`Invalid transition: ${state.globalState.programStatus} -> ${newStatus}`);
    }

    if (newStatus === ProgramStatus.READY && state.mainWindow) {
      state.mainWindow.setTitle('Paraglide');
    }

    await updateState({ programStatus: newStatus, timestamp: Date.now() });
  },

  validateTransition(fromStatus, toStatus) {
    const allowedTransitions = {
      [ProgramStatus.READY]: [ProgramStatus.LOADING],
      [ProgramStatus.LOADING]: [ProgramStatus.PROCESS, ProgramStatus.READY],
      [ProgramStatus.PROCESS]: [ProgramStatus.PAUSE, ProgramStatus.READY],
      [ProgramStatus.PAUSE]: [ProgramStatus.PROCESS, ProgramStatus.READY],
      [ProgramStatus.EDIT]: [ProgramStatus.READY]
    };
    return allowedTransitions[fromStatus]?.includes(toStatus);
    
  }
};

module.exports = StatusManager;
