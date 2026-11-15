// Preparation is independent of the twelve research chapters and has no academic year.
export function preparationCamp() {
  return {
    levelNumber: 0, year: null, title: 'Preparation Camp \u2014 November\u2013December 2026',
    description: 'Mission: Prepare your research environment before beginning Level 1.',
    objectives: [
      'Set up Notion, Zotero and Google Drive.',
      'Understand the scientific research workflow.',
      'Establish your documentation and progress-tracking habits.',
      'Confirm your PhD research subject.',
      'Approve the roadmap and working system.',
    ],
    checkpoints: [{ id: 'research-environment-ready', title: 'Research environment ready and research direction confirmed.',
      mandatory: true, completed: false, validatedAt: null, firstValidatedAt: null, evidence: '' }],
    status: 'current' as const, completedAt: null,
  };
}
