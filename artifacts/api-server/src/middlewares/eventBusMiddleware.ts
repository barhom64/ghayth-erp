import type { Request, Response, NextFunction } from "express";
import { eventBus } from "../lib/eventBus.js";

declare global {
  namespace Express {
    interface Request {
      eventBus: typeof eventBus;
    }
  }
}

export function eventBusMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.eventBus = eventBus;
  next();
}
