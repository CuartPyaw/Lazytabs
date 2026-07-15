import { createRoot } from 'react-dom/client';

import '../../src/styles.css';
import { PopupApp } from './PopupApp';

createRoot(document.getElementById('root')!).render(<PopupApp />);
