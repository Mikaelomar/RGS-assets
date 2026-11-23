import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './ui/base.css';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

async function boot() {
  await document.fonts.ready.catch(() => {});
  if (location.search.includes('gallery')) {
    const { runGallery } = await import('./dev/gallery');
    document.getElementById('boot-screen')?.classList.add('hide');
    runGallery(canvas);
    return;
  }
  if (location.search.includes('humans')) {
    const { runHumans } = await import('./dev/humans');
    document.getElementById('boot-screen')?.classList.add('hide');
    runHumans(canvas);
    return;
  }
  const { startApp } = await import('./game/App');
  await startApp(canvas);
}
boot();
