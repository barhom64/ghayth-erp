// PR-4 (#2163) — back-compat redirect. canonical هو /work-inbox (PR-5 #2077).
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function WorkQueueRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/work-inbox");
  }, [setLocation]);
  return null;
}
