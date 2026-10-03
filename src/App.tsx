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
            memoryLattice: parsed.memoryLattice && typeof parsed.memoryLattice === 'object' ? parsed.memoryLattice : {
              agenticPhase: 'INIT',
              sessionStep: 1,
              activeInvariantThreshold: 0.95,
              executionHistory: [],
            },
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
    // Regex validation helper to ensure the provided string is a valid YouTube playlist URL
    const isValidYouTubePlaylistUrl = (inputUrl: string): boolean => {
      const playlistRegex =
        /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(playlist\?.*?list=|watch\?.*?list=)|youtu\.be\/.*?[?&]list=)[a-zA-Z0-9_-]+/i;
      return playlistRegex.test((inputUrl || '').trim());
    };

    const trimmedUrl = (url || '').trim();
    if (!isValidYouTubePlaylistUrl(trimmedUrl)) {
      showToast(
        'Invalid YouTube playlist URL. Please provide a valid playlist link (e.g., https://www.youtube.com/playlist?list=...)',
        'error'
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetchPlaylistData({ playlistUrl: trimmedUrl });
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

  // Handler: Deep transcribe - bulk processing by mapping over all videos in the playlist
  const handleDeepTranscribe = async (targetVideo?: VideoNode) => {
    const videosToProcess =
      playlist?.videos && playlist.videos.length > 0
        ? playlist.videos
        : targetVideo
        ? [targetVideo]
        : activeVideo
        ? [activeVideo]
        : [];

    if (videosToProcess.length === 0) {
      showToast('No videos available in current playlist to transcribe', 'error');
      return;
    }

    setIsLoading(true);
    const total = videosToProcess.length;
    let completedCount = 0;

    setTranscribeProgress({
      current: 0,
      total,
      currentTitle: `Starting bulk transcription (${total} videos)...`,
      percent: 0,
    });

    try {
      // Map over all videos in the current playlist with progress tracking
      const updatedVideos = await Promise.all(
        videosToProcess.map(async (v, index) => {
          try {
            setTranscribeProgress((prev) => ({
              current: completedCount,
              total,
              currentTitle: `[${index + 1}/${total}] Transcribing: "${v.title}"`,
              percent: Math.round((completedCount / total) * 100),
            }));

            const res = await transcribeAudioSegment({
              videoTitle: v.title,
              audioNotes: v.rawTranscript,
              existingSegments: v.segments,
            });

            completedCount += 1;
            setTranscribeProgress({
              current: completedCount,
              total,
              currentTitle: `[${completedCount}/${total}] Transcribed: "${v.title}"`,
              percent: Math.round((completedCount / total) * 100),
            });

            const updatedSegments = res.segments || [];
            const updatedRaw = updatedSegments
              .map((s: any) => `[${s.start} - ${s.end}] ${s.speaker}: ${s.text}`)
              .join('\n\n') || v.rawTranscript || '';

            return {
              ...v,
              segments: updatedSegments,
              rawTranscript: updatedRaw,
            };
          } catch (err: any) {
            console.warn(`Failed transcribing video "${v.title}":`, err);
            completedCount += 1;
            setTranscribeProgress({
              current: completedCount,
              total,
              currentTitle: `[${completedCount}/${total}] Error in: "${v.title}"`,
              percent: Math.round((completedCount / total) * 100),
            });
            return v;
          }
        })
      );

      // Update in playlist
      if (playlist) {
        setPlaylist({
          ...playlist,
          videos: updatedVideos,
        });
      }

      // Update activeVideo with its refreshed version
      if (activeVideo) {
        const refreshed = updatedVideos.find((v) => v.id === activeVideo.id);
        if (refreshed) {
          setActiveVideo(refreshed);
        }
      } else if (updatedVideos.length > 0) {
        setActiveVideo(updatedVideos[0]);
      }

      showToast(`Bulk transcribed all ${completedCount}/${total} videos in playlist!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Bulk transcription encountered an error', 'error');
    } finally {
      setIsLoading(false);
      setTranscribeProgress(null);
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
        ssiContextWindow: res.rclResult?.ssiInjectedState?.activeContextWindow ?? 128000,
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
      } else if (res.guardReport.semanticAudit?.feedbackLoopRequired) {
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
            videoTitle: activeVideo?.title || 'YouTube Ingestion Node',
            alignmentScore: res.guardReport.semanticAudit?.alignmentScore ?? 95,
            boundaryDecision: res.guardReport.semanticAudit?.boundaryDecision || 'APPROVED',
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

      {/* Main Header with ErrorBoundary Protection */}
      <ErrorBoundary fallbackTitle="Header Navigation Intercepted">
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
      </ErrorBoundary>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Phase Boundary Membrane (Protected by ErrorBoundary) */}
        <ErrorBoundary fallbackTitle="Phase Boundary Membrane Intercepted">
          <PhaseBoundary
            boundaryStatus={boundaryStatus}
            guardReport={guardReport}
            onInitiateMerge={handleRunGuardAudit}
            onTriggerFeedbackLoop={handleTriggerFeedbackLoop}
            isLoading={isLoading}
            canMerge={hasWatermarkAndLogic}
          />
        </ErrorBoundary>

        {/* Tab 1: YouTube Ingestion & Transcripts */}
        {activeTab === 'pipeline' && (
          <ErrorBoundary fallbackTitle="Playlist Ingestion Fault">
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
          </ErrorBoundary>
        )}

        {/* Tab 2: Subjugated Knowledge Brain */}
        {activeTab === 'knowledge' && (
          <ErrorBoundary fallbackTitle="Epistemic Knowledge Engine Fault">
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
          </ErrorBoundary>
        )}

        {/* Tab 3: RCL & SSI Innershell Body */}
        {activeTab === 'innershell' && (
          <ErrorBoundary fallbackTitle="Innershell RCL & SSI Execution Fault">
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
          </ErrorBoundary>
        )}

        {/* Tab 4: Cryptographic Watermarking & Pre-Compression Binding */}
        {activeTab === 'crypto' && (
          <ErrorBoundary fallbackTitle="Watermarking & Compression Pipeline Fault">
            <WatermarkPipeline
              activeVideo={activeVideo}
              innershellLogic={innershellLogic}
              onWatermarkAndCompress={handleWatermarkAndCompress}
              isLoading={isLoading}
              onProceedToGuard={() => setActiveTab('guard')}
            />
          </ErrorBoundary>
        )}

        {/* Tab 5: Second Agentic Guard Shell */}
        {activeTab === 'guard' && (
          <ErrorBoundary fallbackTitle="Guard Shell Verification Array Fault">
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
          </ErrorBoundary>
        )}

        {/* Tab 6: Replicated Parallel Shadow System (AetherTwin) */}
        {activeTab === 'twin' && (
          <ErrorBoundary fallbackTitle="AetherTwin Parallel Shadow System Fault">
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
          </ErrorBoundary>
        )}
      </main>

      {/* Persistent Multi-Session Memory Modal */}
      <ErrorBoundary fallbackTitle="Session Memory Lattice Modal Intercepted">
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
      </ErrorBoundary>

      {/* AetherShell Output Tool: Copy / Paste / Download Modal */}
      <ErrorBoundary fallbackTitle="AetherShell Output Hub Modal Intercepted">
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
