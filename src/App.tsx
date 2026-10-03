import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { PlaylistIngestion } from './components/PlaylistIngestion';
import { InnerShellBody } from './components/InnerShellBody';
import { WatermarkPipeline } from './components/WatermarkPipeline';
import { PhaseBoundary } from './components/PhaseBoundary';
import { GuardShell } from './components/GuardShell';
import { SessionMemoryModal } from './components/SessionMemoryModal';
import { EpistemicKnowledgeEngine } from './components/EpistemicKnowledgeEngine';
import { AetherTwinParallel } from './components/AetherTwinParallel';
import { AetherOutputHubModal } from './components/AetherOutputHubModal';
import {
  PlaylistData,
  VideoNode,
  CuratedPlaylistSummary,
  InnershellLogic,
  RclAnalysis,
  ScriptExecutionResult,
  GuardAuditReport,
  PersistentSessionMemory,
  SynthesizedKnowledge,
  CustomGitHubGuard,
  GitHubGuardAuditResult,
  DualGuardComparisonReport,
} from './types';
import {
  fetchCuratedPlaylists,
  fetchPlaylistData,
  transcribeAudioSegment,
  watermarkAndBindCrypto,
  runRclSsiCycle,
  validateWithGuardShell,
  validateWithGuardShellBeta,
  validateWithDualGuardShells,
  absorbRunIntoTwin,
} from './services/api';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Layers,
  ShieldCheck,
  Terminal,
  Sparkles,
} from 'lucide-react';

const SESSION_STORAGE_KEY = 'AETHERSHELL_SESSION_PERSISTENT_MEMORY_V2';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'pipeline' | 'knowledge' | 'innershell' | 'crypto' | 'guard' | 'twin' | 'memory'>('pipeline');
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isOutputHubOpen, setIsOutputHubOpen] = useState(false);

  // Data State
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylistSummary[]>([]);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [activeVideo, setActiveVideo] = useState<VideoNode | null>(null);

  // Innershell & Synthesis State
  const [innershellLogic, setInnershellLogic] = useState<InnershellLogic | null>(null);
  const [rclAnalysis, setRclAnalysis] = useState<RclAnalysis | null>(null);
  const [lastExecutionResult, setLastExecutionResult] = useState<ScriptExecutionResult | null>(null);

  // Guard Shell & Phase Boundary State
  const [guardReport, setGuardReport] = useState<GuardAuditReport | null>(null);
  const [guardReportBeta, setGuardReportBeta] = useState<GuardAuditReport | null>(null);
  const [dualComparisonReport, setDualComparisonReport] = useState<DualGuardComparisonReport | null>(null);
  const [boundaryStatus, setBoundaryStatus] = useState<'LOCKED' | 'AUDITING' | 'PASSED' | 'FEEDBACK_LOOP'>('LOCKED');
  const [customGitHubGuard, setCustomGitHubGuard] = useState<CustomGitHubGuard | null>(null);
  const [customGuardAuditResult, setCustomGuardAuditResult] = useState<GitHubGuardAuditResult | null>(null);

  // Loading & Toast State
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Multi-Session Persistent Memory
  const [sessionMemory, setSessionMemory] = useState<PersistentSessionMemory>(() => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return {
      sessionId: `SESSION-${Date.now().toString(36).toUpperCase()}`,
      sessionName: 'Default Active Working Lattice',
      createdAt: Date.now(),
      lastActive: Date.now(),
      memoryLattice: {
        agenticPhase: 'INIT',
        sessionStep: 1,
        activeInvariantThreshold: 0.95,
        executionHistory: [],
      },
      historyRuns: [],
    };
  });

  // Sync session memory to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionMemory));
    } catch (err) {
      console.warn('Failed to save session memory to localStorage:', err);
    }
  }, [sessionMemory]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Initial Load: Fetch curated playlists and default load the first one
  useEffect(() => {
    const init = async () => {
      try {
        const curated = await fetchCuratedPlaylists();
        setCuratedPlaylists(curated);
        if (curated.length > 0) {
          const res = await fetchPlaylistData({ curatedId: curated[0].id });
          setPlaylist(res.playlist);
          if (res.playlist.videos.length > 0) {
            setActiveVideo(res.playlist.videos[0]);
          }
        }
      } catch (err: any) {
        console.error('Init error:', err);
        showToast('Initialized offline fallback with curated data', 'info');
      }
    };
    init();
  }, []);

  // Handler: Ingest URL or select curated
  const handleIngestUrl = async (url: string) => {
    setIsLoading(true);
    try {
      const res = await fetchPlaylistData({ playlistUrl: url });
      setPlaylist(res.playlist);
      if (res.playlist.videos.length > 0) {
        setActiveVideo(res.playlist.videos[0]);
      }
      showToast(`Ingested playlist: "${res.playlist.title}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to ingest playlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadCurated = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetchPlaylistData({ curatedId: id });
      setPlaylist(res.playlist);
      if (res.playlist.videos.length > 0) {
        setActiveVideo(res.playlist.videos[0]);
      }
      showToast(`Loaded curated playlist: "${res.playlist.title}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to load curated playlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Deep transcribe individual video
  const handleDeepTranscribe = async (video: VideoNode) => {
    setIsLoading(true);
    try {
      const res = await transcribeAudioSegment({
        videoTitle: video.title,
        audioNotes: video.rawTranscript,
        existingSegments: video.segments,
      });

      const updatedSegments = res.segments;
      const updatedRaw = updatedSegments
        .map((s: any) => `[${s.start} - ${s.end}] ${s.speaker}: ${s.text}`)
        .join('\n\n');

      const updatedVideo = {
        ...video,
        segments: updatedSegments,
        rawTranscript: updatedRaw,
      };

      setActiveVideo(updatedVideo);

      // Update in playlist
      if (playlist) {
        setPlaylist({
          ...playlist,
          videos: playlist.videos.map((v) => (v.id === video.id ? updatedVideo : v)),
        });
      }

      showToast(`Transcribed "${video.title}" with Gemini`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Transcription failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Run RCL and SSI synthesis in Innershell Body
  const handleRunRclSsi = async (iterations: number, directives: string) => {
    if (!activeVideo?.rawTranscript) {
      showToast('Please select a video with transcript dialogue first', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await runRclSsiCycle({
        playlist: playlist || undefined,
        activeVideo,
        sessionMemory: sessionMemory.memoryLattice,
        rclIterations: iterations,
        userDirectives: directives,
      });

      setRclAnalysis(res.rclResult);
      setInnershellLogic(res.innershellLogic);

      // Update memory lattice with newly induced state
      const updatedLattice = {
        ...sessionMemory.memoryLattice,
        lastRclSynthesis: Date.now(),
        innershellLogicId: res.innershellLogic.logicId,
        ssiContextWindow: res.rclResult.ssiInjectedState.activeContextWindow,
      };

      setSessionMemory((prev) => ({
        ...prev,
        lastActive: Date.now(),
        memoryLattice: updatedLattice,
      }));

      showToast(`RCL/SSI cycle complete (${iterations} iterations). Logic ready for binding.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'RCL/SSI cycle failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Cryptographic Watermarking, Logic Signature Binding, and Compression
  // "ALL TRANSCRIPTS must be watermarked and logic pertained must be signed with the transcripts watermarks
  //  holding the signature of the pertained logic before the watermark transcript is compressed."
  const handleWatermarkAndCompress = async () => {
    if (!activeVideo?.rawTranscript || !innershellLogic) {
      showToast('Need active transcript and synthesized Innershell logic to bind', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await watermarkAndBindCrypto({
        rawTranscript: activeVideo.rawTranscript,
        videoId: activeVideo.id,
        playlistId: playlist?.id,
        pertainedLogic: innershellLogic,
      });

      const updatedVideo = {
        ...activeVideo,
        watermark: res.watermark,
        compressedTranscript: res.compressed,
      };

      setActiveVideo(updatedVideo);

      if (playlist) {
        setPlaylist({
          ...playlist,
          videos: playlist.videos.map((v) => (v.id === activeVideo.id ? updatedVideo : v)),
        });
      }

      showToast(
        `Logic signed with Watermark ${res.watermark.watermarkId.slice(0, 12)}... prior to compression (-${res.compressed.compressionRatioPercent}%)`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Watermark & compression failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Run Guard Shell Validation across Phase Boundary
  const handleRunGuardAudit = async () => {
    if (!activeVideo?.rawTranscript || !innershellLogic) {
      showToast('Ground truth transcript and innershell logic are required', 'error');
      return;
    }

    setIsLoading(true);
    setBoundaryStatus('AUDITING');

    try {
      const res = await validateWithGuardShell({
        directTranscript: activeVideo.rawTranscript,
        watermark: activeVideo.watermark,
        compressedRecord: activeVideo.compressedTranscript,
        innershellLogic,
        executedOutput: lastExecutionResult?.output,
      });

      setGuardReport(res.guardReport);

      if (res.guardReport.passedPhaseBoundary) {
        setBoundaryStatus('PASSED');
        showToast('Guard Shell: Architectural alignment approved at Phase Boundary!', 'success');
      } else if (res.guardReport.semanticAudit.feedbackLoopRequired) {
        setBoundaryStatus('FEEDBACK_LOOP');
        showToast('Guard Shell: Critical feedback loop triggered due to invariant drift', 'error');
      } else {
        setBoundaryStatus('LOCKED');
        showToast('Guard Shell: State quarantined at boundary', 'info');
      }

      // Record in session history
      setSessionMemory((prev) => ({
        ...prev,
        lastActive: Date.now(),
        historyRuns: [
          {
            id: `RUN-${Date.now().toString(36)}`,
            timestamp: Date.now(),
            videoTitle: activeVideo.title,
            alignmentScore: res.guardReport.semanticAudit.alignmentScore,
            boundaryDecision: res.guardReport.semanticAudit.boundaryDecision,
          },
          ...prev.historyRuns.slice(0, 19),
        ],
      }));

      // Concurrently feed execution event to Parallel Shadow System
      absorbRunIntoTwin({
        runId: `RUN-${Date.now().toString(36)}`,
        innershellLogic,
        guardReport: res.guardReport,
      }).catch((e) => console.warn('Shadow twin absorption failed silently:', e));
    } catch (err: any) {
      setBoundaryStatus('LOCKED');
      showToast(err.message || 'Guard Shell validation failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Run Guard Shell Beta Independent Adversarial Audit
  const handleRunBetaGuardAudit = async (adversarialStrictness: 'HIGH' | 'MAXIMUM' | 'STANDARD' = 'HIGH') => {
    if (!activeVideo?.rawTranscript || !innershellLogic) {
      showToast('Ground truth transcript and innershell logic are required', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await validateWithGuardShellBeta({
        directTranscript: activeVideo.rawTranscript,
        watermark: activeVideo.watermark,
        compressedRecord: activeVideo.compressedTranscript,
        innershellLogic,
        executedOutput: lastExecutionResult?.output,
        adversarialStrictness,
      });

      setGuardReportBeta(res.guardReport);
      showToast('Guard Shell Beta: Independent adversarial audit complete!', 'info');
    } catch (err: any) {
      showToast(err.message || 'Guard Shell Beta audit failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Run Concurrent Dual Guard Verification (Alpha + Beta)
  const handleRunDualGuardAudit = async (adversarialStrictness: 'HIGH' | 'MAXIMUM' | 'STANDARD' = 'HIGH') => {
    if (!activeVideo?.rawTranscript || !innershellLogic) {
      showToast('Ground truth transcript and innershell logic are required', 'error');
      return;
    }

    setIsLoading(true);
    setBoundaryStatus('AUDITING');

    try {
      const comparison = await validateWithDualGuardShells({
        directTranscript: activeVideo.rawTranscript,
        watermark: activeVideo.watermark,
        compressedRecord: activeVideo.compressedTranscript,
        innershellLogic,
        executedOutput: lastExecutionResult?.output,
        adversarialStrictness,
      });

      setDualComparisonReport(comparison);
      setGuardReport(comparison.guardReportAlpha);
      setGuardReportBeta(comparison.guardReportBeta);

      if (comparison.passedConcurrentValidation) {
        setBoundaryStatus('PASSED');
        showToast(`Dual Guard Quorum Approved: δ_α=${comparison.deltaAlpha}, δ_β=${comparison.deltaBeta}`, 'success');
      } else if (comparison.consensusStatus === 'DIVERGENCE_DISAGREEMENT') {
        setBoundaryStatus('FEEDBACK_LOOP');
        showToast(`Dual Guard Divergence Gap Detected (|δ_α - δ_β| = ${comparison.divergenceDiscrepancy})! Quarantined.`, 'error');
      } else {
        setBoundaryStatus('LOCKED');
        showToast('Dual Guard Shells: Quarantined at phase boundary.', 'info');
      }

      // Record in session memory
      absorbRunIntoTwin({
        runId: `DUAL-RUN-${Date.now().toString(36)}`,
        innershellLogic,
        guardReport: comparison.guardReportAlpha,
      }).catch(() => {});
    } catch (err: any) {
      setBoundaryStatus('LOCKED');
      showToast(err.message || 'Dual Guard verification failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Critical Feedback Loop: Dispatches corrective guidance back to Innershell
  const handleTriggerFeedbackLoop = () => {
    setBoundaryStatus('FEEDBACK_LOOP');
    setActiveTab('innershell');
    showToast('Dispatched corrective feedback loop to Innershell Body. Re-run RCL loop.', 'info');
  };

  // Inject Synthesized Knowledge into Innershell SSI Memory
  const handleInjectKnowledgeIntoInnershell = (k: SynthesizedKnowledge) => {
    setSessionMemory((prev) => ({
      ...prev,
      lastActive: Date.now(),
      memoryLattice: {
        ...prev.memoryLattice,
        activeSynthesizedTitle: k.title,
        activeSynthesizedTheory: k.coreThesis,
        subjugatedAxioms: k.subjugatedAxioms,
        emergentConcepts: k.emergentConcepts,
        injectedDirectives: k.actionableDirectives,
      },
    }));
    setActiveTab('innershell');
    showToast(`Injected "${k.title}" into Innershell SSI working memory!`, 'success');
  };

  // Reset Session
  const handleResetSession = () => {
    const fresh: PersistentSessionMemory = {
      sessionId: `SESSION-${Date.now().toString(36).toUpperCase()}`,
      sessionName: 'Fresh Working Lattice',
      createdAt: Date.now(),
      lastActive: Date.now(),
      memoryLattice: {
        agenticPhase: 'INIT',
        sessionStep: 1,
        activeInvariantThreshold: 0.95,
        executionHistory: [],
      },
      historyRuns: [],
    };
    setSessionMemory(fresh);
    setInnershellLogic(null);
    setRclAnalysis(null);
    setLastExecutionResult(null);
    setGuardReport(null);
    setBoundaryStatus('LOCKED');
    showToast('Session memory and active pipeline reset', 'info');
  };

  const hasWatermarkAndLogic = !!(
    activeVideo?.watermark?.signedLogicHash &&
    activeVideo?.compressedTranscript
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5">
          <div
            className={`px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2 text-xs font-mono font-medium backdrop-blur-md ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
                : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-cyan-400" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sessionMemory={sessionMemory}
        boundaryStatus={boundaryStatus}
        onResetSession={handleResetSession}
        onOpenMemoryModal={() => setIsMemoryModalOpen(true)}
        onOpenOutputHub={() => setIsOutputHubOpen(true)}
        hasWatermarkAndLogic={hasWatermarkAndLogic}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Phase Boundary Membrane (Always visible between steps) */}
        <PhaseBoundary
          boundaryStatus={boundaryStatus}
          guardReport={guardReport}
          onInitiateMerge={handleRunGuardAudit}
          onTriggerFeedbackLoop={handleTriggerFeedbackLoop}
          isLoading={isLoading}
          canMerge={hasWatermarkAndLogic}
        />

        {/* Tab 1: YouTube Ingestion & Transcripts */}
        {activeTab === 'pipeline' && (
          <PlaylistIngestion
            playlist={playlist}
            curatedPlaylists={curatedPlaylists}
            activeVideo={activeVideo}
            setActiveVideo={setActiveVideo}
            onLoadCurated={handleLoadCurated}
            onIngestUrl={handleIngestUrl}
            onDeepTranscribe={handleDeepTranscribe}
            isLoading={isLoading}
            onProceedToInnershell={() => setActiveTab('innershell')}
            onProceedToKnowledge={() => setActiveTab('knowledge')}
          />
        )}

        {/* Tab 2: Subjugated Knowledge Brain */}
        {activeTab === 'knowledge' && (
          <EpistemicKnowledgeEngine
            playlist={playlist}
            sessionMemory={sessionMemory}
            onUpdateSessionMemory={(newMem) =>
              setSessionMemory((prev) => ({
                ...prev,
                lastActive: Date.now(),
                memoryLattice: newMem,
              }))
            }
            onInjectIntoInnershell={handleInjectKnowledgeIntoInnershell}
          />
        )}

        {/* Tab 3: RCL & SSI Innershell Body */}
        {activeTab === 'innershell' && (
          <InnerShellBody
            innershellLogic={innershellLogic}
            rclAnalysis={rclAnalysis}
            activeVideo={activeVideo}
            sessionMemory={sessionMemory}
            onUpdateSessionMemory={(newMem) =>
              setSessionMemory((prev) => ({
                ...prev,
                lastActive: Date.now(),
                memoryLattice: newMem,
              }))
            }
            onRunRclSsi={handleRunRclSsi}
            isLoading={isLoading}
            onProceedToCrypto={() => setActiveTab('crypto')}
            lastExecutionResult={lastExecutionResult}
            setLastExecutionResult={setLastExecutionResult}
          />
        )}

        {/* Tab 3: Cryptographic Watermarking & Pre-Compression Binding */}
        {activeTab === 'crypto' && (
          <WatermarkPipeline
            activeVideo={activeVideo}
            innershellLogic={innershellLogic}
            onWatermarkAndCompress={handleWatermarkAndCompress}
            isLoading={isLoading}
            onProceedToGuard={() => setActiveTab('guard')}
          />
        )}

        {/* Tab 5: Second Agentic Guard Shell */}
        {activeTab === 'guard' && (
          <GuardShell
            guardReport={guardReport}
            guardReportBeta={guardReportBeta}
            dualComparisonReport={dualComparisonReport}
            activeVideo={activeVideo}
            innershellLogic={innershellLogic}
            lastExecutionResult={lastExecutionResult}
            onTriggerFeedbackLoop={handleTriggerFeedbackLoop}
            onRunAudit={handleRunGuardAudit}
            onRunBetaAudit={handleRunBetaGuardAudit}
            onRunDualAudit={handleRunDualGuardAudit}
            isLoading={isLoading}
            customGitHubGuard={customGitHubGuard}
            setCustomGitHubGuard={setCustomGitHubGuard}
            customGuardAuditResult={customGuardAuditResult}
            setCustomGuardAuditResult={setCustomGuardAuditResult}
          />
        )}

        {/* Tab 6: Replicated Parallel Shadow System (AetherTwin) */}
        {activeTab === 'twin' && (
          <AetherTwinParallel
            innershellLogic={innershellLogic}
            guardReport={guardReport}
            sessionMemory={sessionMemory}
            activeRclIterations={sessionMemory.memoryLattice.optimalRclIterations || 3}
            onApplyOptimalRclIterations={(count) => {
              setSessionMemory((prev) => ({
                ...prev,
                lastActive: Date.now(),
                memoryLattice: {
                  ...prev.memoryLattice,
                  optimalRclIterations: count,
                },
              }));
              showToast(`Applied optimal ${count} RCL iterations to Innershell Engine!`, 'success');
            }}
            onUpdateSessionMemory={(newMem) =>
              setSessionMemory((prev) => ({
                ...prev,
                lastActive: Date.now(),
                memoryLattice: newMem,
              }))
            }
            showToast={showToast}
          />
        )}
      </main>

      {/* Persistent Multi-Session Memory Modal */}
      <SessionMemoryModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        sessionMemory={sessionMemory}
        onUpdateMemory={(newMem) =>
          setSessionMemory((prev) => ({
            ...prev,
            lastActive: Date.now(),
            memoryLattice: newMem,
          }))
        }
        onResetSession={handleResetSession}
      />

      {/* AetherShell Output Tool: Copy / Paste / Download Modal */}
      <AetherOutputHubModal
        isOpen={isOutputHubOpen}
        onClose={() => setIsOutputHubOpen(false)}
        activeVideo={activeVideo}
        innershellLogic={innershellLogic}
        rclAnalysis={rclAnalysis}
        lastExecutionResult={lastExecutionResult}
        guardReport={guardReport}
        sessionMemory={sessionMemory}
        onRestoreState={({ innershellLogic: l, guardReport: g, rclAnalysis: r, memoryLattice: m }) => {
          if (l) setInnershellLogic(l);
          if (g) setGuardReport(g);
          if (r) setRclAnalysis(r);
          if (m) {
            setSessionMemory((prev) => ({
              ...prev,
              lastActive: Date.now(),
              memoryLattice: { ...prev.memoryLattice, ...m },
            }));
          }
          if (g?.semanticAudit?.boundaryDecision === 'APPROVED') {
            setBoundaryStatus('PASSED');
          }
        }}
        showToast={showToast}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        <p>
          AetherShell Dual-Shell Architecture • RCL Iterative Reasoning • SSI Grounding Matrix • Watermark-Signed Pre-Compression
        </p>
      </footer>
    </div>
  );
}
