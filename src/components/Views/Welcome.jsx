import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../CSS/Views/Welcome.css';

function Welcome({ onLoadFile, onNewFile, logoPath, titlePath, theme, fileOpenIcon, newFileIcon }) {
  const { t } = useTranslation();

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
            src={newFileIcon} 
            alt={t('mainComponent.welcome.newFileAlt')} 
            className="icon-primary" 
          />
          <span>{t('mainComponent.welcome.newFile')}</span>
        </button>
        <button className="btn-primary" onClick={onLoadFile}>
          <img 
            src={fileOpenIcon} 
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