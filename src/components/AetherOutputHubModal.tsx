import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  ClipboardPaste,
  Check,
  FileText,
  FileCode,
  ShieldCheck,
  Upload,
  RefreshCw,
  X,
  Sparkles,
  Layers,
  Database,
  ArrowRight,
  ExternalLink,
  Code2,
} from 'lucide-react';
import {
  InnershellLogic,
  RclAnalysis,
  ScriptExecutionResult,
  GuardAuditReport,
  VideoNode,
  PersistentSessionMemory,
} from '../types';

interface AetherOutputHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeVideo: VideoNode | null;
  innershellLogic: InnershellLogic | null;
  rclAnalysis: RclAnalysis | null;
  lastExecutionResult: ScriptExecutionResult | null;
  guardReport: GuardAuditReport | null;
  sessionMemory: PersistentSessionMemory;
  onRestoreState: (restored: {
    innershellLogic?: InnershellLogic;
    guardReport?: GuardAuditReport;
    rclAnalysis?: RclAnalysis;
    memoryLattice?: Record<string, any>;
  }) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const AetherOutputHubModal: React.FC<AetherOutputHubModalProps> = ({
  isOpen,
  onClose,
  activeVideo,
  innershellLogic,
  rclAnalysis,
  lastExecutionResult,
  guardReport,
  sessionMemory,
  onRestoreState,
  showToast,
}) => {
  // Navigation mode inside modal
  const [activeMode, setActiveMode] = useState<'copy' | 'download' | 'paste'>('download');
  const [formatType, setFormatType] = useState<'bundle_json' | 'markdown_report' | 'executable_js' | 'proof_cert'>('bundle_json');

  // Copy Feedback
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  // Paste / Ingestion State
  const [pastedContent, setPastedContent] = useState('');
  const [pasteValidationStatus, setPasteValidationStatus] = useState<{
    valid: boolean;
    detectedType?: string;
    details?: string;
  } | null>(null);

  // Generate Export Payloads
  const fullBundleJson = useMemo(() => {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        aetherShellVersion: '2.5.0-SOTA',
        videoProvenance: activeVideo
          ? {
              id: activeVideo.id,
              title: activeVideo.title,
              channel: activeVideo.channel,
              duration: activeVideo.duration,
              url: activeVideo.url,
              watermark: activeVideo.watermark,
              hasCompressedTranscript: !!activeVideo.compressedTranscript,
            }
          : null,
        innershellLogic,
        rclAnalysis,
        lastExecutionResult,
        guardReport,
        sessionMemory: {
          sessionId: sessionMemory.sessionId,
          sessionName: sessionMemory.sessionName,
          memoryLattice: sessionMemory.memoryLattice,
        },
      },
      null,
      2
    );
  }, [activeVideo, innershellLogic, rclAnalysis, lastExecutionResult, guardReport, sessionMemory]);

  const markdownReport = useMemo(() => {
    const title = activeVideo?.title || 'YouTube Ingestion Series';
    const logicSummary = innershellLogic?.summary || 'No innershell logic synthesized yet.';
    const decision = guardReport?.semanticAudit.boundaryDecision || 'PENDING';
    const alignment = guardReport ? `${guardReport.semanticAudit.alignmentScore}%` : 'n/a';
    const triiStatus = !guardReport ? 'NOT RUN' : guardReport.passedPhaseBoundary ? 'PASSED' : 'FAILED';

    const steps = (innershellLogic?.workflowSteps || [])
      .map((s) => `### Step ${s.step}: ${s.action}\n${s.description}\n`)
      .join('\n');

    const invariants = (rclAnalysis?.extractedInvariants || [])
      .map((inv) => `- ${inv}`)
      .join('\n');

    return `# AetherShell Epistemic Execution & Verification Dossier
**Generated:** ${new Date().toUTCString()}  
**Video Ground Truth:** ${title}  
**Model Decision:** \`${decision}\` | **Model Alignment Score:** \`${alignment}\`  
**Guard Result (all checks):** \`${triiStatus}\`  

---

## 1. Executive Summary & Synthesis
${logicSummary}

---

## 2. Innershell Workflow Execution Steps
${steps || '_No discrete steps synthesized._'}

---

## 3. Extracted Reflexive Invariants (RCL/SSI Engine)
${invariants || '_No invariants synthesized._'}

---

## 4. Guard Checks
${guardReport
  ? [
      guardReport.multiGuardTelemetry?.guard1ChannelSentinel,
      guardReport.multiGuardTelemetry?.guard2SemanticAuditor,
      guardReport.multiGuardTelemetry?.guard3FormalOracle,
    ]
      .filter(Boolean)
      .map((g: any) => `- **${g.name}:** ${g.status}\n  - ${g.evidence}`)
      .join('\n')
  : '_Guard Shell not run._'}

---

## 5. Provenance
- Transcript SHA-256: \`${activeVideo?.watermark?.manifest?.transcriptSha256 || 'not signed'}\`
- Logic SHA-256: \`${activeVideo?.watermark?.manifest?.logicSha256 || 'not signed'}\`
- Ed25519 signature: \`${activeVideo?.watermark?.signature || 'none'}\`
- Signer key fingerprint: \`${activeVideo?.watermark?.publicKeyFingerprint || 'n/a'}\` (public key: GET /api/crypto/public-key)

---
*This report is a convenience export. Verify the signature against the server's public key; the text of this file is not itself signed.*
`;
  }, [activeVideo, innershellLogic, rclAnalysis, guardReport]);

  const executableJs = useMemo(() => {
    return innershellLogic?.executableScript || '// No executable script currently synthesized in Innershell Body.';
  }, [innershellLogic]);

  const proofCertJson = useMemo(() => {
    return JSON.stringify(
      {
        certificateId: `AETHER-CERT-${Date.now().toString(36).toUpperCase()}`,
        timestamp: Date.now(),
        transcriptWatermark: activeVideo?.watermark || null,
        cryptographicDetails: guardReport?.cryptographicDetails || null,
        multiGuardConsensus: guardReport?.multiGuardTelemetry || null,
        triiTwoStageProof: {
          formula: 'Valid(A) <=> (H(A) = H(Ls)) ^ (delta(A, T) <= epsilon)',
          isAlignmentValid: guardReport?.passedPhaseBoundary ?? null,
          signatureStatus: guardReport?.watermarkSignatureStatus ?? null,
          groundingDistance: guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? null,
          groundingLimit: guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.epsilonThreshold ?? null,
          note: 'Re-verify with POST /api/engine/guard-validate; this JSON is not self-authenticating.',
        },
      },
      null,
      2
    );
  }, [activeVideo, guardReport]);

  // Current Content Based on formatType
  const activeContent = useMemo(() => {
    switch (formatType) {
      case 'markdown_report':
        return markdownReport;
      case 'executable_js':
        return executableJs;
      case 'proof_cert':
        return proofCertJson;
      case 'bundle_json':
      default:
        return fullBundleJson;
    }
  }, [formatType, fullBundleJson, markdownReport, executableJs, proofCertJson]);

  // Handle Copy to Clipboard
  const handleCopyContent = (customText?: string, label?: string) => {
    const textToCopy = customText || activeContent;
    navigator.clipboard.writeText(textToCopy);
    const key = label || formatType;
    setCopiedFormat(key);
    showToast(`Copied ${key.replace(/_/g, ' ')} to clipboard! (${textToCopy.length.toLocaleString()} chars)`, 'success');
    setTimeout(() => setCopiedFormat(null), 2500);
  };

  // Handle File Download
  const handleDownloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename} successfully!`, 'success');
  };

  // Validate Pasted Content
  const handlePastedContentChange = (text: string) => {
    setPastedContent(text);
    if (!text.trim()) {
      setPasteValidationStatus(null);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed.innershellLogic || parsed.logicId || parsed.workflowSteps) {
        setPasteValidationStatus({
          valid: true,
          detectedType: 'AetherShell Output Bundle / Innershell Logic',
          details: `Detected logic with summary and workflow steps.`,
        });
      } else if (parsed.guardReport || parsed.semanticAudit) {
        setPasteValidationStatus({
          valid: true,
          detectedType: 'Guard Audit Report',
          details: `Detected Guard Shell findings with decision: ${parsed.semanticAudit?.boundaryDecision || 'AUDITED'}.`,
        });
      } else {
        setPasteValidationStatus({
          valid: true,
          detectedType: 'Generic JSON Object',
          details: `Detected valid JSON with ${Object.keys(parsed).length} keys.`,
        });
      }
    } catch {
      // Check if markdown
      if (text.includes('# AetherShell') || text.includes('## Innershell Workflow')) {
        setPasteValidationStatus({
          valid: true,
          detectedType: 'Markdown Dossier',
          details: 'Detected formatted AetherShell markdown dossier.',
        });
      } else {
        setPasteValidationStatus({
          valid: false,
          detectedType: 'Invalid Format',
          details: 'Content must be valid JSON or formatted AetherShell Markdown.',
        });
      }
    }
  };

  // Restore Parsed State
  const handleRestorePastedState = () => {
    if (!pastedContent.trim()) return;
    try {
      const parsed = JSON.parse(pastedContent);
      const restoredLogic = parsed.innershellLogic || (parsed.workflowSteps ? parsed : undefined);
      const restoredGuard = parsed.guardReport || (parsed.semanticAudit ? parsed : undefined);
      const restoredRcl = parsed.rclAnalysis;
      const restoredMemory = parsed.sessionMemory?.memoryLattice;

      onRestoreState({
        innershellLogic: restoredLogic,
        guardReport: restoredGuard,
        rclAnalysis: restoredRcl,
        memoryLattice: restoredMemory,
      });

      showToast('Successfully restored AetherShell state from pasted output!', 'success');
      onClose();
    } catch {
      showToast('Failed to parse pasted content. Ensure it is valid JSON.', 'error');
    }
  };

  // Sample Output Loader
  const handleLoadSampleOutput = () => {
    const sample = {
      exportedAt: new Date().toISOString(),
      innershellLogic: {
        logicId: 'SAMPLE-LOGIC (illustrative, not a real run)',
        summary: 'Synthesized Autonomous Dual-Shell Execution Architecture with TRII Invariant Induction.',
        workflowSteps: [
          { step: 1, action: 'Ingest Direct Transcript Stream', description: 'Acquire raw uncompressed audio segments as immutable ground truth.' },
          { step: 2, action: 'Sign Transcript And Logic', description: 'Ed25519-sign the SHA-256 hashes of transcript and logic before DEFLATE compression.' },
          { step: 3, action: 'Run Guard Shell', description: 'Verify signature and decompression, measure lexical grounding, request model review.' }
        ],
        executableScript: 'ctx.log("Sample script");\nreturn { ok: true };',
        expectedOutputs: { verifiedInvariantsCount: 3, stateMutations: { phaseBoundary: 'PASSED' } },
        criticalGuardRequirements: ['Order 0 Epistemic Subjugation', 'Pre-Compression Signature Binding']
      },
      guardReport: {
        guardShellTimestamp: Date.now(),
        watermarkSignatureStatus: 'VERIFIED',
        decompressionStatus: true,
        semanticAudit: {
          alignmentScore: 98,
          dataDegradationIndex: 0.02,
          boundaryDecision: 'APPROVED',
          reasoning: 'SAMPLE DATA for trying the import box. Imported reports are display-only and never mark the boundary as passed.',
          invariantAudit: [
            { name: 'Transcript Grounding', status: 'PASS', evidence: 'Ground truth anchors verified' },
            { name: 'Channel Integrity Lemma', status: 'PASS', evidence: 'H(D(C(Ls))) = H(Ls) authenticated' }
          ]
        },
        passedPhaseBoundary: false
      }
    };
    handlePastedContentChange(JSON.stringify(sample, null, 2));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-cyan-800/60 bg-slate-900 shadow-2xl shadow-cyan-950/40 overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/30">
              <Download className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
                AetherShell Output Tool & Exporter Hub
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                  Copy • Paste • Download
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Instantly export, copy to clipboard, or paste/import complete AetherShell syntheses, guard certificates, and execution scripts.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Operational Mode Navigation Tabs */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/40 border-b border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveMode('download')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeMode === 'download'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>1. Download Files</span>
            </button>

            <button
              onClick={() => setActiveMode('copy')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeMode === 'copy'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>2. Copy to Clipboard</span>
            </button>

            <button
              onClick={() => setActiveMode('paste')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeMode === 'paste'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>3. Paste & Restore Output</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 hidden sm:block">
            Payload Size: <strong className="text-cyan-400 font-mono">{(activeContent.length / 1024).toFixed(1)} KB</strong>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* MODE 1: DOWNLOAD WORKFLOW */}
          {activeMode === 'download' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* File 1: Full JSON Bundle */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-800/40 hover:border-cyan-600 transition-all space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                      <Database className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold">
                      .JSON
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-200 text-sm">Full State Bundle</h4>
                    <p className="text-[11px] text-slate-400 mt-1 font-sans">
                      Complete export containing Innershell logic, multi-guard reports, transcript watermark, and memory lattice.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleDownloadFile(
                        fullBundleJson,
                        `aethershell-bundle-${Date.now().toString(36)}.json`,
                        'application/json'
                      )
                    }
                    className="w-full py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-cyan-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON Bundle</span>
                  </button>
                </div>

                {/* File 2: Markdown Epistemic Report */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-800/40 hover:border-indigo-600 transition-all space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                      <FileText className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-bold">
                      .MD
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-200 text-sm">Markdown Dossier</h4>
                    <p className="text-[11px] text-slate-400 mt-1 font-sans">
                      Formatted analytical report with TRII proof, workflow steps, Hoare triples, and transcript citations.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleDownloadFile(
                        markdownReport,
                        `aethershell-report-${Date.now().toString(36)}.md`,
                        'text/markdown'
                      )
                    }
                    className="w-full py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-indigo-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Markdown Report</span>
                  </button>
                </div>

                {/* File 3: Standalone Executable Script */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-800/40 hover:border-emerald-600 transition-all space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                      <Code2 className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold">
                      .JS
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-200 text-sm">Executable Script</h4>
                    <p className="text-[11px] text-slate-400 mt-1 font-sans">
                      Standalone JavaScript script synthesized by the Innershell, runnable in Node.js or browser sandbox.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleDownloadFile(
                        executableJs,
                        `innershell-script-${Date.now().toString(36)}.js`,
                        'text/javascript'
                      )
                    }
                    className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-emerald-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Script (.js)</span>
                  </button>
                </div>

                {/* File 4: Cryptographic Invariant Certificate */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-800/40 hover:border-purple-600 transition-all space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-lg bg-purple-950 text-purple-300 border border-purple-800/60">
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 font-bold">
                      .CERT.JSON
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-200 text-sm">TRII Proof Certificate</h4>
                    <p className="text-[11px] text-slate-400 mt-1 font-sans">
                      Guard results with the signed transcript/logic hashes. Not self-authenticating: re-run the guard to verify.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleDownloadFile(
                        proofCertJson,
                        `aethershell-proof-${Date.now().toString(36)}.cert.json`,
                        'application/json'
                      )
                    }
                    className="w-full py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-purple-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Proof Certificate</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: COPY TO CLIPBOARD WORKFLOW */}
          {activeMode === 'copy' && (
            <div className="space-y-4">
              {/* Format Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <button
                    onClick={() => setFormatType('bundle_json')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      formatType === 'bundle_json'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Full Bundle (JSON)
                  </button>
                  <button
                    onClick={() => setFormatType('markdown_report')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      formatType === 'markdown_report'
                        ? 'bg-indigo-500 text-white font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Markdown Report (.md)
                  </button>
                  <button
                    onClick={() => setFormatType('executable_js')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      formatType === 'executable_js'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Executable Script (.js)
                  </button>
                  <button
                    onClick={() => setFormatType('proof_cert')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      formatType === 'proof_cert'
                        ? 'bg-purple-500 text-white font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Proof Certificate (.json)
                  </button>
                </div>

                <button
                  onClick={() => handleCopyContent()}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-cyan-500/20"
                >
                  {copiedFormat === formatType ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-950" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Current View</span>
                    </>
                  )}
                </button>
              </div>

              {/* Code Preview Box */}
              <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {activeContent}
              </div>
            </div>
          )}

          {/* MODE 3: PASTE & RESTORE OUTPUT WORKFLOW */}
          {activeMode === 'paste' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Paste AetherShell Output or Bundle</h4>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                    Paste previously exported JSON or Markdown here to inspect and restore the synthesized logic, guard verdicts, and memory into this session.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        handlePastedContentChange(text);
                        showToast('Pasted content from clipboard!', 'info');
                      } catch {
                        showToast('Clipboard access denied. Please paste manually into the box.', 'error');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste from Clipboard</span>
                  </button>

                  <button
                    onClick={handleLoadSampleOutput}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors"
                  >
                    Load Sample Bundle
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={pastedContent}
                onChange={(e) => handlePastedContentChange(e.target.value)}
                placeholder="Paste AetherShell JSON bundle, Innershell logic, or Markdown dossier here..."
                rows={10}
                className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs leading-relaxed"
              />

              {/* Validation Status Indicator */}
              {pasteValidationStatus && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    pasteValidationStatus.valid
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>
                      Detected: <strong>{pasteValidationStatus.detectedType}</strong> — {pasteValidationStatus.details}
                    </span>
                  </div>

                  {pasteValidationStatus.valid && (
                    <button
                      onClick={handleRestorePastedState}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Restore into Session</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>AetherShell export • signatures verifiable via /api/crypto/public-key</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyContent(fullBundleJson, 'bundle_json')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Full Bundle</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
