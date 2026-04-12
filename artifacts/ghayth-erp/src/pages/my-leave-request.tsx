import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MyLeaveRequest() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/hr/leaves/create");
  }, [setLocation]);
  return null;
}
