import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.jsx';
import './styles/global.css';
import './styles/notifications.css';
import './i18n';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
