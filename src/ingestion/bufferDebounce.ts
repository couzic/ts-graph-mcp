import type { Observable } from "rxjs";
import { buffer, debounceTime, map } from "rxjs";

/**
 * Buffers source emissions and flushes after a quiet period.
 *
 * Accumulates values until no new emissions occur for `ms` milliseconds,
 * then releases the batch (deduplicated).
 *
 * Use case: Batch rapid file change events from fs.watch before processing.
 *
 * @param ms - Quiet period in milliseconds before flushing the buffer
 * @returns RxJS operator that batches and deduplicates emissions
 */
export const bufferDebounce =
  <T>(ms: number) =>
  (source$: Observable<T>): Observable<T[]> => {
    const debounced$ = source$.pipe(debounceTime(ms));
    return source$.pipe(
      buffer(debounced$),
      map((items) => [...new Set(items)]),
    );
  };
