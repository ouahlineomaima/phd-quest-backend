export const CHAPTERS = [
  'Find your direction', 'Explore the literature', 'Ask better questions', 'Shape the approach',
  'Test the waters', 'Gather the evidence', 'Make sense of it', 'Connect the findings',
  'Tell the story', 'Refine the argument', 'Share your contribution', 'Defend your discovery',
];
export function initialRoadmap() {
  return CHAPTERS.map((title, index) => ({ levelNumber: index + 1, year: Math.floor(index / 4) + 1,
    title, description: 'Provisional chapter: edit this description to reflect your agreed research direction.',
    objectives: ['Review the chapter outcomes and agree the next research steps.'],
    checkpoints: [{ id: `chapter-${index + 1}-review`, title: 'Review and validate chapter outcomes',
      description: 'Provisional checkpoint: record the agreed outcomes and supporting references before validation.',
      mandatory: true, completed: false, validatedAt: null, firstValidatedAt: null, evidence: '' }],
    status: index === 0 ? 'current' : 'locked', completedAt: null,
  }));
}
