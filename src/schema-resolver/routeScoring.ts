// src/schema-resolver/routeScoring.ts

/**
 * Calculates a relevance score to rank route candidates based on file path.
 *
 * @param targetSegments The segments of the target API route (e.g. ["api", "auth", "signin"])
 * @param sourceFilePath The absolute path to the candidate source file
 */
export function calculateRelevanceScore(
  targetSegments: string[],
  sourceFilePath: string,
): number {
  const fileSegments = sourceFilePath.toLowerCase().split(/[/\\]/);
  // Only look at the last 5 segments (the project structure) to avoid matching OS-level folders
  const relevantFileSegments = fileSegments.slice(-5);

  return targetSegments.reduce((acc, seg) => {
    if (seg.length <= 2) {
      return (
        acc +
        (relevantFileSegments.some(
          (fs) => fs === seg || fs.startsWith(`${seg}.`),
        )
          ? 1
          : 0)
      );
    }
    return acc + (relevantFileSegments.some((fs) => fs.includes(seg)) ? 1 : 0);
  }, 0);
}
