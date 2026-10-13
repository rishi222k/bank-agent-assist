export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "not_verified"
  | "verification_locked"
  | "call_ended"
  | "not_eligible"
  | "duplicate_case"
  | "conflict";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  not_verified: 403,
  verification_locked: 423,
  call_ended: 409,
  not_eligible: 422,
  duplicate_case: 409,
  conflict: 409,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
