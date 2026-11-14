/** Protocol records are JSON values; this works in native runtimes without structuredClone. */
export function copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
