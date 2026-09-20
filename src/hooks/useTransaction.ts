/**
 * Drive the transaction pipeline from a component.
 *
 * Owns the state that makes a transaction legible: which stages ran, what failed, and what the
 * result was. The pipeline in `lib/tx.ts` is deliberately UI-free, so a test can run it without a
 * renderer and this hook can be the only place that knows about React.
 */

import { useCallback, useState } from "react";

import { runTransaction, TxError, type Stage, type TxOutcome } from "../lib/tx.js";
import type { ConnectedWallet } from "../lib/wallet.js";

export interface StageState {
  stage: Stage;
  status: "pending" | "active" | "done" | "failed";
  detail?: string;
}

const ORDER: Stage[] = ["prepare", "guard", "sign", "submit", "confirm", "done"];

export interface TxState {
  running: boolean;
  stages: StageState[];
  error: { message: string; hint?: string; stage: Stage } | null;
  result: TxOutcome | null;
}

const EMPTY: TxState = { running: false, stages: [], error: null, result: null };

export function useTransaction() {
  const [state, setState] = useState<TxState>(EMPTY);

  const run = useCallback(
    async (tool: string, args: unknown, connection: ConnectedWallet): Promise<TxOutcome | null> => {
      // Fresh run: mark everything before the first stage as pending so the list does not jump.
      const stages: StageState[] = ORDER.map((s) => ({ stage: s, status: "pending" }));
      setState({ running: true, stages, error: null, result: null });

      try {
        const outcome = await runTransaction({
          tool,
          args,
          connection,
          onProgress: ({ stage, detail }) => {
            setState((prev) => ({
              ...prev,
              stages: advance(prev.stages, stage, detail),
            }));
          },
        });
        setState({
          running: false,
          stages: ORDER.map((s) => ({ stage: s, status: "done" })),
          error: null,
          result: outcome,
        });
        return outcome;
      } catch (e) {
        const txErr =
          e instanceof TxError
            ? e
            : new TxError("prepare", e instanceof Error ? e.message : String(e));
        setState((prev) => ({
          running: false,
          stages: prev.stages.map((s) =>
            s.stage === txErr.stage ? { ...s, status: "failed", detail: txErr.message } : s,
          ),
          error: { message: txErr.message, hint: txErr.hint, stage: txErr.stage },
          result: null,
        }));
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState(EMPTY), []);

  return { ...state, run, reset };
}

/**
 * Mark `current` active and everything before it done.
 *
 * Deriving from the ordered list rather than mutating in place means a stage that never reports —
 * because the pipeline skipped it — still ends up in a sensible state rather than stuck as active.
 */
function advance(stages: StageState[], current: Stage, detail?: string): StageState[] {
  const idx = ORDER.indexOf(current);
  return stages.map((s) => {
    const i = ORDER.indexOf(s.stage);
    if (i < idx) return { ...s, status: "done" };
    if (i === idx) return { ...s, status: "active", detail: detail ?? s.detail };
    return { ...s, status: "pending", detail: undefined };
  });
}
