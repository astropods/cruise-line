// Review shapes come straight from the agent so the two can't drift. These
// are type-only re-exports: the bundler drops them, so the frontend's Docker
// build stage (which only copies frontend/) never needs agent/.
export type {
  ArchitectureAnalysis,
  ArchitectureDiagram,
  CommentAnchor,
  FileContent,
  Finding,
  FindingCategory,
  Severity,
  Verdict,
  Walkthrough,
} from '../../../agent/analysis/types';
