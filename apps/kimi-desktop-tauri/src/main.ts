// main.ts — bootstrap.
//
// Mounts the root App.svelte. The daemon connection is handled inside
// App.svelte via the `daemon` store, which calls the Rust `ensure_server`
// command on startup and renders loading / error / connected states.

import { mount } from 'svelte';
import './styles/global.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
