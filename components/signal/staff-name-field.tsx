"use client";

import { TextField } from "./text-field";
import { useStaffName } from "./use-staff-name";

/** "Your name" field for the Staff Actor, remembered on this device. */
export const StaffNameField = ({ id }: { id: string }) => {
  const [name, setName] = useStaffName();
  return (
    <TextField
      hint="Recorded as the Staff Actor. Remembered on this device."
      id={id}
      label="Your name"
      maxLength={80}
      onChange={setName}
      placeholder="e.g. Maya from Support"
      required
      value={name}
    />
  );
};
