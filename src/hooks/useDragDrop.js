// src/hooks/useDragDrop.js — 드래그&드롭 로직 커스텀 훅
import { useCallback } from 'react';
import useAppStore from '../stores/useAppStore';

const { ipcRenderer } = window.require('electron');

export default function useDragDrop() {
  const { ProgramStatus } = useAppStore.getState();
  const setDragging = useAppStore((s) => s.setDragging);
  const setDragCounter = useAppStore((s) => s.setDragCounter);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
  }, [setDragCounter]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev - 1);
  }, [setDragCounter]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(0);
    setDragging(false);

    const { programStatus } = useAppStore.getState();
    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find((file) => file.name.endsWith('.txt'));

    if (txtFile) {
      try {
        const filePath = txtFile.path;

        if (programStatus === ProgramStatus.EDIT) {
          const content = await ipcRenderer.invoke('read-file', filePath);
          useAppStore.setState({
            currentFilePath: filePath,
            programStatus: ProgramStatus.EDIT,
            viewMode: 'editor'
          });
          ipcRenderer.send('update-state', {
            currentFilePath: filePath,
            programStatus: ProgramStatus.EDIT
          });
        } else {
          const result = await ipcRenderer.invoke('open-file', {
            filePath,
            source: 'drag-drop',
          });

          if (result.success) {
            const newState = await ipcRenderer.invoke('get-state');
            useAppStore.getState().updateAfterFileLoad(newState);
          }
        }
      } catch (error) {
        console.error('파일 로드 실패:', error);
      }
    }
  }, [ProgramStatus, setDragCounter, setDragging]);

  return { handleDragOver, handleDragEnter, handleDragLeave, handleDrop };
}
