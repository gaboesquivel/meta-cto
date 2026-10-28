export type FormFieldType = "email" | "text";

export interface FormFieldDefinition {
  label: string;
  name: string;
  required?: boolean;
  type: FormFieldType;
}

const onboardingFields: FormFieldDefinition[] = [
  { label: "Full name", name: "fullName", required: true, type: "text" },
  { label: "Work email", name: "workEmail", required: true, type: "email" },
  { label: "Role", name: "role", type: "text" },
];

const formSchemas: Record<string, FormFieldDefinition[]> = {
  "form:onboarding": onboardingFields,
};

export const getFormSchema = (formId: string) => formSchemas[formId] ?? null;
