import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Finance() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/finance/accounts");
  }, [setLocation]);
  return null;
}
