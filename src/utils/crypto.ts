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

// Client-side execution sandbox for the Innershell context-aware script
export function executeInnershellScript(
  scriptCode: string,
  context: {
    memory: Record<string, any>;
    ssiState: Record<string, any>;
    transcriptHash?: string;
    videoTitle?: string;
  }
): {
  status: 'SUCCESS' | 'ERROR';
  executionTimeMs: number;
  output: any;
  logs: string[];
  mutatedMemory: Record<string, any>;
} {
  const startTime = performance.now();
  const logs: string[] = [];

  const mockConsole = {
    log: (...args: any[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
    warn: (...args: any[]) => logs.push('[WARN] ' + args.join(' ')),
    error: (...args: any[]) => logs.push('[ERR] ' + args.join(' ')),
  };

  try {
    // Clone memory to observe mutations
    const memoryWorkingCopy = JSON.parse(JSON.stringify(context.memory || {}));

    const sandboxContext = {
      ctx: {
        memory: memoryWorkingCopy,
        ssiState: context.ssiState || {},
        transcriptHash: context.transcriptHash || 'N/A',
        videoTitle: context.videoTitle || 'Active Video Node',
        log: mockConsole.log,
      },
      console: mockConsole,
      Date,
      Math,
      JSON,
    };

    // Construct a safe evaluator wrapper
    const runner = new Function(
      'ctx',
      'console',
      'Date',
      'Math',
      'JSON',
      `"use strict";
       try {
         ${scriptCode}
       } catch(e) {
         throw e;
       }`
    );

    const result = runner(
      sandboxContext.ctx,
      sandboxContext.console,
      sandboxContext.Date,
      sandboxContext.Math,
      sandboxContext.JSON
    );

    const endTime = performance.now();

    // Check if script mutated context.memory or returned a stateDelta
    const finalMemory = { ...memoryWorkingCopy };
    if (result && typeof result === 'object' && result.stateDelta) {
      Object.assign(finalMemory, result.stateDelta);
    }

    return {
      status: 'SUCCESS',
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      output: result !== undefined ? result : { message: 'Script executed with no return value' },
      logs: logs.length > 0 ? logs : ['Execution completed cleanly with zero standard error.'],
      mutatedMemory: finalMemory,
    };
  } catch (err: any) {
    const endTime = performance.now();
    return {
      status: 'ERROR',
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      output: { error: err.message || 'Execution error' },
      logs: [...logs, `[RUNTIME_EXCEPTION]: ${err.message}`],
      mutatedMemory: context.memory,
    };
  }
}
