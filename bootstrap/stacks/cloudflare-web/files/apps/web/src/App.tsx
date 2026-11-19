import { useEffect, useState } from 'preact/hooks';
import { type BuildInfo, buildLabel, parseBuildInfo } from './build.ts';

export function App() {
  const [build, setBuild] = useState<BuildInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => setBuild(parseBuildInfo(body)))
      .catch(() => setBuild(null));
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>{'{{PROJECT_NAME}}'}</h1>
      <p>It works. Start building in apps/web/src and apps/worker/src.</p>
      {build && <footer>{buildLabel(build)}</footer>}
    </main>
  );
}
