export class MoshJobGate {
  private activeJobId: string | null = null;

  begin(jobId: string): void {
    this.activeJobId = jobId;
  }

  cancel(jobId = this.activeJobId): void {
    if (jobId && this.activeJobId === jobId) this.activeJobId = null;
  }

  isActive(jobId: string): boolean {
    return this.activeJobId === jobId;
  }

  accept(jobId: string, committed: Uint8ClampedArray, result: Uint8ClampedArray): boolean {
    if (!this.isActive(jobId) || committed.length !== result.length) return false;
    committed.set(result);
    this.activeJobId = null;
    return true;
  }

  get currentJobId(): string | null {
    return this.activeJobId;
  }
}
