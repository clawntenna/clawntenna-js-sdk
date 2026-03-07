import { describe, it, expect } from 'vitest';

describe('adaptive log fetching logic', () => {
  function simulateAdaptiveFetch(
    currentBlock: number,
    maxRange: number,
    limit: number,
    eventsPerBatch: number[],
    chunkSize: number,
  ): { queriedRanges: [number, number, number][]; totalEvents: number } {
    const startBlock = currentBlock - maxRange;
    const queriedRanges: [number, number, number][] = [];
    let totalEvents = 0;
    let toBlock = currentBlock;
    let batchSpan = chunkSize;
    let batchIndex = 0;

    while (toBlock > startBlock && totalEvents < limit) {
      const batchFrom = Math.max(toBlock - batchSpan + 1, startBlock);
      const queryCount = Math.ceil((toBlock - batchFrom + 1) / chunkSize);
      queriedRanges.push([batchFrom, toBlock, queryCount]);
      totalEvents += eventsPerBatch[batchIndex] ?? 0;
      toBlock = batchFrom - 1;
      batchSpan = Math.min(batchSpan * 2, Math.max(toBlock - startBlock + 1, chunkSize));
      batchIndex++;
    }

    return { queriedRanges, totalEvents };
  }

  it('starts with a small recent window and expands exponentially', () => {
    const { queriedRanges } = simulateAdaptiveFetch(
      10000,
      7000,
      50,
      [0, 0, 0],
      1000,
    );

    expect(queriedRanges).toEqual([
      [9001, 10000, 1],
      [7001, 9000, 2],
      [3001, 7000, 4],
    ]);
  });

  it('stops after the first batch when enough recent events are found', () => {
    const { queriedRanges, totalEvents } = simulateAdaptiveFetch(
      10000,
      100000,
      10,
      [15],
      1000,
    );

    expect(queriedRanges).toEqual([
      [9001, 10000, 1],
    ]);
    expect(totalEvents).toBe(15);
  });

  it('handles ranges smaller than the chunk size', () => {
    const { queriedRanges } = simulateAdaptiveFetch(
      1500,
      1000,
      50,
      [0],
      1000,
    );

    expect(queriedRanges).toEqual([
      [501, 1500, 1],
    ]);
  });

  it('handles exact chunk-size boundaries', () => {
    const { queriedRanges } = simulateAdaptiveFetch(
      2000,
      1000,
      50,
      [0],
      1000,
    );

    expect(queriedRanges).toEqual([
      [1001, 2000, 1],
    ]);
  });

  it('caps the last batch at the startBlock boundary', () => {
    const { queriedRanges } = simulateAdaptiveFetch(
      3500,
      3000,
      50,
      [0, 0, 0],
      1000,
    );

    expect(queriedRanges).toEqual([
      [2501, 3500, 1],
      [501, 2500, 2],
    ]);
  });

  it('reduces total round-trips versus fixed 1000-block stepping', () => {
    const { queriedRanges } = simulateAdaptiveFetch(
      43051814,
      200000,
      20,
      Array(8).fill(0),
      1000,
    );

    expect(queriedRanges.length).toBe(8);
    expect(queriedRanges[0]).toEqual([43050815, 43051814, 1]);
    expect(queriedRanges[1]).toEqual([43048815, 43050814, 2]);
    expect(queriedRanges[2]).toEqual([43044815, 43048814, 4]);
  });
});
