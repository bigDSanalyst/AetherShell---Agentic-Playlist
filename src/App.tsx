import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { PlaylistIngestion } from './components/PlaylistIngestion';
import { InnerShellBody } from './components/InnerShellBody';
import { WatermarkPipeline } from './components/WatermarkPipeline';
import { PhaseBoundary } from './components/PhaseBoundary';
import { GuardShell } from './components/GuardShell';
import { SessionMemoryModal } from './components/SessionMemoryModal';
import { DashboardWidget } from './components/DashboardWidget';
import { buildSnapshot, type ParsedSnapshot } from './utils/snapshot';
import { EpistemicKnowledgeEngine } from './components/EpistemicKnowledgeEngine';
import { AetherTwinParallel } from './components/AetherTwinParallel';
import { AetherOutputHubModal } from './components/AetherOutputHubModal';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  fetchVideoCaptions,
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
  const [transcribeProgress, setTranscribeProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
    percent: number;
  } | null>(null);

  // Multi-Session Persistent Memory
  const [sessionMemory, setSessionMemory] = useState<PersistentSessionMemory>(() => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return {
            sessionId: parsed.sessionId || `SESSION-${Date.now().toString(36).toUpperCase()}`,
            sessionName: parsed.sessionName || 'Default Active Working Lattice',
            createdAt: parsed.createdAt || Date.now(),
            lastActive: parsed.lastActive || Date.now(),
            memoryLattice:
              parsed.memoryLattice && typeof parsed.memoryLattice === 'object'
                ? parsed.memoryLattice
                : { agenticPhase: 'INIT', sessionStep: 1, activeInvariantThreshold: 0.95, executionHistory: [] },
            historyRuns: Array.isArray(parsed.historyRuns) ? parsed.historyRuns : [],
          };
        }
      }
    } catch (err) {
      console.warn('Failed to parse session memory from localStorage, resetting to default:', err);
    }
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

  // Sync session memory to localStorage on changes, and record whether it worked.
  const [lastSaved, setLastSaved] = useState<{ at: number } | { error: string } | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionMemory));
      setLastSaved({ at: Date.now() });
    } catch (err: any) {
      console.warn('Failed to save session memory to localStorage:', err);
      setLastSaved({ error: err?.name === 'QuotaExceededError' ? 'browser storage is full' : 'browser refused to save' });
    }
  }, [sessionMemory]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    // Errors and partial results carry reasons worth reading; give them time.
    setTimeout(() => setNotification(null), type === 'success' ? 4000 : 12000);
  };

  // Initial Load: Fetch curated playlists and default load the first one
  useEffect(() => {
    const init = async () => {
      try {
        const curated = await fetchCuratedPlaylists();
        setCuratedPlaylists(curated);
        // Start on offline demo data; live presets hit YouTube, so load them on click.
        const firstDemo = curated.find((c) => c.isDemo);
        if (firstDemo) {
          const res = await fetchPlaylistData({ curatedId: firstDemo.id });
          setPlaylist(res.playlist);
          if (res.playlist.videos.length > 0) {
            setActiveVideo(res.playlist.videos[0]);
          }
        }
      } catch (err: any) {
        console.error('Init error:', err);
        showToast(`Could not load demo playlists: ${err.message || err}`, 'error');
      }
    };
    init();
  }, []);

  const applyIngested = (res: Awaited<ReturnType<typeof fetchPlaylistData>>) => {
    setPlaylist(res.playlist);
    const firstWithText = res.playlist.videos.find((v) => v.rawTranscript) || res.playlist.videos[0];
    if (firstWithText) setActiveVideo(firstWithText);
    if (res.playlist.isDemo) {
      showToast(`Loaded demo playlist (synthetic transcripts): "${res.playlist.title}"`, 'info');
      return;
    }
    const withText = res.playlist.videos.filter((v) => v.rawTranscript).length;
    showToast(
      `Ingested "${res.playlist.title}": captions for ${withText}/${res.playlist.videos.length} video(s)` +
        (res.transcriptProblems ? ` · ${res.transcriptProblems}` : '') +
        (res.metadataNote ? ` · ${res.metadataNote}` : ''),
      withText === res.playlist.videos.length ? 'success' : 'info'
    );
  };

  // Handler: Ingest URL or select curated
  const handleIngestUrl = async (url: string) => {
    setIsLoading(true);
    try {
      applyIngested(await fetchPlaylistData({ playlistUrl: url }));
    } catch (err: any) {
      showToast(err.message || 'Failed to ingest playlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadCurated = async (id: string) => {
    setIsLoading(true);
    try {
      applyIngested(await fetchPlaylistData({ curatedId: id }));
    } catch (err: any) {
      showToast(err.message || 'Failed to load playlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const captionsToVideo = (video: VideoNode, segments: any[]): VideoNode => ({
    ...video,
    segments,
    rawTranscript: segments.map((s: any) => `[${s.start} - ${s.end}] ${s.speaker}: ${s.text}`).join('\n\n'),
    transcriptSource: 'youtube-captions',
    transcriptError: undefined,
  });

  // Re-fetch YouTube captions for one video, or (no argument) for every video
  // in the playlist, sequentially with progress. Never generates text.
  const handleDeepTranscribe = async (targetVideo?: VideoNode) => {
    if (playlist?.isDemo) {
      showToast('Demo videos are not real YouTube videos; there are no captions to fetch', 'info');
      return;
    }
    const videosToProcess = targetVideo ? [targetVideo] : playlist?.videos || [];
    if (videosToProcess.length === 0) {
      showToast('No videos to fetch captions for', 'error');
      return;
    }

    setIsLoading(true);
    const total = videosToProcess.length;
    const updated = new Map<string, VideoNode>();
    let ok = 0;
    try {
      for (let i = 0; i < total; i++) {
        const v = videosToProcess[i];
        setTranscribeProgress({ current: i, total, currentTitle: v.title, percent: Math.round((i / total) * 100) });
        try {
          const res = await fetchVideoCaptions({ youtubeId: v.youtubeId });
          updated.set(v.id, captionsToVideo(v, res.segments || []));
          ok++;
        } catch (err: any) {
          updated.set(v.id, { ...v, transcriptError: err?.message || 'Captions unavailable' });
        }
      }
      setTranscribeProgress({ current: total, total, currentTitle: 'Done', percent: 100 });

      if (playlist) {
        setPlaylist({ ...playlist, videos: playlist.videos.map((v) => updated.get(v.id) || v) });
      }
      if (activeVideo && updated.has(activeVideo.id)) setActiveVideo(updated.get(activeVideo.id)!);

      if (total === 1) {
        showToast(ok ? `Re-fetched YouTube captions for "${videosToProcess[0].title}"` : `No captions: ${updated.get(videosToProcess[0].id)?.transcriptError}`, ok ? 'success' : 'error');
      } else {
        showToast(`Fetched captions for ${ok}/${total} videos`, ok === total ? 'success' : 'info');
      }
    } finally {
      setIsLoading(false);
      setTranscribeProgress(null);
    }
  };

  // Handler: Run RCL and SSI synthesis in Innershell Body
  const handleRunRclSsi = async (iterations: number | 'auto', directives: string, writer?: string) => {
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
        writer,
      });

      setRclAnalysis({ ...res.rclResult, learning: res.learning });
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

      showToast(
        `RCL/SSI cycle complete: ${res.learning.passes} pass(es) by ${res.learning.writer}${res.learning.chosenBy === 'learned' || res.learning.writerChosenBy === 'learned' ? ' (AetherTwin chose)' : ''}. Logic ready for binding.`,
        'success'
      );
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
        // Keep the exact logic object that was signed with this transcript.
        boundLogic: innershellLogic,
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
  // Restore a downloaded snapshot. Guard results are cleared, never restored:
  // the server ledger is their record, so the guards must run again.
  const handleRestoreSnapshot = (parsed: Exclude<ParsedSnapshot, { ok: false }>) => {
    if (parsed.kind === 'memory-only') {
      setSessionMemory((prev) => ({ ...prev, lastActive: Date.now(), memoryLattice: parsed.memoryLattice as Record<string, any> }));
      showToast('Memory keys restored', 'success');
      return;
    }
    const s = parsed.snapshot;
    setSessionMemory((prev) => ({ ...s.sessionMemory, historyRuns: prev.historyRuns }));
    setPlaylist(s.playlist);
    setActiveVideo(parsed.activeVideo);
    setInnershellLogic(s.innershellLogic);
    setRclAnalysis(s.rclAnalysis);
    setLastExecutionResult(null);
    setGuardReport(null);
    setGuardReportBeta(null);
    setDualComparisonReport(null);
    setBoundaryStatus('LOCKED');
    showToast(`Restored ${parsed.summary}. Run the guards again to get verdicts.`, 'success');
  };

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
    setGuardReportBeta(null);
    setDualComparisonReport(null);
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
        lastSaved={lastSaved}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-6">
        {playlist?.isDemo && (
          <div role="status" className="px-4 py-2 rounded-xl border border-amber-600/60 bg-amber-950/40 text-amber-200 text-xs font-mono">
            [DEMO] "{playlist.title}" is synthetic sample text, not real captions. Syntheses, signatures and guard verdicts on it are real
            runs over made-up content; AetherTwin keeps its lessons separate from real playlists.
          </div>
        )}
        <ErrorBoundary key={activeTab} fallbackTitle="This panel hit an error">
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
        {activeTab === 'pipeline' && <DashboardWidget />}
        {activeTab === 'pipeline' && (
          <PlaylistIngestion
            playlist={playlist}
            curatedPlaylists={curatedPlaylists}
            activeVideo={activeVideo}
            setActiveVideo={setActiveVideo}
            onLoadCurated={handleLoadCurated}
            onIngestUrl={handleIngestUrl}
            onDeepTranscribe={handleDeepTranscribe}
            transcribeProgress={transcribeProgress}
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
        </ErrorBoundary>
      </main>

      {/* Persistent Multi-Session Memory Modal */}
      <ErrorBoundary fallbackTitle="Session memory panel hit an error">
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
        buildSnapshot={() => buildSnapshot({ sessionMemory, playlist, activeVideo, innershellLogic, rclAnalysis })}
        onRestoreSnapshot={handleRestoreSnapshot}
      />
      </ErrorBoundary>

      {/* AetherShell Output Tool: Copy / Paste / Download Modal */}
      <ErrorBoundary fallbackTitle="Output hub hit an error">
      <AetherOutputHubModal
        playlist={playlist}
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
          if (g) {
            // Imported reports are shown for reference only and never count as a pass.
            setGuardReport({
              ...g,
              passedPhaseBoundary: false,
              semanticAudit: { ...g.semanticAudit, reasoning: `[IMPORTED, not re-verified] ${g.semanticAudit?.reasoning || ''}` },
            });
          }
          if (r) setRclAnalysis(r);
          if (m) {
            setSessionMemory((prev) => ({
              ...prev,
              lastActive: Date.now(),
              memoryLattice: { ...prev.memoryLattice, ...m },
            }));
          }
          // Imported reports are display-only; a pass must come from a live guard run.
        }}
        showToast={showToast}
      />
      </ErrorBoundary>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        <p>
          AetherShell Dual-Shell Architecture • RCL Iterative Reasoning • SSI Grounding Matrix • Watermark-Signed Pre-Compression
        </p>
      </footer>
    </div>
  );
}
