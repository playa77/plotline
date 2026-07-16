/**
 * Root application component.
 *
 * On mount: sends a 'ping' command and subscribes to 'pong' events.
 * Results are logged to the console as a reference implementation.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { useEffect } from 'react';
import { invoke, onEvent } from './ipc/client';

function App(): JSX.Element {
  useEffect(() => {
    // Subscribe to pong events from the main process
    const unsub = onEvent('pong', (payload) => {
      console.log('[App] Received pong event:', payload);
    });

    // Send ping on mount to verify the round-trip
    invoke('ping', { timestamp: Date.now() })
      .then((response) => {
        console.log('[App] Ping round-trip succeeded:', response);
      })
      .catch((err) => {
        console.error('[App] Ping round-trip failed:', err);
      });

    return unsub;
  }, []);

  return (
    <main>
      <h1>Plotline</h1>
    </main>
  );
}

export default App;
