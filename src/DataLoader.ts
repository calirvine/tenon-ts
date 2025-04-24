import { ResultAsync } from "neverthrow";

export class DataLoader<TContext> {
  constructor(
    private readonly evaluateBatch: (
      batch: [TContext, (result: boolean) => void][]
    ) => void | Promise<void>
  ) {}

  protected queue: [TContext, (result: boolean) => void][] = [];
  protected scheduled = false;
  protected cache = new Map<string, Promise<boolean>>();

  protected getCacheKey(arg: TContext): string {
    return JSON.stringify(arg);
  }

  load(arg: TContext): Promise<boolean> {
    const key = this.getCacheKey(arg);
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const promise = new Promise<boolean>((resolve) => {
      this.queue.push([
        arg,
        (result: boolean) => {
          resolve(result);
        },
      ]);
      if (!this.scheduled) {
        this.scheduled = true;
        void Promise.resolve().then(() => this.flush());
      }
    });
    this.cache.set(key, promise);
    return promise;
  }

  loadMany(args: TContext[]): Promise<boolean[]> {
    return Promise.all(args.map((arg) => this.load(arg)));
  }

  private flush(): ResultAsync<void, unknown> {
    // Replace cache for the new batch
    this.cache = new Map();
    const batch = this.queue;
    this.queue = [];
    this.scheduled = false;
    return ResultAsync.fromPromise(
      (async () => {
        await this.evaluateBatch(batch);
      })(),
      (err) => err
    );
  }
}
