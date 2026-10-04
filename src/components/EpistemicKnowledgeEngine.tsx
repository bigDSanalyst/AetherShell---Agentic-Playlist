import React, { useState, useRef, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  MessageSquare,
  Network,
  BookOpen,
  Send,
  Mic,
  MicOff,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Cpu,
  Layers,
  FileText,
  Clock,
  RotateCw,
  Search,
  Quote,
  Lightbulb,
  Workflow,
  ArrowRight,
} from 'lucide-react';
import {
  PlaylistData,
  SynthesizedKnowledge,
  ChatMessage,
  PersistentSessionMemory,
} from '../types';
import {
  synthesizePlaylistKnowledge,
  sendSubjugatedChatMessage,
  transcribeMicrophoneAudio,
  fetchModels,
  type ModelInfo,
} from '../services/api';

interface EpistemicKnowledgeEngineProps {
  playlist: PlaylistData | null;
  sessionMemory: PersistentSessionMemory;
  onUpdateSessionMemory: (newMemory: Record<string, any>) => void;
  onInjectIntoInnershell: (knowledge: SynthesizedKnowledge) => void;
}

export const EpistemicKnowledgeEngine: React.FC<EpistemicKnowledgeEngineProps> = ({
  playlist,
  sessionMemory,
  onUpdateSessionMemory,
  onInjectIntoInnershell,
}) => {
  // Synthesis State
  const [synthesisMode, setSynthesisMode] = useState<
    'unified_theory' | 'ontology_graph' | 'action_playbook' | 'socratic_cross_exam' | 'emergent_axioms'
  >('unified_theory');
  const [focusQuery, setFocusQuery] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [knowledge, setKnowledge] = useState<SynthesizedKnowledge | null>(null);
  // Models come from the server: whatever providers it is set up for (Gemini, local, OpenRouter, ...).
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  useEffect(() => {
    fetchModels()
      .then((r) => {
        setModels(r.models);
        setSelectedModel((cur) => cur || r.models.find((m) => m.available)?.ref || '');
      })
      .catch((e) => setModelsError(e.message));
  }, []);

  // Subjugated Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'init-msg',
      role: 'model',
      content:
        "I am the Subjugated Epistemic Mind for this YouTube playlist. My intelligence is strictly confined to the transcripts of these videos. Ask me to formulate new theories, compare speaker methodologies, or extract operational protocols.",
      timestamp: Date.now(),
    },
  ]);
  const [userChatInput, setUserChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribingMic, setIsTranscribingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [copiedQuote, setCopiedQuote] = useState<string | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  // Total word count of all transcripts in playlist
  const totalWords = (playlist?.videos || []).reduce(
    (acc, v) => acc + (v.rawTranscript?.split(/\s+/).filter(Boolean).length || 0),
    0
  );

  // Handler: Run Knowledge Synthesis
  const handleSynthesizeKnowledge = async () => {
    if (!playlist || playlist.videos.length === 0) return;

    setIsSynthesizing(true);
    try {
      const res = await synthesizePlaylistKnowledge({
        playlistTitle: playlist.title,
        playlistDescription: playlist.description,
        videos: playlist.videos,
        mode: synthesisMode,
        focusQuery,
        preferredModel: selectedModel,
      });

      setKnowledge(res.knowledge);

      // Record in session memory
      onUpdateSessionMemory({
        ...sessionMemory.memoryLattice,
        lastSynthesizedKnowledgeTitle: res.knowledge.title,
        lastSynthesizedMode: res.knowledge.mode,
        knowledgeSynthesizedAt: res.synthesizedAt,
      });
    } catch (err: any) {
      console.error('Synthesis failed:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Handler: Send Chat Message
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || userChatInput;
    if (!text.trim() || !playlist) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setUserChatInput('');
    setIsChatLoading(true);

    try {
      const res = await sendSubjugatedChatMessage({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        playlistTitle: playlist.title,
        videos: playlist.videos,
        subjugationStrictness: 0.95,
        preferredModel: selectedModel,
      });

      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: res.reply,
        timestamp: res.timestamp,
      };

      setChatMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: `Error generating subjugated response: ${err.message || 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Microphone audio recording; transcription uses Gemini's audio input
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        // Convert to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          setIsTranscribingMic(true);
          try {
            const res = await transcribeMicrophoneAudio({
              audioBase64: base64Data,
              mimeType: 'audio/webm',
            });
            if (res.transcription) {
              setUserChatInput(res.transcription);
              handleSendMessage(res.transcription);
            }
          } catch (err) {
            console.error('Mic transcription failed:', err);
          } finally {
            setIsTranscribingMic(false);
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone access denied:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `mic-err-${Date.now()}`,
          role: 'model',
          content: 'Microphone access was denied or not supported in this environment. Please type your query in the input box.',
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCopyQuote = async (quote: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(quote);
      } else {
        const ta = document.createElement('textarea');
        ta.value = quote;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedQuote(quote);
      setTimeout(() => setCopiedQuote(null), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = quote;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopiedQuote(quote);
        setTimeout(() => setCopiedQuote(null), 2000);
      } catch (err) {
        console.warn('Quote copy prevented:', err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Subjugated Epistemic Mind Concept */}
      <div className="rounded-2xl border border-indigo-800/40 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-5 shadow-xl shadow-indigo-950/20 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-300">
              <Brain className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Subjugated Knowledge Synthesis & Playlist LLM Brain
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 uppercase">
                  Subjugated Corpus
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Similar to how an AI uses its vast database of learning, but this engine's intelligence is strictly subjugated to and synthesized from your selected YouTube playlist transcripts.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 font-mono text-xs">
            {/* Model selector: the models this server is set up to call (GET /api/models) */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-indigo-700/60 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-slate-400 hidden xl:inline">Model:</span>
              {models.length ? (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer pr-1 max-w-[16rem]"
                >
                  {models.map((m) => (
                    <option key={m.ref} value={m.ref} disabled={!m.available} className="bg-slate-900 text-slate-200">
                      {m.model} ({m.provider}){m.available ? '' : ' - not set up'}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-slate-500">{modelsError ? `unavailable: ${modelsError}` : 'loading…'}</span>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-300">
              <span>Subjugated Corpus: </span>
              <strong className="text-cyan-400">{playlist?.videos?.length || 0} Videos</strong>
              <span className="text-slate-500"> ({totalWords.toLocaleString()} words)</span>
            </div>

            {/* Corpus size: an estimate, and what the server actually sends */}
            <div className="px-3 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-300" title="Tokens estimated at 1.35 per word. The server sends at most 45,000 characters of transcript per request.">
              <span>Corpus ≈ </span>
              <strong className="text-emerald-400">{Math.round(totalWords * 1.35).toLocaleString()} tokens</strong>
              <span className="text-slate-500"> (sent: up to 45,000 characters)</span>
            </div>
          </div>
        </div>

        {/* Synthesis Mode Selector & Trigger */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-slate-400 font-medium">Synthesis Mode:</span>
            {[
              { id: 'unified_theory', label: '🌟 Unified Epistemic Theory' },
              { id: 'ontology_graph', label: '🕸️ Knowledge Graph & Ontology' },
              { id: 'action_playbook', label: '📋 Actionable Playbook' },
              { id: 'emergent_axioms', label: '💎 Subjugated Axioms' },
              { id: 'socratic_cross_exam', label: '⚖️ Socratic Dialectics' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSynthesisMode(m.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  synthesisMode === m.id
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-8 space-y-1">
              <label className="text-xs font-mono text-slate-400">
                Optional Synthesis Angle / Deep Dive Focus:
              </label>
              <input
                type="text"
                value={focusQuery}
                onChange={(e) => setFocusQuery(e.target.value)}
                placeholder="e.g., How do the speakers resolve memory decay, phase boundaries, and cryptographic verification?"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="md:col-span-4">
              <button
                onClick={handleSynthesizeKnowledge}
                disabled={isSynthesizing || !playlist || playlist.videos.length === 0}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSynthesizing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Synthesizing Knowledge...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Synthesize Subjugated Knowledge</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column (Synthesized Knowledge Dossier) + Right Column (Subjugated Chat Interface) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Synthesized Knowledge Dossier (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {knowledge ? (
            <div className="space-y-4">
              {/* Core Thesis Card */}
              <div className="rounded-2xl border border-indigo-900/50 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-bold">
                    Core Emergent Thesis
                  </span>
                  <button
                    onClick={() => onInjectIntoInnershell(knowledge)}
                    className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
                    title="Pipe this synthesized knowledge into Innershell SSI Working Memory"
                  >
                    <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Inject Into Innershell SSI</span>
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-100 font-sans leading-tight">
                  {knowledge.title}
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed font-sans border-l-2 border-indigo-500 pl-3 italic">
                  "{knowledge.coreThesis}"
                </p>
              </div>

              {/* Subjugated Axioms */}
              {knowledge.subjugatedAxioms && knowledge.subjugatedAxioms.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-indigo-300 font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    Subjugated Epistemic Axioms ({knowledge.subjugatedAxioms.length})
                  </h4>
                  <div className="space-y-2">
                    {knowledge.subjugatedAxioms.map((axiom, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-xs font-sans text-slate-300 flex items-start gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-md bg-indigo-950 text-indigo-400 flex items-center justify-center font-mono font-bold text-[10px] shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{axiom}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergent Concepts */}
              {knowledge.emergentConcepts && knowledge.emergentConcepts.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-semibold flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-cyan-400" />
                    Emergent Synthesized Concepts ({knowledge.emergentConcepts.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {knowledge.emergentConcepts.map((concept, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2"
                      >
                        <h5 className="text-xs font-bold text-cyan-300 font-mono">
                          {concept.name}
                        </h5>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                          {concept.definition}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono text-slate-500">
                          {concept.citations.map((c, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ontology Graph Preview */}
              {knowledge.ontologyGraph && knowledge.ontologyGraph.nodes?.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold flex items-center gap-2">
                    <Network className="w-4 h-4 text-cyan-400" />
                    Conceptual Ontology & Dependency Graph
                  </h4>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                    <div className="flex flex-wrap gap-2">
                      {knowledge.ontologyGraph.nodes.map((node) => (
                        <span
                          key={node.id}
                          className="px-2.5 py-1 rounded-lg bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 text-[11px] flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                          <strong>{node.label}</strong>
                          <span className="text-[9px] text-slate-500 uppercase">({node.type})</span>
                        </span>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-900 space-y-1 text-[11px] text-slate-400">
                      <span className="text-[10px] text-slate-500 block mb-1">
                        Epistemic Relationships:
                      </span>
                      {knowledge.ontologyGraph.edges.map((edge, idx) => (
                        <div key={idx} className="flex items-center gap-2 truncate">
                          <span className="text-cyan-300 font-semibold">{edge.source}</span>
                          <span className="text-slate-600">→ [{edge.relationship}] →</span>
                          <span className="text-indigo-300 font-semibold">{edge.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Verbatim Grounding Citations */}
              {knowledge.groundingCitations && knowledge.groundingCitations.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold flex items-center gap-2">
                    <Quote className="w-4 h-4 text-indigo-400" />
                    Verbatim Grounding & Transcript Provenance
                  </h4>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {knowledge.groundingCitations.map((cite, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400">
                          <span>{cite.videoTitle}</span>
                          <span className="flex items-center gap-1.5">
                            {cite.quoteVerified !== undefined && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  cite.quoteVerified ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                                }`}
                                title="Checked server-side against the transcript text"
                              >
                                {cite.quoteVerified ? 'quote found' : 'quote NOT in transcript'}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px]">
                              {cite.timestamp}
                            </span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 italic font-sans leading-relaxed">
                          "{cite.verbatimQuote}"
                        </p>
                        <div className="text-[11px] text-emerald-300 font-sans pt-1 border-t border-slate-900">
                          <strong>Synthesized Insight:</strong> {cite.synthesizedInsight}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 space-y-3">
              <Brain className="w-10 h-10 text-indigo-400/60 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-200 font-mono">
                No Subjugated Synthesis Executed Yet
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Select a synthesis mode above (Unified Epistemic Theory, Knowledge Graph, or Playbook) and click "Synthesize Subjugated Knowledge" to generate new learning derived strictly from this playlist.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Subjugated Multi-Turn Conversational Brain (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 backdrop-blur-sm flex flex-col h-[700px] shadow-xl">
            {/* Chat Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Subjugated Playlist Chat
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-[10px] font-mono">
                Strict Grounding
              </span>
            </div>

            {/* Scrollable Message Thread */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 text-xs font-sans"
            >
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] p-3 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-cyan-500 text-slate-950 font-medium rounded-br-xs'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-xs font-mono text-[11px]'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                  <span>Synthesizing from transcript corpus...</span>
                </div>
              )}
            </div>

            {/* Quick Prompts */}
            <div className="py-2 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[10px] font-mono text-slate-400 shrink-0">
              <span className="text-slate-500 shrink-0">Ask:</span>
              {[
                'Synthesize core paradigm',
                'Compare speaker 1 & 2',
                'What are the phase invariants?',
                'Step-by-step implementation',
              ].map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(qp)}
                  disabled={isChatLoading}
                  className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 whitespace-nowrap transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Input & Microphone Bar */}
            <div className="pt-2 border-t border-slate-800 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={userChatInput}
                    onChange={(e) => setUserChatInput(e.target.value)}
                    placeholder={
                      isRecording
                        ? 'Listening to microphone...'
                        : isTranscribingMic
                        ? 'Transcribing audio with Gemini...'
                        : 'Ask the subjugated playlist brain...'
                    }
                    disabled={isChatLoading || isRecording || isTranscribingMic}
                    className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-colors"
                  />
                  {/* Microphone Button */}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isChatLoading || isTranscribingMic}
                    className={`absolute right-1.5 top-1.5 p-1 rounded-lg transition-colors ${
                      isRecording
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800'
                    }`}
                    title={isRecording ? 'Stop Recording' : 'Speak query via Microphone'}
                  >
                    {isRecording ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!userChatInput.trim() || isChatLoading}
                  className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
