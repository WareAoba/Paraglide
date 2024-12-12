import React from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import MainComponent from './components/MainComponent';
import OverlayComponent from './components/OverlayComponent';
import Console from './components/Views/Console';
import './CSS/App.css';

// 라우트 경로 상수
const ROUTES = {
  HOME: '/',
  OVERLAY: '/overlay',
  CONSOLE: '/console'
};

// 라우터 설정
const router = createHashRouter([
  {
    path: ROUTES.HOME,
    element: <MainComponent />
  },
  {
    path: ROUTES.OVERLAY,
    element: <OverlayComponent />
  },
  {
    path: ROUTES.CONSOLE,
    element: <Console />
  }
], {
  future: {
    v7_startTransition: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
    v7_relativeSplatPath: true
  }
});

function App() {
  return <RouterProvider router={router} />;
}

export default App;