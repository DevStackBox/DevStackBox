import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface OverflowItem {
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

export interface OverflowGroup {
  /** Optional label to render above this group. */
  label?: string;
  items: OverflowItem[];
}

interface ServiceOverflowMenuProps {
  label: string;
  groups: OverflowGroup[];
}

/**
 * Phase 6.2 - compact overflow menu rendered in a service card header.
 * Houses every secondary action so the card body stays focused on the
 * primary Start/Stop + one Open button.
 */
export function ServiceOverflowMenu({
  label,
  groups,
}: ServiceOverflowMenuProps) {
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter(Boolean) }))
    .filter((g) => g.items.length > 0);

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`${label} actions`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <DropdownMenuSeparator />}
            {group.items.map((item, ii) => (
              <DropdownMenuItem
                key={ii}
                onSelect={item.onSelect}
                disabled={item.disabled}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ServiceOverflowMenu;
