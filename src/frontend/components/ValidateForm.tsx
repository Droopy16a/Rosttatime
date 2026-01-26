import React, { JSX, useEffect, useState } from "react";
import { Feature, Service } from "../service.ts";
import MissingFeatureBanner from "./MissingFeatureBanner.tsx";

interface IProps {
  service: Service | null;
  onError: (e: Error) => void;
}

export default function ValidateForm({
  service,
  onError,
}: IProps): JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [available, setAvailable] = useState<boolean>(false);
  const [content, setContent] = useState<string>("valider la leçon");

  useEffect(() => {
    service?.isFeatureReady(Feature.ValidateLesson).then(setAvailable);
  }, [service]);

  const onClick = async () => {
    if (service === null) {
      onError(new Error("Aucun service trouvé"));
      return;
    }
    console.debug("validating lesson");
    setEnabled(false);
    setContent("...");
    try {
      await service.validateLesson();
    } catch (e) {
      onError(e as Error);
    } finally {
      setContent("valider la leçon");
      setEnabled(true);
    }
  };

  return (
    <div className="validate-form">
      {available ? (
        <button onClick={onClick} disabled={!enabled}>
          {content}
        </button>
      ) : (
        <MissingFeatureBanner message="valider la leçon" />
      )}
    </div>
  );
}
