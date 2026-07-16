/**
 * Demo outline data for the manuscript tree.
 *
 * Mirrors the structure returned by `parseOutlineMarkdown` without
 * requiring the parser or file-system access in the renderer.
 * Replaced by live IPC data when WP-08 lands.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import type { ParsedPart, ParsedChapter, ParsedSection } from '../../shared/schemas/outline';

// ── Demo sections (beats omitted for tree rendering) ───────────────────────────

const ch1Sections: ParsedSection[] = [
  { id: '01J00000000000000001', number: '1.1', title: 'Ancestry and roots', wordTarget: 800, beats: ['Tracing family lineage'] },
  { id: '01J00000000000000002', number: '1.2', title: 'Formative years', wordTarget: 900, beats: ['Early childhood influences'] },
  { id: '01J00000000000000003', number: '1.3', title: 'Schooling and early ambition', wordTarget: 800, beats: ['Education milestones'] },
];

const ch2Sections: ParsedSection[] = [
  { id: '01J00000000000000004', number: '2.1', title: 'War arrives', wordTarget: 1000, beats: ['Japanese invasion'] },
  { id: '01J00000000000000005', number: '2.2', title: 'Life under occupation', wordTarget: 900, beats: ['Survival strategies'] },
  { id: '01J00000000000000006', number: '2.3', title: 'Turning point', wordTarget: 800, beats: ['Decision to resist'] },
];

const ch3Sections: ParsedSection[] = [
  { id: '01J00000000000000007', number: '3.1', title: 'Cambridge years', wordTarget: 1000, beats: ['Academic life'] },
  { id: '01J00000000000000008', number: '3.2', title: 'Political awakening', wordTarget: 900, beats: ['Exposure to ideas'] },
  { id: '01J00000000000000009', number: '3.3', title: 'Return home', wordTarget: 700, beats: ['Decision to return'] },
];

const ch4Sections: ParsedSection[] = [
  { id: '01J0000000000000000A', number: '4.1', title: 'Legal career begins', wordTarget: 800, beats: ['First cases'] },
  { id: '01J0000000000000000B', number: '4.2', title: 'Union work', wordTarget: 1000, beats: ['Labour movement involvement'] },
  { id: '01J0000000000000000C', number: '4.3', title: 'PAP founding', wordTarget: 1200, beats: ['Party formation'] },
  { id: '01J0000000000000000D', number: '4.4', title: 'First electoral test', wordTarget: 900, beats: ['Election campaign'] },
];

const ch5Sections: ParsedSection[] = [
  { id: '01J0000000000000000E', number: '5.1', title: 'Taking office', wordTarget: 1000, beats: ['Transition of power'] },
  { id: '01J0000000000000000F', number: '5.2', title: 'Merger and separation', wordTarget: 1200, beats: ['Malaysia union'] },
  { id: '01J0000000000000000G', number: '5.3', title: 'Independence', wordTarget: 1000, beats: ['Singapore alone'] },
];

const ch6Sections: ParsedSection[] = [
  { id: '01J0000000000000000H', number: '6.1', title: 'Housing programme', wordTarget: 900, beats: ['HDB story'] },
  { id: '01J0000000000000000I', number: '6.2', title: 'Industrialisation', wordTarget: 800, beats: ['Economic transformation'] },
  { id: '01J0000000000000000J', number: '6.3', title: 'Education reform', wordTarget: 800, beats: ['Bilingual policy'] },
];

// ── Demo chapters ──────────────────────────────────────────────────────────────

const part1Chapters: ParsedChapter[] = [
  {
    chapterId: '01J10000000000000001',
    title: 'Roots of a Leader',
    wordTarget: { min: 7000, max: 8000 },
    sections: ch1Sections,
  },
  {
    chapterId: '01J10000000000000002',
    title: 'The Fall of Singapore',
    wordTarget: { min: 8000, max: 9000 },
    sections: ch2Sections,
  },
  {
    chapterId: '01J10000000000000003',
    title: 'Cambridge and Awakening',
    wordTarget: { min: 7500, max: 8500 },
    sections: ch3Sections,
  },
];

const part2Chapters: ParsedChapter[] = [
  {
    chapterId: '01J10000000000000004',
    title: 'The Lawyer and the Unionist',
    wordTarget: { min: 8000, max: 10000 },
    sections: ch4Sections,
  },
  {
    chapterId: '01J10000000000000005',
    title: 'A Nation Is Born',
    wordTarget: { min: 9000, max: 11000 },
    sections: ch5Sections,
  },
  {
    chapterId: '01J10000000000000006',
    title: 'Building the Foundations',
    wordTarget: { min: 8000, max: 9000 },
    sections: ch6Sections,
  },
];

// ── Demo parts ─────────────────────────────────────────────────────────────────

export const demoParts: ParsedPart[] = [
  {
    id: '01JP0000000000000001',
    title: 'Part I: The Making of a Statesman',
    chapters: part1Chapters,
  },
  {
    id: '01JP0000000000000002',
    title: 'Part II: Forging a Nation',
    chapters: part2Chapters,
  },
];
