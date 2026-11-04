/** Gzip bytes. Eager: what an entry loads before it runs. Lazy: on-demand chunks and workers, such as optional decoders. */
export const budgets = { basic:115000, standard:210000, advanced:215000, photo:165000, workspace:310000, full:400000 };
export const lazyBudgets = { basic:400_000, standard:410_000, advanced:400_000, photo:390_000, workspace:400_000, full:430_000 };
