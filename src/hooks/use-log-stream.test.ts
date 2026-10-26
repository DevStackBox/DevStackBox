import { describe, expect, it } from 'vitest';
import { appendLogChunk, type LogChunk, type LogStream } from './use-log-stream';
const chunk: LogChunk = { text: '', cursor: null, path: 'error.log', size: 0, missing: false, reset: false, skipped: false };
describe('incremental log view', () => {
  it('appends new data after clear without restoring old lines', () => {
    const previous: LogStream = { ...chunk, logs: '', idle: 0, cleared: true };
    const next = appendLogChunk(previous, { ...chunk, text: 'new line\n' });
    expect(next.logs).toBe('new line\n'); expect(next.cleared).toBe(true);
  });
  it('replaces the tail after rotation or skipped bytes', () => {
    const previous: LogStream = { ...chunk, logs: 'old\n', idle: 0, cleared: false };
    expect(appendLogChunk(previous, { ...chunk, text: 'new\n', reset: true }).logs).toBe('new\n');
    expect(appendLogChunk(previous, { ...chunk, text: 'new\n', skipped: true }).logs).toBe('new\n');
  });
  it('bounds retained lines and tracks idle reads', () => {
    const result = appendLogChunk(undefined, { ...chunk, text: 'line\n'.repeat(5000) });
    expect(result.logs.split('\n')).toHaveLength(1000);
    expect(appendLogChunk(result, chunk).idle).toBe(1);
  });
});
