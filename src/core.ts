import { resolveTracer, type OtelTracer } from "./internal/otel";
import { makeCreateMatcher } from "./matcher";
import { createLogicalOperators } from "./operators";
import { createSegmentEvaluator } from "./segment";
import { wrapMatchers } from "./wrapMatchers";

import type {
  Schema,
  Subject,
  Input,
  SegmentDefinition,
  SegmentBuilder,
  MatcherMap,
  Logger,
} from "./types";

class TenonBuilder<TSubjectSchema extends Schema> {
  private subjectSchema: TSubjectSchema;
  private config?: {
    logger?: Logger;
    tracer?: boolean | OtelTracer;
    onError?: (err: Error, context?: unknown) => void;
  };
  constructor(
    subjectSchema: TSubjectSchema,
    config?: {
      logger?: Logger;
      tracer?: boolean | OtelTracer;
      onError?: (err: Error, context?: unknown) => void;
    }
  ) {
    this.subjectSchema = subjectSchema;
    this.config = config;
  }
  matchers<TMatchers extends MatcherMap<Subject<TSubjectSchema>>>(
    matcherCb: (
      createMatcher: ReturnType<
        typeof makeCreateMatcher<Subject<TSubjectSchema>>
      >
    ) => TMatchers
  ) {
    const createMatcher = makeCreateMatcher<Subject<TSubjectSchema>>();
    const matcherMap = matcherCb(createMatcher);
    const self = this;
    return {
      segments<TSegments extends string = string>(
        segmentsObj: Record<
          TSegments,
          SegmentDefinition<Subject<TSubjectSchema>, TMatchers>
        >
      ) {
        const wrappedMatchers = wrapMatchers<
          Subject<TSubjectSchema>,
          TMatchers
        >(matcherMap);
        const operators = createLogicalOperators<Subject<TSubjectSchema>>();
        const logger = self.config?.logger ?? console;
        const tracer = resolveTracer(self.config?.tracer);
        const builder: SegmentBuilder<
          Subject<TSubjectSchema>,
          TMatchers,
          TSegments,
          Input<TSubjectSchema>
        > = {
          segments: segmentsObj,
          matchers: wrappedMatchers,
          contextFor: createSegmentEvaluator<
            Subject<TSubjectSchema>,
            TMatchers,
            TSegments,
            TSubjectSchema
          >(
            self.subjectSchema,
            segmentsObj,
            operators,
            wrappedMatchers,
            matcherMap,
            logger,
            tracer,
            self.config?.onError
          ),
        };
        return builder;
      },
    };
  }
}

export { TenonBuilder };
