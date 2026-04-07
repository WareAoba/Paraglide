// src/hooks/useDragDrop.js — 드래그&드롭 로직 커스텀 훅
import { useCallback } from 'react';
import useAppStore from '../stores/useAppStore';
import { ProgramStatus } from '../constants';

const { ipcRenderer } = window.require('electron');

export default function useDragDrop() {
  const setDragging = useAppStore((s) => s.setDragging);
  const setDragCounter = useAppStore((s) => s.setDragCounter);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    setDragCounter((prev) => prev + 1);
  }, [setDragCounter]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    setDragCounter((prev) => prev - 1);
  }, [setDragCounter]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    setDragCounter(0);
    setDragging(false);

    const { programStatus, isEditorSaved } = useAppStore.getState();
    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find((file) => file.name.endsWith('.txt') || file.name.endsWith('.para'));
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.psd'];
    const pathModule = window.require('path');

    // EDIT 모드에서 미저장 경고
    if (programStatus === ProgramStatus.EDIT && !isEditorSaved) {
      const saveChoice = await ipcRenderer.invoke('show-dialog', 'UNSAVED_CHANGES');
      if (saveChoice === 1) return;
    }

    if (txtFile) {
      try {
        const filePath = txtFile.path;

        if (programStatus === ProgramStatus.EDIT) {
          // EDIT 모드: 파일 내용을 실제로 로드하여 에디터에 반영
          const readResult = await ipcRenderer.invoke('read-file-decrypted', filePath);
          if (!readResult.success) return;
          await ipcRenderer.invoke('process-file-content', readResult.content, filePath);
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
    } else {
      const imageFilePaths = files
        .filter(f => IMAGE_EXTENSIONS.includes(pathModule.extname(f.name).toLowerCase()))
        .map(f => f.path);
      if (imageFilePaths.length > 0) {
        if (programStatus === ProgramStatus.EDIT) {
          // EDIT 모드 → 커스텀 이벤트로 에디터에 전달
          window.dispatchEvent(new CustomEvent('editor-load-images', { detail: imageFilePaths }));
        } else {
          // 메인 화면 → 스토어에 저장 후 에디터 전환 (에디터가 마운트되면 소비)
          useAppStore.setState({
            pendingImagePaths: imageFilePaths,
            programStatus: ProgramStatus.EDIT,
          });
        }
      }
    }
  }, [setDragCounter, setDragging]);

  return { handleDragOver, handleDragEnter, handleDragLeave, handleDrop };
}
