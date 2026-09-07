export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 text-sm text-[#655D56]"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-[#E5DED6] border-t-[#7A5138]"
      />
      {label}
    </div>
  );
}
