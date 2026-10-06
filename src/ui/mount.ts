import { h, render } from 'preact';
import type { GameActions, GameUiState } from '../game/state';
import type { Store } from '../game/store';
import { App } from './App';

export function mountUi(root: HTMLElement, store: Store<GameUiState>, actions: GameActions): void {
  render(h(App, { store, actions }), root);
}
