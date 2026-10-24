import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ConfigProvider } from './context/ConfigContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </ErrorBoundary>
);
