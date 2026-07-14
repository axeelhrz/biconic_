export type InferredColumnType = "Fecha" | "Número" | "Texto";
export type InferredColumnFormat = "" | "currency" | "percent" | "number" | "DD/MM/YYYY";
export type InferredColumnMetadata = {
    type: InferredColumnType;
    format?: InferredColumnFormat;
};
export declare function isWeakSchemaDataType(dataType: string | undefined): boolean;
export declare function inferTypeFromSchemaDataType(dataType: string | undefined): InferredColumnType | null;
export declare function mergeColumnInferredType(params: {
    columnName: string;
    schemaDataType?: string;
    sampleInferred?: InferredColumnType;
}): InferredColumnType;
export declare function inferFormatForColumn(columnName: string, type: InferredColumnType, sampleValues?: unknown[]): InferredColumnFormat;
export declare function inferColumnMetadata(params: {
    columnName: string;
    schemaDataType?: string;
    sampleInferred?: InferredColumnType;
    sampleValues?: unknown[];
}): InferredColumnMetadata;
export declare function mergeColumnInferredFormat(params: {
    columnName: string;
    type: InferredColumnType;
    sampleFormat?: InferredColumnFormat;
    userFormat?: string;
}): InferredColumnFormat;
export declare function deriveColumnTypesFromSample(sampleData: unknown[]): Record<string, InferredColumnType>;
export declare function deriveColumnMetadataFromSample(sampleData: unknown[]): Record<string, InferredColumnMetadata>;
