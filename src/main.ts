import './ui/styles.css';
import { bootGame } from './game/app';

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!stage || !ui) throw new Error('Missing #stage or #ui root element');
  await bootGame(stage, ui);
}

void boot();
