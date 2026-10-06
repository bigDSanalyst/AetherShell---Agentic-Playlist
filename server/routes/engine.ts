// Signing (watermark-and-bind), the RCL/SSI cycle, and the Guard Shell endpoints.
import type { Express, Request, Response } from 'express';
import { signedSourceLabel, transcriptSourceFromLedger } from '../transcribe';
import { MalformedTextError, hashLogic, hashTranscript, watermarkAndCompress } from '../provenance';
import { changeBetween, logicClaimText, round4, wordOverlap } from '../grounding';
import { charterSha256 } from '../charter';
import { HABIT_KINDS, chooseArm, chooseWriter, lengthBucketOf, transcriptWords, habitsPromptBlock, knownHabitsOf, learningPromptBlock, playlistKeyOf, synthesisOutcomes } from '../learning';
import { transcriptBlock } from '../latency';
import { type CritiqueItem, critiquePrompt, findProblems, findingsSummary, improvePrompt, sanitizeCritique } from '../rci';
import { Evaluator, MAX_TRANSCRIPT_CHARS, MODEL_CASCADE, NoCharterError, RCL_SCHEMA, callModelJson, callableWriters, charterState, learningStore, normalizeForQuote, raiseSystemConcerns, runGuardShell, runLedger, sanitizeInvariants, sanitizeLogic, sendError, signingKeys } from '../core';

export function registerEngineRoutes(app: Express) {
  // Sign transcript + logic (Ed25519) before compression. The signing key is
  // server-held; clients cannot supply one.
  app.post('/api/crypto/watermark-and-bind', (req: Request, res: Response) => {
    try {
      const { rawTranscript, videoId, playlistId, pertainedLogic } = req.body || {};
      if (!rawTranscript || typeof rawTranscript !== 'string') {
        return res.status(400).json({ error: 'rawTranscript is required' });
      }
      if (!pertainedLogic) {
        return res.status(400).json({ error: 'pertainedLogic is required: logic must be signed together with the transcript' });
      }
      // The transcript's source comes from this server's own ingest record, not from the request.
      const origin = transcriptSourceFromLedger(runLedger.all(), hashTranscript(rawTranscript));
      const out = watermarkAndCompress(signingKeys, {
        rawTranscript,
        logic: pertainedLogic,
        videoId: typeof videoId === 'string' ? videoId : undefined,
        playlistId: typeof playlistId === 'string' ? playlistId : undefined,
        transcriptSource: signedSourceLabel(origin),
      });
      const entry = runLedger.append('bind', {
        transcriptSource: origin.source,
        transcriptModel: origin.model,
        transcriptImported: origin.imported,
        watermarkId: out.watermark.watermarkId,
        transcriptSha256: out.watermark.manifest.transcriptSha256,
        logicSha256: out.watermark.manifest.logicSha256,
        videoId: out.watermark.manifest.videoId,
        playlistId: out.watermark.manifest.playlistId,
        signatureSha256: hashTranscript(out.watermark.signature),
      });
      res.json({
        success: true,
        ...out,
        ledger: { seq: entry.seq, hash: entry.hash },
        auditTrail: {
          videoId: videoId ?? null,
          playlistId: playlistId ?? null,
          logicDigest: out.watermark.logicHash,
          signedBeforeCompression: true,
          signerKeyFingerprint: signingKeys.fingerprint,
          signerKeyEphemeral: signingKeys.ephemeral,
        },
      });
    } catch (err: any) {
      if (err instanceof MalformedTextError) return res.status(400).json({ error: err.message });
      sendError(res, err, 'Watermarking/compression failed');
    }
  });

  // RCL/SSI: N real model passes. Pass 1 synthesizes; later passes revise
  // against the transcript. Every number reported is measured, not generated.
  app.post('/api/engine/rcl-ssi-cycle', async (req: Request, res: Response) => {
    try {
      const { playlist, activeVideo, sessionMemory, rclIterations = 3, userDirectives = '', writer: writerRequest, refine: refineRequest } = req.body || {};
      // How passes after the first refine: 'revise' (one step) or 'rci' (computed problems → critique → fix).
      const refine: 'revise' | 'rci' = refineRequest === 'rci' ? 'rci' : 'revise';
      const transcript: string = activeVideo?.rawTranscript || '';
      if (!transcript.trim()) {
        return res.status(400).json({ error: 'activeVideo.rawTranscript is required' });
      }
      const tb = transcriptBlock(transcript, MAX_TRANSCRIPT_CHARS);

      // Learning: what the guards said about earlier syntheses of this material.
      const playlistKey = playlistKeyOf(playlist, activeVideo);
      const transcriptSha256 = hashTranscript(transcript);
      const outcomesSoFar = synthesisOutcomes(runLedger.all());
      // Which model writes: AetherTwin's choice ("auto"), the one asked for, or the first callable.
      const candidates = callableWriters();
      const writerPick = writerRequest === 'auto' ? chooseWriter(outcomesSoFar, playlistKey, candidates) : null;
      const writer = writerPick?.writer ?? (candidates.includes(writerRequest) ? writerRequest : candidates[0] ?? MODEL_CASCADE[0]);
      const writerChosenBy = writerPick ? 'learned' : candidates.includes(writerRequest) ? 'owner' : 'default';
      const writeModels = [writer, ...MODEL_CASCADE.filter((m) => m !== writer)];
      // Passes: learned from this writer's own record (over the other models'), or as chosen.
      // Transcript length: the bandit learns pass counts per length bucket.
      const words = transcriptWords(transcript);
      const lengthBucket = lengthBucketOf(words);
      const learned = rclIterations === 'auto' ? chooseArm(outcomesSoFar, playlistKey, writer, lengthBucket) : null;
      const iterations = learned ? learned.passes : Math.max(1, Math.min(5, Math.round(Number(rclIterations) || 1)));
      const { lessons, example } = learningStore.select(runLedger.all(), playlistKey, transcriptSha256, writer);
      // The intended writer's known first-draft habits, across all playlists (counts from the ledger).
      const habits = knownHabitsOf(runLedger.all(), writer);
      const learnedBlock = [learningPromptBlock(lessons, example), habitsPromptBlock(writer, habits)].filter(Boolean).join('\n\n');

      const rounds: {
        cycle: number;
        focus: string;
        changeFromPrevious: number;
        groundingRatio: number;
        modelUsed: string;
        problems: number; // computed problems in this pass's output (server/rci.ts)
        problemSummary: string;
        critique?: CritiqueItem[]; // RCI only: the critique this pass applied
        critiqueModel?: string;
      }[] = [];
      let current: any = null;
      let prevClaims = '';
      let notes = '';
      let stoppedEarly: string | null = null;
      // Problems the server computed in the first draft, by kind, and who wrote it: what habits are counted from.
      let draftProblems: Record<string, number> = {};

      for (let pass = 1; pass <= iterations; pass++) {
        const header = `${tb.text}
SESSION MEMORY KEYS: ${Object.keys(sessionMemory || {}).slice(0, 30).join(', ') || '(none)'}
USER DIRECTIVES: ${String(userDirectives).slice(0, 1000) || '(none)'}
${learnedBlock ? `\n${learnedBlock}\n` : ''}`;
        // RCI: criticise the previous pass from its computed problems; nothing computed, nothing to fix.
        let critique: CritiqueItem[] | undefined;
        let critiqueModel: string | undefined;
        if (refine === 'rci' && pass > 1) {
          const findings = findProblems(current, transcript);
          if (!findings.length) {
            stoppedEarly = `Stopped after pass ${pass - 1}: no computed problems left to criticise.`;
            break;
          }
          const c = await callModelJson({ contents: critiquePrompt(header, current, findings), taskName: `rcl-critique-${pass}`, models: writeModels });
          critique = sanitizeCritique(c.data, findings, transcript);
          critiqueModel = c.modelUsed;
        }
        const prompt = critique
          ? improvePrompt(header, current, critique, RCL_SCHEMA)
          : pass === 1
            ? `${header}
Derive an execution plan and a small set of invariants from this transcript only. Every claim must be supported by the transcript; quote it in transcriptEvidence. Do not invent metrics or numbers.
Return JSON matching:
${RCL_SCHEMA}`
            : `${header}
PREVIOUS PASS (JSON):
${JSON.stringify(current).slice(0, 40000)}

Revise the previous pass. Remove or rewrite any claim, step or invariant not supported by the transcript, and fix any transcriptEvidence that is not a real quote. Keep what is supported.
Return JSON matching:
${RCL_SCHEMA}`;

        const { data, modelUsed } = await callModelJson({ contents: prompt, taskName: `rcl-pass-${pass}`, models: writeModels });
        current = data;
        const logicNow = sanitizeLogic(data, pass);
        const claims = logicClaimText(logicNow);
        const problems = findProblems(data, transcript);
        if (pass === 1) draftProblems = Object.fromEntries(HABIT_KINDS.map((k) => [k, problems.filter((f) => f.kind === k).length]));
        rounds.push({
          cycle: pass,
          focus: pass === 1 ? 'Initial synthesis' : critique ? 'Grounded critique, then fix' : 'Revision against transcript',
          changeFromPrevious: pass === 1 ? 1 : round4(changeBetween(prevClaims, claims)),
          groundingRatio: round4(wordOverlap(claims, transcript).ratio),
          modelUsed,
          problems: problems.length,
          problemSummary: findingsSummary(problems),
          ...(critique ? { critique, critiqueModel } : {}),
        });
        prevClaims = claims;
        notes = String(data?.notes || notes);
      }

      const passesRun = rounds.length;
      const innershellLogic = sanitizeLogic(current, passesRun);
      const invariants = sanitizeInvariants(current?.invariants).map((inv) => ({
        ...inv,
        evidenceFoundInTranscript: inv.transcriptEvidence
          ? normalizeForQuote(transcript).includes(normalizeForQuote(inv.transcriptEvidence))
          : false,
      }));
      const last = rounds[rounds.length - 1];
      const stabilized = (passesRun > 1 && last.changeFromPrevious <= 0.1) || (stoppedEarly !== null && last.problems === 0);

      // Record the synthesis so guard verdicts on it can be attributed to how it was made.
      const synthEntry = runLedger.append('synthesis', {
        playlistKey,
        transcriptSha256,
        transcriptSource: transcriptSourceFromLedger(runLedger.all(), transcriptSha256).source,
        logicSha256: hashLogic(innershellLogic),
        passes: iterations,
        passesRun,
        refine,
        transcriptWords: words,
        lengthBucket,
        draftWriter: rounds[0].modelUsed,
        draftProblems,
        habitsShown: habits.map((h) => h.kind),
        chosenBy: learned ? 'learned' : 'owner',
        // The model whose output became the logic; intendedWriter differs only after a fallback.
        writer: last.modelUsed,
        intendedWriter: writer,
        writerChosenBy,
        lessonsUsed: lessons.map((l) => l.id),
        lessonWriters: lessons.map((l) => l.writer ?? 'unknown'),
        examplesUsed: example ? [example.id] : [],
        groundingRatio: last.groundingRatio,
        modelsUsed: [...new Set(rounds.map((r) => r.modelUsed))],
      });

      res.json({
        success: true,
        rclResult: {
          iterationCount: passesRun,
          passesPlanned: iterations,
          refine,
          stoppedEarly,
          reflexiveFixedPointReached: stabilized,
          groundingScore: last.groundingRatio,
          convergenceRounds: rounds,
          extractedInvariants: invariants.map((i) => i.name),
          sotaReflexiveInvariants: invariants,
          reflexiveFeedbackNotes:
            (notes ? notes + ' ' : '') +
            `Measured: final pass shares ${Math.round(last.groundingRatio * 100)}% of its content words with the transcript` +
            (passesRun > 1 ? `; it changed ${Math.round(last.changeFromPrevious * 100)}% from the previous pass` : '') +
            `; computed problems left: ${last.problemSummary}.` +
            (stoppedEarly ? ` ${stoppedEarly}` : ''),
          ssiInjectedState: {
            activeContextWindow: tb.included,
            contextWindowUnit: 'characters',
            transcriptCharacters: tb.total, // more than activeContextWindow means the writer read a cut transcript
            environmentBoundary: 'server (Gemini) → browser sandbox',
            memoryLatticeNodes: Object.keys(sessionMemory || {}).length,
            // From the owner-signed charter; null when there is none (guards are off).
            invariantTolerances: {
              driftThreshold: charterState.ok && charterState.signed ? round4(1 - charterState.signed.charter.guard.minWordOverlap) : null,
              provenanceEnforced: true,
            },
          },
        },
        innershellLogic,
        learning: {
          playlistKey,
          passes: iterations,
          lengthBucket,
          transcriptWords: words,
          chosenBy: learned ? 'learned' : 'owner',
          why: learned ? learned.why : `You chose ${iterations} pass(es).`,
          writer: last.modelUsed,
          intendedWriter: writer,
          writerChosenBy,
          writerWhy: writerPick
            ? writerPick.why
            : writerChosenBy === 'owner'
            ? `You chose ${writer}.`
            : `${writer}: the first callable model in AETHERSHELL_MODELS.`,
          lessonsUsed: lessons.map((l) => ({ id: l.id, failedChecks: l.failedChecks, writer: l.writer ?? null, reviewer: l.reviewer ?? null })),
          habitsShown: habits.map(({ kind, drafts, of, low, text }) => ({ kind, drafts, of, low, text })),
          exampleUsed: example ? example.id : null,
          exampleWriter: example?.writer ?? null,
          ledgerSeq: synthEntry.seq,
        },
        cycleTimestamp: Date.now(),
      });
    } catch (err: any) {
      sendError(res, err, 'RCL/SSI cycle failed');
    }
  });

  const guardHandler = (evaluator: Evaluator) => async (req: Request, res: Response) => {
    try {
      const { directTranscript, innershellLogic } = req.body || {};
      if (!directTranscript || typeof directTranscript !== 'string' || !innershellLogic) {
        return res.status(400).json({ error: 'directTranscript and innershellLogic are required' });
      }
      const report = await runGuardShell(evaluator, req.body);
      const charter = charterState.signed!.charter;
      const g2 = report.multiGuardTelemetry.guard2SemanticAuditor;
      const entry = runLedger.append('guard', {
        runId: String(innershellLogic?.logicId || 'unknown').slice(0, 80),
        evaluator,
        transcriptSource: transcriptSourceFromLedger(runLedger.all(), hashTranscript(directTranscript)).source,
        watermarkId: req.body?.watermark?.watermarkId ?? null,
        transcriptSha256: hashTranscript(directTranscript),
        logicSha256: hashLogic(innershellLogic),
        passed: report.passedPhaseBoundary,
        failureMode: report.multiGuardTelemetry.triiVerificationCondition.failureModeClassification,
        signatureStatus: report.watermarkSignatureStatus,
        wordDelta: g2.semanticDistanceDelta,
        epsilon: g2.epsilonThreshold,
        llmAvailable: report.llmAvailable,
        reviewModel: report.reviewModel,
        witnessAgreed: report.witness ? report.witness.agreesWithPrimary : null,
        modelDecision: report.semanticAudit.boundaryDecision,
        charterVersion: charter.version,
        charterSha256: charterState.sha256,
      });
      raiseSystemConcerns();
      let learnedItem: string | null = null;
      try {
        learnedItem = learningStore.observe(entry, runLedger.all(), innershellLogic, report.semanticAudit)?.id ?? null;
      } catch (e: any) {
        console.warn(`[learning] could not store what this verdict taught: ${e.message}`);
      }
      res.json({
        success: true,
        learnedItem,
        guardReport: { ...report, ledgerSeq: entry.seq, ledgerHash: entry.hash, charterVersion: charter.version, charterSha256: charterState.sha256 },
        evaluator,
      });
    } catch (err: any) {
      if (err instanceof NoCharterError) return res.status(503).json({ error: err.message, code: 'NO_VALID_CHARTER' });
      sendError(res, err, 'Guard Shell validation failed');
    }
  };
  app.post('/api/engine/guard-validate', guardHandler('alpha'));
  app.post('/api/engine/guard-validate-beta', guardHandler('beta'));
}
