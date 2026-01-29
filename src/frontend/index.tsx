import ReactDOM from "react-dom/client";
import React, { JSX, useEffect, useState } from "react";
import { addProgress } from './addProgress';

import TimeForm from "./components/TimeForm.tsx";
import ValidateForm from "./components/ValidateForm.tsx";
import { getService, Service } from "./service.ts";
import ErrorBanner from "./components/ErrorBanner.tsx";

function App(): JSX.Element {
  const [service, setService] = useState<Service | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    getService().then(setService).catch(setError);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TimeForm service={service} onError={setError} />
      {error && <div style={{ color: 'red', fontSize: 12 }}>{error.message}</div>}
    </div>
  );
}

const rootEl = document.getElementById("root") || document.body;
ReactDOM.createRoot(rootEl).render(<App />);
