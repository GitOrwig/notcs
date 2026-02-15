import { Game } from './Game.js';

try {
  const game = new Game();
  window.game = game;
} catch (e) {
  document.body.innerHTML = `
    <div style="color:#ff4444;padding:40px;font-family:monospace;background:#111;min-height:100vh">
      <h2 style="color:#ff6666">Game failed to start:</h2>
      <pre style="white-space:pre-wrap">${e.stack || e.message}</pre>
    </div>`;
  console.error(e);
}
