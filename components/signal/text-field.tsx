import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Textarea } from "@/components/textarea";

interface TextFieldProps {
  hint?: string;
  id: string;
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}

/** Labeled input or textarea used across the Signal forms. */
export const TextField = ({
  hint,
  id,
  label,
  maxLength,
  multiline = false,
  onChange,
  placeholder,
  required = false,
  value,
}: TextFieldProps) => {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-muted-foreground font-normal">(required)</span> : null}
      </Label>
      {multiline ? (
        <Textarea
          aria-describedby={hintId}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          value={value}
        />
      ) : (
        <Input
          aria-describedby={hintId}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          value={value}
        />
      )}
      {hint ? (
        <p className="text-muted-foreground text-xs" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
};
