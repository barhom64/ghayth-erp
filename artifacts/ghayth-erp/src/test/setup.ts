// Component-test setup: register jest-dom matchers (toBeInTheDocument, …) and
// auto-clean the DOM between tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
