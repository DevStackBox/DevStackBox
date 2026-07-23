import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
};

export function AppLogo({ className }: AppLogoProps) {
  return (
    <>
      <img
        src="/logo.svg"
        alt="DevStackBox"
        width={32}
        height={32}
        className={cn("h-8 w-8 dark:hidden", className)}
      />
      <img
        src="/logo-dark.svg"
        alt="DevStackBox"
        width={32}
        height={32}
        className={cn("hidden h-8 w-8 dark:block", className)}
      />
    </>
  );
}
