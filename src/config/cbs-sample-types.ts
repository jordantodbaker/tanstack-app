/** Types for the generated CBS sample data (see scripts/build-cbs-sample.ts). */

export type CbsLevelColor = { fill: string; text: string };

export type CbsNode = {
  id: number;
  name: string;
  code: string;
  level: number;
  rowType: string;
  /** Non-empty cell values keyed by the workbook's column header. */
  fields: Record<string, string>;
  children: CbsNode[];
};

export type CbsData = {
  meta: {
    title: string;
    subtitle: string;
    sheetName: string;
    generatedAt: string;
    source: string;
    counts: {
      total: number;
      original: number;
      subRows: number;
      materialRows: number;
    };
    /** Detail field headers, in workbook order. */
    detailColumns: string[];
    headerColor: CbsLevelColor;
    /** Per outline level (0-5) fill + text colour, lifted from the workbook. */
    levelColors: Record<string, CbsLevelColor>;
  };
  nodes: CbsNode[];
};
