// ---------------------------------------------------------------------------
// Last Light - bootstrap. Builds the simulation, renderer and DOM layer, then
// hands control to the fixed-timestep game loop.
// ---------------------------------------------------------------------------
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { validateContent } from './config.js';

const canvas = document.getElementById('game');

const game = new Game(canvas);
const renderer = new Renderer(canvas, game);
const ui = new UI(game, renderer);

game.renderer = renderer;
game.ui = ui;

// Apply the saved graphics setting before the first frame.
renderer.applyQuality();
game.sound.enabled = !!game.settings.sound;
game.sound.setVolume(game.settings.volume);

const missing = validateContent();
if (missing.length) console.warn('[Last Light] Missing content references:', missing.join(', '));

game.bindInput();
ui.start();
requestAnimationFrame(game.loop);

// Small debug handle for manual testing from the console.
window.lastlight = { game, renderer, ui };
