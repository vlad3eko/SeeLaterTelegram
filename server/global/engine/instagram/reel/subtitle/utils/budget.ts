import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Time budget of the subtitle step.
 *
 * Every step that asks Gemini repeats a failed request (a 503 "high demand"
 * answer takes about a minute to arrive) and falls back to another model. One
 * overloaded evening these waits add up: a reel job hung for the whole task
 * timeout (30 minutes) and was killed, so the reel was not published at all.
 *
 * The budget caps the total time of the Gemini pipeline. Once it is used up no
 * new request is sent and every waiting one is abandoned: the optional steps
 * (coverage pass, transcript check, translation) keep the transcript they
 * have, and when even the first transcription does not finish, the reel goes
 * out without subtitles instead of not at all.
 *
 * The budget travels with the async call chain (AsyncLocalStorage), so two
 * reels prepared in one process do not share it.
 */
export class BudgetExceededError extends Error {
    constructor(label: string) {
        super(`[SUBTITLE] Time budget used up: ${label}`);
        this.name = 'BudgetExceededError';
    }
}

type Budget = { deadlineAt: number };

const storage = new AsyncLocalStorage<Budget>();

export const DEFAULT_BUDGET_MS = 10 * 60 * 1000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 60 * 1000;
/** Translating a few short lines takes seconds; an answer slower than this is as good as lost. */
export const DEFAULT_TRANSLATE_REQUEST_TIMEOUT_MS = 25 * 1000;
/**
 * The transcript check sends the whole audio with the text, but the answer is a short list of
 * problems. A model that is silent for a minute is overloaded (measured: gemini-3.8-flash did
 * not answer in 60 s, the next model answered in 2.5 s), so the request is cut earlier and
 * the fallback model takes over.
 */
export const DEFAULT_VERIFY_REQUEST_TIMEOUT_MS = 30 * 1000;
/** Time kept back for the translation while the optional steps before it run. */
export const DEFAULT_TRANSLATE_RESERVE_MS = 150 * 1000;

const readMs = (raw: string | undefined, fallback: number, min: number, max: number): number => {
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);

    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

/** REEL_SUBTITLE_BUDGET_MS: total time of the Gemini pipeline (30 s – 25 min, default 10 min). */
export function budgetMs(env: NodeJS.ProcessEnv = process.env): number {
    return readMs(env.REEL_SUBTITLE_BUDGET_MS, DEFAULT_BUDGET_MS, 30_000, 25 * 60 * 1000);
}

/** REEL_SUBTITLE_GEMINI_REQUEST_TIMEOUT_MS: one generateContent request (5 s – 5 min, default 60 s). */
export function requestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    return readMs(env.REEL_SUBTITLE_GEMINI_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 5_000, 5 * 60 * 1000);
}

/** REEL_SUBTITLE_TRANSLATE_REQUEST_TIMEOUT_MS: one translation request (5 s – 5 min, default 25 s). */
export function translateRequestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    return readMs(env.REEL_SUBTITLE_TRANSLATE_REQUEST_TIMEOUT_MS, DEFAULT_TRANSLATE_REQUEST_TIMEOUT_MS, 5_000, 5 * 60 * 1000);
}

/** REEL_SUBTITLE_VERIFY_REQUEST_TIMEOUT_MS: one transcript check request (5 s – 5 min, default 30 s). */
export function verifyRequestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    return readMs(env.REEL_SUBTITLE_VERIFY_REQUEST_TIMEOUT_MS, DEFAULT_VERIFY_REQUEST_TIMEOUT_MS, 5_000, 5 * 60 * 1000);
}

/** REEL_SUBTITLE_TRANSLATE_RESERVE_MS: time kept back for the translation (0 – 10 min, default 150 s). */
export function translateReserveMs(env: NodeJS.ProcessEnv = process.env): number {
    return readMs(env.REEL_SUBTITLE_TRANSLATE_RESERVE_MS, DEFAULT_TRANSLATE_RESERVE_MS, 0, 10 * 60 * 1000);
}

/** Runs `fn` with a budget of `ms`; everything it starts (even after it returns) sees the same deadline. */
export function runWithBudget<T>(ms: number, fn: () => Promise<T>): Promise<T> {
    return storage.run({ deadlineAt: Date.now() + ms }, fn);
}

/**
 * Runs `fn` under a deadline `reserveMs` earlier than the budget it is called in,
 * so the steps after it keep that much time. The optional steps (coverage pass,
 * transcript check) run like this: under an overloaded Gemini they would use up
 * the whole budget and leave nothing for the translation, which the viewer
 * notices (subtitles in the wrong language). Without a budget, or with a zero
 * reserve, `fn` simply runs.
 */
export function withBudgetReserve<T>(reserveMs: number, fn: () => Promise<T>): Promise<T> {
    const budget = storage.getStore();

    if (!budget || reserveMs <= 0) return fn();

    return storage.run({ deadlineAt: budget.deadlineAt - reserveMs }, fn);
}

/** Milliseconds left; Infinity when there is no budget. */
export function remainingBudgetMs(): number {
    const budget = storage.getStore();

    return budget ? Math.max(0, budget.deadlineAt - Date.now()) : Number.POSITIVE_INFINITY;
}

export const isBudgetExceeded = (error: unknown): boolean => error instanceof BudgetExceededError;

/**
 * Starts `start()` only while the budget lasts and stops waiting for it when
 * the budget (or `capMs`, for one request) runs out. The abandoned request
 * finishes in the background and its result is dropped.
 *
 * - budget used up -> BudgetExceededError (never retried);
 * - `capMs` used up while budget is left -> an ordinary timeout error that
 *   looks like a transient failure (DEADLINE_EXCEEDED), so the caller's retry
 *   and model fallback apply.
 */
export async function withinBudget<T>(
    label: string,
    start: () => Promise<T>,
    capMs: number = Number.POSITIVE_INFINITY,
): Promise<T> {
    const remaining = remainingBudgetMs();

    if (remaining <= 0) throw new BudgetExceededError(label);

    const limit = Math.min(remaining, capMs);

    if (!Number.isFinite(limit)) return start();

    const limitedByBudget = remaining <= capMs;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(limitedByBudget
                ? new BudgetExceededError(label)
                : new Error(`[SUBTITLE] ${label} did not answer within ${limit} ms (DEADLINE_EXCEEDED)`));
        }, limit);
    });

    try {
        return await Promise.race([start(), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
