import { useMemo } from "react";
import { AppletHostAdapter } from "../core/host";
import { TidalSqueezeCanvas } from "../applets/tidal_squeeze/TidalSqueezeCanvas";

export function App(): JSX.Element {
  const host: AppletHostAdapter = useMemo(
    () => ({
      onClose: () => {},
      readReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }),
    []
  );

  return (
    <div className="app-shell">
      <main>
        <section className="modal card">
          <TidalSqueezeCanvas host={host} />
        </section>
      </main>
    </div>
  );
}
