export type SanitizedJoinResult = {
    ok: true;
    join: Record<string, unknown>;
} | {
    ok: false;
    error: string;
};
export declare function sanitizeGuidedJoinForRun(join: unknown, filter?: unknown): SanitizedJoinResult | null;
export declare function resolvePrimaryConnectionId(guided: Record<string, unknown>, join?: Record<string, unknown> | null): string;
