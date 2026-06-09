/**
 * shell-types.ts
 *
 * Registry of all shell types available in the universal terminal.
 *
 * How `initialCommand` works:
 *  The Rust backend ALWAYS spawns cmd.exe as the host process (with php/current
 *  and mysql/bin prepended to PATH). `initialCommand` is a string written to
 *  cmd.exe's stdin immediately after spawn — equivalent to the user typing it
 *  and pressing Enter. null means a plain cmd.exe prompt.
 *
 *  Git Bash is a special case: the Rust side must resolve git-bash.exe at
 *  runtime and spawn it directly instead of cmd.exe. The frontend passes
 *  shellTypeId="git-bash" and the backend handles binary resolution.
 */

import {
  SquareTerminal,
  Code,
  Database,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

export interface ShellType {
  id: "shell" | "powershell" | "cmd" | "php-cli" | "mysql-cli" | "git-bash";
  label: string;
  icon: LucideIcon;
  /**
   * Command written to cmd.exe stdin after spawn.
   * null = plain cmd.exe prompt (no initial command sent).
   */
  initialCommand: string | null;
}

export const SHELL_TYPES: ShellType[] = [
  {
    id: "shell",
    label: "Shell",
    icon: SquareTerminal,
    initialCommand: null,
  },
  {
    id: "powershell",
    label: "PowerShell",
    icon: SquareTerminal,
    initialCommand: "powershell",
  },
  {
    id: "cmd",
    label: "CMD",
    icon: SquareTerminal,
    initialCommand: null, // plain cmd.exe — identical to "shell" but semantically distinct
  },
  {
    id: "php-cli",
    label: "PHP Interactive",
    icon: Code,
    initialCommand: "php -a",
  },
  {
    id: "mysql-cli",
    label: "MySQL CLI",
    icon: Database,
    initialCommand: "mysql -u root",
  },
  {
    id: "git-bash",
    label: "Git Bash",
    icon: GitBranch,
    // null here — the Rust backend resolves git-bash.exe via shellTypeId="git-bash"
    initialCommand: null,
  },
] as const;

/** Default shell opened when the terminal page first mounts. */
export const DEFAULT_SHELL = SHELL_TYPES[0];
