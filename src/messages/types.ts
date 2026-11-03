/** Widen message text while retaining each interpolating function's parameter types. */
export type MessageValues<T> = keyof T extends never ? Record<string, never> : { [K in keyof T]: T[K] extends string ? string : T[K] };
export const IMAGE_LOCALES = ["ar","de","es","fr","he","it","ja","ko","nl","pt-BR","zh-Hans"] as const;
export type ImageLocale = typeof IMAGE_LOCALES[number];
