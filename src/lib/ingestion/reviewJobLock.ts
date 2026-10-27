/**
 * One heavy Review Automation job at a time in this process: an analysis, a classifier comparison, an assignment preview or an assignment run.
 * Each reads (and the last writes) the same queue in bounded chunks; running two at once would only slow both and confuse the progress shown.
 */
let holder: string | null = null;
export const acquireReviewJob = (name: string): boolean => { if (holder) return false; holder = name; return true; };
export const releaseReviewJob = (name: string) => { if (holder === name) holder = null; };
export const reviewJobHolder = () => holder;
export const __resetReviewJobLock = () => { holder = null; };
