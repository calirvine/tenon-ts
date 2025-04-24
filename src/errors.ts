export class MatcherArgumentError extends Error {
  matcherName?: string;
  segmentName?: string;
  subject?: unknown;
  override cause?: unknown;
  constructor(
    message: string,
    matcherName?: string,
    segmentName?: string,
    subject?: unknown,
    cause?: unknown
  ) {
    super(message);
    this.name = "MatcherArgumentError";
    this.matcherName = matcherName;
    this.segmentName = segmentName;
    this.subject = subject;
    this.cause = cause;
  }
}

export class MatcherEvaluationError extends Error {
  matcherName: string;
  segmentName: string;
  subject: unknown;
  args: unknown;
  override cause: unknown;

  constructor(
    matcherName: string,
    segmentName: string,
    subject: unknown,
    args: unknown,
    originalError: unknown
  ) {
    const cause =
      originalError instanceof Error
        ? originalError
        : new Error(String(originalError));
    super(`Matcher "${matcherName}" in segment "${segmentName}" error`, {
      cause,
    });
    this.name = "MatcherEvaluationError";
    this.matcherName = matcherName;
    this.segmentName = segmentName;
    this.subject = subject;
    this.args = args;
    this.cause = cause;
  }
}
