import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import MainComponent from './components/MainComponent';
import OverlayComponent from './components/OverlayComponent';
import './CSS/App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route exact path="/" element={<MainComponent />} />
        <Route path="/overlay" element={<OverlayComponent />} />
      </Routes>
    </Router>
  );
}

export default App;
