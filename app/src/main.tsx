import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/800.css';
import './ui/styles.css';
import App from './ui/App';
import { Component, type ReactNode } from 'react';
class Boundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() { return this.state.err ? <div className="welcome"><h1>Something went wrong.</h1><p>{this.state.err}</p><p>Your work is saved on this device. Reload the page, or open a backup file.</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<StrictMode><Boundary><App /></Boundary></StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
