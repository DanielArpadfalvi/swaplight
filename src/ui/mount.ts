import { h, render } from 'preact';
import { App } from './App';

export function mountUi(root: HTMLElement): void {
  render(h(App, null), root);
}
