export class FormulaCycleError extends Error {
  readonly columnName: string;

  constructor(columnName: string) {
    super(`Referencia circular en columna calculada: «${columnName}»`);
    this.name = "FormulaCycleError";
    this.columnName = columnName;
  }
}
