import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import '@fontsource-variable/inter';
import './theme.css';

try {
  const t = localStorage.getItem('gl-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch { /* storage may be blocked */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
