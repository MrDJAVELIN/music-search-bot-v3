class DownloadQueue {
  private running = 0;
  private readonly maxConcurrent: number;
  private readonly queue: Array<() => Promise<void>> = [];

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  add(task: () => Promise<void>): void {
    this.queue.push(task);
    this.process();
  }

  private process(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();

      if (!task) return;

      this.running++;

      task()
        .catch((error) => {
          console.error("Queue task error:", error);
        })
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }

  get stats() {
    return {
      running: this.running,
      waiting: this.queue.length,
    };
  }
}

export const downloadQueue = new DownloadQueue(3);
