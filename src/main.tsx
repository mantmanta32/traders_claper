import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MarketEngine } from './engine/MarketEngine';
import './styles/index.css';

const engine = new MarketEngine();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App engine={engine} />
    </ErrorBoundary>
  </StrictMode>,
);
