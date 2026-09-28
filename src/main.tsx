import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useBoard } from './store/boardStore';
import './styles.css';

// E2E テスト用に状態を参照できるようにする (?e2e 指定時のみ)
if (new URLSearchParams(window.location.search).has('e2e')) {
  (window as unknown as { __board: typeof useBoard }).__board = useBoard;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
