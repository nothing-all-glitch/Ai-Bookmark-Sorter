import { heuristicClassify } from './heuristics';
import type { BookmarkCandidate, Classification } from './types';

type WorkerRequest = {
  id: number;
  type: 'heuristic-classify';
  payload: {
    bookmarks: BookmarkCandidate[];
    taxonomy: string[];
  };
};

type WorkerResponse =
  | {
      id: number;
      ok: true;
      classifications: Classification[];
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

export class HeuristicWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: Classification[]) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  constructor() {
    if (typeof Worker === 'undefined') {
      return;
    }

    try {
      this.worker = new Worker(new URL('../workers/organizer.worker.ts', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const callback = this.pending.get(event.data.id);
        if (!callback) {
          return;
        }
        this.pending.delete(event.data.id);
        if (event.data.ok) {
          callback.resolve(event.data.classifications);
        } else {
          callback.reject(new Error(event.data.error));
        }
      });
    } catch {
      this.worker = null;
    }
  }

  classify(bookmarks: BookmarkCandidate[], taxonomy: string[]): Promise<Classification[]> {
    if (!this.worker) {
      return Promise.resolve(heuristicClassify(bookmarks, taxonomy));
    }

    const id = this.nextId;
    this.nextId += 1;
    const request: WorkerRequest = {
      id,
      type: 'heuristic-classify',
      payload: { bookmarks, taxonomy },
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.postMessage(request);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
