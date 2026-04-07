import React from 'react';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../stores/useAppStore';
import useIconStore from '../../stores/useIconStore';
import '../../CSS/Views/Welcome.css';

function Welcome({ onLoadFile, onNewFile }) {
  const { t } = useTranslation();
  const logoPath = useAppStore((s) => s.logoPath);
  const titlePath = useAppStore((s) => s.titlePath);
  const theme = useAppStore((s) => s.theme);
  const icons = useIconStore((s) => s.icons);

  return (
    <div className="welcome-screen" data-theme={theme.mode}>
      <div className="logo-container">
        {logoPath && (
          <img
            src={logoPath}
            alt={t('mainComponent.welcome.logoAlt')}
            className="logo"
            onError={(e) => {
              console.error(t('mainComponent.errors.logoLoad'));
              e.target.style.display = 'none';
            }}
          />
        )}
        {titlePath ? (
          <img
            src={titlePath}
            alt={t('mainComponent.welcome.titleAlt')}
            className="title-image"
            onError={(e) => {
              console.error(t('mainComponent.errors.titleLoad'));
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <h1 className="title">{t('mainComponent.welcome.title')}</h1>
        )}
      </div>
      <div className="button-container">
        <button className="btn-primary" onClick={onNewFile}>
          <img 
            src={icons.newFile} 
            alt={t('mainComponent.welcome.newFileAlt')} 
            className="icon-primary" 
          />
          <span>{t('mainComponent.welcome.newFile')}</span>
        </button>
        <button className="btn-primary" onClick={onLoadFile}>
          <img 
            src={icons.fileOpen} 
            alt={t('mainComponent.welcome.openFileAlt')} 
            className="icon-primary" 
          />
          <span>{t('mainComponent.welcome.openFile')}</span>
        </button>
      </div>
    </div>
  );
}

export default Welcome;