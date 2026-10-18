// Asks the browser to keep the app's IndexedDB data instead of clearing it under storage pressure.
export class StorageService {
  private requested = false;

  constructor(private readonly storage: StorageManager | undefined) {}

  get supported(): boolean {
    return typeof this.storage?.persist === "function" && typeof this.storage.persisted === "function";
  }

  async persisted(): Promise<boolean> {
    return this.supported ? this.storage!.persisted() : false;
  }

  async request(): Promise<boolean> {
    return this.supported ? this.storage!.persist() : false;
  }

  // Asks at most once per session; browsers remember a refusal, so asking again on every save gains nothing.
  async requestOnce(): Promise<void> {
    if (this.requested || !this.supported) return;
    this.requested = true;
    if (!(await this.persisted())) await this.request();
  }
}
