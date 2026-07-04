/**
 * CTC-style focused holistic scoring for CSET Mathematics constructed
 * responses. Scorers judge overall effectiveness against four performance
 * characteristics: PURPOSE (addresses the assignment), SUBJECT MATTER
 * KNOWLEDGE (accuracy of the mathematics), SUPPORT (quality of reasoning,
 * justification, and detail), and DEPTH AND BREADTH OF UNDERSTANDING.
 */
export const CR_RUBRIC = `Score 4: The response fully achieves the purpose of the assignment. It demonstrates a substantial, accurate command of the relevant mathematics; reasoning is sound and complete; supporting work and justification are of high quality and show comprehensive understanding.

Score 3: The response largely achieves the purpose. It demonstrates a general, mostly accurate command of the mathematics; reasoning is adequate with only minor gaps or errors; support shows general understanding.

Score 2: The response partially achieves the purpose. It demonstrates limited or partly inaccurate command of the mathematics; reasoning has significant gaps or errors; support shows limited understanding.

Score 1: The response fails to achieve the purpose. Little or no accurate command of the relevant mathematics; reasoning is missing, irrelevant, or substantially flawed.`;

export const CR_SCORE_DESCRIPTIONS: Record<number, string> = {
  4: "Thorough and accurate — would earn full credit",
  3: "Generally accurate with minor gaps",
  2: "Partial — significant gaps or errors",
  1: "Little or no command of the mathematics",
};
