import { describe, it, expect } from 'vitest';
import { classifyRpcError } from '../../src/rpc-errors.js';

describe('classifyRpcError', () => {
  const ctx = { method: 'getTopic', chainName: 'base' };

  it('detects BAD_DATA errors', () => {
    const err = new Error('could not coalesce error (error={ "code": -32000, "data": "BAD_DATA" })');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('contract may not be deployed on base');
  });

  it('detects empty decode errors', () => {
    const err = new Error('could not decode result data');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('empty response');
  });

  it('detects NETWORK_ERROR', () => {
    const err = new Error('NETWORK_ERROR: could not connect');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('network error');
  });

  it('detects ECONNREFUSED', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:8545');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('network error');
  });

  it('detects fetch failed', () => {
    const err = new Error('fetch failed');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('network error');
  });

  it('detects getaddrinfo errors', () => {
    const err = new Error('getaddrinfo ENOTFOUND bad-rpc.example.com');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('network error');
  });

  it('detects 429 rate limit', () => {
    const err = new Error('HTTP 429 Too Many Requests');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('rate limit');
    expect(result).toContain('getTopic');
    expect(result).toContain('base');
  });

  it('detects rate limit text', () => {
    const err = new Error('rate limit exceeded for project');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('rate limit');
  });

  it('detects too many requests', () => {
    const err = new Error('too many requests');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('rate limit');
  });

  it('detects exceeded', () => {
    const err = new Error('request quota exceeded');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('rate limit');
  });

  it('detects throttling', () => {
    const err = new Error('request throttled by provider');
    const result = classifyRpcError(err, ctx);
    expect(result).toContain('rate limit');
  });

  it('returns null for unrecognized errors', () => {
    const err = new Error('some random error');
    expect(classifyRpcError(err, ctx)).toBeNull();
  });

  it('includes method name in output', () => {
    const err = new Error('BAD_DATA');
    const result = classifyRpcError(err, { method: 'getApplication', chainName: 'avalanche' });
    expect(result).toContain('getApplication');
    expect(result).toContain('avalanche');
  });
});
