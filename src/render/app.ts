import { Application, Container, Graphics, Text } from 'pixi.js';

const BG = 0x07070f;
const CYAN = 0x3ef4ff;
const PINK = 0xff3ec8;

export async function createPixiApp(host: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    background: BG,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);

  const scene = new Container();
  app.stage.addChild(scene);

  const glow = new Graphics();
  const panel = new Graphics();
  const title = new Text({
    text: 'SWAPLIGHT',
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 44,
      fontWeight: '800',
      letterSpacing: 6,
      fill: CYAN,
      dropShadow: { color: CYAN, blur: 12, distance: 0, alpha: 0.9, angle: 0 },
    },
  });
  title.anchor.set(0.5);
  scene.addChild(glow, panel, title);

  const layout = (): void => {
    const w = app.screen.width;
    const h = app.screen.height;
    const pw = Math.min(w * 0.8, 360);
    const ph = Math.min(h * 0.6, pw * 2);
    const x = (w - pw) / 2;
    const y = (h - ph) / 2;

    glow.clear();
    glow
      .roundRect(x - 6, y - 6, pw + 12, ph + 12, 26)
      .stroke({ width: 10, color: PINK, alpha: 0.18 });
    panel.clear();
    panel
      .roundRect(x, y, pw, ph, 20)
      .fill({ color: 0x12122a, alpha: 0.9 })
      .stroke({ width: 3, color: PINK, alpha: 1 });

    title.position.set(w / 2, y + ph / 2);
    title.scale.set(Math.min(1, (pw - 32) / 320));
  };

  layout();
  app.renderer.on('resize', layout);

  return app;
}
