import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the chunked block range logic used in readMessages().
 * We test the chunking algorithm in isolation without hitting real RPCs.
 */
describe('chunked log fetching logic', () => {
  const CHUNK_SIZE = 2000;

  function simulateChunkedFetch(
    currentBlock: number,
    maxRange: number,
    limit: number,
    eventsPerChunk: number[],
  ): { queriedRanges: [number, number][]; totalEvents: number } {
    const startBlock = currentBlock - maxRange;
    const queriedRanges: [number, number][] = [];
    let totalEvents = 0;
    let toBlock = currentBlock;

    let chunkIndex = 0;
    while (toBlock > startBlock && totalEvents < limit) {
      const chunkFrom = Math.max(toBlock - CHUNK_SIZE + 1, startBlock);
      queriedRanges.push([chunkFrom, toBlock]);
      totalEvents += eventsPerChunk[chunkIndex] ?? 0;
      toBlock = chunkFrom - 1;
      chunkIndex++;
    }

    return { queriedRanges, totalEvents };
  }

  it('queries in chunks of 2000 blocks', () => {
    const { queriedRanges } = simulateChunkedFetch(
      10000, // currentBlock
      6000,  // maxRange
      50,    // limit
      [0, 0, 0], // no events
    );

    expect(queriedRanges).toEqual([
      [8001, 10000],
      [6001, 8000],
      [4001, 6000],
    ]);
  });

  it('stops early when enough events collected', () => {
    const { queriedRanges, totalEvents } = simulateChunkedFetch(
      10000,
      100000,
      10,
      [15], // First chunk returns 15 events (>= limit of 10)
    );

    expect(queriedRanges.length).toBe(1);
    expect(totalEvents).toBe(15);
  });

  it('handles range smaller than chunk size', () => {
    const { queriedRanges } = simulateChunkedFetch(
      1500,  // currentBlock
      1000,  // maxRange (only 1000 blocks)
      50,
      [0],
    );

    expect(queriedRanges).toEqual([
      [500, 1500],
    ]);
  });

  it('handles exact chunk size boundary', () => {
    const { queriedRanges } = simulateChunkedFetch(
      4000,
      4000,
      50,
      [0, 0],
    );

    expect(queriedRanges).toEqual([
      [2001, 4000],
      [1, 2000],
    ]);
  });

  it('accumulates events across chunks', () => {
    const { totalEvents, queriedRanges } = simulateChunkedFetch(
      10000,
      100000,
      50,
      [5, 10, 8, 15, 20], // Each chunk returns some events
    );

    // Should stop after enough chunks to get >= 50 events
    // 5 + 10 + 8 + 15 + 20 = 58 >= 50, so 5 chunks
    expect(queriedRanges.length).toBe(5);
    expect(totalEvents).toBe(58);
  });

  it('clamps fromBlock to startBlock', () => {
    const { queriedRanges } = simulateChunkedFetch(
      3500,  // currentBlock
      3000,  // maxRange → startBlock = 500
      50,
      [0, 0],
    );

    // First: [1501, 3500], Second: [501, 1500] (clamped to startBlock=500+1)
    // Actually: startBlock = 3500 - 3000 = 500
    // chunkFrom = Math.max(3500 - 2000 + 1, 500) = 1501
    expect(queriedRanges[0]).toEqual([1501, 3500]);
    expect(queriedRanges[1]).toEqual([500, 1500]);
  });
});
