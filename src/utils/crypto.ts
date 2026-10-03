import { runSandboxed } from './sandbox';

// Zero-width Unicode characters used for steganography
export const ZERO_WIDTH_CHARS = ['\u200B', '\u200C', '\u200D', '\uFEFF'];

export function inspectSteganographicPayload(text: string): {
  detected: boolean;
  charCount: number;
  decodedString: string | null;
} {
  let charCount = 0;
  let binary = '';
  for (const char of text) {
    const idx = ZERO_WIDTH_CHARS.indexOf(char);
    if (idx !== -1) {
      charCount++;
      binary += idx.toString(2).padStart(2, '0');
    }
  }

  if (charCount === 0 || binary.length < 8) {
    return { detected: false, charCount: 0, decodedString: null };
  }

  try {
    const bytes: number[] = [];
    for (let i = 0; i < binary.length; i += 8) {
      const byteStr = binary.substring(i, i + 8);
      if (byteStr.length === 8) {
        bytes.push(parseInt(byteStr, 2));
      }
    }
    const decoder = new TextDecoder();
    const decoded = decoder.decode(new Uint8Array(bytes));
    return { detected: true, charCount, decodedString: decoded };
  } catch {
    return { detected: true, charCount, decodedString: 'Binary payload detected (custom encoding)' };
  }
}

// Runs the Innershell script in the isolated sandbox (see sandbox.ts).
export async function executeInnershellScript(
  scriptCode: string,
  context: {
    memory: Record<string, any>;
    ssiState: Record<string, any>;
    transcriptHash?: string;
    videoTitle?: string;
  }
): Promise<{
  status: 'SUCCESS' | 'ERROR';
  executionTimeMs: number;
  output: any;
  logs: string[];
  mutatedMemory: Record<string, any>;
}> {
  const res = await runSandboxed(scriptCode, {
    memory: context.memory || {},
    ssiState: context.ssiState || {},
    transcriptHash: context.transcriptHash || 'N/A',
    videoTitle: context.videoTitle || '',
  });

  if (!res.ok) {
    return {
      status: 'ERROR',
      executionTimeMs: res.timeMs,
      output: { error: res.error || 'Execution error' },
      logs: [...res.logs, `[RUNTIME_EXCEPTION]: ${res.error}`],
      mutatedMemory: context.memory,
    };
  }

  const finalMemory = { ...(res.memory || {}) };
  if (res.result && typeof res.result === 'object' && res.result.stateDelta && typeof res.result.stateDelta === 'object') {
    Object.assign(finalMemory, res.result.stateDelta);
  }
  return {
    status: 'SUCCESS',
    executionTimeMs: res.timeMs,
    output: res.result !== null ? res.result : { message: 'Script executed with no return value' },
    logs: res.logs.length > 0 ? res.logs : ['Script produced no log output.'],
    mutatedMemory: finalMemory,
  };
}
