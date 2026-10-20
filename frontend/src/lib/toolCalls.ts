import {
  FileArrowUp, FileText, FolderOpen, MagnifyingGlass, PencilSimple, Terminal, type Icon,
} from '@phosphor-icons/react';

const TOOL_ICONS: Record<string, Icon> = {
  Read: FileText,
  Grep: MagnifyingGlass,
  Glob: FolderOpen,
  Bash: Terminal,
  Edit: PencilSimple,
  Write: FileArrowUp,
};

/** The icon for an agent tool, by name; a terminal for anything unknown */
export function toolIcon(name: string | undefined): Icon {
  return TOOL_ICONS[name ?? ''] ?? Terminal;
}

/**
 * What a tool call acted on, for the activity line: drops the "Read: " style
 * prefix and the sandbox clone path, leaving the path inside the repo.
 */
export function toolCallDetail(content: string | undefined): string {
  return (content ?? '')
    .replace(/^(?:Read|Grep|Glob|Bash|Edit|Write):\s*/, '')
    .replace(/^\/.*?\.cruise-data\/repos\/[^/]+\/[^/]+\/\d+\//, '')
    .replace(/^\/.*?\/repos\/[^/]+\/[^/]+\//, '');
}
