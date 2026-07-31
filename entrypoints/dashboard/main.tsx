import { createRoot } from 'react-dom/client';

import '../../src/styles.css';
import { DashboardApp } from './DashboardApp';

createRoot(document.getElementById('root')!).render(<DashboardApp />);
