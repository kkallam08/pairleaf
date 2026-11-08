/** All coordinates use the rendered page's top-left origin at PDF.js scale 1. */
export interface TextSpan {
  text: string;
  x: number;
  y: number;
  bottom: number;
  baseline: number;
  width: number;
  height: number;
  font: string;
}
export interface PageText {
  page: number;
  width: number;
  height: number;
  items: TextSpan[];
  textlessGraphics?: boolean;
}
export interface Heading {
  id: string;
  page: number;
  x: number;
  y: number;
  top: number;
}
export interface Region {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Solution extends Heading {
  regions: Region[];
  issue?: string;
}
export type MatchStatus = "matched" | "missing" | "ambiguous" | "unsafe";
export interface Match {
  id: string;
  status: MatchStatus;
  questions: Heading[];
  solutions: Solution[];
  reason: string;
}
export interface Analysis {
  headings: Heading[];
  solutions: Solution[];
  warnings: string[];
}
