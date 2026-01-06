import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './styles/global.css';
import RegistrationPage from './pages/RegistrationPage.js';
import LoginPagePage from './pages/LoginPagePage.js';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/registration" element={<RegistrationPage />} />
        <Route path="/loginpage" element={<LoginPagePage />} />
        <Route path="/" element={<Navigate to="/registration" replace />} />
        <Route path="*" element={<Navigate to="/registration" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
