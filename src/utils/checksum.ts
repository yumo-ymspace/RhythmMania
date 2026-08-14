/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import SparkMD5 from 'spark-md5';

export type ChecksumAlgorithm = 'md5' | 'sha256';

export function inferChecksumAlgorithm(checksum: string): ChecksumAlgorithm {
  return /^[a-f0-9]{64}$/i.test(checksum) ? 'sha256' : 'md5';
}

export async function computeChecksum(
  data: ArrayBuffer | ArrayBufferView,
  algorithm: ChecksumAlgorithm,
): Promise<string> {
  const source = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);

  if (algorithm === 'md5') {
    return SparkMD5.ArrayBuffer.hash(bytes.buffer);
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
