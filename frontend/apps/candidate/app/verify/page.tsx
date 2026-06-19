"use client";

import { VerifyCard, type VerifyStatus } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../lib/auth";

export default function VerifyPage() {
  const { api } = useAuth();
  const [status, setStatus] = useState<VerifyStatus>("working");
  const [message, setMessage] = useState("");
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setStatus("invalid");
      return;
    }
    api.auth
      .verify({ token })
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setMessage(errorMessage(err));
      });
  }, [api]);

  return (
    <VerifyCard
      status={status}
      message={message}
      continueHref="/"
      onResend={(email) => api.auth.resendVerification({ email }).then(() => {})}
    />
  );
}
