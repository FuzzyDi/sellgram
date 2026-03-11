import { jsx as _jsx } from "react/jsx-runtime";
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AdminI18nProvider } from './i18n';
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(AdminI18nProvider, { children: _jsx(App, {}) }));
