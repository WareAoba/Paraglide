// DialogManager.js — 다이얼로그 표시
const { dialog } = require('electron');
const i18next = require('i18next');
const { state } = require('../state');

const DialogManager = {
  DIALOGS: {
    EXIT_CONFIRM: 'EXIT_CONFIRM',
    UNSAVED_CHANGES: 'UNSAVED_CHANGES',
    FILE_ERROR: 'FILE_ERROR',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    EMPTY_FILE: 'EMPTY_FILE',
    PROCESS_MODE: 'PROCESS_MODE',
    ALREADY_RUNNING: 'ALREADY_RUNNING',
    SWITCH_TO_EXISTING: 'SWITCH_TO_EXISTING',
    FILE_OPEN_ERROR: 'FILE_OPEN_ERROR'
  },

  async show(dialogType, window = state.mainWindow) {
    const defaultOptions = { noLink: true };

    switch (dialogType) {
      case this.DIALOGS.EXIT_CONFIRM:
        return dialog.showMessageBoxSync(window, {
          type: 'warning',
          buttons: [i18next.t('common.buttons.exit'), i18next.t('common.buttons.cancel')],
          defaultId: 1,
          title: i18next.t('dialogs.exitConfirm.title'),
          message: i18next.t('dialogs.exitConfirm.message'),
          cancelId: 1,
          ...defaultOptions
        });

        case this.DIALOGS.UNSAVED_CHANGES:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.exit'), i18next.t('common.buttons.cancel')],
            defaultId: 1,
            title: i18next.t('dialogs.unsavedChanges.title'),
            message: i18next.t('dialogs.unsavedChanges.message'),
            cancelId: 1,
            ...defaultOptions
          });

        case this.DIALOGS.FILE_ERROR:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: i18next.t('dialogs.fileError.title'),
            message: i18next.t('dialogs.fileError.message'),
            ...defaultOptions
          });

        case this.DIALOGS.FILE_NOT_FOUND:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: i18next.t('dialogs.fileNotFound.title'),
            message: i18next.t('dialogs.fileNotFound.message'),
            ...defaultOptions
          });

        case this.DIALOGS.EMPTY_FILE:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 1,
            title: i18next.t('dialogs.emptyFile.title'),
            message: i18next.t('dialogs.emptyFile.message'),
            cancelId: 1,
            normalizeAccessKeys: true,
            ...defaultOptions
          });

        case this.DIALOGS.PROCESS_MODE:
          return dialog.showMessageBox(window, {
            type: 'question',
            buttons: [i18next.t('common.buttons.confirm'), i18next.t('common.buttons.cancel')],
            defaultId: 0,
            title: i18next.t('dialogs.processMode.title'),
            message: i18next.t('dialogs.processMode.message'),
            ...defaultOptions
          });

        case this.DIALOGS.ALREADY_RUNNING:
          return dialog.showMessageBoxSync({
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            title: i18next.t('dialogs.alreadyRunning.title'),
            message: i18next.t('dialogs.alreadyRunning.message'),
            detail: i18next.t('dialogs.alreadyRunning.detail'),
            cancelId: 1,
            normalizeAccessKeys: true,
            ...defaultOptions
          });

        case this.DIALOGS.SWITCH_TO_EXISTING:
          return dialog.showMessageBox(window, {
            type: 'info',
            buttons: [i18next.t('common.buttons.confirm')],
            title: i18next.t('dialogs.switchToExisting.title'),
            message: i18next.t('dialogs.switchToExisting.message'),
            detail: i18next.t('dialogs.switchToExisting.detail'),
            cancelId: 1,
            normalizeAccessKeys: true,
            ...defaultOptions
          });

        case this.DIALOGS.FILE_OPEN_ERROR:
          return dialog.showMessageBox(window, {
            type: 'error',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: i18next.t('dialogs.fileOpenError.title'),
            message: i18next.t('dialogs.fileOpenError.message'),
            ...defaultOptions
          });

          default:
        throw new Error(`Unknown dialog type: ${dialogType}`);
    }
  }
};

module.exports = DialogManager;
