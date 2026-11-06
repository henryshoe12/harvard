"use client";

// Inputs in the work list save as soon as they change, so a checkmark moves the
// assignment to Completed right away.

export function AutoCheck({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return <input type="checkbox" name={name} defaultChecked={checked} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function AutoHours({ name, value, label }: { name: string; value: number; label: string }) {
  return (
    <input
      type="number"
      name={name}
      min="0"
      max="100"
      step="0.5"
      defaultValue={value}
      aria-label={label}
      onBlur={(e) => {
        if (e.currentTarget.value !== String(value)) e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
