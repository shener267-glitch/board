import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { canvasApi } from './canvas/canvasApi';
import { useBoard } from './store/boardStore';
import './styles.css';

// E2E テスト用に状態を参照できるようにする (?e2e 指定時のみ)
if (new URLSearchParams(window.location.search).has('e2e')) {
  (window as unknown as { __board: typeof useBoard; __canvas: typeof canvasApi }).__board = useBoard;
  (window as unknown as { __canvas: typeof canvasApi }).__canvas = canvasApi;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
