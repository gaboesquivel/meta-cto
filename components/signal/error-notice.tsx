import { Alert, AlertDescription, AlertTitle } from "@/components/alert";

import type { ApiError } from "./view";

/** Shows an API error with its resolution so the next step is clear. */
export const ErrorNotice = ({ error }: { error: ApiError | null }) => {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{error.message}</AlertTitle>
      {error.resolution ? <AlertDescription>{error.resolution}</AlertDescription> : null}
    </Alert>
  );
};
