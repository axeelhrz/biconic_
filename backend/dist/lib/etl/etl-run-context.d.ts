export type EtlPipelineContext = {
    appOrigin: string;
    etlRunnerBase: string;
    internalEtlSecret?: string;
    cookieHeader?: string | null;
};
export declare function getEtlRunnerBase(): string;
export declare function getEtlAppOrigin(): string;
export declare function createEtlPipelineContext(partial?: Partial<EtlPipelineContext>): EtlPipelineContext;
