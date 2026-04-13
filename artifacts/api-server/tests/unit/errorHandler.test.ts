import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
  isTypedError,
  handleRouteError,
  classifyDbError,
} from "../../src/lib/errorHandler.js";

describe("TypedError hierarchy (P0.3)", () => {
  it("ValidationError carries 422 and VALIDATION_ERROR code", () => {
    const err = new ValidationError("الاسم مطلوب", { field: "name", fix: "أدخل الاسم" });
    expect(err.status).toBe(422);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.field).toBe("name");
    expect(err.fix).toBe("أدخل الاسم");
    expect(err.name).toBe("ValidationError");
  });

  it("NotFoundError carries 404 and NOT_FOUND code", () => {
    const err = new NotFoundError("العقد غير موجود");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("ConflictError carries 409 and CONFLICT code", () => {
    const err = new ConflictError("الحالة الحالية لا تسمح بهذه العملية");
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("ForbiddenError carries 403 and FORBIDDEN code", () => {
    const err = new ForbiddenError("غير مصرح");
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("IntegrationError carries 502 and INTEGRATION_ERROR code", () => {
    const err = new IntegrationError("ZATCA غير متاح");
    expect(err.status).toBe(502);
    expect(err.code).toBe("INTEGRATION_ERROR");
  });

  it("isTypedError guards narrow unknowns", () => {
    expect(isTypedError(new ValidationError("x"))).toBe(true);
    expect(isTypedError(new NotFoundError("x"))).toBe(true);
    expect(isTypedError(new Error("plain"))).toBe(false);
    expect(isTypedError("string")).toBe(false);
    expect(isTypedError(null)).toBe(false);
  });

  it("toResponse omits cause and meta when absent", () => {
    const err = new ValidationError("الاسم مطلوب", { field: "name" });
    const res = err.toResponse();
    expect(res).toEqual({
      error: "الاسم مطلوب",
      code: "VALIDATION_ERROR",
      field: "name",
    });
    expect(res).not.toHaveProperty("cause");
  });

  it("toResponse includes meta when provided", () => {
    const err = new ConflictError("حالة غير صالحة", {
      meta: { from: "draft", to: "completed" },
    });
    const res = err.toResponse();
    expect(res.meta).toEqual({ from: "draft", to: "completed" });
  });

  it("cause is not leaked in toResponse", () => {
    const err = new IntegrationError("ZATCA timeout", {
      cause: new Error("ECONNREFUSED"),
    });
    const res = err.toResponse();
    expect(res).not.toHaveProperty("cause");
  });
});

describe("handleRouteError (P0.3)", () => {
  const makeRes = () => {
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      headersSent: false,
    };
    return res;
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("forwards ValidationError status + shape unchanged", () => {
    const res = makeRes();
    handleRouteError(new ValidationError("الاسم مطلوب", { field: "name" }), res, "create");
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "الاسم مطلوب",
      code: "VALIDATION_ERROR",
      field: "name",
    }));
  });

  it("forwards NotFoundError as 404", () => {
    const res = makeRes();
    handleRouteError(new NotFoundError("غير موجود"), res, "read");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("forwards ConflictError as 409", () => {
    const res = makeRes();
    handleRouteError(new ConflictError("مكرر"), res, "create");
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("forwards ForbiddenError as 403", () => {
    const res = makeRes();
    handleRouteError(new ForbiddenError("غير مصرح"), res, "update");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("forwards IntegrationError as 502", () => {
    const res = makeRes();
    handleRouteError(new IntegrationError("ZATCA غير متاح"), res, "post");
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INTEGRATION_ERROR" }));
  });

  it("falls back to classifyDbError for plain errors — now with code forwarded", () => {
    const res = makeRes();
    // A plain error with no recognised pg code falls through to the generic
    // SERVER_ERROR bucket. The response now also carries `code` so the
    // frontend's <PageErrorBoundary> can branch on it even for un-typed
    // errors that slipped through — that's the Step 1 audit fix that kills
    // the "كل إجراء يرد 'حدث خطأ'" UX complaint.
    handleRouteError(new Error("something weird"), res, "misc");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً",
      code: "SERVER_ERROR",
    });
  });

  it("forwards pg 23505 duplicate email as CONFLICT + field", () => {
    const res = makeRes();
    // Simulated pg unique-violation with a typical detail string.
    const pgErr = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "employees_email_unique"',
      detail: "Key (email)=(test@x.com) already exists.",
    };
    handleRouteError(pgErr, res, "create employee");
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "CONFLICT",
      field: "email",
      error: expect.stringContaining("البريد"),
    }));
  });

  it("forwards pg 23503 FK on departmentId as VALIDATION_ERROR + field", () => {
    const res = makeRes();
    const pgErr = {
      code: "23503",
      message: 'insert or update on table "employees" violates foreign key constraint',
      detail: 'Key (departmentId)=(999) is not present in table "departments".',
    };
    handleRouteError(pgErr, res, "create employee");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "VALIDATION_ERROR",
      field: "departmentId",
    }));
  });

  it("forwards pg 23502 NOT NULL on hireDate as VALIDATION_ERROR + field", () => {
    const res = makeRes();
    const pgErr = {
      code: "23502",
      message: 'null value in column "hireDate" of relation "employee_assignments" violates not-null constraint',
    };
    handleRouteError(pgErr, res, "create assignment");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "VALIDATION_ERROR",
      field: "hireDate",
    }));
  });

  it("does not write the response twice when headers were already sent", () => {
    const res = makeRes();
    res.headersSent = true;
    handleRouteError(new ConflictError("race"), res, "update");
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("classifyDbError still handles raw Postgres errors (regression guard)", () => {
  it("23505 → 409 duplicate", () => {
    const err = { code: "23505", message: "duplicate key value" } as any;
    const { status } = classifyDbError(err);
    expect(status).toBe(409);
  });

  it("23503 → 400 foreign key", () => {
    const err = { code: "23503", message: "foreign key violation" } as any;
    const { status } = classifyDbError(err);
    expect(status).toBe(400);
  });

  it("unknown → 500 with generic message", () => {
    const { status, message } = classifyDbError(new Error("something"));
    expect(status).toBe(500);
    expect(message).toContain("حدث خطأ");
  });
});
