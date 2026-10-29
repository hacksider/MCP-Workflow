export type RetryPolicy = {
  retries: number;
  delaySeconds: number;
  idleSeconds: number;
};
export type AttemptControl = {
  attempt: number;
  signal: AbortSignal;
  heartbeat: () => void;
  pause: (paused: boolean) => void;
};
export class BlockedStepError extends Error {
  readonly retryable = false;
}
export class UnsafeStepError extends Error {
  readonly retryable = false;
  readonly redirectable = false;
}
export class IdleTimeoutError extends Error {}
export const defaultRetry: RetryPolicy = {
  retries: 0,
  delaySeconds: 2,
  idleSeconds: 180,
};
export function validateRetry(policy: RetryPolicy, draft = false) {
  if (
    !policy ||
    !Number.isInteger(policy.retries) ||
    !Number.isFinite(policy.delaySeconds) ||
    !Number.isFinite(policy.idleSeconds) ||
    (!draft &&
      (policy.retries < 0 ||
        policy.retries > 10 ||
        policy.delaySeconds < 0 ||
        policy.delaySeconds > 60 ||
        policy.idleSeconds < 0 ||
        policy.idleSeconds > 3600))
  )
    throw Error(
      "Retries must be 0–10; retry delay 0–60 seconds; inactivity timeout 0–3600 seconds (0 disables it).",
    );
}
export async function monitoredAttempt<T>(
  attempt: number,
  policy: RetryPolicy,
  work: (control: AttemptControl) => Promise<T>,
  cancelled: () => boolean,
  onTimeout: () => void,
): Promise<T> {
  const controller = new AbortController();
  let last = Date.now(),
    paused = false,
    timedOut = false;
  const control: AttemptControl = {
    attempt,
    signal: controller.signal,
    heartbeat: () => {
      last = Date.now();
    },
    pause: (value) => {
      paused = value;
      last = Date.now();
    },
  };
  const timer = setInterval(() => {
    if (cancelled()) controller.abort();
    else if (
      !paused &&
      policy.idleSeconds > 0 &&
      Date.now() - last >= policy.idleSeconds * 1000 &&
      !timedOut
    ) {
      timedOut = true;
      controller.abort();
      onTimeout();
    }
  }, 100);
  try {
    // Aborting requests cancellation. Await the original work before retrying so attempts never overlap.
    const result = await work(control);
    if (timedOut)
      throw new IdleTimeoutError(
        `No activity for ${policy.idleSeconds} seconds. The attempt has stopped.`,
      );
    if (cancelled()) throw Error("Stopped");
    return result;
  } catch (e) {
    if ((e as any)?.redirectable === false) throw e;
    if (timedOut)
      throw new IdleTimeoutError(
        `No activity for ${policy.idleSeconds} seconds. The attempt has stopped. ${String(e)}`,
      );
    throw e;
  } finally {
    clearInterval(timer);
  }
}
export async function retryDelay(seconds: number, cancelled: () => boolean) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until && !cancelled())
    await new Promise((r) => setTimeout(r, Math.min(100, until - Date.now())));
}
