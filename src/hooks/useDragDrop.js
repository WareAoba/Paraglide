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
    const txtFile = files.find((file) => file.name.endsWith('.txt') || file.name.endsWith('.para'));
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

    if (txtFile) {
      try {
        const filePath = txtFile.path;

        if (programStatus === ProgramStatus.EDIT) {
          useAppStore.setState({
            currentFilePath: filePath,
            programStatus: ProgramStatus.EDIT,
            viewMode: 'editor'
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
    } else if (programStatus === ProgramStatus.EDIT) {
      // EDIT 모드에서 이미지 파일 드롭 → 커스텀 이벤트로 에디터에 전달
      const path = window.require('path');
      const imageFilePaths = files
        .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f.name).toLowerCase()))
        .map(f => f.path);
      if (imageFilePaths.length > 0) {
        window.dispatchEvent(new CustomEvent('editor-load-images', { detail: imageFilePaths }));
      }
    }
  }, [ProgramStatus, setDragCounter, setDragging]);

  return { handleDragOver, handleDragEnter, handleDragLeave, handleDrop };
}
