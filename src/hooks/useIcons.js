// src/hooks/useIcons.js — 아이콘 로딩 커스텀 훅 (23개 useState → 1개 객체)
import { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

const ICON_NAMES = [
  'play.svg',
  'pause.svg',
  'terminal-tag.svg',
  'settings.svg',
  'sidebar.svg',
  'home.svg',
  'eyes.svg',
  'eyes-off.svg',
  'sidebar-unfold.svg',
  'search.svg',
  'page-jump.svg',
  'text-file.svg',
  'delete.svg',
  'theme-auto.svg',
  'theme-light.svg',
  'theme-dark.svg',
  'file-open.svg',
  'edit.svg',
  'go-back.svg',
  'folder.svg',
  'finder.svg',
  'new-file.svg',
  'file-work.svg',
  'photoshop.svg',
  'save.svg',
  'zoom_in.svg',
  'zoom_out.svg',
  'text-add.svg',
  'paragraph-left.svg',
  'paragraph-center.svg',
  'paragraph-right.svg',
  'locate.svg',
  'automation.svg',
  'image-add.svg',
  'font-style.svg',
  'database.svg'
];

const ICON_KEYS = [
  'play', 'pause', 'terminal', 'settings', 'sidebar', 'home',
  'eye', 'eyeOff', 'sidebarUnfold', 'search', 'pageJump',
  'textFile', 'delete', 'themeAuto', 'themeLight', 'themeDark',
  'fileOpen', 'edit', 'back', 'folder', 'finder', 'newFile', 'fileWork',
  'photoshop', 'save', 'zoomIn', 'zoomOut', 'textAdd',
  'paragraphLeft', 'paragraphCenter', 'paragraphRight', 'locate', 'automation',
  'imageAdd', 'fontStyle', 'database'
];

export default function useIcons() {
  const [icons, setIcons] = useState({});

  useEffect(() => {
    const loadIcons = async () => {
      try {
        const iconPaths = await Promise.all(
          ICON_NAMES.map((name) => ipcRenderer.invoke('get-icon-path', name))
        );

        const iconMap = {};
        ICON_KEYS.forEach((key, i) => {
          iconMap[key] = iconPaths[i];
        });

        setIcons(iconMap);
      } catch (error) {
        console.error('아이콘 로드 실패:', error);
      }
    };

    loadIcons();
  }, []);

  return icons;
}
