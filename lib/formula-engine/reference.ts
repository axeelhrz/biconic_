export type ExcelFormulaRefEntry = {
  nombre: string;
  sintaxis: string;
  descripcion: string;
  supported: boolean;
};

export type ExcelFormulaRefCategory = {
  categoria: string;
  funciones: ExcelFormulaRefEntry[];
};

/** Nombres de funciones aún no traducidas / no soportadas en el motor. */
const NOT_SUPPORTED_NAMES = new Set([
  "VLOOKUP",
  "HLOOKUP",
  "INDEX",
  "MATCH",
  "XLOOKUP",
  "OFFSET",
  "INDIRECT",
  "CHOOSE",
]);

const RAW: { categoria: string; funciones: Omit<ExcelFormulaRefEntry, "supported">[] }[] = [
  {
    categoria: "Operadores aritméticos",
    funciones: [
      { nombre: "+", sintaxis: "A + B", descripcion: "Suma" },
      { nombre: "-", sintaxis: "A - B", descripcion: "Resta" },
      { nombre: "*", sintaxis: "A * B", descripcion: "Multiplicación" },
      { nombre: "/", sintaxis: "A / B", descripcion: "División" },
      { nombre: "^", sintaxis: "A ^ B", descripcion: "Potencia" },
      { nombre: "%", sintaxis: "A %", descripcion: "Porcentaje" },
      { nombre: "&", sintaxis: "A & B", descripcion: "Concatenar textos (Excel)" },
    ],
  },
  {
    categoria: "Matemáticas y trigonometría",
    funciones: [
      { nombre: "SUM", sintaxis: "SUM(rango)", descripcion: "Suma de valores" },
      { nombre: "AVERAGE", sintaxis: "AVERAGE(rango)", descripcion: "Promedio" },
      { nombre: "COUNT", sintaxis: "COUNT(rango)", descripcion: "Cuenta celdas numéricas" },
      { nombre: "COUNTA", sintaxis: "COUNTA(rango)", descripcion: "Cuenta celdas no vacías" },
      { nombre: "MIN", sintaxis: "MIN(rango)", descripcion: "Valor mínimo" },
      { nombre: "MAX", sintaxis: "MAX(rango)", descripcion: "Valor máximo" },
      { nombre: "ABS", sintaxis: "ABS(número)", descripcion: "Valor absoluto" },
      { nombre: "ROUND", sintaxis: "ROUND(número; decimales)", descripcion: "Redondeo estándar" },
      { nombre: "ROUNDUP", sintaxis: "ROUNDUP(número; decimales)", descripcion: "Redondeo hacia arriba" },
      { nombre: "ROUNDDOWN", sintaxis: "ROUNDDOWN(número; decimales)", descripcion: "Redondeo hacia abajo" },
      { nombre: "TRUNC", sintaxis: "TRUNC(número)", descripcion: "Trunca decimales" },
      { nombre: "MOD", sintaxis: "MOD(número; divisor)", descripcion: "Módulo (resto)" },
      { nombre: "POWER", sintaxis: "POWER(base; exponente)", descripcion: "Potencia" },
      { nombre: "SQRT", sintaxis: "SQRT(número)", descripcion: "Raíz cuadrada" },
      { nombre: "FLOOR", sintaxis: "FLOOR(número; significancia)", descripcion: "Redondea hacia abajo" },
      { nombre: "CEILING", sintaxis: "CEILING(número; significancia)", descripcion: "Redondea hacia arriba" },
      { nombre: "INT", sintaxis: "INT(número)", descripcion: "Parte entera" },
      { nombre: "SIGN", sintaxis: "SIGN(número)", descripcion: "Signo (-1, 0, 1)" },
      { nombre: "EXP", sintaxis: "EXP(número)", descripcion: "e elevado a número" },
      { nombre: "LN", sintaxis: "LN(número)", descripcion: "Logaritmo natural" },
      { nombre: "LOG", sintaxis: "LOG(número; base)", descripcion: "Logaritmo" },
      { nombre: "LOG10", sintaxis: "LOG10(número)", descripcion: "Logaritmo base 10" },
      { nombre: "SIN", sintaxis: "SIN(ángulo)", descripcion: "Seno" },
      { nombre: "COS", sintaxis: "COS(ángulo)", descripcion: "Coseno" },
      { nombre: "TAN", sintaxis: "TAN(ángulo)", descripcion: "Tangente" },
      { nombre: "PI", sintaxis: "PI()", descripcion: "Constante π" },
    ],
  },
  {
    categoria: "Lógica",
    funciones: [
      { nombre: "IF", sintaxis: "IF(condición; valor_si_verdadero; valor_si_falso)", descripcion: "Condicional" },
      { nombre: "IFERROR", sintaxis: "IFERROR(valor; valor_si_error)", descripcion: "Valor alternativo (COALESCE aprox.)" },
      { nombre: "IFNA", sintaxis: "IFNA(valor; valor_si_NA)", descripcion: "Valor alternativo si nulo" },
      { nombre: "AND", sintaxis: "AND(cond1; cond2; ...)", descripcion: "Y lógico" },
      { nombre: "OR", sintaxis: "OR(cond1; cond2; ...)", descripcion: "O lógico" },
      { nombre: "NOT", sintaxis: "NOT(condición)", descripcion: "Negación" },
      { nombre: "TRUE", sintaxis: "TRUE()", descripcion: "Verdadero" },
      { nombre: "FALSE", sintaxis: "FALSE()", descripcion: "Falso" },
      { nombre: "XOR", sintaxis: "XOR(cond1; cond2; ...)", descripcion: "O exclusivo (impar de verdaderos)" },
      { nombre: "IFS", sintaxis: "IFS(cond1; valor1; cond2; valor2; ...)", descripcion: "Múltiples condiciones" },
      { nombre: "SWITCH", sintaxis: "SWITCH(expr; val1; res1; ...; default)", descripcion: "Selección por valor" },
    ],
  },
  {
    categoria: "Texto",
    funciones: [
      { nombre: "LEFT", sintaxis: "LEFT(texto; cantidad)", descripcion: "Caracteres a la izquierda" },
      { nombre: "RIGHT", sintaxis: "RIGHT(texto; cantidad)", descripcion: "Caracteres a la derecha" },
      { nombre: "MID", sintaxis: "MID(texto; inicio; cantidad)", descripcion: "Extrae subcadena" },
      { nombre: "LEN", sintaxis: "LEN(texto)", descripcion: "Longitud del texto" },
      { nombre: "CONCATENATE", sintaxis: "CONCATENATE(texto1; texto2; ...)", descripcion: "Une textos" },
      { nombre: "CONCAT", sintaxis: "CONCAT(texto1; texto2; ...)", descripcion: "Une textos" },
      { nombre: "TEXTJOIN", sintaxis: "TEXTJOIN(separador; omitir_vacíos; texto1; ...)", descripcion: "Une con separador" },
      { nombre: "TEXT", sintaxis: "TEXT(valor; formato)", descripcion: "Formatea como texto (passthrough SQL)" },
      { nombre: "VALUE", sintaxis: "VALUE(texto)", descripcion: "Convierte texto a número (passthrough SQL)" },
      { nombre: "TRIM", sintaxis: "TRIM(texto)", descripcion: "Quita espacios extra" },
      { nombre: "UPPER", sintaxis: "UPPER(texto)", descripcion: "Mayúsculas" },
      { nombre: "LOWER", sintaxis: "LOWER(texto)", descripcion: "Minúsculas" },
      { nombre: "PROPER", sintaxis: "PROPER(texto)", descripcion: "Primera letra en mayúscula" },
      { nombre: "REPLACE", sintaxis: "REPLACE(texto; inicio; longitud; nuevo)", descripcion: "Reemplaza caracteres" },
      { nombre: "SUBSTITUTE", sintaxis: "SUBSTITUTE(texto; buscar; reemplazar; ocurrencia)", descripcion: "Sustituye texto" },
      { nombre: "FIND", sintaxis: "FIND(buscar; texto; inicio)", descripcion: "Posición (sensible mayúsculas)" },
      { nombre: "SEARCH", sintaxis: "SEARCH(buscar; texto; inicio)", descripcion: "Posición (no sensible)" },
      { nombre: "REPT", sintaxis: "REPT(texto; veces)", descripcion: "Repite texto" },
    ],
  },
  {
    categoria: "Fecha y hora",
    funciones: [
      { nombre: "DATE", sintaxis: "DATE(año; mes; día)", descripcion: "Fecha a partir de año, mes, día" },
      { nombre: "TODAY", sintaxis: "TODAY()", descripcion: "Fecha actual" },
      { nombre: "NOW", sintaxis: "NOW()", descripcion: "Fecha y hora actual" },
      { nombre: "YEAR", sintaxis: "YEAR(fecha)", descripcion: "Año" },
      { nombre: "MONTH", sintaxis: "MONTH(fecha)", descripcion: "Mes" },
      { nombre: "DAY", sintaxis: "DAY(fecha)", descripcion: "Día" },
      { nombre: "HOUR", sintaxis: "HOUR(fecha_hora)", descripcion: "Hora" },
      { nombre: "MINUTE", sintaxis: "MINUTE(fecha_hora)", descripcion: "Minuto" },
      { nombre: "SECOND", sintaxis: "SECOND(fecha_hora)", descripcion: "Segundo" },
      { nombre: "WEEKDAY", sintaxis: "WEEKDAY(fecha; tipo)", descripcion: "Día de la semana" },
      { nombre: "WEEKNUM", sintaxis: "WEEKNUM(fecha; tipo)", descripcion: "Número de semana" },
      { nombre: "EOMONTH", sintaxis: "EOMONTH(fecha; meses)", descripcion: "Último día del mes" },
      { nombre: "EDATE", sintaxis: "EDATE(fecha; meses)", descripcion: "Fecha + N meses" },
      { nombre: "DATEDIF", sintaxis: "DATEDIF(inicio; fin; unidad)", descripcion: "Diferencia entre fechas" },
      { nombre: "DATEVALUE", sintaxis: "DATEVALUE(texto)", descripcion: "Texto a fecha" },
      { nombre: "TIMEVALUE", sintaxis: "TIMEVALUE(texto)", descripcion: "Texto a hora" },
    ],
  },
  {
    categoria: "Búsqueda y referencia",
    funciones: [
      { nombre: "VLOOKUP", sintaxis: "VLOOKUP(valor; tabla; col; aprox)", descripcion: "Búsqueda vertical" },
      { nombre: "HLOOKUP", sintaxis: "HLOOKUP(valor; tabla; fila; aprox)", descripcion: "Búsqueda horizontal" },
      { nombre: "INDEX", sintaxis: "INDEX(rango; fila; col)", descripcion: "Valor en posición" },
      { nombre: "MATCH", sintaxis: "MATCH(valor; rango; tipo)", descripcion: "Posición en rango" },
      { nombre: "XLOOKUP", sintaxis: "XLOOKUP(buscar; rango_buscar; rango_devuelve)", descripcion: "Búsqueda moderna" },
      { nombre: "OFFSET", sintaxis: "OFFSET(ref; filas; cols; alto; ancho)", descripcion: "Referencia desplazada" },
      { nombre: "INDIRECT", sintaxis: "INDIRECT(ref_texto)", descripcion: "Referencia desde texto" },
      { nombre: "CHOOSE", sintaxis: "CHOOSE(índice; valor1; valor2; ...)", descripcion: "Elige por índice" },
    ],
  },
  {
    categoria: "Estadística",
    funciones: [
      { nombre: "MEDIAN", sintaxis: "MEDIAN(rango)", descripcion: "Mediana (Postgres: PERCENTILE_CONT)" },
      { nombre: "MODE", sintaxis: "MODE(rango)", descripcion: "Moda (Postgres: MODE aggregate)" },
      { nombre: "STDEV", sintaxis: "STDEV(rango)", descripcion: "Desviación estándar (muestra)" },
      { nombre: "STDEVP", sintaxis: "STDEVP(rango)", descripcion: "Desviación estándar (población)" },
      { nombre: "VAR", sintaxis: "VAR(rango)", descripcion: "Varianza (muestra)" },
      { nombre: "VARP", sintaxis: "VARP(rango)", descripcion: "Varianza (población)" },
      { nombre: "AVERAGEIF", sintaxis: "AVERAGEIF(rango; criterio; rango_promedio)", descripcion: "Promedio condicional" },
      { nombre: "SUMIF", sintaxis: "SUMIF(rango; criterio; rango_suma)", descripcion: "Suma condicional" },
      { nombre: "COUNTIF", sintaxis: "COUNTIF(rango; criterio)", descripcion: "Conteo condicional" },
      { nombre: "COUNTIFS", sintaxis: "COUNTIFS(rango1; crit1; rango2; crit2; ...)", descripcion: "Conteo con múltiples criterios" },
      { nombre: "SUMIFS", sintaxis: "SUMIFS(rango_suma; rango1; crit1; ...)", descripcion: "Suma con múltiples criterios" },
      { nombre: "MAXIFS", sintaxis: "MAXIFS(rango_max; rango1; crit1; ...)", descripcion: "Máximo condicional" },
      { nombre: "MINIFS", sintaxis: "MINIFS(rango_min; rango1; crit1; ...)", descripcion: "Mínimo condicional" },
    ],
  },
  {
    categoria: "Información y compatibilidad",
    funciones: [
      { nombre: "ISBLANK", sintaxis: "ISBLANK(valor)", descripcion: "¿Está vacío?" },
      { nombre: "ISNUMBER", sintaxis: "ISNUMBER(valor)", descripcion: "¿Es número?" },
      { nombre: "ISTEXT", sintaxis: "ISTEXT(valor)", descripcion: "¿Es texto?" },
      { nombre: "ISDATE", sintaxis: "ISDATE(valor)", descripcion: "¿Es fecha?" },
      { nombre: "ISERROR", sintaxis: "ISERROR(valor)", descripcion: "¿Es error? (siempre FALSE en SQL)" },
      { nombre: "ISNA", sintaxis: "ISNA(valor)", descripcion: "¿Es nulo?" },
      { nombre: "NA", sintaxis: "NA()", descripcion: "NULL" },
      { nombre: "NULLIF", sintaxis: "NULLIF(valor1; valor2)", descripcion: "NULL si son iguales" },
      { nombre: "COALESCE", sintaxis: "COALESCE(val1; val2; ...)", descripcion: "Primer valor no nulo" },
    ],
  },
  {
    categoria: "Ejemplos útiles",
    funciones: [
      {
        nombre: "IF / estado",
        sintaxis: 'IF(estado="PAGADO"; 1; 0)',
        descripcion: "Bandera según texto",
      },
      {
        nombre: "SUMIF",
        sintaxis: 'SUMIF(monto; ">0")',
        descripcion: "Suma con criterio",
      },
      {
        nombre: "SUMIFS",
        sintaxis: 'SUMIFS(total; estado; "PAGADO"; region; "AMBA")',
        descripcion: "Suma con varios criterios",
      },
      {
        nombre: "COUNTIFS",
        sintaxis: 'COUNTIFS(estado; "PAGADO"; fecha; "<>")',
        descripcion: "Conteo múltiple",
      },
      {
        nombre: "IFS",
        sintaxis: 'IFS(score>=90; "A"; score>=70; "B"; TRUE(); "C")',
        descripcion: "Varias ramas",
      },
      {
        nombre: "COUNTA UNIQUE",
        sintaxis: "COUNTA(UNIQUE(cliente_id))",
        descripcion: "Conteo distintos",
      },
      {
        nombre: "Ratio",
        sintaxis: "SUM(ingresos) / NULLIF(SUM(costos); 0)",
        descripcion: "Dos agregados en una expresión (usar métricas separadas si falla)",
      },
    ],
  },
];

export const EXCEL_FORMULAS_REFERENCIA: ExcelFormulaRefCategory[] = RAW.map((cat) => ({
  categoria: cat.categoria,
  funciones: cat.funciones.map((f) => ({
    ...f,
    supported: !NOT_SUPPORTED_NAMES.has(f.nombre),
  })),
}));
