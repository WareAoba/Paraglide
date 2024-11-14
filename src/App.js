import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import MainComponent from './MainComponent';
import OverlayComponent from './OverlayComponent';

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
