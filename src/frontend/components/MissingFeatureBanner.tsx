import React from "react";

interface IProps {
  message: string;
}

export default function ({ message }: IProps) {
  return (
    <p className="warning-form">
      Faites au moins un exercice pour {message}
    </p>
  );
}
