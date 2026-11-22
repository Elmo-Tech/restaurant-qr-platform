"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils";

/** One labelled form field with an optional hint and a server validation message wired for assistive tech. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The ARIA attributes linking a control to its `Field` hint and error. */
export function describedBy(id: string, hint: boolean, error: string | null | undefined) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return {
    "aria-describedby": ids || undefined,
    "aria-invalid": error ? true : undefined,
  } as const;
}

/** A text input bound to a nullable draft value. LTR fields (emails, phones, URLs) keep their direction in Arabic. */
export function TextField({
  id,
  label,
  hint,
  error,
  value,
  onValue,
  onBlur,
  ltr = false,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  value: string | null;
  onValue: (value: string) => void;
  onBlur?: () => void;
  ltr?: boolean;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <Input
        id={id}
        value={value ?? ""}
        onChange={(event) => onValue(event.target.value)}
        onBlur={onBlur}
        // Free text follows its own content (an English name in the Arabic UI stays readable); codes stay LTR.
        dir={ltr ? "ltr" : "auto"}
        className={cn(ltr && "text-start", error && "border-danger focus:border-danger focus:ring-danger/25")}
        {...describedBy(id, Boolean(hint), error)}
        {...rest}
      />
    </Field>
  );
}
