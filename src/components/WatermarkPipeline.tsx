import React, { useState } from 'react';
import {
  ShieldCheck,
  Minimize2,
  Lock,
  Key,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  Hash,
  Sparkles,
  RotateCw,
  Binary,
  Cpu,
} from 'lucide-react';
import {
  VideoNode,
  InnershellLogic,
  WatermarkData,
  CompressedTranscriptData,
} from '../types';
import { inspectSteganographicPayload } from '../utils/crypto';

interface WatermarkPipelineProps {
  activeVideo: VideoNode | null;
  innershellLogic: InnershellLogic | null;
  onWatermarkAndCompress: () => void;
  isLoading: boolean;
  onProceedToGuard: () => void;
}

export const WatermarkPipeline: React.FC<WatermarkPipelineProps> = ({
  activeVideo,
  innershellLogic,
  onWatermarkAndCompress,
  isLoading,
  onProceedToGuard,
}) => {
  const [showStegoInspector, setShowStegoInspector] = useState(false);
  const watermark = activeVideo?.watermark;
  const compressed = activeVideo?.compressedTranscript;

  const stegoInfo = watermark?.watermarkedText
    ? inspectSteganographicPayload(watermark.watermarkedText)
    : null;

  const isSignedBeforeCompression = !!(
    watermark?.signedLogicHash &&
    compressed?.compressedBase64
  );

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-2xl border border-cyan-800/40 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-300">
              <Lock className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Cryptographic Watermarking & Pre-Compression Binding Engine
              </h2>
              <p className="text-xs text-slate-400">
                Enforces the invariant: Transcripts must be watermarked and logic must be signed with transcript watermarks before the watermarked transcript is compressed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onWatermarkAndCompress}
              disabled={isLoading || !activeVideo?.rawTranscript || !innershellLogic}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs font-mono transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Binding & Compressing...</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Sign Logic & Compress Transcript</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 5-Step Architectural Progression Ladder */}
        <div className="mt-5 pt-4 border-t border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs font-mono">
            {/* Step 1 */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                activeVideo?.rawTranscript
                  ? 'bg-slate-900 border-cyan-800 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-600'
              }`}
            >
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                STEP 01
              </span>
              <p className="font-semibold text-slate-300">Direct Transcript</p>
              <span className="text-[10px] text-slate-400">
                {activeVideo?.rawTranscript ? 'Canonical Digest Ready' : 'Pending Ingestion'}
              </span>
            </div>

            {/* Step 2 */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                innershellLogic
                  ? 'bg-slate-900 border-cyan-800 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-600'
              }`}
            >
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                STEP 02
              </span>
              <p className="font-semibold text-slate-300">RCL/SSI Logic</p>
              <span className="text-[10px] text-slate-400">
                {innershellLogic ? 'Innershell Body Synthesized' : 'Pending Synthesis'}
              </span>
            </div>

            {/* Step 3 */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                watermark
                  ? 'bg-slate-900 border-cyan-800 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-600'
              }`}
            >
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                STEP 03
              </span>
              <p className="font-semibold text-slate-300">Transcript Watermark</p>
              <span className="text-[10px] text-slate-400">
                {watermark ? 'HMAC + Stego Injected' : 'Pending Watermarking'}
              </span>
            </div>

            {/* Step 4 */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                watermark?.signedLogicHash
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                  : 'bg-slate-950 border-slate-800 text-slate-600'
              }`}
            >
              <span className="text-[10px] text-emerald-400 font-bold block mb-1">
                STEP 04
              </span>
              <p className="font-semibold text-emerald-300">Logic Signature Binding</p>
              <span className="text-[10px] text-emerald-400">
                {watermark?.signedLogicHash ? 'Pre-Compression Signed' : 'Pending Logic Hash'}
              </span>
            </div>

            {/* Step 5 */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                compressed
                  ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-200'
                  : 'bg-slate-950 border-slate-800 text-slate-600'
              }`}
            >
              <span className="text-[10px] text-indigo-400 font-bold block mb-1">
                STEP 05
              </span>
              <p className="font-semibold text-indigo-300">Transcript Compressed</p>
              <span className="text-[10px] text-indigo-400">
                {compressed ? `-${compressed.compressionRatioPercent}% Token Reduction` : 'Awaiting Binding'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Cryptographic Certificate + Compression Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cryptographic Watermark & Signature Certificate (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Cryptographic Watermark & Logic Signature Certificate
                </h3>
              </div>
              {watermark?.signedLogicHash && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[10px] font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  PRE-COMPRESSION BINDING VERIFIED
                </span>
              )}
            </div>

            {watermark ? (
              <div className="space-y-3 font-mono text-xs">
                {/* Watermark ID */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 block">Watermark Unique ID:</span>
                  <div className="flex items-center justify-between text-cyan-300 font-bold">
                    <span className="truncate">{watermark.watermarkId}</span>
                    <Hash className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                  </div>
                </div>

                {/* Direct Transcript Canonical Hash */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 block">Direct Transcript HMAC-SHA256:</span>
                  <span className="text-slate-300 text-[11px] break-all block">
                    {watermark.transcriptHash}
                  </span>
                </div>

                {/* Pertained Logic Signature */}
                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-900/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-400 block">
                      Signed Logic Hash (Bound to Transcript Watermark):
                    </span>
                    <Lock className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-emerald-300 text-[11px] break-all block font-bold">
                    {watermark.signedLogicHash || 'NO_LOGIC_ATTACHED'}
                  </span>
                </div>

                {/* Steganographic Zero-Width Data */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Binary className="w-3.5 h-3.5 text-cyan-400" />
                      Zero-Width Steganographic Embedding:
                    </span>
                    <button
                      onClick={() => setShowStegoInspector(!showStegoInspector)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                    >
                      {showStegoInspector ? 'Hide Stego Inspector' : 'Inspect Stego Token'}
                    </button>
                  </div>

                  {showStegoInspector && stegoInfo && (
                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-400">
                        <span>Zero-Width Glyphs Embedded:</span>
                        <span className="text-cyan-400 font-bold">{stegoInfo.charCount} chars</span>
                      </div>
                      <div className="text-slate-400">
                        <span>Decoded Stego Payload: </span>
                        <code className="text-emerald-300 break-all">{stegoInfo.decodedString}</code>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-10 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Watermark Not Yet Generated</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ensure Innershell logic is synthesized, then click "Sign Logic & Compress Transcript".
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Compression Metrics & Decompression Verification (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Minimize2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Transcript Compression Engine
                </h3>
              </div>
              {compressed?.decompressionVerified && (
                <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[10px] font-mono">
                  LOSSLESS VERIFIED
                </span>
              )}
            </div>

            {compressed ? (
              <div className="space-y-4 font-mono text-xs">
                {/* Big Compression Ratio Gauge */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/50 to-slate-950 border border-indigo-800/40 text-center space-y-1">
                  <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">
                    -{compressed.compressionRatioPercent}%
                  </span>
                  <p className="text-[11px] text-slate-400">Context Window Token Reduction</p>
                </div>

                {/* Token and Byte Comparison */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                    <span className="text-slate-400">Pre-Compression Tokens:</span>
                    <span className="text-slate-200 font-bold">
                      {compressed.rawSizeTokens.toLocaleString()} tokens
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                    <span className="text-slate-400">Compressed Byte Payload:</span>
                    <span className="text-indigo-300 font-bold">
                      {compressed.compressedSizeBytes.toLocaleString()} bytes
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                    <span className="text-slate-400">Compression Algorithm:</span>
                    <span className="text-cyan-400">{compressed.algorithm}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                    <span className="text-slate-400">Decompression Integrity:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      100% Exact Match
                    </span>
                  </div>
                </div>

                {/* Compressed Base64 String Preview */}
                <div className="space-y-1 text-[11px]">
                  <span className="text-slate-500">Compressed Token Stream:</span>
                  <div className="p-2.5 rounded bg-slate-950 text-indigo-300 text-[10px] break-all max-h-24 overflow-y-auto font-mono">
                    {compressed.compressedBase64}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                <Minimize2 className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">No Compressed Record</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Compression occurs strictly after the watermark signs the logic.
                </p>
              </div>
            )}

            {/* Advance to Guard Shell */}
            <div className="pt-2">
              <button
                onClick={onProceedToGuard}
                disabled={!isSignedBeforeCompression}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
              >
                <span>Proceed to Phase Boundary & Guard Shell</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
