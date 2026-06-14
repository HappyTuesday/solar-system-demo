import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initDatabase } from './persistence/db';
import './App.css';

initDatabase().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
