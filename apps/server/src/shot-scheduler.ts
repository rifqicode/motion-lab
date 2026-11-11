export type ShotStatus = 'queued' | 'generating' | 'validating' | 'preview_ready' | 'failed' | 'cancelled';
export interface ShotTask {
  shotId: string;
  status: ShotStatus;
  attempt: number;
  workerId?: string;
  changedFiles?: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface SchedulerOptions {
  concurrency: number;
  signal: AbortSignal;
  onChange: (task: ShotTask) => Promise<void>;
}

/** Workers produce proposals concurrently; the publisher alone mutates the aggregate. */
export class ShotScheduler {
  private controllers = new Map<string, AbortController>();
  private cancelled = new Set<string>();
  private publication = Promise.resolve();

  cancel(shotId: string): void {
    this.cancelled.add(shotId);
    this.controllers.get(shotId)?.abort();
  }

  async run<T>(tasks: ShotTask[], options: SchedulerOptions,
    generate: (task: ShotTask, signal: AbortSignal) => Promise<T>,
    publish: (task: ShotTask, result: T, signal: AbortSignal) => Promise<void>,
  ): Promise<ShotTask[]> {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 3) {
      throw new Error('Shot concurrency must be an integer from 1 to 3.');
    }
    const results = tasks.map(task => ({...task}));
    let next = 0;
    const update = async (task: ShotTask, status: ShotStatus, error?: string) => {
      task.status = status;
      if (error) task.error = error.slice(0, 12_000);
      if (['preview_ready', 'failed', 'cancelled'].includes(status)) task.completedAt = new Date().toISOString();
      await options.onChange({...task});
    };
    const worker = async (workerIndex: number) => {
      while (next < results.length) {
        const task = results[next++];
        const controller = new AbortController();
        this.controllers.set(task.shotId, controller);
        const abort = () => controller.abort();
        options.signal.addEventListener('abort', abort, {once: true});
        try {
          if (options.signal.aborted || this.cancelled.has(task.shotId)) controller.abort();
          if (controller.signal.aborted) { await update(task, 'cancelled'); continue; }
          task.workerId = `worker-${workerIndex + 1}`;
          task.startedAt = new Date().toISOString();
          await update(task, 'generating');
          const result = await generate(task, controller.signal);
          if (controller.signal.aborted) { await update(task, 'cancelled'); continue; }
          await update(task, 'validating');
          const publication = this.publication.then(async () => {
            if (controller.signal.aborted) return;
            await publish(task, result, controller.signal);
          });
          this.publication = publication.catch(() => undefined);
          await publication;
          await update(task, controller.signal.aborted ? 'cancelled' : 'preview_ready');
        } catch (error) {
          await update(task, controller.signal.aborted ? 'cancelled' : 'failed', error instanceof Error ? error.message : String(error));
        } finally {
          options.signal.removeEventListener('abort', abort);
          this.controllers.delete(task.shotId);
        }
      }
    };
    await Promise.all(Array.from({length: Math.min(options.concurrency, tasks.length)}, (_, index) => worker(index)));
    return results;
  }
}
