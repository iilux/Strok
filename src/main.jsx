import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

// Pas de StrictMode : évite le double-montage des effets en dev qui
// réinitialiserait inutilement le canvas et les observers de resize.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
