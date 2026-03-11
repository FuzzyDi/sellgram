import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AdminI18nProvider } from './i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AdminI18nProvider>
    <App />
  </AdminI18nProvider>
);
