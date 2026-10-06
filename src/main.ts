import './ui/styles.css';
import { createPixiApp } from './render/app';
import { mountUi } from './ui/mount';

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!stage || !ui) throw new Error('Missing #stage or #ui root element');

  await createPixiApp(stage);
  mountUi(ui);
}

void boot();
