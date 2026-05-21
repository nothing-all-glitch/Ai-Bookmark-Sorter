import { heuristicClassify } from '../lib/heuristics';
import type { BookmarkCandidate } from '../lib/types';

type WorkerRequest = {
  id: number;
  type: 'heuristic-classify';
  payload: {
    bookmarks: BookmarkCandidate[];
    taxonomy: string[];
  };
};

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type !== 'heuristic-classify') {
      throw new Error(`Unknown worker request: ${event.data.type}`);
    }

    const classifications = heuristicClassify(event.data.payload.bookmarks, event.data.payload.taxonomy);
    self.postMessage({ id: event.data.id, ok: true, classifications });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown worker error',
    });
  }
});
